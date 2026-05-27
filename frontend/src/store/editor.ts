import { create } from 'zustand'
import * as graphsApi from '../api/graphs'
import { uploadAudio } from '../api/audio'
import type { Graph, GraphListItem, Node } from '../types'

interface EditorState {
  graphs: GraphListItem[]
  activeGraphId: string | null
  graph: Graph | null
  selectedNodeId: string | null
  selectedEdgeId: string | null
  saving: boolean
  error: string | null
}

interface EditorActions {
  // Graph list
  loadGraphList: () => Promise<void>

  // Active graph
  loadGraph: (graphId: string) => Promise<void>
  createGraph: (name: string, gameTitle: string) => Promise<void>
  updateGraph: (data: { name?: string; game_title?: string }) => Promise<void>
  deleteActiveGraph: () => Promise<void>

  // Nodes
  createNode: (data: Partial<Node> & { name: string }) => Promise<Node | null>
  updateNode: (nodeId: string, data: Partial<Node>) => Promise<void>
  deleteNode: (nodeId: string) => Promise<void>
  uploadNodeAudio: (nodeId: string, file: File) => Promise<void>

  // Edges
  createEdge: (data: { source_node_id: string; target_node_id: string; weight?: number; bidirectional?: boolean }) => Promise<void>
  updateEdge: (edgeId: string, data: { weight?: number; bidirectional?: boolean }) => Promise<void>
  deleteEdge: (edgeId: string) => Promise<void>

  // Layout
  batchUpdateNodePositions: (positions: { id: string; x: number; y: number }[]) => Promise<void>

  // Selection
  selectNode: (id: string | null) => void
  selectEdge: (id: string | null) => void
}

export const useEditor = create<EditorState & EditorActions>((set, get) => ({
  graphs: [],
  activeGraphId: null,
  graph: null,
  selectedNodeId: null,
  selectedEdgeId: null,
  saving: false,
  error: null,

  // ── Graph list ──────────────────────────────────────────────────────────

  loadGraphList: async () => {
    const graphs = await graphsApi.listGraphs()
    set({ graphs })
  },

  // ── Active graph ────────────────────────────────────────────────────────

  loadGraph: async (graphId) => {
    const graph = await graphsApi.getGraph(graphId)
    set({ graph, activeGraphId: graphId, selectedNodeId: null, selectedEdgeId: null })
  },

  createGraph: async (name, gameTitle) => {
    set({ saving: true })
    try {
      const created = await graphsApi.createGraph(name, gameTitle)
      const full = await graphsApi.getGraph(created.id)
      const graphs = await graphsApi.listGraphs()
      set({ graph: full, activeGraphId: full.id, graphs, selectedNodeId: null, selectedEdgeId: null })
    } finally {
      set({ saving: false })
    }
  },

  updateGraph: async (data) => {
    const { activeGraphId, graph } = get()
    if (!activeGraphId || !graph) return
    set({ saving: true })
    try {
      const updated = await graphsApi.updateGraph(activeGraphId, data)
      set({ graph: { ...graph, ...updated } })
      // Refresh list
      const graphs = await graphsApi.listGraphs()
      set({ graphs })
    } finally {
      set({ saving: false })
    }
  },

  deleteActiveGraph: async () => {
    const { activeGraphId } = get()
    if (!activeGraphId) return
    await graphsApi.deleteGraph(activeGraphId)
    const graphs = await graphsApi.listGraphs()
    set({ graph: null, activeGraphId: null, graphs, selectedNodeId: null, selectedEdgeId: null })
  },

  // ── Nodes ───────────────────────────────────────────────────────────────

  createNode: async (data) => {
    const { activeGraphId, graph } = get()
    if (!activeGraphId || !graph) return null
    const node = await graphsApi.createNode(activeGraphId, data)
    set({ graph: { ...graph, nodes: [...graph.nodes, node] } })
    return node
  },

  updateNode: async (nodeId, data) => {
    const { graph } = get()
    if (!graph) return
    // Optimistic update
    set({
      graph: {
        ...graph,
        nodes: graph.nodes.map(n => n.id === nodeId ? { ...n, ...data } : n),
      },
    })
    await graphsApi.updateNode(nodeId, data)
  },

  deleteNode: async (nodeId) => {
    const { graph } = get()
    if (!graph) return
    await graphsApi.deleteNode(nodeId)
    set({
      graph: {
        ...graph,
        nodes: graph.nodes.filter(n => n.id !== nodeId),
        edges: graph.edges.filter(e => e.source_node_id !== nodeId && e.target_node_id !== nodeId),
      },
      selectedNodeId: get().selectedNodeId === nodeId ? null : get().selectedNodeId,
    })
  },

  uploadNodeAudio: async (nodeId, file) => {
    const { graph, activeGraphId } = get()
    if (!graph || !activeGraphId) return
    const response = await uploadAudio(activeGraphId, file)
    await get().updateNode(nodeId, { audio_file_path: response.file_path })
  },

  // ── Edges ───────────────────────────────────────────────────────────────

  createEdge: async (data) => {
    const { activeGraphId, graph } = get()
    if (!activeGraphId || !graph) return
    const edge = await graphsApi.createEdge(activeGraphId, data)
    set({ graph: { ...graph, edges: [...graph.edges, edge] } })
  },

  updateEdge: async (edgeId, data) => {
    const { graph } = get()
    if (!graph) return
    set({
      graph: {
        ...graph,
        edges: graph.edges.map(e => e.id === edgeId ? { ...e, ...data } : e),
      },
    })
    await graphsApi.updateEdge(edgeId, data)
  },

  deleteEdge: async (edgeId) => {
    const { graph } = get()
    if (!graph) return
    await graphsApi.deleteEdge(edgeId)
    set({
      graph: {
        ...graph,
        edges: graph.edges.filter(e => e.id !== edgeId),
      },
      selectedEdgeId: get().selectedEdgeId === edgeId ? null : get().selectedEdgeId,
    })
  },

  // ── Layout ──────────────────────────────────────────────────────────────

  batchUpdateNodePositions: async (positions) => {
    const { graph } = get()
    if (!graph) return
    const posMap = new Map(positions.map(p => [p.id, p]))
    const updatedNodes = graph.nodes.map(n => {
      const p = posMap.get(n.id)
      return p ? { ...n, canvas_x: p.x, canvas_y: p.y } : n
    })
    set({ graph: { ...graph, nodes: updatedNodes } })
    await Promise.all(
      positions.map(p => graphsApi.updateNode(p.id, { canvas_x: p.x, canvas_y: p.y }))
    )
  },

  // ── Selection ───────────────────────────────────────────────────────────

  selectNode: (id) => set({ selectedNodeId: id, selectedEdgeId: null }),
  selectEdge: (id) => set({ selectedEdgeId: id, selectedNodeId: null }),
}))
