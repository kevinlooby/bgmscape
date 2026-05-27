import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect } from 'react'
import { AudioManager } from './audio/AudioManager'
import { initPlaybackStore } from './store/playback'
import EditorPage from './pages/EditorPage'
import ListenerPage from './pages/ListenerPage'
import GameGridPage from './pages/GameGridPage'

// Initialise the global AudioManager instance once
const audioManager = new AudioManager()
initPlaybackStore(audioManager)

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
        {/* Legacy redirects */}
        <Route path="/editor" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
