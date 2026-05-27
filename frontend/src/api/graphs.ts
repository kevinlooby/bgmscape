import client from './client'
import type { Graph, GraphListItem, GraphExport, Node, Edge } from '../types'

// Graphs
export const listGraphs = (gameId?: string): Promise<GraphListItem[]> =>
  client.get('/api/graphs', { params: gameId ? { game_id: gameId } : undefined }).then(r => r.data)

export const getGraph = (graphId: string): Promise<Graph> =>
  client.get(`/api/graphs/${graphId}`).then(r => r.data)

export const createGraph = (name: string, game_id: string): Promise<Graph> =>
  client.post('/api/graphs', { name, game_id }).then(r => r.data)

export const updateGraph = (graphId: string, data: { name?: string }): Promise<Graph> =>
  client.patch(`/api/graphs/${graphId}`, data).then(r => r.data)

export const deleteGraph = (graphId: string): Promise<void> =>
  client.delete(`/api/graphs/${graphId}`).then(() => undefined)

// Nodes
export const createNode = (
  graphId: string,
  data: Partial<Node> & { name: string }
): Promise<Node> =>
  client.post(`/api/graphs/${graphId}/nodes`, data).then(r => r.data)

export const updateNode = (nodeId: string, data: Partial<Node>): Promise<Node> =>
  client.patch(`/api/nodes/${nodeId}`, data).then(r => r.data)

export const deleteNode = (nodeId: string): Promise<void> =>
  client.delete(`/api/nodes/${nodeId}`).then(() => undefined)

// Edges
export const createEdge = (
  graphId: string,
  data: { source_node_id: string; target_node_id: string; weight?: number; bidirectional?: boolean }
): Promise<Edge> =>
  client.post(`/api/graphs/${graphId}/edges`, data).then(r => r.data)

export const updateEdge = (
  edgeId: string,
  data: { weight?: number; bidirectional?: boolean }
): Promise<Edge> =>
  client.patch(`/api/edges/${edgeId}`, data).then(r => r.data)

export const deleteEdge = (edgeId: string): Promise<void> =>
  client.delete(`/api/edges/${edgeId}`).then(() => undefined)

// Export / Import
export const exportGraph = (graphId: string): Promise<GraphExport> =>
  client.get(`/api/graphs/${graphId}/export`).then(r => r.data)

export const importGraph = (data: GraphExport): Promise<Graph> =>
  client.post('/api/graphs/import', data).then(r => r.data)
