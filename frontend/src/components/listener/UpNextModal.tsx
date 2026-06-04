import { useEffect, useState } from 'react'
import { List, X } from 'lucide-react'
import { IconButton, iconSize } from '@/ui/IconButton'
import { color, font, fontSize, radius, shadow, space, weight } from '@/ui/tokens'
import LookaheadQueue from './LookaheadQueue'

interface UpNextIconButtonProps {
  /** Active playback session id. The button hides itself when null so the
   *  modal can't open on a not-yet-started session. */
  sessionId: string | null
  /** Current node id (used by LookaheadQueue to consume entries as the player
   *  advances through them). */
  currentNodeId: string | null
  currentNodeName: string | null
}

/** Header-mounted icon button that opens a small modal containing the
 *  LookaheadQueue. Mirrors the TeleportIconButton + TeleportModal pattern so
 *  both navigation aids feel like part of the same family. */
export function UpNextIconButton({
  sessionId, currentNodeId, currentNodeName,
}: UpNextIconButtonProps) {
  const [open, setOpen] = useState(false)
  if (!sessionId || !currentNodeId || !currentNodeName) return null

  return (
    <>
      <IconButton
        aria-label="What's coming next"
        size="md"
        variant="secondary"
        title="See the predicted next locations"
        onClick={() => setOpen(true)}
      >
        <List size={iconSize.md} />
      </IconButton>

      {open && (
        <UpNextModal
          sessionId={sessionId}
          currentNodeId={currentNodeId}
          currentNodeName={currentNodeName}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}

interface UpNextModalProps {
  sessionId: string
  currentNodeId: string
  currentNodeName: string
  onClose: () => void
}

/** Floating panel listing the current node + the predicted next steps the
 *  wander engine would take if left alone. Read-only by design; for actually
 *  *changing* the next destination, use Steer (chips in the left column) or
 *  Teleport (the other header icon). */
function UpNextModal({
  sessionId, currentNodeId, currentNodeName, onClose,
}: UpNextModalProps) {
  // Esc closes the modal — matches TeleportModal behavior.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0, 0, 0, 0.6)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        paddingTop: '10vh', zIndex: 100,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: color.surfaceRaised,
          border: `1px solid ${color.border}`,
          borderRadius: radius.lg,
          boxShadow: shadow.raised,
          width: '90%', maxWidth: 420, maxHeight: '70vh',
          display: 'flex', flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: space.sm,
          padding: space.md, borderBottom: `1px solid ${color.borderSubtle}`,
        }}>
          <List size={18} color={color.accent} />
          <span style={{
            fontFamily: font.sans, fontSize: fontSize.lg,
            color: color.textPrimary, fontWeight: weight.bold,
            flex: 1,
          }}>
            Up next
          </span>
          <IconButton aria-label="Close" size="sm" variant="ghost" onClick={onClose}>
            <X size={iconSize.sm} />
          </IconButton>
        </div>

        {/* Body — the existing LookaheadQueue, scrollable */}
        <div style={{ padding: space.md, overflowY: 'auto' }}>
          <LookaheadQueue
            sessionId={sessionId}
            currentNodeId={currentNodeId}
            currentNodeName={currentNodeName}
          />
        </div>
      </div>
    </div>
  )
}
