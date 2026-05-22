import { useEffect, useRef } from 'react'
import { AudioManager } from './AudioManager'

/**
 * Returns a stable AudioManager instance for the lifetime of the component tree.
 * Attaches a one-time click/keydown listener to resume the AudioContext on first
 * user interaction (required by browser autoplay policy).
 */
export function useAudio(): AudioManager {
  const managerRef = useRef<AudioManager | null>(null)

  if (!managerRef.current) {
    managerRef.current = new AudioManager()
  }

  useEffect(() => {
    const manager = managerRef.current!
    let resumed = false

    const handleInteraction = async () => {
      if (resumed) return
      resumed = true
      await manager.resume()
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

  return managerRef.current
}
