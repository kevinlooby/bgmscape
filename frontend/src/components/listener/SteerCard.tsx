import { ArrowRight } from 'lucide-react'
import { Card } from '@/ui/Card'
import { Chip } from '@/ui/Chip'
import { color, font, fontSize, space, weight } from '@/ui/tokens'
import type { Node } from '../../types'

interface SteerCardProps {
  neighbors: Node[]
  nominatedNextNodeId: string | null
  wanderActive: boolean
  onSteer: (nodeId: string) => void
}

/** "Where do you want to go next?" — a chip row of the current node's neighbors.
 *  Clicking nominates a destination; the engine picks it up at the next wander
 *  step (or immediately when the user hits Skip). */
export function SteerCard({
  neighbors, nominatedNextNodeId, wanderActive, onSteer,
}: SteerCardProps) {
  if (neighbors.length === 0) return null

  return (
    <Card>
      <div style={{
        fontSize: fontSize.xs,
        color: color.textDim,
        letterSpacing: '0.2em',
        textTransform: 'uppercase',
        fontWeight: weight.medium,
        marginBottom: space.sm,
      }}>
        Steer to next
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: space.xs }}>
        {neighbors.map(n => {
          const isNominated = n.id === nominatedNextNodeId
          return (
            <Chip
              key={n.id}
              tone="accent"
              size="md"
              active={isNominated}
              onClick={() => onSteer(n.id)}
            >
              {isNominated && (
                <ArrowRight size={12} style={{ marginRight: 4 }} />
              )}
              {n.name}
            </Chip>
          )
        })}
      </div>

      {nominatedNextNodeId && (
        <div style={{
          marginTop: space.sm,
          fontSize: fontSize.xs,
          color: color.textFaint,
          fontFamily: font.sans,
        }}>
          {wanderActive
            ? 'Plays at the next wander step. Hit Skip to advance now.'
            : 'Hit Skip to advance now.'}
        </div>
      )}
    </Card>
  )
}
