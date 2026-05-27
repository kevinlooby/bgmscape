import { useEffect, useMemo, useRef, useState } from 'react'
import ReactFlow, {
  Background,
  BackgroundVariant,
  MarkerType,
  ReactFlowProvider,
  useNodesState,
  useReactFlow,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { usePlayback } from '../../store/playback'
import { lookaheadSession } from '../../api/sessions'
import FloatingEdge from '../editor/FloatingEdge'
import ListenerLocationNode, { type ListenerNodeData } from './ListenerLocationNode'
import type { LookaheadStep } from '../../types'

const nodeTypes = { listenerNode: ListenerLocationNode }
const edgeTypes = { floating: FloatingEdge }

// Opacity for path edges at each depth (index = depth - 1)
const PATH_DEPTH_OPACITY = [1.0, 0.75, 0.6, 0.45, 0.35]
// Animation duration for path edges: faster at depth 1, slower deeper
const PATH_DEPTH_DURATION = [0.6, 0.8, 1.0, 1.1, 1.2]

const ANIM_CSS_ID = 'bgmscape-listener-anim'
function injectAnimCSS() {
  if (document.getElementById(ANIM_CSS_ID)) return
  const el = document.createElement('style')
  el.id = ANIM_CSS_ID
  // Positive-increasing dashoffset makes dashes flow source → target.
  // Period of '6 4' dasharray = 10, so animating by 10 gives a seamless loop.
  el.textContent = `@keyframes bgmflow { from { stroke-dashoffset: 0; } to { stroke-dashoffset: 10; } }`
  document.head.appendChild(el)
}

function ListenerGraphInner() {
  const { graph, currentNode, sessionId } = usePlayback()
  const { fitView } = useReactFlow()
  const [lookaheadSteps, setLookaheadSteps] = useState<LookaheadStep[]>([])
  const fetchGenRef = useRef(0)
  const fittedRef = useRef(false)

  // Use useNodesState so React Flow properly propagates dimension updates through
  // nodeInternals — required for FloatingEdge border-to-border routing.
  const [rfNodeState, setRFNodeState, onNodesChange] = useNodesState<ListenerNodeData>([])

  useEffect(() => { injectAnimCSS() }, [])

  // Re-fetch lookahead whenever the current node changes
  useEffect(() => {
    if (!sessionId) return
    const gen = ++fetchGenRef.current
    lookaheadSession(sessionId, 8)
      .then(res => { if (gen === fetchGenRef.current) setLookaheadSteps(res.steps) })
      .catch(() => {})
  }, [sessionId, currentNode?.id])

  // Ordered path: currentNode → step0 → step1 → … (capped at 6 entries)
  const lookaheadPath = useMemo(() => {
    if (!currentNode) return []
    return [currentNode.id, ...lookaheadSteps.slice(0, 5).map(s => s.node_id)]
  }, [currentNode, lookaheadSteps])

  // depth map: node_id → 1-indexed position in lookahead (1 = next)
  const depthMap = useMemo(() => {
    const m = new Map<string, number>()
    lookaheadSteps.slice(0, 5).forEach((step, i) => m.set(step.node_id, i + 1))
    return m
  }, [lookaheadSteps])

  // Set of "src::tgt" pairs that are consecutive in the lookahead path
  const pathEdgePairs = useMemo(() => {
    const pairs = new Set<string>()
    for (let i = 0; i < lookaheadPath.length - 1; i++) {
      pairs.add(`${lookaheadPath[i]}::${lookaheadPath[i + 1]}`)
    }
    return pairs
  }, [lookaheadPath])

  // Computed nodes — synced into RF state via useEffect below
  const rfNodes = useMemo(() => {
    if (!graph || !currentNode) return []
    return graph.nodes.map(n => ({
      id: n.id,
      position: { x: n.canvas_x, y: n.canvas_y },
      type: 'listenerNode' as const,
      data: {
        ...n,
        isCurrent: n.id === currentNode.id,
        lookaheadDepth: depthMap.get(n.id) ?? null,
      },
    }))
  }, [graph, currentNode, depthMap])

  // Sync computed nodes into RF state (triggers dimension measurement + nodeInternals updates)
  useEffect(() => {
    setRFNodeState(rfNodes)
  }, [rfNodes, setRFNodeState])

  const rfEdges = useMemo(() => {
    if (!graph) return []
    return graph.edges.map(e => {
      const src = e.source_node_id
      const tgt = e.target_node_id

      const fwd = pathEdgePairs.has(`${src}::${tgt}`)
      const rev = e.bidirectional && pathEdgePairs.has(`${tgt}::${src}`)
      const isPath = fwd || rev

      if (isPath) {
        let depth = 1
        for (let i = 0; i < lookaheadPath.length - 1; i++) {
          const a = lookaheadPath[i], b = lookaheadPath[i + 1]
          if ((a === src && b === tgt) || (e.bidirectional && a === tgt && b === src)) {
            depth = i + 1
            break
          }
        }
        const opacity = PATH_DEPTH_OPACITY[depth - 1] ?? 0.35
        const strokeWidth = Math.max(1.5, 2.5 - (depth - 1) * 0.25)
        const duration = PATH_DEPTH_DURATION[depth - 1] ?? 1.2
        const marker = { type: MarkerType.ArrowClosed, color: '#4a90d9', width: 14, height: 14 }
        return {
          id: e.id, source: src, target: tgt, type: 'floating' as const,
          markerEnd: marker,
          ...(e.bidirectional ? { markerStart: marker } : {}),
          style: {
            stroke: '#4a90d9', strokeWidth, opacity,
            strokeDasharray: '6 4',
            animation: `bgmflow ${duration}s linear infinite`,
          },
        }
      }

      // Dim / off-path (everything that isn't on the lookahead path)
      return {
        id: e.id, source: src, target: tgt, type: 'floating' as const,
        style: { stroke: '#2a4060', strokeWidth: 1, opacity: 0.5 },
      }
    })
  }, [graph, pathEdgePairs, lookaheadPath])

  // Fit once after nodes first appear (150ms allows dimension measurement to complete)
  useEffect(() => {
    if (rfNodeState.length > 0 && !fittedRef.current) {
      fittedRef.current = true
      setTimeout(() => fitView({ padding: 0.2, duration: 0 }), 150)
    }
  }, [rfNodeState.length, fitView])

  return (
    <div style={{
      position: 'relative', width: '100%', height: 420,
      borderRadius: 8, overflow: 'hidden', border: '1px solid #1a2a3a',
    }}>
      <ReactFlow
        nodes={rfNodeState}
        edges={rfEdges}
        onNodesChange={onNodesChange}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnDrag={true}
        zoomOnScroll={true}
        minZoom={0.05}
        style={{ background: '#0a1520' }}
        deleteKeyCode={null}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#1a2a3a" variant={BackgroundVariant.Dots} gap={20} />
      </ReactFlow>

      <button
        onClick={() => fitView({ padding: 0.2, duration: 300 })}
        title="Fit graph to view"
        style={{
          position: 'absolute', top: 10, right: 10,
          background: '#1e2a3a', border: '1px solid #2d4a6e',
          borderRadius: 4, color: '#6a8aaa', cursor: 'pointer',
          fontSize: 11, fontFamily: 'monospace', padding: '3px 8px',
          zIndex: 10,
        }}
      >
        ⊹ fit
      </button>
    </div>
  )
}

export default function ListenerGraphView() {
  return (
    <ReactFlowProvider>
      <ListenerGraphInner />
    </ReactFlowProvider>
  )
}
