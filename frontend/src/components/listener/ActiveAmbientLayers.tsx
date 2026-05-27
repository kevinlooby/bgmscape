import { useEffect, useState } from 'react'
import { ambientEngine } from '../../App'

interface Layer {
  category: string
  assetName: string
  remainingS: number
}

/**
 * Always-visible chip strip showing which ambient categories are currently
 * playing. Polls the AmbientEngine once per second — light enough that
 * setInterval is fine and avoids plumbing engine events through the store.
 *
 * Renders nothing when no ambient is playing, so it stays unobtrusive in
 * sessions that don't use the ambient layer at all.
 */
export default function ActiveAmbientLayers() {
  const [layers, setLayers] = useState<Layer[]>([])

  useEffect(() => {
    const tick = () => setLayers(ambientEngine.getActivePlays())
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  if (layers.length === 0) return null

  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center',
      marginTop: 4, marginBottom: 4,
    }}>
      <span style={{
        fontSize: 9, color: '#4a6a8a', letterSpacing: 2,
        textTransform: 'uppercase', fontFamily: 'monospace', marginRight: 2,
      }}>
        Ambient
      </span>
      {layers.map(l => (
        <span
          key={l.category}
          title={`${l.assetName} — ${Math.round(l.remainingS)}s left`}
          style={{
            display: 'inline-block', padding: '2px 8px', borderRadius: 10,
            background: '#162230', color: '#8aa8c8',
            border: '1px solid #2d4a6e',
            fontSize: 10, fontFamily: 'monospace', letterSpacing: 0.5,
          }}
        >
          {l.category}
        </span>
      ))}
    </div>
  )
}
