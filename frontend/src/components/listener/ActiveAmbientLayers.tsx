import { useEffect, useState } from 'react'
import { ambientEngine } from '../../App'

interface Layer {
  category: string
  assetName: string
  remainingS: number | null
  status: 'playing' | 'queued'
}

/**
 * Always-visible chip strip near the now-playing card showing every category
 * slot the ambient engine is driving — both actively-playing layers (with a
 * live countdown of seconds remaining in their scheduled play) and queued
 * layers (selected at the most recent node arrival but still loading their
 * audio file). Polls the engine twice per second so the countdown is smooth
 * without burning render cycles.
 *
 * Renders nothing when no ambient is active or queued, so it stays
 * unobtrusive in music-only sessions and on nodes that have no ambient tags.
 */
export default function ActiveAmbientLayers() {
  const [layers, setLayers] = useState<Layer[]>([])

  useEffect(() => {
    const tick = () => setLayers(ambientEngine.getActivePlays())
    tick()
    const id = setInterval(tick, 500)
    return () => clearInterval(id)
  }, [])

  if (layers.length === 0) return null

  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center',
      justifyContent: 'center',
    }}>
      <span style={{
        fontSize: 9, color: '#4a6a8a', letterSpacing: 2,
        textTransform: 'uppercase', fontFamily: 'monospace', marginRight: 2,
      }}>
        Ambient
      </span>
      {layers.map(l => (
        <AmbientChip key={l.category} layer={l} />
      ))}
    </div>
  )
}

function AmbientChip({ layer }: { layer: Layer }) {
  const queued = layer.status === 'queued'
  const remaining = layer.remainingS
  const countdown = remaining == null
    ? '…'
    : remaining > 60
      ? `${Math.floor(remaining / 60)}m ${Math.round(remaining % 60)}s`
      : `${Math.round(remaining)}s`

  return (
    <span
      title={
        queued
          ? `${layer.assetName} — loading`
          : `${layer.assetName} — ${countdown} left`
      }
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '2px 8px', borderRadius: 10,
        background: queued ? '#0c1822' : '#162230',
        border: `1px solid ${queued ? '#1e3a5a' : '#2d4a6e'}`,
        color: queued ? '#5a8aaa' : '#8aa8c8',
        fontSize: 10, fontFamily: 'monospace', letterSpacing: 0.5,
        // Subtle pulse on queued chips so they look distinct from playing
        // chips at a glance.
        opacity: queued ? 0.75 : 1,
      }}
    >
      <span>{layer.category}</span>
      <span style={{
        color: queued ? '#3a5a7a' : '#4a6a8a',
        fontSize: 9,
      }}>
        {queued ? 'loading' : countdown}
      </span>
    </span>
  )
}
