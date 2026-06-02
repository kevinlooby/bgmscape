import client from './client'
import type { PlaybackSession, AdvanceResponse, LookaheadResponse } from '../types'
import { STATIC_MODE } from '../static/mode'
import * as staticSrc from '../static/staticDataSource'

export const createSession = (
  graph_id: string,
  starting_node_id?: string
): Promise<PlaybackSession> => {
  if (STATIC_MODE) return staticSrc.createSession(graph_id, starting_node_id)
  return client.post('/api/sessions', { graph_id, starting_node_id }).then(r => r.data)
}

export const getSession = (sessionId: string): Promise<PlaybackSession> => {
  if (STATIC_MODE) {
    // The listener never actually calls getSession today — sessions are
    // ephemeral. If that changes, expose the in-memory session here.
    return staticSrc.writeNotSupported('getSession')
  }
  return client.get(`/api/sessions/${sessionId}`).then(r => r.data)
}

export const advanceSession = (sessionId: string): Promise<AdvanceResponse> => {
  if (STATIC_MODE) return staticSrc.advanceSession(sessionId)
  return client.post(`/api/sessions/${sessionId}/advance`).then(r => r.data)
}

export const updateSession = (
  sessionId: string,
  data: { wander_active?: boolean; nominated_next_node_id?: string | null }
): Promise<PlaybackSession> => {
  if (STATIC_MODE) return staticSrc.updateSession(sessionId, data)
  return client.patch(`/api/sessions/${sessionId}`, data).then(r => r.data)
}

export const teleportSession = (
  sessionId: string,
  node_id: string
): Promise<PlaybackSession> => {
  if (STATIC_MODE) return staticSrc.teleportSession(sessionId, node_id)
  return client.post(`/api/sessions/${sessionId}/teleport`, { node_id }).then(r => r.data)
}

export const lookaheadSession = (
  sessionId: string,
  steps = 10,
): Promise<LookaheadResponse> => {
  if (STATIC_MODE) return staticSrc.lookaheadSession(sessionId, steps)
  return client.post(`/api/sessions/${sessionId}/lookahead`, null, { params: { steps } }).then(r => r.data)
}
