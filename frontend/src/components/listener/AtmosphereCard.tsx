import { useEffect, useState } from 'react'
import { ambientEngine } from '../../App'
import { Card } from '@/ui/Card'
import { color, font, fontSize, space, weight } from '@/ui/tokens'

interface Layer {
  category: string
  assetName: string
  remainingS: number | null
  status: 'playing' | 'queued'
}

/** Shows every category slot the ambient engine is currently driving — both
 *  actively-playing layers (with live countdown) and queued layers (still
 *  loading their buffer). Polls the engine twice per second so the countdown
 *  feels smooth.
 *
 *  Returns null when nothing is active — keeping the listener page tidy on
 *  music-only sessions and on nodes without ambient tags.
 *
 *  This component replaces the old ActiveAmbientLayers, which was embedded in
 *  the now-playing card and crowded the location name. */
export function AtmosphereCard() {
  const [layers, setLayers] = useState<Layer[]>([])

  useEffect(() => {
    const tick = () => setLayers(ambientEngine.getActivePlays())
    tick()
    const id = setInterval(tick, 500)
    return () => clearInterval(id)
  }, [])

  if (layers.length === 0) return null

  return (
    <Card padding={space.md}>
      <div style={{
        fontSize: fontSize.xs,
        color: color.textDim,
        letterSpacing: '0.2em',
        textTransform: 'uppercase',
        fontWeight: weight.medium,
        marginBottom: space.sm,
      }}>
        Atmosphere
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: space.sm }}>
        {layers.map(layer => (
          <LayerChip key={layer.category} layer={layer} />
        ))}
      </div>
    </Card>
  )
}

function formatRemaining(s: number | null): string {
  if (s === null) return 'loading'
  if (s > 60) return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`
  return `${Math.round(s)}s`
}

/** A pill showing a single ambient layer's category + status (countdown or
 *  'loading'). Queued layers render slightly dimmer so they read as
 *  "about to play" rather than "currently playing". */
function LayerChip({ layer }: { layer: Layer }) {
  const queued = layer.status === 'queued'
  const remaining = formatRemaining(layer.remainingS)
  return (
    <span
      title={queued ? `${layer.assetName} — loading` : `${layer.assetName} — ${remaining} left`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: space.xs,
        padding: `2px ${space.sm}px`,
        borderRadius: 999,
        background: queued ? color.surfaceSubtle : color.surface,
        border: `1px solid ${queued ? color.borderSubtle : color.border}`,
        color: queued ? color.textFaint : color.textMuted,
        opacity: queued ? 0.75 : 1,
        fontSize: fontSize.xs,
        fontFamily: font.sans,
      }}
    >
      <span style={{ fontWeight: weight.medium }}>{layer.category}</span>
      <span style={{ color: queued ? color.textDim : color.textFaint, fontFamily: font.mono }}>
        {remaining}
      </span>
    </span>
  )
}
