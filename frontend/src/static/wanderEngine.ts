/**
 * TypeScript port of `backend/services/wander.py`. Kept structurally close
 * to the Python so behaviour matches HTTP mode exactly.
 *
 * The two routing rules:
 *   1. Hard-avoid revisits while any unvisited neighbour exists (novelty
 *      preferred).
 *   2. When every neighbour has been visited, fall back to least-recently-
 *      visited (smallest step index wins). Ties broken by weighted random
 *      sample of the edge weights.
 *
 * If the backend wander logic changes, this file must be updated in
 * lockstep. The Python test suite (`backend/tests/test_wander.py`)
 * exercises edge cases we should consider mirroring as Vitest specs.
 */
import type { Edge } from '../types'

const HISTORY_CAP = 10

interface Candidate {
  id: string
  weight: number
}

function _reachable(currentNodeId: string, edges: Edge[]): Candidate[] {
  const out: Candidate[] = []
  for (const edge of edges) {
    if (edge.source_node_id === currentNodeId) {
      out.push({ id: edge.target_node_id, weight: edge.weight })
    } else if (edge.bidirectional && edge.target_node_id === currentNodeId) {
      out.push({ id: edge.source_node_id, weight: edge.weight })
    }
  }
  return out
}

function _weightedSample(candidates: Candidate[]): string {
  const total = candidates.reduce((s, c) => s + Math.max(0, c.weight), 0)
  if (total <= 0) {
    // All weights non-positive — fall back to uniform pick.
    return candidates[Math.floor(Math.random() * candidates.length)].id
  }
  let r = Math.random() * total
  for (const { id, weight } of candidates) {
    r -= Math.max(0, weight)
    if (r <= 0) return id
  }
  return candidates[candidates.length - 1].id
}

/**
 * Pick the next node under novelty + LRU rules. Returns currentNodeId on
 * a true dead end.
 */
export function planStep(
  currentNodeId: string,
  edges: Edge[],
  visited: Set<string>,
  lastVisitedStep: Map<string, number>,
): string {
  const candidates = _reachable(currentNodeId, edges)
  if (candidates.length === 0) return currentNodeId

  const fresh = candidates.filter(c => !visited.has(c.id))
  if (fresh.length > 0) return _weightedSample(fresh)

  // All visited → LRU. Smallest last_visited_step wins (-1 for missing,
  // so a never-tracked neighbour is preferred just in case).
  let minStep = Infinity
  for (const c of candidates) {
    const s = lastVisitedStep.has(c.id) ? lastVisitedStep.get(c.id)! : -1
    if (s < minStep) minStep = s
  }
  const oldest = candidates.filter(c => {
    const s = lastVisitedStep.has(c.id) ? lastVisitedStep.get(c.id)! : -1
    return s === minStep
  })
  return _weightedSample(oldest)
}

/**
 * Plan a horizon-N path starting *after* currentNodeId. Uses local copies
 * of the session's visited set / LRU map so the plan accounts for nodes
 * the plan itself will mark as seen.
 */
export function planPath(
  currentNodeId: string,
  edges: Edge[],
  visited: Set<string>,
  lastVisitedStep: Map<string, number>,
  startStep: number,
  horizon: number,
): string[] {
  if (horizon <= 0) return []
  const simVisited = new Set(visited)
  const simLru = new Map(lastVisitedStep)
  let step = startStep
  let current = currentNodeId
  const path: string[] = []
  for (let i = 0; i < horizon; i++) {
    const next = planStep(current, edges, simVisited, simLru)
    if (next === current) break  // dead end
    path.push(next)
    simVisited.add(next)
    simLru.set(next, step)
    step += 1
    current = next
  }
  return path
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

// ── Legacy entry points (kept for any caller that hasn't migrated) ────────────

/** @deprecated Use planStep with explicit visited / lastVisitedStep state. */
export function getNextNode(
  currentNodeId: string,
  edges: Edge[],
  wanderHistory: string[],
): string {
  // Translate the bounded history into the new framework: every node
  // ever in the history is "visited", later list position = more recent.
  const visited = new Set<string>()
  const lastVisitedStep = new Map<string, number>()
  wanderHistory.forEach((id, i) => {
    visited.add(id)
    lastVisitedStep.set(id, i)
  })
  return planStep(currentNodeId, edges, visited, lastVisitedStep)
}

/** @deprecated Use planPath with explicit visited / lastVisitedStep state. */
export function buildLookahead(
  startId: string,
  baseHistory: string[],
  queuePrefix: string[],
  nodeIds: Set<string>,
  edges: Edge[],
  n: number,
): string[] {
  const visited = new Set<string>(baseHistory)
  const lastVisitedStep = new Map<string, number>()
  baseHistory.forEach((id, i) => lastVisitedStep.set(id, i))
  let step = baseHistory.length
  for (const id of queuePrefix) {
    visited.add(id)
    step += 1
    lastVisitedStep.set(id, step)
  }
  // Guard against a stale start id (node deleted from snapshot).
  if (!nodeIds.has(startId)) return []
  return planPath(startId, edges, visited, lastVisitedStep, step + 1, n)
}
