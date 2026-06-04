import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect } from 'react'
import { AudioManager } from './audio/AudioManager'
import { AmbientEngine } from './audio/AmbientEngine'
import { httpFetcher } from './api/audio'
import { initPlaybackStore } from './store/playback'
import EditorPage from './pages/EditorPage'
import ListenerPage from './pages/ListenerPage'
import GameGridPage from './pages/GameGridPage'
import AmbientLibraryPage from './pages/AmbientLibraryPage'
import SettingsPage from './pages/SettingsPage'
import { STATIC_MODE } from './static/mode'
import { staticFetcher } from './static/staticFetcher'
import PickerGate from './static/PickerGate'
import LocalOnlyMessage from './static/LocalOnlyMessage'

// Initialise the global AudioManager and the parallel AmbientEngine once.
// The engine shares the AudioContext but routes its own bus into masterGain.
//
// In HTTP mode (default), httpFetcher fetches the URL key directly. In
// static-deploy mode (VITE_STATIC_MODE=true) the audio engines instead
// resolve their keys against a local directory handle picked by the
// visitor — letting the deployed app serve audio that never moves off
// the listener's device.
const audioFetcher = STATIC_MODE ? staticFetcher : httpFetcher
const audioManager = new AudioManager(audioFetcher)
const ambientEngine = new AmbientEngine(audioManager, audioFetcher)
initPlaybackStore(audioManager, ambientEngine)
// Re-exported for the listener UI (active-layers chip strip + volume slider).
export { ambientEngine }

function App() {
  useEffect(() => {
    // Resume AudioContext on first user interaction (browser autoplay policy)
    const handleInteraction = () => {
      audioManager.resume().catch(console.error)
      window.removeEventListener('click', handleInteraction)
      window.removeEventListener('keydown', handleInteraction)
    }
    window.addEventListener('click', handleInteraction)
    window.addEventListener('keydown', handleInteraction)
    return () => {
      window.removeEventListener('click', handleInteraction)
      window.removeEventListener('keydown', handleInteraction)
    }
  }, [])

  // In static mode, gate every listener route behind the folder picker
  // so the audio fetcher always has a directory handle to resolve against.
  // The editor / ambient-library routes don't need audio bytes — they
  // need the local backend, which doesn't exist in this build — so they
  // surface a flat "local-only" message instead.
  const wrapListen = (el: React.ReactNode) =>
    STATIC_MODE ? <PickerGate>{el}</PickerGate> : el

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={wrapListen(<GameGridPage />)} />
        <Route path="/listen/:gameSlug" element={wrapListen(<ListenerPage />)} />
        <Route path="/listen/graph/:graphId" element={wrapListen(<ListenerPage />)} />
        <Route
          path="/games/:gameSlug/edit"
          element={STATIC_MODE ? <LocalOnlyMessage feature="The map editor" /> : <EditorPage />}
        />
        <Route
          path="/ambient"
          element={STATIC_MODE ? <LocalOnlyMessage feature="The ambient library" /> : <AmbientLibraryPage />}
        />
        <Route path="/settings" element={<SettingsPage />} />
        {/* Legacy redirects */}
        <Route path="/editor" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
