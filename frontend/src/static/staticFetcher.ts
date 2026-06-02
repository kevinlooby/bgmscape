import type { AudioFetcher } from '../api/audio'
import { resolveAudioBytes } from './audioFolder'
import { getSnapshot } from './snapshot'

/**
 * Translates the URL keys produced by `audioUrl()` and `ambientAssetUrl()`
 * into bytes read from the visitor's local audio folder.
 *
 * Both engines store the URL string as their buffer-cache key, so each
 * physical file ends up cached under one stable key whether we resolve
 * it via HTTP or via the local FS. That stability is why the audio
 * engines don't need to know which mode is active.
 *
 * Key shapes we handle:
 *   /api/audio/{game_uuid}/{filename}
 *     → folder = {game_uuid}, file = {filename}
 *   /api/ambient/assets/{assetId}/file
 *     → look up the asset's file_path in the snapshot (e.g. "_ambient/wind.mp3")
 */
export const staticFetcher: AudioFetcher = async (key) => {
  if (key.startsWith('/api/audio/')) {
    const relativePath = key.slice('/api/audio/'.length)
    return resolveAudioBytes(decodeURIComponent(relativePath))
  }
  const ambientMatch = key.match(/^\/api\/ambient\/assets\/([^/]+)\/file$/)
  if (ambientMatch) {
    const assetId = ambientMatch[1]
    const asset = getSnapshot().ambient_assets.find(a => a.id === assetId)
    if (!asset) {
      throw new Error(
        `Ambient asset not in snapshot: ${assetId} ` +
        `(snapshot may be stale relative to a node referencing this asset)`
      )
    }
    return resolveAudioBytes(asset.file_path)
  }
  throw new Error(`Unrecognised audio key in static mode: ${key}`)
}
