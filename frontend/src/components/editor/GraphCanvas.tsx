import { useCallback, useEffect, useMemo } from 'react'
import ReactFlow, {
  Background,
  Controls,
  MarkerType,
  ReactFlowProvider,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Node as RFNode,
  type Edge as RFEdge,
  type Connection,
  type NodeChange,
  type NodeMouseHandler,
  type EdgeMouseHandler,
  BackgroundVariant,
} from 'reactflow'
import 'reactflow/dist/style.css'
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  type SimulationNodeDatum,
} from 'd3-force'

import { useEditor } from '../../store/editor'
import LocationNode from './LocationNode'
import FloatingEdge from './FloatingEdge'
import FloatingConnectionLine from './FloatingConnectionLine'
import type { Node as DomainNode, Edge as DomainEdge } from '../../types'

const nodeTypes = { locationNode: LocationNode }
const edgeTypes = { floating: FloatingEdge }

// ── Types ─────────────────────────────────────────────────────────────────────

interface LayoutNode extends SimulationNodeDatum {
  id: string
}

interface SimLink {
  source: string
  target: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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
    type: 'floating',
    selected,
    animated: false,
    style: { stroke: edge.bidirectional ? '#4a90d9' : '#90b8e8', strokeWidth: 2 },
    markerEnd: { type: MarkerType.ArrowClosed, color: '#4a90d9' },
    ...(edge.bidirectional ? { markerStart: { type: MarkerType.ArrowClosed, color: '#4a90d9' } } : {}),
    label: edge.weight !== 1.0 ? `×${edge.weight}` : undefined,
    labelStyle: { fill: '#8a9bb0', fontSize: 10 },
  }
}

// ── Layout algorithm ──────────────────────────────────────────────────────────

function runForceLayout(simNodes: LayoutNode[], simLinks: SimLink[]): void {
  forceSimulation(simNodes)
    .force('link', forceLink<LayoutNode, SimLink>(simLinks).id(d => d.id).distance(220).strength(0.8))
    .force('charge', forceManyBody().strength(-500))
    .force('center', forceCenter(0, 0))
    .force('collide', forceCollide<LayoutNode>(110))
    .stop()
    .tick(300)
}

// ── Inner canvas (needs ReactFlow context for useReactFlow) ───────────────────

function GraphCanvasInner() {
  const { fitView } = useReactFlow()
  const {
    graph, selectedNodeId, selectedEdgeId,
    selectNode, selectEdge, updateNode, createEdge, createNode,
    batchUpdateNodePositions,
  } = useEditor()

  const [rfNodes, setRFNodes, onNodesChange] = useNodesState<DomainNode>([])
  const [rfEdges, setRFEdges, onEdgesChange] = useEdgesState<DomainEdge>([])

  // Sync RF state from store whenever the graph or selection changes
  useEffect(() => {
    if (!graph) {
      setRFNodes([])
      setRFEdges([])
      return
    }
    setRFNodes(graph.nodes.map(n => toRFNode(n, n.id === selectedNodeId)))
    setRFEdges(graph.edges.map(e => toRFEdge(e, e.id === selectedEdgeId)))
  }, [graph, selectedNodeId, selectedEdgeId, setRFNodes, setRFEdges])

  // Auto-apply force layout and fit viewport when switching graphs
  useEffect(() => {
    if (!graph || graph.nodes.length === 0) return
    const simNodes = graph.nodes.map(n => ({ id: n.id, x: n.canvas_x, y: n.canvas_y }))
    const simLinks = graph.edges.map(e => ({ source: e.source_node_id, target: e.target_node_id }))
    runForceLayout(simNodes, simLinks)
    batchUpdateNodePositions(simNodes.map(n => ({ id: n.id, x: n.x ?? 0, y: n.y ?? 0 })))
      .then(() => setTimeout(() => fitView({ padding: 0.15, duration: 400 }), 50))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph?.id])

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

  // ── Manual re-layout ────────────────────────────────────────────────────────

  const applyLayout = useCallback(async () => {
    if (!graph || graph.nodes.length === 0) return
    const simNodes: LayoutNode[] = graph.nodes.map(n => ({ id: n.id, x: n.canvas_x, y: n.canvas_y }))
    const simLinks: SimLink[] = graph.edges.map(e => ({ source: e.source_node_id, target: e.target_node_id }))
    runForceLayout(simNodes, simLinks)
    await batchUpdateNodePositions(simNodes.map(n => ({ id: n.id, x: n.x ?? 0, y: n.y ?? 0 })))
    setTimeout(() => fitView({ padding: 0.15, duration: 400 }), 50)
  }, [graph, batchUpdateNodePositions, fitView])

  // ── Render ──────────────────────────────────────────────────────────────────

  if (!graph) {
    return (
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#0a1520', color: '#4a6a8a', fontFamily: 'monospace',
      }}>
        Select or create a graph to start editing.
      </div>
    )
  }

  return (
    <div style={{ flex: 1, position: 'relative' }}>
      {/* Canvas overlay: Add Node + layout controls */}
      <div style={{
        position: 'absolute', top: 12, left: 12, zIndex: 10,
        display: 'flex', gap: 8, alignItems: 'center',
      }}>
        <button
          onClick={handleAddNode}
          style={{
            background: '#1e4a8a', color: '#90b8e8', border: '1px solid #4a90d9',
            borderRadius: 4, padding: '6px 14px', cursor: 'pointer',
            fontSize: 12, fontFamily: 'monospace',
          }}
        >
          + Add Node
        </button>

        <button
          onClick={applyLayout}
          title="Re-run force layout"
          style={{
            background: '#1e2a3a', color: '#8a9bb0', border: '1px solid #2d4a6e',
            borderRadius: 4, padding: '6px 14px', cursor: 'pointer',
            fontSize: 12, fontFamily: 'monospace',
          }}
        >
          ⊞ Layout
        </button>
      </div>

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
        edgeTypes={edgeTypes}
        connectionLineComponent={FloatingConnectionLine}
        fitView
        style={{ background: '#0a1520' }}
        deleteKeyCode={null}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#1a2a3a" variant={BackgroundVariant.Dots} gap={20} />
        <Controls style={{ background: '#1e2a3a', border: '1px solid #2d4a6e' }} />
      </ReactFlow>
    </div>
  )
}

// ── Public export: wraps with ReactFlowProvider ───────────────────────────────

export default function GraphCanvas() {
  return (
    <ReactFlowProvider>
      <GraphCanvasInner />
    </ReactFlowProvider>
  )
}
