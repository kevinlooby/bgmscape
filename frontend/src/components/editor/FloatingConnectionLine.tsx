import { getBezierPath, type ConnectionLineComponentProps } from 'reactflow'
import { getEdgeParams, type FloatNode } from './floatingEdgeUtils'

/**
 * Preview line drawn while the user is dragging a new connection.
 * Routes from the nearest border of the source node toward the cursor.
 */
export default function FloatingConnectionLine({
  toX,
  toY,
  fromPosition,
  toPosition,
  fromNode,
}: ConnectionLineComponentProps) {
  if (!fromNode) return null

  // Synthetic 1×1 node at the cursor position acts as the "target"
  const syntheticTarget: FloatNode = {
    position: { x: toX, y: toY },
    positionAbsolute: { x: toX, y: toY },
    width: 1,
    height: 1,
  }

  const { sx, sy } = getEdgeParams(fromNode as FloatNode, syntheticTarget)

  const [path] = getBezierPath({
    sourceX: sx,
    sourceY: sy,
    sourcePosition: fromPosition,
    targetX: toX,
    targetY: toY,
    targetPosition: toPosition,
  })

  return (
    <g>
      <path fill="none" stroke="#4a90d9" strokeWidth={1.5} d={path} />
      <circle cx={toX} cy={toY} r={3} fill="#0a1520" stroke="#4a90d9" strokeWidth={1.5} />
    </g>
  )
}
