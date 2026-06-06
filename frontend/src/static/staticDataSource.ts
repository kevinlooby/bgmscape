/**
 * In-memory implementation of the listener-facing API surface for
 * static-deploy mode. Reads game/graph/ambient data from the bundled
 * snapshot, maintains transient session state in memory.
 *
 * Editing operations (create/update/delete graphs, upload audio,
 * mutate ambient assets) deliberately throw — the deployed app is
 * listen-only by design. The page-level UI gates the editor routes so
 * these errors shouldn't fire in practice.
 *
 * Behavior intentionally mirrors the FastAPI routes:
 *   - createSession seeds the session with the first node if no
 *     starting_node_id was passed
 *   - advanceSession honours `nominated_next_node_id` and pops the
 *     lookahead queue when present, otherwise samples a next node
 *   - teleportSession clears the lookahead queue
 *   - lookaheadSession tops the queue up to LOOKAHEAD_TARGET
 *
 * The pure wander logic is in `./wanderEngine.ts`.
 */
import type {
  AdvanceResponse,
  AmbientAsset,
  Game,
  Graph,
  LookaheadResponse,
  PlaybackSession,
} from '../types'
import { loadSnapshot } from './snapshot'
import { appendHistory, planPath, planStep } from './wanderEngine'

const LOOKAHEAD_TARGET = 16

interface SessionState extends PlaybackSession {
  lookahead_queue: string[]
  /** Mirrors backend's PlaybackSession.node_last_visited (id → step index). */
  node_last_visited: Record<string, number>
  /** Mirrors backend's PlaybackSession.step_index (monotonic counter). */
  step_index: number
}

function _markVisited(session: SessionState, nodeId: string): void {
  session.step_index += 1
  session.node_last_visited[nodeId] = session.step_index
}

function _sessionVisitedState(session: SessionState): {
  visited: Set<string>
  lru: Map<string, number>
} {
  const visited = new Set<string>(Object.keys(session.node_last_visited))
  const lru = new Map<string, number>(Object.entries(session.node_last_visited))
  return { visited, lru }
}

const _sessions: Map<string, SessionState> = new Map()
let _sessionCounter = 0

function _newSessionId(): string {
  _sessionCounter += 1
  // The id is opaque to the listener — only used by the static data
  // source to look the session back up. Keeping it plain string avoids
  // a runtime crypto dep.
  return `static-session-${_sessionCounter}`
}

function _nowIso(): string {
  return new Date().toISOString()
}

async function _getGraphOrThrow(graphId: string): Promise<Graph> {
  const snap = await loadSnapshot()
  const graph = snap.graphs.find(g => g.id === graphId)
  if (!graph) {
    throw new Error(
      `Graph not found in snapshot: ${graphId}. ` +
      `The snapshot only bundles listener-reachable default graphs.`
    )
  }
  return graph
}

// ── Games ────────────────────────────────────────────────────────────────────

export async function getGames(): Promise<Game[]> {
  return (await loadSnapshot()).games
}

export async function getGame(gameId: string): Promise<Game> {
  const games = (await loadSnapshot()).games
  const game = games.find(g => g.id === gameId)
  if (!game) throw new Error(`Game not found: ${gameId}`)
  return game
}

export async function getGameBySlug(slug: string): Promise<Game> {
  const games = (await loadSnapshot()).games
  const game = games.find(g => g.slug === slug)
  if (!game) throw new Error(`Game not found by slug: ${slug}`)
  return game
}

// ── Graphs ───────────────────────────────────────────────────────────────────

export async function getGraph(graphId: string): Promise<Graph> {
  return _getGraphOrThrow(graphId)
}

// ── Ambient ──────────────────────────────────────────────────────────────────

export async function listAmbientAssets(): Promise<AmbientAsset[]> {
  return (await loadSnapshot()).ambient_assets
}

// ── Sessions ─────────────────────────────────────────────────────────────────

export async function createSession(
  graphId: string,
  startingNodeId?: string,
): Promise<PlaybackSession> {
  const graph = await _getGraphOrThrow(graphId)
  const startNodeId = startingNodeId ?? graph.nodes[0]?.id ?? null
  if (!startNodeId) {
    throw new Error(`Cannot start session: graph ${graphId} has no nodes`)
  }
  const id = _newSessionId()
  const now = _nowIso()
  const session: SessionState = {
    id,
    graph_id: graphId,
    current_node_id: startNodeId,
    wander_active: false,
    nominated_next_node_id: null,
    wander_history: [startNodeId],
    lookahead_queue: [],
    // The starting node counts as the first visit so the planner won't
    // immediately suggest it again.
    node_last_visited: { [startNodeId]: 1 },
    step_index: 1,
    created_at: now,
    updated_at: now,
  }
  _sessions.set(id, session)
  return session
}

export async function advanceSession(sessionId: string): Promise<AdvanceResponse> {
  const session = _sessions.get(sessionId)
  if (!session) throw new Error(`Session not found: ${sessionId}`)
  if (!session.current_node_id) {
    throw new Error('Session has no current node')
  }
  const graph = await _getGraphOrThrow(session.graph_id)

  let nextNodeId: string
  if (session.nominated_next_node_id) {
    nextNodeId = session.nominated_next_node_id
    session.nominated_next_node_id = null
    session.lookahead_queue = []
  } else if (session.lookahead_queue.length > 0) {
    nextNodeId = session.lookahead_queue.shift()!
  } else {
    const { visited, lru } = _sessionVisitedState(session)
    nextNodeId = planStep(session.current_node_id, graph.edges, visited, lru)
  }

  const nextNode = graph.nodes.find(n => n.id === nextNodeId)
  if (!nextNode) {
    throw new Error(`Wander engine returned invalid node: ${nextNodeId}`)
  }

  session.current_node_id = nextNodeId
  session.wander_history = appendHistory(session.wander_history, nextNodeId)
  _markVisited(session, nextNodeId)
  session.updated_at = _nowIso()

  return {
    next_node_id: nextNodeId,
    node_name: nextNode.name,
    audio_file_path: nextNode.audio_file_path,
  }
}

export async function updateSession(
  sessionId: string,
  data: { wander_active?: boolean; nominated_next_node_id?: string | null },
): Promise<PlaybackSession> {
  const session = _sessions.get(sessionId)
  if (!session) throw new Error(`Session not found: ${sessionId}`)
  if (data.wander_active !== undefined) {
    session.wander_active = data.wander_active
  }
  if ('nominated_next_node_id' in data) {
    session.nominated_next_node_id = data.nominated_next_node_id ?? null
    // A steer invalidates the pre-planned path — clear it so the next
    // lookahead call replans from the steered destination.
    if (data.nominated_next_node_id) {
      session.lookahead_queue = []
    }
  }
  session.updated_at = _nowIso()
  return session
}

export async function teleportSession(
  sessionId: string,
  nodeId: string,
): Promise<PlaybackSession> {
  const session = _sessions.get(sessionId)
  if (!session) throw new Error(`Session not found: ${sessionId}`)
  const graph = await _getGraphOrThrow(session.graph_id)
  const node = graph.nodes.find(n => n.id === nodeId)
  if (!node) throw new Error(`Node not in this graph: ${nodeId}`)

  session.current_node_id = nodeId
  session.nominated_next_node_id = null
  session.lookahead_queue = []
  session.wander_history = appendHistory(session.wander_history, nodeId)
  // Teleport is intentional user steering — count it as a visit for
  // novelty purposes (matches backend behavior).
  _markVisited(session, nodeId)
  session.updated_at = _nowIso()
  return session
}

export async function lookaheadSession(
  sessionId: string,
  steps = 12,
): Promise<LookaheadResponse> {
  const session = _sessions.get(sessionId)
  if (!session) throw new Error(`Session not found: ${sessionId}`)
  if (!session.current_node_id) {
    throw new Error('Session has no current node')
  }
  const clampedSteps = Math.max(1, Math.min(steps, 50))
  const graph = await _getGraphOrThrow(session.graph_id)

  if (session.lookahead_queue.length < LOOKAHEAD_TARGET) {
    const simStart =
      session.lookahead_queue.length > 0
        ? session.lookahead_queue[session.lookahead_queue.length - 1]
        : session.current_node_id
    // Project the current visited / LRU state forward across the already-
    // queued items so the planner doesn't re-suggest them.
    const { visited, lru } = _sessionVisitedState(session)
    let step = session.step_index
    for (const id of session.lookahead_queue) {
      step += 1
      visited.add(id)
      lru.set(id, step)
    }
    const additions = planPath(
      simStart,
      graph.edges,
      visited,
      lru,
      step + 1,
      LOOKAHEAD_TARGET - session.lookahead_queue.length,
    )
    session.lookahead_queue.push(...additions)
  }

  const result = []
  for (const id of session.lookahead_queue.slice(0, clampedSteps)) {
    const node = graph.nodes.find(n => n.id === id)
    if (!node) break
    result.push({
      node_id: id,
      node_name: node.name,
      region: node.region,
      audio_file_path: node.audio_file_path,
    })
  }
  return { steps: result }
}

// ── Write operations: explicitly unsupported ─────────────────────────────────

export function writeNotSupported(operation: string): never {
  throw new Error(
    `"${operation}" is not available in static-deploy mode. ` +
    `Run bgmscape locally (npm run dev against the FastAPI backend) to edit.`
  )
}
