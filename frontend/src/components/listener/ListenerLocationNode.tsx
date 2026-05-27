import { memo } from 'react'
import { Handle, Position, type NodeProps } from 'reactflow'
import type { Node as DomainNode } from '../../types'

export interface ListenerNodeData extends DomainNode {
  isCurrent: boolean
  lookaheadDepth: number | null  // 1 = next, 2 = two ahead, …, null = not in path
}

const DEPTH_OPACITY: Record<number, number> = {
  1: 0.9, 2: 0.75, 3: 0.6, 4: 0.45, 5: 0.35,
}

const DEPTH_BORDER: Record<number, string> = {
  1: '#4a90d9', 2: '#3a7ab8', 3: '#2d5e8a', 4: '#223d5a', 5: '#1a2f42',
}

// Handles must exist for ReactFlow to render edges, even though the listener
// view is non-interactive and FloatingEdge routes from node borders, not handles.
const hiddenHandleStyle: React.CSSProperties = {
  opacity: 0,
  width: 1,
  height: 1,
  background: 'transparent',
  border: 'none',
  pointerEvents: 'none',
}

function ListenerLocationNode({ data }: NodeProps<ListenerNodeData>) {
  const { isCurrent, lookaheadDepth } = data

  const opacity = isCurrent
    ? 1
    : lookaheadDepth !== null
      ? (DEPTH_OPACITY[lookaheadDepth] ?? 0.35)
      : 0.2

  const borderColor = isCurrent
    ? '#f0c040'
    : lookaheadDepth !== null
      ? (DEPTH_BORDER[lookaheadDepth] ?? '#1a2f42')
      : '#1a2a3a'

  const boxShadow = isCurrent ? '0 0 14px 3px rgba(240, 192, 64, 0.6)' : undefined

  return (
    <div style={{
      background: '#1e2a3a',
      border: `2px solid ${borderColor}`,
      borderRadius: 8,
      padding: '8px 12px',
      minWidth: 130,
      fontFamily: 'monospace',
      opacity,
      boxShadow,
      userSelect: 'none',
    }}>
      <Handle type="target" position={Position.Top}    style={hiddenHandleStyle} />
      <Handle type="source" position={Position.Right}  style={hiddenHandleStyle} />
      <Handle type="target" position={Position.Bottom} style={hiddenHandleStyle} id="b" />
      <Handle type="source" position={Position.Left}   style={hiddenHandleStyle} id="l" />

      <div style={{ color: '#e8f0fe', fontWeight: 700, fontSize: 12, marginBottom: 2 }}>
        {data.name}
      </div>
      {data.region && (
        <div style={{
          display: 'inline-block', background: '#2d4a6e', color: '#90b8e8',
          fontSize: 9, padding: '1px 5px', borderRadius: 3,
        }}>
          {data.region}
        </div>
      )}
    </div>
  )
}

export default memo(ListenerLocationNode)
