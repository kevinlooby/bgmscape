import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, X, Zap } from 'lucide-react'
import { Button } from '@/ui/Button'
import { IconButton, iconSize } from '@/ui/IconButton'
import { color, font, fontSize, radius, shadow, space, weight } from '@/ui/tokens'
import type { Node } from '../../types'

interface TeleportButtonProps {
  /** All graph nodes except the current one — destinations to choose from. */
  nodes: Node[]
  /** True while the engine is mid-crossfade — block teleports. */
  transitioning: boolean
  /** Teleport handler. */
  onTeleport: (nodeId: string) => void
}

/** Single button that opens the teleport modal. Keeps the listener page tidy
 *  by not rendering one chip per node — important once a graph has 50+ nodes. */
export function TeleportButton({ nodes, transitioning, onTeleport }: TeleportButtonProps) {
  const [open, setOpen] = useState(false)
  const disabled = transitioning || nodes.length === 0

  return (
    <>
      <Button
        variant="secondary"
        size="md"
        leading={<Zap size={16} />}
        disabled={disabled}
        onClick={() => setOpen(true)}
        title={
          nodes.length === 0
            ? 'No other locations in this graph yet'
            : 'Jump to any location'
        }
      >
        Teleport…
      </Button>

      {open && (
        <TeleportModal
          nodes={nodes}
          onClose={() => setOpen(false)}
          onPick={(id) => { onTeleport(id); setOpen(false) }}
        />
      )}
    </>
  )
}

interface TeleportModalProps {
  nodes: Node[]
  onClose: () => void
  onPick: (nodeId: string) => void
}

/** Search-filtered list of every other node in the graph. Focused on open;
 *  closes on Escape; click outside to dismiss; type to filter. */
function TeleportModal({ nodes, onClose, onPick }: TeleportModalProps) {
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // Autofocus the search input and listen for Escape.
  useEffect(() => {
    inputRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return nodes
    return nodes.filter(n =>
      n.name.toLowerCase().includes(q) ||
      (n.region?.toLowerCase().includes(q) ?? false)
    )
  }, [nodes, query])

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
          width: '90%', maxWidth: 500, maxHeight: '70vh',
          display: 'flex', flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: space.sm,
          padding: space.md, borderBottom: `1px solid ${color.borderSubtle}`,
        }}>
          <Zap size={18} color={color.accent} />
          <span style={{
            fontFamily: font.sans, fontSize: fontSize.lg,
            color: color.textPrimary, fontWeight: weight.bold,
            flex: 1,
          }}>
            Teleport to…
          </span>
          <IconButton aria-label="Close" size="sm" variant="ghost" onClick={onClose}>
            <X size={iconSize.sm} />
          </IconButton>
        </div>

        {/* Search */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: space.sm,
          padding: space.md, borderBottom: `1px solid ${color.borderSubtle}`,
        }}>
          <Search size={16} color={color.textDim} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search locations…"
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: color.textPrimary,
              fontFamily: font.sans,
              fontSize: fontSize.md,
            }}
          />
        </div>

        {/* Result list */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {filtered.length === 0 && (
            <div style={{
              padding: space.lg, color: color.textFaint,
              fontFamily: font.sans, fontSize: fontSize.sm, textAlign: 'center',
            }}>
              No matches.
            </div>
          )}
          {filtered.map(n => (
            <div
              key={n.id}
              onClick={() => onPick(n.id)}
              style={{
                padding: `${space.sm}px ${space.md}px`,
                cursor: 'pointer',
                borderBottom: `1px solid ${color.borderSubtle}`,
                display: 'flex', alignItems: 'center', gap: space.sm,
              }}
              onMouseEnter={e => { e.currentTarget.style.background = color.surface }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
            >
              <Zap size={12} color={color.textDim} />
              <span style={{
                fontFamily: font.sans, fontSize: fontSize.md,
                color: color.textBody, flex: 1,
              }}>
                {n.name}
              </span>
              {n.region && (
                <span style={{
                  fontFamily: font.sans, fontSize: fontSize.xs,
                  color: color.textFaint,
                }}>
                  {n.region}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
