import { useEffect, useState } from 'react'
import {
  forgetAudioFolder,
  getAudioFolder,
  isFileSystemAccessSupported,
  pickAudioFolder,
  restoreAudioFolder,
} from './audioFolder'

const MONO = 'monospace'

/**
 * Renders its children only once the visitor has connected a local audio
 * folder (or restored a previously-connected one). In HTTP mode this
 * component is a no-op (children pass through) — but you typically only
 * mount it when STATIC_MODE is true so the no-op path is cosmetic.
 *
 * The "Disconnect" button forgets the saved handle and reopens the
 * picker — useful for switching between game-library installations or
 * recovering from a moved/renamed folder.
 */
export default function PickerGate({ children }: { children: React.ReactNode }) {
  const [connected, setConnected] = useState<boolean>(getAudioFolder() !== null)
  const [error, setError] = useState<string | null>(null)
  const [restoring, setRestoring] = useState<boolean>(true)

  useEffect(() => {
    let cancelled = false
    if (connected) {
      setRestoring(false)
      return
    }
    restoreAudioFolder()
      .then(handle => {
        if (cancelled) return
        if (handle) setConnected(true)
        setRestoring(false)
      })
      .catch(err => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Failed to restore audio folder')
        setRestoring(false)
      })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (connected) return <>{children}</>

  const handlePick = async () => {
    setError(null)
    try {
      const handle = await pickAudioFolder()
      if (handle) setConnected(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open folder picker')
    }
  }

  if (restoring) {
    return <Screen>checking for a remembered audio folder…</Screen>
  }

  if (!isFileSystemAccessSupported()) {
    return (
      <Screen>
        <Heading>This browser can't read local files.</Heading>
        <Body>
          bgmscape's hosted build relies on the File System Access API to read
          your audio without uploading it. Currently supported in Chrome, Edge,
          Brave, Opera, and Arc. Firefox and Safari don't expose this API.
        </Body>
      </Screen>
    )
  }

  return (
    <Screen>
      <Heading>Connect your audio folder</Heading>
      <Body>
        bgmscape never uploads or hosts your audio. The hosted app needs read
        access to a folder on your machine that contains the soundtrack files
        — typically the <code style={{ color: '#90b8e8' }}>audio_files/</code>
        directory inside a local bgmscape checkout.
      </Body>
      <Body>
        Inside that folder you should see per-game subfolders (their names are
        UUIDs) and an <code style={{ color: '#90b8e8' }}>_ambient/</code> folder
        for ambient sounds. Pick the <em>parent</em> folder, not a subfolder.
      </Body>
      {error && (
        <div style={{ color: '#f87171', fontSize: 13, marginBottom: 16 }}>
          {error}
        </div>
      )}
      <button
        onClick={handlePick}
        style={{
          padding: '10px 18px', borderRadius: 4,
          background: '#1e4a8a', color: '#e8f0fe',
          border: '1px solid #4a90d9', cursor: 'pointer',
          fontFamily: MONO, fontSize: 14, fontWeight: 700,
        }}
      >
        Pick folder…
      </button>
      <button
        onClick={() => { void forgetAudioFolder().then(() => setError(null)) }}
        style={{
          marginLeft: 12,
          padding: '10px 14px', borderRadius: 4,
          background: 'transparent', color: '#4a6a8a',
          border: '1px solid #2d4a6e', cursor: 'pointer',
          fontFamily: MONO, fontSize: 12,
        }}
        title="Clear any previously-saved folder handle"
      >
        Forget saved folder
      </button>
    </Screen>
  )
}

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      minHeight: '100vh', background: '#0a1520', color: '#c8d8e8',
      fontFamily: MONO, display: 'flex', justifyContent: 'center',
      padding: '80px 24px',
    }}>
      <div style={{ width: '100%', maxWidth: 580 }}>
        <div style={{
          fontSize: 11, color: '#4a90d9', letterSpacing: 3,
          textTransform: 'uppercase', marginBottom: 14,
        }}>
          bgmscape
        </div>
        {children}
      </div>
    </div>
  )
}

function Heading({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 24, color: '#e8f0fe', fontWeight: 700, marginBottom: 18 }}>
      {children}
    </div>
  )
}

function Body({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: 13, lineHeight: 1.7, color: '#8a9bb0', marginBottom: 14 }}>
      {children}
    </p>
  )
}
