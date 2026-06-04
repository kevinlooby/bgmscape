import { CollapsiblePanel } from '@/ui/CollapsiblePanel'
import { color, font, fontSize, space, weight } from '@/ui/tokens'
import type { Node } from '../../types'

interface TrailCardProps {
  /** Most recent visited node IDs, oldest → newest. Same shape as
   *  `playback.wanderHistory`. */
  wanderHistory: string[]
  /** All nodes in the current graph, used for ID → name lookup. */
  nodes: Node[]
  /** The current node — rendered in bold at the end of the trail. */
  currentNode: Node | null
  /** Maximum trail entries to show (oldest are dropped). Default 7. */
  limit?: number
}

/** Collapsible "Recent path" panel. Default closed; remembers its open/closed
 *  state in localStorage. The graph view already shows the current + future
 *  path; this is for inspecting where you've been. */
export function TrailCard({
  wanderHistory, nodes, currentNode, limit = 7,
}: TrailCardProps) {
  if (wanderHistory.length <= 1) return null

  const recent = wanderHistory.slice(-limit)
  const nodeName = (id: string) => nodes.find(n => n.id === id)?.name ?? id.slice(0, 8)

  return (
    <CollapsiblePanel
      title={`Recent path (${wanderHistory.length})`}
      storageKey="listener-trail"
      defaultOpen={false}
    >
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: space.xs,
        flexWrap: 'wrap',
        fontSize: fontSize.sm,
        color: color.textFaint,
        fontFamily: font.sans,
      }}>
        {recent.map((id, i) => {
          const isLast = i === recent.length - 1
          return (
            <span key={`${id}-${i}`} style={{ display: 'inline-flex', alignItems: 'center', gap: space.xs }}>
              <span style={{ color: isLast ? color.textMuted : color.textDim }}>
                {nodeName(id)}
              </span>
              <span style={{ color: color.borderSubtle }}>→</span>
            </span>
          )
        })}
        <span style={{
          color: color.accentBright,
          fontWeight: weight.bold,
        }}>
          {currentNode?.name ?? '—'}
        </span>
      </div>
    </CollapsiblePanel>
  )
}
