import { create } from 'zustand'
import { AudioManager } from '../audio/AudioManager'
import { AmbientEngine } from '../audio/AmbientEngine'
import { audioUrl } from '../api/audio'
import * as sessionsApi from '../api/sessions'
import * as graphsApi from '../api/graphs'
import * as ambientApi from '../api/ambient'
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
  //
  // Dwell minimum is implicit: every track plays at least once end-to-end.
  // _scheduleWander() uses the current track's duration (from the AudioManager
  // buffer cache) as the floor, then adds random(0, dwellVarianceMs) on top.
  // For nodes flagged is_transition, the variance is also skipped — the track
  // plays once and then advance() fires.
  dwellVarianceMs: number
  fadeOutDuration: number
  fadeInDuration: number
  /** Minimum silent travel period between wander transitions, in ms. */
  travelMinMs: number
  /** Random additional travel time on top of the minimum, in ms. */
  travelVarianceMs: number
  /** Master volume for the music bus (0..1). Applied via AudioManager.setVolume. */
  musicVolume: number
  /** Ambient bus master volume (0..1). Multiplicative with the music master. */
  ambientBusVolume: number
  /** Global base chance a matching ambient category starts a sound (0..1). */
  ambientDensity: number
  /** Per-already-playing-layer multiplier on the ambient start chance (0..1).
   *  Lower = sounds rarely stack; 1 = no suppression. */
  ambientCrowdingFalloff: number
  /** Minimum silence after an ambient sound ends before its category may restart, in ms. */
  ambientRestMinMs: number
  /** Random extra ambient rest on top of the minimum, in ms. */
  ambientRestVarianceMs: number

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
  reset: () => void

  // ── Tunable param setters ────────────────────────────────────────────────
  setDwellVarianceMs: (v: number) => void
  setFadeOutDuration: (v: number) => void
  setFadeInDuration: (v: number) => void
  setTravelMinMs: (v: number) => void
  setTravelVarianceMs: (v: number) => void
  setMusicVolume: (v: number) => void
  setAmbientBusVolume: (v: number) => void
  setAmbientDensity: (v: number) => void
  setAmbientCrowdingFalloff: (v: number) => void
  setAmbientRestMinMs: (v: number) => void
  setAmbientRestVarianceMs: (v: number) => void
}

let _audioManager: AudioManager | null = null
let _ambientEngine: AmbientEngine | null = null

export function initPlaybackStore(manager: AudioManager, ambient: AmbientEngine) {
  _audioManager = manager
  _ambientEngine = ambient
}

function getAudio(): AudioManager {
  if (!_audioManager) throw new Error('AudioManager not initialised — call initPlaybackStore() first')
  return _audioManager
}

function getAmbient(): AmbientEngine | null {
  return _ambientEngine
}

/**
 * Fetch the global ambient library and hand it to the engine. Called on
 * session start. Failures (e.g. backend unreachable) are swallowed — ambient
 * is non-essential and a music-only experience is still the primary product.
 */
async function _refreshAmbientLibrary(): Promise<void> {
  const engine = getAmbient()
  if (!engine) return
  try {
    const assets = await ambientApi.listAmbientAssets()
    engine.setLibrary(assets)
  } catch {
    // Backend down or endpoint missing — silently leave the library empty.
  }
}

// ── Persistence: saved defaults for tuning sliders ───────────────────────────
//
// All six tuning sliders can be persisted as defaults via the "Save as defaults"
// button in the Tuning panel. We store them in localStorage under bgmscape:tuning:*
// keys; on store init we read them back and override the hardcoded defaults
// when a saved value is present.
//
// Per-browser, not per-user — when bgmscape becomes multi-user (Phase 3) this
// should migrate to a UserPreferences model in the backend. Keys are namespaced
// to make that migration straightforward.

const TUNING_KEYS = [
  'dwellVarianceMs',
  'fadeOutDuration',
  'fadeInDuration',
  'travelMinMs',
  'travelVarianceMs',
  'musicVolume',
  'ambientBusVolume',
  'ambientDensity',
  'ambientCrowdingFalloff',
  'ambientRestMinMs',
  'ambientRestVarianceMs',
] as const

type TuningKey = typeof TUNING_KEYS[number]
type TuningValues = Partial<Record<TuningKey, number>>

function _storageKey(key: TuningKey): string {
  return `bgmscape:tuning:${key}`
}

/** Write all current tuning values to localStorage as the user's new defaults. */
export function saveDefaults(state: Pick<PlaybackState, TuningKey>): void {
  if (typeof window === 'undefined' || !window.localStorage) return
  for (const key of TUNING_KEYS) {
    try {
      window.localStorage.setItem(_storageKey(key), JSON.stringify(state[key]))
    } catch {
      // Storage may be full or disabled — fail silently per-key.
    }
  }
}

/** Read saved tuning defaults from localStorage. Missing/invalid keys are omitted. */
export function loadDefaults(): TuningValues {
  if (typeof window === 'undefined' || !window.localStorage) return {}
  const result: TuningValues = {}
  for (const key of TUNING_KEYS) {
    try {
      const raw = window.localStorage.getItem(_storageKey(key))
      if (raw === null) continue
      const parsed = JSON.parse(raw)
      if (typeof parsed === 'number' && Number.isFinite(parsed)) {
        result[key] = parsed
      }
    } catch {
      // Corrupted entry — ignore, fall back to hardcoded default.
    }
  }
  return result
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
//
// Dwell is sized to the actual track length: we look up the current track's
// duration from the AudioManager buffer cache (it's always populated by the
// time we get here — startSession/advance/teleportTo each await play/transitionTo
// which await loadTrack). For regular nodes we add random(0, dwellVarianceMs)
// on top so timing isn't perfectly predictable. For transition nodes we use
// the duration exactly — the track plays once and then we advance, no variance.
//
// Fallback: if the duration is somehow unknown (cache miss after a buffer was
// evicted, or a future code path that schedules wander before the buffer
// resolves), use 30s so the timer neither fires instantly nor stalls forever.
const DWELL_FALLBACK_MS = 30_000

// ── Same-audio cluster dwell ──────────────────────────────────────────────
//
// When the next several lookahead nodes share the current node's
// audio_file_path, we treat them as a contiguous "cluster" and budget the
// total listening time as `trackLen × (1 + ln n)` (logarithmic decay), then
// split that budget evenly across the cluster's n nodes. So a 3-cluster
// lasts ~2.1× the track instead of 3×; a 1-cluster (no shared neighbors)
// uses today's per-node dwell.
//
// The cluster is set up at the *first* node of the run via a lookahead API
// call, then consumed by each subsequent same-audio entry. It's cleared on
// teleport / steer / reset (all of which invalidate the prior lookahead).
type AudioCluster = {
  audioFilePath: string
  perNodeDwellMs: number
  perNodeVarianceMs: number
  /** Cluster nodes still to be entered after the current one. Decremented per arrival. */
  remainingNodes: number
}

let _audioCluster: AudioCluster | null = null

function _clearCluster(): void {
  _audioCluster = null
}

/**
 * Fetch the current lookahead queue and, if the upcoming nodes share the
 * current node's audio_file_path, build a cluster descriptor with the
 * logarithmic per-node dwell budget. Sets `_audioCluster` to null when
 * there's no run (single-node listening — today's behavior).
 */
async function _setupClusterFromLookahead(
  currentNode: Node,
  baseTrackMs: number,
  dwellVarianceMs: number,
): Promise<void> {
  const { sessionId } = usePlayback.getState()
  _audioCluster = null
  if (!sessionId || !currentNode.audio_file_path) return

  let steps: Awaited<ReturnType<typeof sessionsApi.lookaheadSession>>['steps']
  try {
    const resp = await sessionsApi.lookaheadSession(sessionId, 16)
    steps = resp.steps
  } catch {
    return  // backend hiccup — fall back to single-node dwell
  }

  // Count contiguous upcoming nodes that share this node's audio.
  let matching = 0
  for (const step of steps) {
    if (step.audio_file_path === currentNode.audio_file_path) matching += 1
    else break
  }
  if (matching === 0) return  // single-node case: leave _audioCluster null

  const n = 1 + matching
  const totalDwellMs = baseTrackMs * (1 + Math.log(n))
  _audioCluster = {
    audioFilePath: currentNode.audio_file_path,
    perNodeDwellMs: totalDwellMs / n,
    // Variance is also split so the user's overall dwellVariance setting
    // isn't multiplied n× across the cluster.
    perNodeVarianceMs: dwellVarianceMs / n,
    remainingNodes: matching,  // current node consumes the first slot inline below
  }

  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.debug(
      '[wander] cluster setup',
      { audio: currentNode.audio_file_path, n, perNodeMs: Math.round(_audioCluster.perNodeDwellMs) },
    )
  }
}

async function _scheduleWander() {
  const { currentNode, dwellVarianceMs } = usePlayback.getState()
  const url = currentNode?.audio_file_path ? audioUrl(currentNode.audio_file_path) : null
  const durationSec = url ? getAudio().getDuration(url) : null
  const baseMs = durationSec != null ? durationSec * 1000 : DWELL_FALLBACK_MS

  let dwell: number

  if (!currentNode) {
    dwell = baseMs
  } else if (currentNode.is_transition) {
    // Transition nodes bypass clustering: track plays exactly once, no variance.
    _clearCluster()
    dwell = baseMs
  } else if (
    _audioCluster &&
    _audioCluster.audioFilePath === currentNode.audio_file_path &&
    _audioCluster.remainingNodes > 0
  ) {
    // Mid-cluster: use the share already budgeted at first-node setup.
    dwell = _audioCluster.perNodeDwellMs + Math.random() * _audioCluster.perNodeVarianceMs
    _audioCluster.remainingNodes -= 1
    if (_audioCluster.remainingNodes <= 0) _clearCluster()
  } else {
    // Fresh entry: try to set up a cluster from the upcoming lookahead.
    const nodeAtStart = currentNode
    await _setupClusterFromLookahead(currentNode, baseMs, dwellVarianceMs)
    // If user steered / teleported / stopped during the await, abort the schedule.
    const after = usePlayback.getState()
    if (after.currentNode !== nodeAtStart || !after.wanderActive || !after.playing) return
    if (_audioCluster) {
      dwell = _audioCluster.perNodeDwellMs + Math.random() * _audioCluster.perNodeVarianceMs
      // First node of the cluster is being scheduled now; rest follow.
      // remainingNodes already counts only the *additional* cluster nodes,
      // so don't decrement here — the next entry will consume the first slot.
    } else {
      dwell = baseMs + Math.random() * dwellVarianceMs
    }
  }

  const firesAt = Date.now() + dwell
  usePlayback.setState({ nextAdvanceAt: firesAt })
  _wanderTimer = setTimeout(async () => {
    const { wanderActive, playing, transitioning, advance } = usePlayback.getState()
    if (!wanderActive || !playing) return
    if (!transitioning) await advance()
    void _scheduleWander()
  }, dwell)
}

// ── Store ─────────────────────────────────────────────────────────────────────

// Apply any saved defaults from localStorage on top of the hardcoded defaults.
// Saved values win when present; otherwise the hardcoded defaults are used.
const _savedDefaults = loadDefaults()

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

  dwellVarianceMs: 20_000,
  fadeOutDuration: 1.5,
  fadeInDuration: 1,
  travelMinMs: 3_000,
  travelVarianceMs: 3_000,
  musicVolume: 1,
  ambientBusVolume: 0.7,
  ambientDensity: 0.6,
  ambientCrowdingFalloff: 0.35,
  ambientRestMinMs: 8_000,
  ambientRestVarianceMs: 22_000,

  // Saved defaults from localStorage override the hardcoded values above where present
  ..._savedDefaults,

  // ── Tunable setters ──────────────────────────────────────────────────────

  setDwellVarianceMs: (v) => set({ dwellVarianceMs: v }),
  setFadeOutDuration: (v) => set({ fadeOutDuration: v }),
  setFadeInDuration: (v) => set({ fadeInDuration: v }),
  setTravelMinMs: (v) => set({ travelMinMs: v }),
  setTravelVarianceMs: (v) => set({ travelVarianceMs: v }),
  setMusicVolume: (v) => {
    set({ musicVolume: v })
    _audioManager?.setVolume(v)
  },
  setAmbientBusVolume: (v) => {
    set({ ambientBusVolume: v })
    _ambientEngine?.setBusVolume(v)
  },
  setAmbientDensity: (v) => {
    set({ ambientDensity: v })
    _ambientEngine?.setDensity(v)
  },
  setAmbientCrowdingFalloff: (v) => {
    set({ ambientCrowdingFalloff: v })
    _ambientEngine?.setCrowdingFalloff(v)
  },
  setAmbientRestMinMs: (v) => {
    set({ ambientRestMinMs: v })
    _ambientEngine?.setRest(v, get().ambientRestVarianceMs)
  },
  setAmbientRestVarianceMs: (v) => {
    set({ ambientRestVarianceMs: v })
    _ambientEngine?.setRest(get().ambientRestMinMs, v)
  },

  // ── Actions ──────────────────────────────────────────────────────────────

  reset: () => {
    cancelWanderTimer()
    _clearCluster()
    _audioManager?.fadeOut(0.5).catch(() => {})
    _ambientEngine?.stopAll()
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
    // Apply the user's saved music volume (loaded from localStorage on store
    // init). Without this, the AudioManager always starts at its hardcoded 1.0
    // and the slider in Settings would silently disagree with what plays.
    audio.setVolume(get().musicVolume)

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
        loop: !startNode.is_transition,
      })
    }

    // Refresh the ambient asset library (fire-and-forget — does not gate
    // music playback) and trigger the first node-arrival evaluation once
    // it's done. Also push all ambient tuning params so the engine reflects
    // the localStorage values picked up at store init.
    if (_ambientEngine) {
      const s = get()
      _ambientEngine.setBusVolume(s.ambientBusVolume)
      _ambientEngine.setDensity(s.ambientDensity)
      _ambientEngine.setCrowdingFalloff(s.ambientCrowdingFalloff)
      _ambientEngine.setRest(s.ambientRestMinMs, s.ambientRestVarianceMs)
    }
    void _refreshAmbientLibrary().then(() => {
      _ambientEngine?.onNodeChange(startNode.ambient_tags ?? [])
    })

    await sessionsApi.updateSession(session.id, { wander_active: true })
    // Fresh session — no cluster context carried over from a previous run.
    _clearCluster()
    void _scheduleWander()
  },

  advance: async () => {
    const { sessionId, graph, currentNode, wanderHistory, fadeOutDuration, fadeInDuration, travelMinMs, travelVarianceMs } = get()
    if (!sessionId || get().transitioning) return
    set({ transitioning: true, nextAdvanceAt: null })

    try {
      const audio = getAudio()
      const result = await sessionsApi.advanceSession(sessionId)
      const nextNode = graph?.nodes.find(n => n.id === result.next_node_id) ?? null

      // Skip the crossfade when the next node shares an audio file with the
      // current node. This is intentional in graphs that model spatially
      // distinct locations sharing one OST track (e.g. SM64 castle hubs all
      // playing "Inside The Castle Walls"). The music keeps looping while
      // the listener "moves" between same-track locations.
      const sameAudio = !!(
        result.audio_file_path &&
        currentNode?.audio_file_path &&
        result.audio_file_path === currentNode.audio_file_path
      )

      if (result.audio_file_path && !sameAudio) {
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
          loop: !nextNode?.is_transition,
        })
      }

      const prev = currentNode?.id
      const newHistory = prev
        ? [...wanderHistory.slice(-19), prev]
        : wanderHistory
      set({ currentNode: nextNode, nominatedNextNodeId: null, wanderHistory: newHistory })

      // Ambient layer re-evaluates at every arrival. Active plays from a
      // previous node continue their scheduled durations — see AmbientEngine
      // tail-off rule.
      if (nextNode) {
        _ambientEngine?.onNodeChange(nextNode.ambient_tags ?? [])
      }
    } finally {
      set({ transitioning: false })
    }
  },

  setPlaying: (active) => {
    const audio = getAudio()
    if (active) {
      audio.unpause()
      _ambientEngine?.resume()
      set({ playing: true })
      const { wanderActive } = get()
      if (wanderActive) void _scheduleWander()
    } else {
      cancelWanderTimer()
      set({ playing: false, nextAdvanceAt: null })
      audio.pause()
      _ambientEngine?.pause()
    }
  },

  setWanderActive: async (active) => {
    const { sessionId, playing } = get()
    if (sessionId) {
      await sessionsApi.updateSession(sessionId, { wander_active: active })
    }
    set({ wanderActive: active })

    if (active && playing) {
      void _scheduleWander()
    } else {
      cancelWanderTimer()
      set({ nextAdvanceAt: null })
    }
  },

  steerTo: async (nodeId) => {
    const { sessionId } = get()
    if (!sessionId) return
    await sessionsApi.updateSession(sessionId, { nominated_next_node_id: nodeId })
    // Steer invalidates the lookahead → invalidate any cluster built from it.
    _clearCluster()
    set({ nominatedNextNodeId: nodeId })
  },

  teleportTo: async (nodeId) => {
    const { sessionId, graph, currentNode, wanderHistory, fadeInDuration } = get()
    if (!sessionId) return
    const audio = getAudio()

    const targetNode = graph?.nodes.find(n => n.id === nodeId) ?? null
    if (!targetNode) return

    // Same-audio skip: teleporting to a node that shares the current track is
    // a pure visual jump — no fade, no reload.
    const sameAudio = !!(
      targetNode.audio_file_path &&
      currentNode?.audio_file_path &&
      targetNode.audio_file_path === currentNode.audio_file_path
    )

    set({ transitioning: true })
    // Teleport clears the server lookahead → invalidate any cluster built from it.
    _clearCluster()
    try {
      await sessionsApi.teleportSession(sessionId, nodeId)
      if (!sameAudio) {
        await audio.fadeOut()
        if (targetNode.audio_file_path) {
          await audio.play(audioUrl(targetNode.audio_file_path), {
            loopStart: targetNode.loop_start ?? 0,
            loopEnd: targetNode.loop_end ?? undefined,
            fadeInDuration,
            loop: !targetNode.is_transition,
          })
        }
      }
      const prev = currentNode?.id
      const newHistory = prev ? [...wanderHistory.slice(-19), prev] : wanderHistory
      set({ currentNode: targetNode, nominatedNextNodeId: null, wanderHistory: newHistory })

      // Same as advance(): refresh ambient at the new node. Teleport is
      // instant for music but ambient still gets re-evaluated — already-
      // playing scheduled events continue regardless.
      _ambientEngine?.onNodeChange(targetNode.ambient_tags ?? [])
    } finally {
      set({ transitioning: false })
    }
  },
}))
