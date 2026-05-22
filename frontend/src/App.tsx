import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect } from 'react'
import { AudioManager } from './audio/AudioManager'
import { initPlaybackStore } from './store/playback'
import EditorPage from './pages/EditorPage'
import ListenerPage from './pages/ListenerPage'

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
        <Route path="/" element={<Navigate to="/editor" replace />} />
        <Route path="/editor" element={<EditorPage />} />
        <Route path="/listen/:graphId" element={<ListenerPage />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
