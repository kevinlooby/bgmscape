// AmbientEngine — atmospheric audio layer mixed alongside the music engine.
// Framework-agnostic: no React imports. Pairs with AudioManager via the
// `getEngineHandles()` accessor; ambient audio routes through its own bus
// into AudioManager's masterGain so a single master volume governs both.
//
// Design principles (see plan / review):
//   - Selection is decided at node-arrival time. Scheduled plays run to
//     completion regardless of subsequent wanders — gives the soundscape
//     inertia and avoids jarring cuts.
//   - Selection logic (selectActiveAssets) is a pure function so the editor's
//     Preview button can call it with the same library and current node tags
//     to show what would queue.
//   - One slot per category. If a category is already running, do nothing
//     until the active play ends; then re-evaluate the current node.
//   - Independent of the music engine — ambient keeps playing through the
//     travel-silence gap.

import type { AmbientAsset } from '../types'
import type { AudioManager } from './AudioManager'
import { ambientAssetUrl } from '../api/ambient'
import type { AudioFetcher } from '../api/audio'
import { httpFetcher } from '../api/audio'

export interface SelectedAsset {
  asset: AmbientAsset
  /** Overlap count between node tags and asset tags — higher = better fit. */
  score: number
}

/**
 * Pure selection function: given a node's tag list and the full asset library,
 * return the best-fit asset for each category, ranked by tag overlap. Ties
 * broken randomly — repeated calls with the same input may pick different
 * winners, which is desired (variety across visits to the same node).
 *
 * Used both by the runtime AmbientEngine and by the editor's Preview button.
 */
export function selectActiveAssets(
  nodeTags: string[],
  library: AmbientAsset[],
): SelectedAsset[] {
  if (nodeTags.length === 0) return []

  const nodeTagSet = new Set(nodeTags)
  const byCategory = new Map<string, SelectedAsset[]>()

  for (const asset of library) {
    // Vetting suppression: a curator-tagged asset never plays. Both the
    // runtime engine and the editor's Preview button see this identical
    // filtered result (single source of truth).
    if (asset.review_status === 'marked_for_removal') continue
    let score = 0
    for (const t of asset.tags) if (nodeTagSet.has(t)) score++
    if (score === 0) continue
    const list = byCategory.get(asset.category) ?? []
    list.push({ asset, score })
    byCategory.set(asset.category, list)
  }

  const winners: SelectedAsset[] = []
  for (const list of byCategory.values()) {
    const topScore = Math.max(...list.map(x => x.score))
    const top = list.filter(x => x.score === topScore)
    winners.push(top[Math.floor(Math.random() * top.length)])
  }
  return winners
}

/** In-place Fisher–Yates shuffle; returns the same array for chaining. */
function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}


// ── Runtime engine ───────────────────────────────────────────────────────────

interface ActivePlay {
  asset: AmbientAsset
  source: AudioBufferSourceNode
  gain: GainNode
  /** When the play is scheduled to end (AudioContext.currentTime). */
  endTimeS: number
}

export class AmbientEngine {
  private am: AudioManager
  private fetcher: AudioFetcher
  private context: AudioContext | null = null
  private ambientBus: GainNode | null = null

  /** Decoded ambient buffers, keyed by asset id. */
  private bufferCache: Map<string, AudioBuffer> = new Map()
  /** Currently playing ambient sources, keyed by category. */
  private activePlays: Map<string, ActivePlay> = new Map()
  /**
   * Assets selected and queued at the most recent onNodeChange but not yet
   * playing — typically waiting on _loadBuffer to fetch + decode the audio
   * file. Keyed by category so it mirrors activePlays. Surfaced in the
   * listener UI so the player can see what's about to start, not just what's
   * already audible.
   */
  private pendingPlays: Map<string, AmbientAsset> = new Map()

  /** Asset library snapshot. The library page is the canonical source — this
   *  is refreshed via setLibrary() when the listener mounts (and on demand). */
  private library: AmbientAsset[] = []

  /** Last node arrival's tag list. Re-evaluated when a play ends so the engine
   *  doesn't requeue a category that no longer matches the current location. */
  private currentNodeTags: string[] = []

  /** Ambient bus volume (0..1). Multiplicative with the AudioManager master. */
  private _busVolume = 0.7
  private _paused = false

  // ── Density model ──────────────────────────────────────────────────────────
  //
  // Spawning is probabilistic and crowding-aware so the soundscape stays sparse
  // by default and only rarely reaches a high layer count. The chance a matching
  // category actually starts a sound is:
  //
  //   density × asset.play_probability × crowdingFalloff^(layers already playing)
  //
  // With density 0.6 / falloff 0.35 that's ~0.6 with nothing playing, ~0.21 with
  // one layer, ~0.07 with two — so 3+ at once is uncommon but never forbidden.
  /** Global base chance a matching category starts a sound (0..1). */
  private _density = 0.6
  /** Per-already-playing-layer multiplier on the start chance (0..1). */
  private _crowdingFalloff = 0.35
  /** Minimum silence after a play ends before its category may restart (ms). */
  private _restMinMs = 8_000
  /** Random extra silence on top of the minimum (ms). */
  private _restVarianceMs = 22_000

  /**
   * Categories currently in their post-play rest window, keyed by category to a
   * pending timer handle. A category is "resting" iff it has an entry here; the
   * timer fires _maybeRequeueCategory when the rest elapses. Keeps the layer
   * from refilling the instant a sound ends, which is what makes it breathe.
   */
  private restTimers: Map<string, ReturnType<typeof setTimeout>> = new Map()

  constructor(audioManager: AudioManager, fetcher: AudioFetcher = httpFetcher) {
    this.am = audioManager
    this.fetcher = fetcher
  }

  // ── Setup ──────────────────────────────────────────────────────────────────

  setLibrary(library: AmbientAsset[]): void {
    this.library = library
  }

  getLibrary(): AmbientAsset[] {
    return this.library
  }

  /** Lazily build the ambient bus once AudioManager has its context up. */
  private ensureBus(): boolean {
    if (this.ambientBus && this.context) return true
    const handles = this.am.getEngineHandles()
    if (!handles) return false
    this.context = handles.context
    this.ambientBus = this.context.createGain()
    this.ambientBus.gain.setValueAtTime(this._busVolume, this.context.currentTime)
    this.ambientBus.connect(handles.masterGain)
    return true
  }

  // ── Volume ─────────────────────────────────────────────────────────────────

  setBusVolume(v: number): void {
    this._busVolume = Math.max(0, Math.min(1, v))
    if (!this.ambientBus || !this.context) return
    this.ambientBus.gain.setValueAtTime(this._busVolume, this.context.currentTime)
  }

  getBusVolume(): number {
    return this._busVolume
  }

  // ── Density tuning ───────────────────────────────────────────────────────────

  setDensity(v: number): void {
    this._density = Math.max(0, Math.min(1, v))
  }

  setCrowdingFalloff(v: number): void {
    this._crowdingFalloff = Math.max(0, Math.min(1, v))
  }

  setRest(minMs: number, varianceMs: number): void {
    this._restMinMs = Math.max(0, minMs)
    this._restVarianceMs = Math.max(0, varianceMs)
  }

  // ── Lifecycle: pause / resume ──────────────────────────────────────────────

  /**
   * Suspend ambient: duck the bus to silence AND clear all pending rest
   * timers. The rest timers are wall-clock setTimeouts so they'd otherwise
   * keep ticking during pause and either fire uselessly (skipped via the
   * `_paused` guard inside `_maybeRequeueCategory`) or expire while paused
   * and leave the category stranded with no active / pending / rest entry —
   * never coming back until the next node change.
   *
   * Active source playback freezes naturally because AudioManager.pause()
   * suspends the shared AudioContext once its fade-out completes — so we
   * don't need to stop or remember offsets for the source nodes themselves.
   * When the context resumes, the playing sources pick up exactly where
   * they left off.
   */
  pause(): void {
    if (this._paused) return
    this._paused = true
    for (const timer of this.restTimers.values()) clearTimeout(timer)
    this.restTimers.clear()
    if (!this.ambientBus || !this.context) return
    const now = this.context.currentTime
    this.ambientBus.gain.cancelScheduledValues(now)
    this.ambientBus.gain.setValueAtTime(this.ambientBus.gain.value, now)
    this.ambientBus.gain.linearRampToValueAtTime(0, now + 0.15)
  }

  /**
   * Resume ambient: ramp the bus back up. Any source nodes that were
   * playing when we paused continue from where they left off (the
   * AudioContext was suspended; their playheads are frozen). Re-evaluate
   * the current node tags so categories whose rest timers we cleared on
   * pause get a chance to repopulate instead of staying empty.
   */
  resume(): void {
    if (!this._paused) return
    this._paused = false
    if (this.ambientBus && this.context) {
      const now = this.context.currentTime
      this.ambientBus.gain.cancelScheduledValues(now)
      this.ambientBus.gain.setValueAtTime(this.ambientBus.gain.value, now)
      this.ambientBus.gain.linearRampToValueAtTime(this._busVolume, now + 0.15)
    }
    // Repopulate any category whose rest timer we cleared on pause.
    // onNodeChange skips slots that are already active/pending, so this
    // doesn't disturb sources that resumed from suspension.
    if (this.currentNodeTags.length > 0) {
      this.onNodeChange(this.currentNodeTags)
    }
  }

  /** Stop everything immediately — used when the listener leaves the page. */
  stopAll(): void {
    for (const play of this.activePlays.values()) {
      try { play.source.stop() } catch { /* already stopped */ }
      try { play.gain.disconnect() } catch { /* ok */ }
    }
    for (const timer of this.restTimers.values()) clearTimeout(timer)
    this.restTimers.clear()
    this.activePlays.clear()
    this.pendingPlays.clear()
  }

  // ── Public read of active state (for the listener UI chip strip) ─────────

  /**
   * Snapshot of every category slot the engine is currently driving — both
   * actively playing layers (with remaining seconds) and pending layers
   * (selected at the last node arrival, still loading/decoding their audio
   * file, so remainingS is null). Pending layers do not duplicate active
   * ones — a category appears as one or the other, never both.
   */
  getActivePlays(): Array<{
    category: string
    assetName: string
    remainingS: number | null
    status: 'playing' | 'queued'
  }> {
    if (!this.context) return []
    const now = this.context.currentTime
    const out: Array<{
      category: string
      assetName: string
      remainingS: number | null
      status: 'playing' | 'queued'
    }> = []
    for (const [category, play] of this.activePlays.entries()) {
      out.push({
        category,
        assetName: play.asset.name,
        remainingS: Math.max(0, play.endTimeS - now),
        status: 'playing',
      })
    }
    for (const [category, asset] of this.pendingPlays.entries()) {
      // An active play in the same category supersedes its pending entry —
      // pendingPlays is cleared the moment the source actually starts.
      if (this.activePlays.has(category)) continue
      out.push({
        category,
        assetName: asset.name,
        remainingS: null,
        status: 'queued',
      })
    }
    return out
  }

  // ── Main entry: called by playback store on each node arrival ────────────

  /**
   * Called when the listener arrives at a node. Selects best-fit assets per
   * category given the node's ambient_tags, and queues a new play for any
   * empty category slot whose probability roll succeeds. Active plays from a
   * previous node are NOT cancelled — they finish their scheduled durations
   * (the "tail-off" rule).
   */
  onNodeChange(ambientTags: string[]): void {
    this.currentNodeTags = ambientTags
    if (this._paused) return
    if (!this.ensureBus()) return

    // Shuffle the per-category winners so that when crowding falloff limits how
    // many actually start, it isn't always the same categories that win the
    // early (less-suppressed) slots.
    const winners = shuffle(selectActiveAssets(ambientTags, this.library))
    for (const { asset } of winners) {
      if (this.activePlays.has(asset.category)) continue
      if (this.pendingPlays.has(asset.category)) continue
      if (this.restTimers.has(asset.category)) continue
      // Crowding-aware roll: each layer already playing (or pending) lowers the
      // chance the next one starts, so density stays low and high counts are
      // rare. _currentLayerCount() rises as accepted assets are added to
      // pendingPlays below, so the 2nd/3rd candidate this arrival is suppressed.
      if (Math.random() > this._effectiveStartProb(asset)) continue
      // Mark as pending immediately so the listener UI surfaces the
      // about-to-play asset during the buffer fetch/decode window. The
      // entry is cleared inside _queuePlay once source.start() runs (or on
      // load failure).
      this.pendingPlays.set(asset.category, asset)
      void this._queuePlay(asset)
    }
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  private async _loadBuffer(asset: AmbientAsset): Promise<AudioBuffer | null> {
    if (this.bufferCache.has(asset.id)) return this.bufferCache.get(asset.id)!
    if (!this.context) return null
    try {
      const arr = await this.fetcher(ambientAssetUrl(asset.id))
      const buf = await this.context.decodeAudioData(arr)
      this.bufferCache.set(asset.id, buf)
      return buf
    } catch {
      return null
    }
  }

  private async _queuePlay(asset: AmbientAsset): Promise<void> {
    if (!this.context || !this.ambientBus) {
      this.pendingPlays.delete(asset.category)
      return
    }
    const buf = await this._loadBuffer(asset)
    if (!buf || !this.context || !this.ambientBus) {
      this.pendingPlays.delete(asset.category)
      return
    }

    // Pick a duration in [min, max]; clamp to a length that comfortably holds
    // both fade ramps so fade_in and fade_out can't overlap (and aren't longer
    // than the asset's own buffer with looping disabled in the future).
    const min = asset.min_play_duration_s
    const max = asset.max_play_duration_s
    const drawn = min + Math.random() * Math.max(0, max - min)
    const fadeIn = asset.fade_in_ms / 1000
    const fadeOut = asset.fade_out_ms / 1000
    const minHold = fadeIn + fadeOut + 0.5
    const durationS = Math.max(drawn, minHold)

    const source = this.context.createBufferSource()
    source.buffer = buf
    source.loop = true  // ambient loops within its scheduled window
    source.loopStart = 0
    source.loopEnd = buf.duration

    const gain = this.context.createGain()
    const now = this.context.currentTime
    const targetVol = asset.default_volume
    gain.gain.setValueAtTime(0, now)
    gain.gain.linearRampToValueAtTime(targetVol, now + fadeIn)
    // Schedule the fade-out so the play ends at exactly now + durationS.
    const fadeOutStart = now + durationS - fadeOut
    gain.gain.setValueAtTime(targetVol, fadeOutStart)
    gain.gain.linearRampToValueAtTime(0, now + durationS)

    source.connect(gain)
    gain.connect(this.ambientBus)
    source.start(now)
    source.stop(now + durationS + 0.05)

    const endTimeS = now + durationS
    const play: ActivePlay = { asset, source, gain, endTimeS }
    this.activePlays.set(asset.category, play)
    // Audio is now actually playing — clear the pending marker.
    this.pendingPlays.delete(asset.category)

    source.onended = () => {
      // The source might be the *new* one for this category by the time this
      // fires (rare, but possible if the engine queues another in the same
      // category after this one ended). Guard against clobbering.
      const current = this.activePlays.get(asset.category)
      if (current && current.source === source) {
        this.activePlays.delete(asset.category)
        try { gain.disconnect() } catch { /* ok */ }
        // Breathing: instead of refilling immediately, rest the category for a
        // randomized window. Only when the rest elapses do we re-evaluate the
        // current node and maybe start a new sound — so density drops and the
        // layer goes genuinely quiet between plays.
        const restMs = this._restMinMs + Math.random() * this._restVarianceMs
        const timer = setTimeout(() => {
          this.restTimers.delete(asset.category)
          this._maybeRequeueCategory(asset.category)
        }, restMs)
        this.restTimers.set(asset.category, timer)
      }
    }
  }

  /** Layers occupying a slot right now — used to scale the crowding falloff. */
  private _currentLayerCount(): number {
    return this.activePlays.size + this.pendingPlays.size
  }

  /**
   * Chance a given asset should actually start, combining the global density
   * dial, the asset's own play_probability, and the crowding falloff applied
   * once per layer already occupying a slot. Clamped to [0, 1].
   */
  private _effectiveStartProb(asset: AmbientAsset): number {
    const p = this._density
      * asset.play_probability
      * Math.pow(this._crowdingFalloff, this._currentLayerCount())
    return Math.max(0, Math.min(1, p))
  }

  private _maybeRequeueCategory(category: string): void {
    if (this._paused) return
    if (!this.context || !this.ambientBus) return
    // Bail if the category filled or re-entered a rest window while we waited.
    if (this.activePlays.has(category)) return
    if (this.pendingPlays.has(category)) return
    if (this.restTimers.has(category)) return
    const winners = selectActiveAssets(this.currentNodeTags, this.library)
    const next = winners.find(w => w.asset.category === category)
    if (!next) return
    if (Math.random() > this._effectiveStartProb(next.asset)) return
    this.pendingPlays.set(next.asset.category, next.asset)
    void this._queuePlay(next.asset)
  }
}
