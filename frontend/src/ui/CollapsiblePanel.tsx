import { useEffect, useState, type ReactNode } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Card } from './Card'
import type { CardVariant } from './Card'
import { color, font, fontSize, space, weight } from './tokens'

interface CollapsiblePanelProps {
  title: string
  children: ReactNode
  /** When true, panel starts open. Default false. */
  defaultOpen?: boolean
  /** When provided, open/closed state persists across reloads in localStorage. */
  storageKey?: string
  /** Card variant for the wrapping surface. Defaults to `default`. */
  variant?: CardVariant
  /** Optional content rendered in the header next to the title (e.g. a count). */
  headerExtra?: ReactNode
}

function readStored(key: string | undefined, fallback: boolean): boolean {
  if (!key || typeof window === 'undefined') return fallback
  try {
    const v = window.localStorage.getItem(`panel:${key}`)
    if (v === null) return fallback
    return v === 'open'
  } catch {
    return fallback
  }
}

function writeStored(key: string | undefined, open: boolean): void {
  if (!key || typeof window === 'undefined') return
  try {
    window.localStorage.setItem(`panel:${key}`, open ? 'open' : 'closed')
  } catch { /* ignore quota / private mode */ }
}

/** A Card whose body can collapse behind a chevron-style header. Persists
 *  open/closed across reloads when `storageKey` is provided.
 *
 *  Used for Trail, Lookahead, and the legacy Tuning panel pattern. */
export function CollapsiblePanel({
  title,
  children,
  defaultOpen = false,
  storageKey,
  variant = 'default',
  headerExtra,
}: CollapsiblePanelProps) {
  const [open, setOpen] = useState(() => readStored(storageKey, defaultOpen))

  useEffect(() => {
    writeStored(storageKey, open)
  }, [open, storageKey])

  const Chevron = open ? ChevronDown : ChevronRight

  return (
    <Card variant={variant} padding={open ? space.lg : space.md}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: space.sm,
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        <Chevron size={16} color={color.textMuted} />
        <span style={{
          fontFamily: font.sans,
          fontSize: fontSize.sm,
          color: color.textBody,
          fontWeight: weight.medium,
          letterSpacing: '0.02em',
        }}>
          {title}
        </span>
        {headerExtra && (
          <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center' }}>
            {headerExtra}
          </span>
        )}
      </div>

      {open && (
        <div style={{ marginTop: space.md }}>
          {children}
        </div>
      )}
    </Card>
  )
}
