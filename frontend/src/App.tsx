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

// Initialise the global AudioManager and the parallel AmbientEngine once.
// The engine shares the AudioContext but routes its own bus into masterGain.
//
// The fetcher abstraction is the seam for static-deploy mode (Vercel build).
// In HTTP mode (default), httpFetcher fetches the key as a URL. A future
// staticFetcher will resolve keys against a local directory handle picked
// by the visitor — letting the deployed app serve audio that never moves
// off the listener's device.
const audioFetcher = httpFetcher
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

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<GameGridPage />} />
        <Route path="/listen/:gameSlug" element={<ListenerPage />} />
        <Route path="/listen/graph/:graphId" element={<ListenerPage />} />
        <Route path="/games/:gameSlug/edit" element={<EditorPage />} />
        <Route path="/ambient" element={<AmbientLibraryPage />} />
        {/* Legacy redirects */}
        <Route path="/editor" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
