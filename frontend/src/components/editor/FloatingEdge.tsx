import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  useStore,
  type EdgeProps,
} from 'reactflow'
import { getEdgeParams } from './floatingEdgeUtils'

/**
 * Custom edge that routes from the nearest border of the source node to the
 * nearest border of the target node, ignoring fixed handle positions.
 *
 * Uses BaseEdge so markerEnd/markerStart (arrows), selection styling, and
 * interactivity all work without any extra plumbing.
 */
export default function FloatingEdge({
  id,
  source,
  target,
  style,
  markerEnd,
  markerStart,
  label,
  labelStyle,
}: EdgeProps) {
  const { sourceNode, targetNode } = useStore(s => ({
    sourceNode: s.nodeInternals.get(source),
    targetNode: s.nodeInternals.get(target),
  }))

  if (!sourceNode || !targetNode) return null

  const { sx, sy, tx, ty, sourcePos, targetPos } = getEdgeParams(sourceNode, targetNode)

  const [path, labelX, labelY] = getBezierPath({
    sourceX: sx,
    sourceY: sy,
    sourcePosition: sourcePos,
    targetX: tx,
    targetY: ty,
    targetPosition: targetPos,
  })

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        style={style}
        markerEnd={markerEnd}
        markerStart={markerStart}
      />
      {label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              pointerEvents: 'all',
              transform: `translate(-50%,-50%) translate(${labelX}px,${labelY}px)`,
              ...(labelStyle as React.CSSProperties),
            }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}
