import { useCallback, useEffect, useMemo } from 'react'
import ReactFlow, {
  Background,
  Controls,
  MarkerType,
  useNodesState,
  useEdgesState,
  type Node as RFNode,
  type Edge as RFEdge,
  type Connection,
  type NodeChange,
  type NodeMouseHandler,
  type EdgeMouseHandler,
  BackgroundVariant,
} from 'reactflow'
import 'reactflow/dist/style.css'

import { useEditor } from '../../store/editor'
import LocationNode from './LocationNode'
import type { Node as DomainNode, Edge as DomainEdge } from '../../types'

const nodeTypes = { locationNode: LocationNode }

// Debounce helper
function debounce<T extends (...args: Parameters<T>) => void>(fn: T, delay: number) {
  let timer: ReturnType<typeof setTimeout>
  return (...args: Parameters<T>) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), delay)
  }
}

function toRFNode(node: DomainNode, selected: boolean): RFNode<DomainNode> {
  return {
    id: node.id,
    position: { x: node.canvas_x, y: node.canvas_y },
    data: node,
    type: 'locationNode',
    selected,
  }
}

function toRFEdge(edge: DomainEdge, selected: boolean): RFEdge<DomainEdge> {
  return {
    id: edge.id,
    source: edge.source_node_id,
    target: edge.target_node_id,
    data: edge,
    type: 'default',
    selected,
    animated: false,
    style: { stroke: edge.bidirectional ? '#4a90d9' : '#90b8e8', strokeWidth: 2 },
    markerEnd: { type: MarkerType.ArrowClosed, color: '#4a90d9' },
    ...(edge.bidirectional ? { markerStart: { type: MarkerType.ArrowClosed, color: '#4a90d9' } } : {}),
    label: edge.weight !== 1.0 ? `×${edge.weight}` : undefined,
    labelStyle: { fill: '#8a9bb0', fontSize: 10 },
  }
}

export default function GraphCanvas() {
  const { graph, selectedNodeId, selectedEdgeId, selectNode, selectEdge, updateNode, createEdge, createNode } = useEditor()

  const [rfNodes, setRFNodes, onNodesChange] = useNodesState<DomainNode>([])
  const [rfEdges, setRFEdges, onEdgesChange] = useEdgesState<DomainEdge>([])

  // Sync RF state from store whenever the graph changes
  useEffect(() => {
    if (!graph) {
      setRFNodes([])
      setRFEdges([])
      return
    }
    setRFNodes(graph.nodes.map(n => toRFNode(n, n.id === selectedNodeId)))
    setRFEdges(graph.edges.map(e => toRFEdge(e, e.id === selectedEdgeId)))
  }, [graph, selectedNodeId, selectedEdgeId])

  // Debounced canvas position save
  const savePosition = useMemo(
    () =>
      debounce((nodeId: string, x: number, y: number) => {
        updateNode(nodeId, { canvas_x: x, canvas_y: y })
      }, 400),
    [updateNode]
  )

  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      onNodesChange(changes)
      for (const change of changes) {
        if (change.type === 'position' && change.position && !change.dragging) {
          savePosition(change.id, change.position.x, change.position.y)
        }
      }
    },
    [onNodesChange, savePosition]
  )

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return
      createEdge({ source_node_id: connection.source, target_node_id: connection.target })
    },
    [createEdge]
  )

  const onNodeClick: NodeMouseHandler = useCallback(
    (_, node) => selectNode(node.id),
    [selectNode]
  )

  const onEdgeClick: EdgeMouseHandler = useCallback(
    (_, edge) => selectEdge(edge.id),
    [selectEdge]
  )

  const onPaneClick = useCallback(() => {
    selectNode(null)
    selectEdge(null)
  }, [selectNode, selectEdge])

  const handleAddNode = async () => {
    const node = await createNode({
      name: 'New Location',
      canvas_x: 200 + Math.random() * 200,
      canvas_y: 200 + Math.random() * 200,
    })
    if (node) selectNode(node.id)
  }

  if (!graph) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a1520', color: '#4a6a8a', fontFamily: 'monospace' }}>
        Select or create a graph to start editing.
      </div>
    )
  }

  return (
    <div style={{ flex: 1, position: 'relative' }}>
      {/* Add Node button overlaid on canvas */}
      <button
        onClick={handleAddNode}
        style={{
          position: 'absolute', top: 12, left: 12, zIndex: 10,
          background: '#1e4a8a', color: '#90b8e8', border: '1px solid #4a90d9',
          borderRadius: 4, padding: '6px 14px', cursor: 'pointer',
          fontSize: 12, fontFamily: 'monospace',
        }}
      >
        + Add Node
      </button>

      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        onNodesChange={handleNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        fitView
        style={{ background: '#0a1520' }}
        deleteKeyCode={null}
      >
        <Background color="#1a2a3a" variant={BackgroundVariant.Dots} gap={20} />
        <Controls style={{ background: '#1e2a3a', border: '1px solid #2d4a6e' }} />
      </ReactFlow>
    </div>
  )
}
