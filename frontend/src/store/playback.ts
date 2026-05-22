import { create } from 'zustand'
import { AudioManager } from '../audio/AudioManager'
import { audioUrl } from '../api/audio'
import * as sessionsApi from '../api/sessions'
import * as graphsApi from '../api/graphs'
import type { Graph, Node } from '../types'

const MIN_DWELL_MS      = 30_000   // minimum time at a node before auto-advance
const DWELL_VARIANCE_MS = 20_000   // random variance added to dwell time

interface PlaybackState {
  sessionId: string | null
  graph: Graph | null
  currentNode: Node | null
  wanderActive: boolean
  transitioning: boolean
  nominatedNextNodeId: string | null
  /** Local wander trail — node IDs in visit order, most recent last. Capped at 20. */
  wanderHistory: string[]
}

interface PlaybackActions {
  startSession: (graphId: string, startingNodeId?: string) => Promise<void>
  advance: () => Promise<void>
  setWanderActive: (active: boolean) => Promise<void>
  steerTo: (nodeId: string) => Promise<void>
  teleportTo: (nodeId: string) => Promise<void>
  setVolume: (gain: number) => void
  reset: () => void
}

// AudioManager is injected so it can be swapped out in tests.
// In production, call `initPlaybackStore(audioManager)` from the app root.
let _audioManager: AudioManager | null = null

export function initPlaybackStore(manager: AudioManager) {
  _audioManager = manager
}

function getAudio(): AudioManager {
  if (!_audioManager) throw new Error('AudioManager not initialised — call initPlaybackStore() first')
  return _audioManager
}

// Wander loop timer
let _wanderTimer: ReturnType<typeof setTimeout> | null = null

function cancelWanderTimer() {
  if (_wanderTimer !== null) {
    clearTimeout(_wanderTimer)
    _wanderTimer = null
  }
}

export const usePlayback = create<PlaybackState & PlaybackActions>((set, get) => ({
  // ── State ────────────────────────────────────────────────────────────────
  sessionId: null,
  graph: null,
  currentNode: null,
  wanderActive: false,
  transitioning: false,
  nominatedNextNodeId: null,
  wanderHistory: [],

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
      wanderActive: false,
      transitioning: false,
      nominatedNextNodeId: null,
      wanderHistory: [],
    })
  },

  startSession: async (graphId, startingNodeId) => {
    const audio = getAudio()
    await audio.resume()

    const [session, graph] = await Promise.all([
      sessionsApi.createSession(graphId, startingNodeId),
      graphsApi.getGraph(graphId),
    ])

    const startNode = graph.nodes.find(n => n.id === session.current_node_id) ?? graph.nodes[0]
    if (!startNode) throw new Error('Graph has no nodes')

    set({ sessionId: session.id, graph, currentNode: startNode, wanderHistory: [startNode.id] })

    if (startNode.audio_file_path) {
      await audio.play(audioUrl(startNode.audio_file_path), {
        loopStart: startNode.loop_start ?? 0,
        loopEnd: startNode.loop_end ?? undefined,
      })
    }
  },

  advance: async () => {
    const { sessionId, graph, currentNode, wanderHistory } = get()
    if (!sessionId || get().transitioning) return
    set({ transitioning: true })

    try {
      const audio = getAudio()
      const result = await sessionsApi.advanceSession(sessionId)
      const nextNode = graph?.nodes.find(n => n.id === result.next_node_id) ?? null

      // Preload and crossfade (pass loop points so AudioManager loops correctly)
      if (result.audio_file_path) {
        const url = audioUrl(result.audio_file_path)
        await audio.loadTrack(url)
        await audio.crossfadeTo(url, {
          loopStart: nextNode?.loop_start ?? 0,
          loopEnd: nextNode?.loop_end ?? undefined,
        })
      }

      // Append to local wander trail (cap at 20)
      const prev = currentNode?.id
      const newHistory = prev
        ? [...wanderHistory.slice(-19), prev]
        : wanderHistory
      set({ currentNode: nextNode, nominatedNextNodeId: null, wanderHistory: newHistory })
    } finally {
      set({ transitioning: false })
    }
  },

  setWanderActive: async (active) => {
    const { sessionId } = get()
    if (sessionId) {
      await sessionsApi.updateSession(sessionId, { wander_active: active })
    }
    set({ wanderActive: active })

    if (active) {
      const scheduleNext = () => {
        const dwell = MIN_DWELL_MS + Math.random() * DWELL_VARIANCE_MS
        _wanderTimer = setTimeout(async () => {
          const state = get()
          if (!state.wanderActive) return
          if (!state.transitioning) {
            await get().advance()
          }
          // Re-schedule regardless (advance might have been skipped if transitioning)
          scheduleNext()
        }, dwell)
      }
      scheduleNext()
    } else {
      cancelWanderTimer()
    }
  },

  steerTo: async (nodeId) => {
    const { sessionId } = get()
    if (!sessionId) return
    await sessionsApi.updateSession(sessionId, { nominated_next_node_id: nodeId })
    set({ nominatedNextNodeId: nodeId })
  },

  teleportTo: async (nodeId) => {
    const { sessionId, graph, currentNode, wanderHistory } = get()
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
