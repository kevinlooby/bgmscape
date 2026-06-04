import { Card } from '@/ui/Card'
import { Chip } from '@/ui/Chip'
import { color, font, fontSize, space, weight } from '@/ui/tokens'

interface NowPlayingCardProps {
  /** Display name of the current node, or null if none. */
  nodeName: string | null
  /** Region label, or null. Rendered in accent color under the name. */
  region: string | null
  /** True while the engine is mid-crossfade. */
  transitioning: boolean
  /** Steer target name (or null if none nominated). When transitioning is false
   *  and this is set, a "→ steering to X" badge appears. */
  nominatedName: string | null
}

/** The primary surface on the listener page — the answer to "what am I hearing
 *  right now?". Big location name on a raised card; small status chips below.
 *
 *  Note that audio file path and ambient layer chips no longer live here. The
 *  filename moves to a muted line below the card; ambient chips get their own
 *  Atmosphere card. Keeping this card clean keeps the location name primary. */
export function NowPlayingCard({
  nodeName, region, transitioning, nominatedName,
}: NowPlayingCardProps) {
  return (
    <Card variant="raised" padding={space.xl}>
      <div style={{
        fontSize: fontSize.xs,
        color: color.textDim,
        letterSpacing: '0.3em',
        textTransform: 'uppercase',
        fontWeight: weight.medium,
        marginBottom: space.md,
      }}>
        Now playing
      </div>

      <div style={{
        fontSize: fontSize.hero,
        color: color.textPrimary,
        fontFamily: font.sans,
        fontWeight: weight.bold,
        lineHeight: 1.15,
        letterSpacing: '-0.01em',
        marginBottom: region ? space.sm : space.md,
        wordBreak: 'break-word',
      }}>
        {nodeName ?? '—'}
      </div>

      {region && (
        <div style={{
          fontSize: fontSize.md,
          color: color.accent,
          fontFamily: font.sans,
          marginBottom: space.md,
        }}>
          {region}
        </div>
      )}

      {/* Status chips. Reserve vertical space so the card doesn't jump when a
          chip appears/disappears mid-transition. */}
      <div style={{
        display: 'flex', gap: space.sm, flexWrap: 'wrap',
        minHeight: 24, alignItems: 'center',
      }}>
        {transitioning && (
          <Chip tone="accent" withDot>crossfading</Chip>
        )}
        {nominatedName && !transitioning && (
          <Chip tone="accent" withDot>steering to {nominatedName}</Chip>
        )}
      </div>
    </Card>
  )
}
