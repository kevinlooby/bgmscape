import { useEffect, useRef, useState } from 'react'
import { ambientEngine } from '../../App'
import { usePlayback } from '../../store/playback'
import { PixiWorld } from './world/pixiWorld'
import { color, radius } from '@/ui/tokens'

/**
 * WorldSimulation — React shell that hosts the pixel-art Pixi scene.
 *
 * The component itself is intentionally small: it owns a host `<div>`, mounts
 * a `PixiWorld` controller inside it on first render, and forwards a state
 * snapshot from the playback store + ambient engine on every change.
 *
 * StrictMode behavior: in dev React 19 runs every effect twice (mount,
 * cleanup, mount). Each pass creates a fresh `PixiWorld`; the previous
 * instance is fully torn down via its `destroy()` (which is idempotent and
 * safe to call before its async mount resolves). This is the right
 * pattern — using a ref to "skip" the second mount would mask real teardown
 * bugs that would otherwise surface during HMR or user navigation.
 *
 * Sized at 800x416 today — close enough to the right-column slot's natural
 * width on a wide screen. Responsive resize comes in a later PR.
 */

const CANVAS_WIDTH = 800
const CANVAS_HEIGHT = 416

interface AmbientPlay {
  category: string
  status: 'playing' | 'queued'
}

export default function WorldSimulation() {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const worldRef = useRef<PixiWorld | null>(null)

  // Subset of playback store the simulation reads. Subscribed via Zustand
  // selector — re-renders only when one of these fields actually changes.
  const currentNode = usePlayback(s => s.currentNode)
  const transitioning = usePlayback(s => s.transitioning)

  // Ambient categories are polled (no event API on the engine). Same 500ms
  // cadence as AtmosphereCard so both views stay in sync.
  const [activeAmbient, setActiveAmbient] = useState<string[]>([])
  useEffect(() => {
    const tick = () => {
      const plays: AmbientPlay[] = ambientEngine.getActivePlays()
      // De-dupe categories — getActivePlays() returns one entry per asset
      // but the simulation only cares whether a *category* is currently
      // contributing to the soundscape.
      const cats = Array.from(new Set(plays.map(p => p.category)))
      setActiveAmbient(prev => sameArray(prev, cats) ? prev : cats)
    }
    tick()
    const id = setInterval(tick, 500)
    return () => clearInterval(id)
  }, [])

  // Mount / destroy the Pixi controller. Strict dependency list = []: the
  // host div is stable and the snapshot push happens in a separate effect.
  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const world = new PixiWorld({ width: CANVAS_WIDTH, height: CANVAS_HEIGHT })
    worldRef.current = world
    void world.mount(host)

    return () => {
      worldRef.current = null
      world.destroy()
    }
  }, [])

  // Push a snapshot any time the relevant state changes. Runs once after
  // mount with the initial values, then re-runs on each change. The world's
  // update() is a no-op until its async mount finishes — safe to call early.
  useEffect(() => {
    worldRef.current?.update({
      currentNodeId: currentNode?.id ?? null,
      currentNodeName: currentNode?.name ?? null,
      ambientTags: currentNode?.ambient_tags ?? [],
      activeAmbient,
      transitioning,
    })
  }, [currentNode, transitioning, activeAmbient])

  return (
    <div
      style={{
        background: color.surface,
        border: `1px solid ${color.border}`,
        borderRadius: radius.md,
        overflow: 'hidden',
        // Center the fixed-size canvas inside the responsive column. On
        // narrow screens the canvas will overflow horizontally — that's
        // acceptable for PR B; a responsive resize lands in a later PR.
        display: 'flex',
        justifyContent: 'center',
      }}
    >
      <div
        ref={hostRef}
        style={{
          width: CANVAS_WIDTH,
          height: CANVAS_HEIGHT,
          // The Pixi canvas gets appended as a child of this div.
        }}
      />
    </div>
  )
}

function sameArray(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}
