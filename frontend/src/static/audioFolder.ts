/**
 * File System Access API integration: the visitor picks a local folder
 * containing the audio files (subfolders per game, plus `_ambient` for
 * ambient assets). The handle is persisted in IndexedDB so the visitor
 * doesn't have to re-pick it on every page load — though browsers will
 * still re-prompt for *permission* on a new session, which is policy and
 * unavoidable.
 *
 * Expected folder shape (mirrors the backend's `./audio_files/`):
 *   <root>/
 *     {game_uuid}/
 *       *.mp3 / *.ogg / ...
 *     _ambient/
 *       *.mp3 / *.ogg / ...
 *
 * Browser support: Chromium-only (Chrome, Edge, Brave, Opera, Arc).
 * Firefox and Safari don't implement showDirectoryPicker — for the first
 * deploy we accept that constraint. A `<input type="file" webkitdirectory>`
 * fallback can be added later.
 */
import { get as idbGet, set as idbSet, del as idbDel } from 'idb-keyval'

const IDB_KEY = 'bgmscape:audioFolderHandle'

let _handle: FileSystemDirectoryHandle | null = null

// Subfolder handles are looked up many times per session; memoise them.
const _subFolderCache: Map<string, FileSystemDirectoryHandle> = new Map()

/**
 * Returns true iff the current browser exposes the File System Access API
 * surface this module needs. Use this to gate the picker UI and to fall
 * back to a friendlier error in unsupported browsers.
 */
export function isFileSystemAccessSupported(): boolean {
  return typeof (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker === 'function'
}

/**
 * Prompt the visitor to pick the audio folder. Persists the chosen handle
 * to IndexedDB so the same folder is remembered on the next visit.
 * Returns null if the visitor cancels the picker.
 */
export async function pickAudioFolder(): Promise<FileSystemDirectoryHandle | null> {
  if (!isFileSystemAccessSupported()) {
    throw new Error(
      'This browser does not support the File System Access API. ' +
      'Use Chrome, Edge, or another Chromium-based browser to listen to bgmscape.'
    )
  }
  try {
    const picker = (window as unknown as {
      showDirectoryPicker: (opts: { id?: string; mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle>
    }).showDirectoryPicker
    const handle = await picker({ id: 'bgmscape-audio', mode: 'read' })
    _handle = handle
    _subFolderCache.clear()
    await idbSet(IDB_KEY, handle)
    return handle
  } catch (err) {
    // User cancelled the picker — not an error, just no selection.
    if ((err as DOMException)?.name === 'AbortError') return null
    throw err
  }
}

/**
 * Load any previously-picked handle from IndexedDB and re-ask for
 * permission. Returns null if no handle was stored, or if the visitor
 * denies the permission re-prompt.
 */
export async function restoreAudioFolder(): Promise<FileSystemDirectoryHandle | null> {
  if (_handle) return _handle
  if (!isFileSystemAccessSupported()) return null
  const stored = await idbGet<FileSystemDirectoryHandle>(IDB_KEY)
  if (!stored) return null

  // Permission may have lapsed across sessions. Query first, then request.
  type Permissioned = FileSystemDirectoryHandle & {
    queryPermission: (opts: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>
    requestPermission: (opts: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>
  }
  const ph = stored as Permissioned
  let state = await ph.queryPermission({ mode: 'read' })
  if (state !== 'granted') {
    state = await ph.requestPermission({ mode: 'read' })
  }
  if (state !== 'granted') return null

  _handle = stored
  _subFolderCache.clear()
  return stored
}

/** Drop the cached handle (visitor disconnects the folder). */
export async function forgetAudioFolder(): Promise<void> {
  _handle = null
  _subFolderCache.clear()
  await idbDel(IDB_KEY)
}

/** Synchronous accessor for the currently-connected handle, if any. */
export function getAudioFolder(): FileSystemDirectoryHandle | null {
  return _handle
}

/**
 * Read the bytes for a file at a path relative to the chosen folder,
 * e.g. "abc-uuid-123/zelda-theme.mp3" or "_ambient/wind.mp3". Errors
 * surface with the requested path so log lines pinpoint the missing
 * file rather than a generic "not found".
 */
export async function resolveAudioBytes(relativePath: string): Promise<ArrayBuffer> {
  const root = _handle
  if (!root) {
    throw new Error(
      `No audio folder connected; cannot read "${relativePath}". ` +
      `The PickerGate should have intercepted this — bug to fix.`
    )
  }
  const slashIdx = relativePath.indexOf('/')
  if (slashIdx < 0) {
    throw new Error(
      `Audio path missing folder segment: "${relativePath}". ` +
      `Expected "{folder}/{filename}".`
    )
  }
  const folderName = relativePath.slice(0, slashIdx)
  const fileName = relativePath.slice(slashIdx + 1)

  let folder = _subFolderCache.get(folderName) ?? null
  if (!folder) {
    try {
      folder = await root.getDirectoryHandle(folderName)
    } catch (err) {
      throw new Error(
        `Audio subfolder not found: "${folderName}" inside chosen folder. ` +
        `Did the visitor pick the folder containing "{game_uuid}/" dirs? ` +
        `(underlying: ${(err as Error).message})`
      )
    }
    _subFolderCache.set(folderName, folder)
  }

  let fileHandle: FileSystemFileHandle
  try {
    fileHandle = await folder.getFileHandle(fileName)
  } catch (err) {
    throw new Error(
      `Audio file not found: "${relativePath}" ` +
      `(underlying: ${(err as Error).message})`
    )
  }
  const file = await fileHandle.getFile()
  return file.arrayBuffer()
}
