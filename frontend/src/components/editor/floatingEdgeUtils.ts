import { Position, type XYPosition } from 'reactflow'

/**
 * Minimal shape needed from both real internal nodes (from the ReactFlow v11 store)
 * and synthetic connection-target nodes used while dragging.
 */
export interface FloatNode {
  position: XYPosition
  positionAbsolute?: XYPosition
  width?: number
  height?: number
}

/**
 * Returns the point on the border of `intersectionNode` that lies on the line
 * connecting the centres of the two nodes.
 */
function getNodeIntersection(
  intersectionNode: FloatNode,
  targetNode: FloatNode
): XYPosition {
  const w = (intersectionNode.width ?? 0) / 2
  const h = (intersectionNode.height ?? 0) / 2
  const iPos = intersectionNode.positionAbsolute ?? intersectionNode.position
  const tPos = targetNode.positionAbsolute ?? targetNode.position

  const x2 = iPos.x + w
  const y2 = iPos.y + h
  const x1 = tPos.x + (targetNode.width ?? 0) / 2
  const y1 = tPos.y + (targetNode.height ?? 0) / 2

  const xx1 = (x1 - x2) / (2 * w) - (y1 - y2) / (2 * h)
  const yy1 = (x1 - x2) / (2 * w) + (y1 - y2) / (2 * h)
  const a = 1 / (Math.abs(xx1) + Math.abs(yy1))
  const xx3 = a * xx1
  const yy3 = a * yy1

  return {
    x: w * (xx3 + yy3) + x2,
    y: h * (-xx3 + yy3) + y2,
  }
}

/** Returns which side of `node` the given intersection point lies on. */
function getEdgePosition(node: FloatNode, pt: XYPosition): Position {
  const pos = node.positionAbsolute ?? node.position
  const nx = Math.round(pos.x)
  const ny = Math.round(pos.y)
  const px = Math.round(pt.x)
  const py = Math.round(pt.y)
  const w = node.width ?? 0
  const h = node.height ?? 0

  if (px <= nx + 1) return Position.Left
  if (px >= nx + w - 1) return Position.Right
  if (py <= ny + 1) return Position.Top
  if (py >= ny + h - 1) return Position.Bottom
  return Position.Top
}

/**
 * Returns the source and target anchor points on the node borders, plus the
 * ReactFlow Position values needed to orient the bezier curve correctly.
 */
export function getEdgeParams(source: FloatNode, target: FloatNode) {
  const si = getNodeIntersection(source, target)
  const ti = getNodeIntersection(target, source)
  return {
    sx: si.x, sy: si.y,
    tx: ti.x, ty: ti.y,
    sourcePos: getEdgePosition(source, si),
    targetPos: getEdgePosition(target, ti),
  }
}
