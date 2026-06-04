import { useEffect, useState } from 'react'
import { usePlayback } from '../../store/playback'
import { color, font, fontSize, radius, space, weight } from '@/ui/tokens'

/** Thin progress bar that fills as the dwell window runs out, plus the seconds
 *  remaining until the next wander step. Lives at the top of the playback
 *  area; auto-hides when wander is off or during a crossfade.
 *
 *  The store doesn't expose the *original* dwell budget (only the wall-clock
 *  `nextAdvanceAt`), so this component captures the total once when
 *  `nextAdvanceAt` changes and uses it to render the proportional fill. */
export function CountdownBar() {
  const { nextAdvanceAt, wanderActive, transitioning } = usePlayback()
  const [secsLeft, setSecsLeft] = useState<number | null>(null)
  const [totalSecs, setTotalSecs] = useState<number | null>(null)

  useEffect(() => {
    if (!wanderActive || !nextAdvanceAt) {
      setSecsLeft(null)
      setTotalSecs(null)
      return
    }
    setTotalSecs(Math.max(1, Math.ceil((nextAdvanceAt - Date.now()) / 1000)))
    const tick = () => {
      setSecsLeft(Math.max(0, Math.ceil((nextAdvanceAt - Date.now()) / 1000)))
    }
    tick()
    const id = setInterval(tick, 500)
    return () => clearInterval(id)
  }, [nextAdvanceAt, wanderActive])

  if (!wanderActive || secsLeft === null || transitioning) return null

  const progress = totalSecs ? Math.max(0, Math.min(1, secsLeft / totalSecs)) : 0
  const filledWidth = Math.round((1 - progress) * 100)
  const urgent = secsLeft <= 5

  return (
    <div>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 5,
      }}>
        <span style={{
          fontFamily: font.sans,
          fontSize: fontSize.xs,
          color: color.textDim,
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
          fontWeight: weight.medium,
        }}>
          Next advance
        </span>
        <span style={{
          fontFamily: font.mono,
          fontSize: fontSize.sm,
          color: urgent ? color.danger : color.accentBright,
          fontWeight: weight.bold,
        }}>
          {secsLeft}s
        </span>
      </div>
      <div style={{
        height: 4,
        background: color.borderSubtle,
        borderRadius: radius.sm,
        overflow: 'hidden',
        position: 'relative',
      }}>
        <div style={{
          position: 'absolute',
          left: 0, top: 0, bottom: 0,
          width: `${filledWidth}%`,
          background: urgent ? color.danger : color.accent,
          borderRadius: radius.sm,
          transition: 'width 0.5s linear, background 0.3s',
        }} />
      </div>
      <div style={{ height: space.sm }} />
    </div>
  )
}
