import { create } from 'zustand'
import { AudioManager } from '../audio/AudioManager'
import { audioUrl } from '../api/audio'
import * as sessionsApi from '../api/sessions'
import * as graphsApi from '../api/graphs'
import type { Graph, Node } from '../types'

interface PlaybackState {
  sessionId: string | null
  graph: Graph | null
  currentNode: Node | null
  playing: boolean
  wanderActive: boolean
  transitioning: boolean
  nominatedNextNodeId: string | null
  /** Local wander trail — node IDs in visit order, most recent last. Capped at 20. */
  wanderHistory: string[]

  // ── Tunable parameters (live-editable via tuning panel) ──────────────────
  minDwellMs: number
  dwellVarianceMs: number
  fadeOutDuration: number
  fadeInDuration: number
  /** Minimum silent travel period between wander transitions, in ms. */
  travelMinMs: number
  /** Random additional travel time on top of the minimum, in ms. */
  travelVarianceMs: number

  /** Timestamp (Date.now()) when the next wander advance will fire. Null when wander is off. */
  nextAdvanceAt: number | null
}

interface PlaybackActions {
  startSession: (graphId: string, startingNodeId?: string) => Promise<void>
  advance: () => Promise<void>
  setPlaying: (active: boolean) => void
  setWanderActive: (active: boolean) => Promise<void>
  steerTo: (nodeId: string) => Promise<void>
  teleportTo: (nodeId: string) => Promise<void>
  setVolume: (gain: number) => void
  reset: () => void

  // ── Tunable param setters ────────────────────────────────────────────────
  setMinDwellMs: (v: number) => void
  setDwellVarianceMs: (v: number) => void
  setFadeOutDuration: (v: number) => void
  setFadeInDuration: (v: number) => void
  setTravelMinMs: (v: number) => void
  setTravelVarianceMs: (v: number) => void
}

let _audioManager: AudioManager | null = null

export function initPlaybackStore(manager: AudioManager) {
  _audioManager = manager
}

function getAudio(): AudioManager {
  if (!_audioManager) throw new Error('AudioManager not initialised — call initPlaybackStore() first')
  return _audioManager
}

// ── Wander timer ─────────────────────────────────────────────────────────────

let _wanderTimer: ReturnType<typeof setTimeout> | null = null

function cancelWanderTimer() {
  if (_wanderTimer !== null) {
    clearTimeout(_wanderTimer)
    _wanderTimer = null
  }
}

// Uses Zustand's static API so it can be called from module scope and setTimeout callbacks.
function _scheduleWander() {
  const { minDwellMs, dwellVarianceMs } = usePlayback.getState()
  const dwell = minDwellMs + Math.random() * dwellVarianceMs
  const firesAt = Date.now() + dwell
  usePlayback.setState({ nextAdvanceAt: firesAt })
  _wanderTimer = setTimeout(async () => {
    const { wanderActive, playing, transitioning, advance } = usePlayback.getState()
    if (!wanderActive || !playing) return
    if (!transitioning) await advance()
    _scheduleWander()
  }, dwell)
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const usePlayback = create<PlaybackState & PlaybackActions>((set, get) => ({
  // ── State ────────────────────────────────────────────────────────────────
  sessionId: null,
  graph: null,
  currentNode: null,
  playing: false,
  wanderActive: false,
  transitioning: false,
  nominatedNextNodeId: null,
  wanderHistory: [],
  nextAdvanceAt: null,

  minDwellMs: 30_000,
  dwellVarianceMs: 20_000,
  fadeOutDuration: 1.5,
  fadeInDuration: 1,
  travelMinMs: 3_000,
  travelVarianceMs: 3_000,

  // ── Tunable setters ──────────────────────────────────────────────────────

  setMinDwellMs: (v) => set({ minDwellMs: v }),
  setDwellVarianceMs: (v) => set({ dwellVarianceMs: v }),
  setFadeOutDuration: (v) => set({ fadeOutDuration: v }),
  setFadeInDuration: (v) => set({ fadeInDuration: v }),
  setTravelMinMs: (v) => set({ travelMinMs: v }),
  setTravelVarianceMs: (v) => set({ travelVarianceMs: v }),

  // ── Actions ──────────────────────────────────────────────────────────────

  setVolume: (gain) => {
    _audioManager?.setVolume(gain)
  },

  reset: () => {
    cancelWanderTimer()
    _audioManager?.fadeOut(0.5).catch(() => {})
    set({
      sessionId: null,
      graph: null,
      currentNode: null,
      playing: false,
      wanderActive: false,
      transitioning: false,
      nominatedNextNodeId: null,
      wanderHistory: [],
      nextAdvanceAt: null,
    })
  },

  startSession: async (graphId, startingNodeId) => {
    const audio = getAudio()
    await audio.resume()
    audio.unpause()  // ensure master gain is at full volume for the new session

    const [session, graph] = await Promise.all([
      sessionsApi.createSession(graphId, startingNodeId),
      graphsApi.getGraph(graphId),
    ])

    const startNode = graph.nodes.find(n => n.id === session.current_node_id) ?? graph.nodes[0]
    if (!startNode) throw new Error('Graph has no nodes')

    set({
      sessionId: session.id,
      graph,
      currentNode: startNode,
      wanderHistory: [startNode.id],
      playing: true,
      wanderActive: true,
    })

    const { fadeInDuration } = get()
    if (startNode.audio_file_path) {
      await audio.play(audioUrl(startNode.audio_file_path), {
        loopStart: startNode.loop_start ?? 0,
        loopEnd: startNode.loop_end ?? undefined,
        fadeInDuration,
      })
    }

    await sessionsApi.updateSession(session.id, { wander_active: true })
    _scheduleWander()
  },

  advance: async () => {
    const { sessionId, graph, currentNode, wanderHistory, fadeOutDuration, fadeInDuration, travelMinMs, travelVarianceMs } = get()
    if (!sessionId || get().transitioning) return
    set({ transitioning: true, nextAdvanceAt: null })

    try {
      const audio = getAudio()
      const result = await sessionsApi.advanceSession(sessionId)
      const nextNode = graph?.nodes.find(n => n.id === result.next_node_id) ?? null

      if (result.audio_file_path) {
        const url = audioUrl(result.audio_file_path)
        // Random silent travel period between this transition's tracks.
        // Teleport intentionally does not use this — teleport stays instant.
        const silenceDuration = (travelMinMs + Math.random() * travelVarianceMs) / 1000
        await audio.transitionTo(url, {
          loopStart: nextNode?.loop_start ?? 0,
          loopEnd: nextNode?.loop_end ?? undefined,
          fadeOutDuration,
          fadeInDuration,
          silenceDuration,
        })
      }

      const prev = currentNode?.id
      const newHistory = prev
        ? [...wanderHistory.slice(-19), prev]
        : wanderHistory
      set({ currentNode: nextNode, nominatedNextNodeId: null, wanderHistory: newHistory })
    } finally {
      set({ transitioning: false })
    }
  },

  setPlaying: (active) => {
    const audio = getAudio()
    if (active) {
      audio.unpause()
      set({ playing: true })
      const { wanderActive } = get()
      if (wanderActive) _scheduleWander()
    } else {
      cancelWanderTimer()
      set({ playing: false, nextAdvanceAt: null })
      audio.pause()
    }
  },

  setWanderActive: async (active) => {
    const { sessionId, playing } = get()
    if (sessionId) {
      await sessionsApi.updateSession(sessionId, { wander_active: active })
    }
    set({ wanderActive: active })

    if (active && playing) {
      _scheduleWander()
    } else {
      cancelWanderTimer()
      set({ nextAdvanceAt: null })
    }
  },

  steerTo: async (nodeId) => {
    const { sessionId } = get()
    if (!sessionId) return
    await sessionsApi.updateSession(sessionId, { nominated_next_node_id: nodeId })
    set({ nominatedNextNodeId: nodeId })
  },

  teleportTo: async (nodeId) => {
    const { sessionId, graph, currentNode, wanderHistory, fadeInDuration } = get()
    if (!sessionId) return
    const audio = getAudio()

    const targetNode = graph?.nodes.find(n => n.id === nodeId) ?? null
    if (!targetNode) return

    set({ transitioning: true })
    try {
      await sessionsApi.teleportSession(sessionId, nodeId)
      await audio.fadeOut()
      if (targetNode.audio_file_path) {
        await audio.play(audioUrl(targetNode.audio_file_path), {
          loopStart: targetNode.loop_start ?? 0,
          loopEnd: targetNode.loop_end ?? undefined,
          fadeInDuration,
        })
      }
      const prev = currentNode?.id
      const newHistory = prev ? [...wanderHistory.slice(-19), prev] : wanderHistory
      set({ currentNode: targetNode, nominatedNextNodeId: null, wanderHistory: newHistory })
    } finally {
      set({ transitioning: false })
    }
  },
}))
