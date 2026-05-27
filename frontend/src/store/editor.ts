import { create } from 'zustand'
import * as graphsApi from '../api/graphs'
import * as gamesApi from '../api/games'
import { uploadAudio } from '../api/audio'
import type { Game, Graph, GraphListItem, Node } from '../types'

interface EditorState {
  /** The game we're scoped to. All graph operations happen within this game. */
  game: Game | null
  /** Graphs belonging to the current game. */
  graphs: GraphListItem[]
  activeGraphId: string | null
  graph: Graph | null
  selectedNodeId: string | null
  selectedEdgeId: string | null
  saving: boolean
  error: string | null
}

interface EditorActions {
  /** Load a game by slug and its graphs. Auto-selects the default graph (or first available). */
  loadGameBySlug: (slug: string) => Promise<void>
  /** Reload the current game (after creating/deleting graphs or changing the default). */
  reloadGame: () => Promise<void>

  // Active graph
  loadGraph: (graphId: string) => Promise<void>
  createGraph: (name: string) => Promise<void>
  updateGraph: (data: { name?: string }) => Promise<void>
  deleteActiveGraph: () => Promise<void>
  setActiveAsDefault: () => Promise<void>

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
  game: null,
  graphs: [],
  activeGraphId: null,
  graph: null,
  selectedNodeId: null,
  selectedEdgeId: null,
  saving: false,
  error: null,

  // ── Game scope ──────────────────────────────────────────────────────────

  loadGameBySlug: async (slug) => {
    const game = await gamesApi.getGameBySlug(slug)
    const graphsList = await graphsApi.listGraphs(game.id)
    set({ game, graphs: graphsList })

    // Auto-select the default graph, or the first graph if none is set.
    const targetId = game.default_graph_id ?? graphsList[0]?.id ?? null
    if (targetId) {
      const full = await graphsApi.getGraph(targetId)
      set({ graph: full, activeGraphId: targetId, selectedNodeId: null, selectedEdgeId: null })
    } else {
      set({ graph: null, activeGraphId: null })
    }
  },

  reloadGame: async () => {
    const { game } = get()
    if (!game) return
    const fresh = await gamesApi.getGame(game.id)
    const graphsList = await graphsApi.listGraphs(game.id)
    set({ game: fresh, graphs: graphsList })
  },

  // ── Active graph ────────────────────────────────────────────────────────

  loadGraph: async (graphId) => {
    const graph = await graphsApi.getGraph(graphId)
    set({ graph, activeGraphId: graphId, selectedNodeId: null, selectedEdgeId: null })
  },

  createGraph: async (name) => {
    const { game } = get()
    if (!game) return
    set({ saving: true })
    try {
      const created = await graphsApi.createGraph(name, game.id)
      const full = await graphsApi.getGraph(created.id)
      const graphsList = await graphsApi.listGraphs(game.id)
      const fresh = await gamesApi.getGame(game.id)
      set({ graph: full, activeGraphId: full.id, graphs: graphsList, game: fresh, selectedNodeId: null, selectedEdgeId: null })
    } finally {
      set({ saving: false })
    }
  },

  updateGraph: async (data) => {
    const { activeGraphId, graph, game } = get()
    if (!activeGraphId || !graph) return
    set({ saving: true })
    try {
      const updated = await graphsApi.updateGraph(activeGraphId, data)
      set({ graph: { ...graph, ...updated } })
      if (game) {
        const graphsList = await graphsApi.listGraphs(game.id)
        set({ graphs: graphsList })
      }
    } finally {
      set({ saving: false })
    }
  },

  deleteActiveGraph: async () => {
    const { activeGraphId, game } = get()
    if (!activeGraphId || !game) return
    await graphsApi.deleteGraph(activeGraphId)
    const graphsList = await graphsApi.listGraphs(game.id)
    const fresh = await gamesApi.getGame(game.id)
    set({ graph: null, activeGraphId: null, graphs: graphsList, game: fresh, selectedNodeId: null, selectedEdgeId: null })
  },

  setActiveAsDefault: async () => {
    const { activeGraphId, game } = get()
    if (!activeGraphId || !game) return
    const updated = await gamesApi.setDefaultGraph(game.id, activeGraphId)
    set({ game: updated })
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
    const { graph, game } = get()
    if (!graph || !game) return
    const response = await uploadAudio(game.id, file)
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
