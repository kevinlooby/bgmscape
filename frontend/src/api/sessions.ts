import client from './client'
import type { PlaybackSession, AdvanceResponse, LookaheadResponse } from '../types'

export const createSession = (
  graph_id: string,
  starting_node_id?: string
): Promise<PlaybackSession> =>
  client.post('/api/sessions', { graph_id, starting_node_id }).then(r => r.data)

export const getSession = (sessionId: string): Promise<PlaybackSession> =>
  client.get(`/api/sessions/${sessionId}`).then(r => r.data)

export const advanceSession = (sessionId: string): Promise<AdvanceResponse> =>
  client.post(`/api/sessions/${sessionId}/advance`).then(r => r.data)

export const updateSession = (
  sessionId: string,
  data: { wander_active?: boolean; nominated_next_node_id?: string | null }
): Promise<PlaybackSession> =>
  client.patch(`/api/sessions/${sessionId}`, data).then(r => r.data)

export const teleportSession = (
  sessionId: string,
  node_id: string
): Promise<PlaybackSession> =>
  client.post(`/api/sessions/${sessionId}/teleport`, { node_id }).then(r => r.data)

export const lookaheadSession = (
  sessionId: string,
  steps = 10,
): Promise<LookaheadResponse> =>
  client.post(`/api/sessions/${sessionId}/lookahead`, null, { params: { steps } }).then(r => r.data)
