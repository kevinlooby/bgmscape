import { Compass, Pause, Play, SkipForward } from 'lucide-react'
import { Card } from '@/ui/Card'
import { IconButton, iconSize } from '@/ui/IconButton'
import { color, font, fontSize, space, weight } from '@/ui/tokens'

interface PlaybackControlsProps {
  playing: boolean
  wanderActive: boolean
  transitioning: boolean
  onPlay: () => void
  onPause: () => void
  onSkip: () => void
  onToggleWander: () => void
}

/** Play / Pause / Skip / Wander as a row of icon buttons inside a subtle card.
 *
 *  Wander uses a Compass icon and visualises its on/off state via the
 *  IconButton's `active` prop. Play and Pause are mutually exclusive disabled
 *  states — only one is "armed" at a time, depending on whether audio is
 *  already playing. */
export function PlaybackControls({
  playing, wanderActive, transitioning,
  onPlay, onPause, onSkip, onToggleWander,
}: PlaybackControlsProps) {
  const playDisabled = playing || transitioning
  const pauseDisabled = !playing || transitioning
  const skipDisabled = !playing || transitioning

  return (
    <Card variant="subtle" padding={space.md}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: space.md,
        flexWrap: 'wrap',
        justifyContent: 'center',
      }}>
        <IconButton
          aria-label="Play"
          size="lg"
          variant="primary"
          active={!playing && !transitioning}
          disabled={playDisabled}
          onClick={onPlay}
        >
          <Play size={iconSize.lg} fill="currentColor" />
        </IconButton>

        <IconButton
          aria-label="Pause"
          size="lg"
          variant="primary"
          active={playing && !transitioning}
          disabled={pauseDisabled}
          onClick={onPause}
        >
          <Pause size={iconSize.lg} fill="currentColor" />
        </IconButton>

        <IconButton
          aria-label="Skip to next location"
          size="lg"
          variant="secondary"
          disabled={skipDisabled}
          onClick={onSkip}
        >
          <SkipForward size={iconSize.lg} />
        </IconButton>

        <div style={{
          width: 1, height: 28, background: color.borderSubtle, margin: `0 ${space.sm}px`,
        }} />

        <IconButton
          aria-label={wanderActive ? 'Turn off auto-wander' : 'Turn on auto-wander'}
          size="lg"
          variant="secondary"
          active={wanderActive && !transitioning}
          disabled={transitioning}
          onClick={onToggleWander}
        >
          <Compass size={iconSize.lg} />
        </IconButton>

        <span style={{
          fontFamily: font.sans,
          fontSize: fontSize.sm,
          color: wanderActive ? color.accentBright : color.textDim,
          fontWeight: wanderActive ? weight.medium : weight.regular,
        }}>
          Wander
        </span>
      </div>
    </Card>
  )
}
