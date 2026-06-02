/**
 * TypeScript port of `backend/services/wander.py::get_next_node` and the
 * lookahead simulator inside `backend/api/routes/sessions.py`.
 *
 * Kept structurally identical to the Python so behaviour matches HTTP
 * mode exactly — same recency window (last 5), same dead-end handling
 * (stay), same weighted random sample.
 *
 * If the backend wander logic changes, this file must be updated in
 * lockstep. The python test suite (`backend/tests/test_wander.py`)
 * exercises edge cases we should consider mirroring as Vitest specs.
 */
import type { Edge } from '../types'

const HISTORY_CAP = 10
const RECENCY_WINDOW = 5

/**
 * Pick the next wander destination given the current node, the graph's
 * edges, and the recent history. Returns the current node id if there
 * are no outbound edges (dead end → stay).
 */
export function getNextNode(
  currentNodeId: string,
  edges: Edge[],
  wanderHistory: string[],
): string {
  // Collect reachable neighbors with their base weights.
  const candidates: Array<{ id: string; weight: number }> = []
  for (const edge of edges) {
    if (edge.source_node_id === currentNodeId) {
      candidates.push({ id: edge.target_node_id, weight: edge.weight })
    } else if (edge.bidirectional && edge.target_node_id === currentNodeId) {
      candidates.push({ id: edge.source_node_id, weight: edge.weight })
    }
  }

  if (candidates.length === 0) return currentNodeId

  // Recency penalty using the last 5 entries of history.
  const recencyWindow = wanderHistory.slice(-RECENCY_WINDOW)
  const effective = candidates.map(({ id, weight }) => {
    const recencyCount = recencyWindow.filter(h => h === id).length
    return { id, weight: weight / (recencyCount + 1) }
  })

  // Weighted random sample.
  const total = effective.reduce((s, c) => s + c.weight, 0)
  if (total <= 0) return currentNodeId
  let r = Math.random() * total
  for (const { id, weight } of effective) {
    r -= weight
    if (r <= 0) return id
  }
  return effective[effective.length - 1].id
}

/**
 * Append a node id to a history list, capped at HISTORY_CAP. Returns a
 * new array — never mutates the input.
 */
export function appendHistory(history: string[], nodeId: string): string[] {
  const updated = [...history, nodeId]
  return updated.length > HISTORY_CAP
    ? updated.slice(updated.length - HISTORY_CAP)
    : updated
}

/**
 * Simulate `n` future wander steps from `startId`, returning the
 * pre-committed sequence of node ids. Mirrors `_build_lookahead` in the
 * backend sessions route.
 */
export function buildLookahead(
  startId: string,
  baseHistory: string[],
  queuePrefix: string[],
  nodeIds: Set<string>,
  edges: Edge[],
  n: number,
): string[] {
  let history = [...baseHistory]
  for (const nodeId of queuePrefix) {
    history = appendHistory(history, nodeId)
  }
  let currentId = startId
  const result: string[] = []
  for (let i = 0; i < n; i++) {
    if (!nodeIds.has(currentId)) break
    const nextId = getNextNode(currentId, edges, history)
    result.push(nextId)
    history = appendHistory(history, nextId)
    currentId = nextId
  }
  return result
}
