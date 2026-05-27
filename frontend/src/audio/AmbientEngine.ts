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
  private context: AudioContext | null = null
  private ambientBus: GainNode | null = null

  /** Decoded ambient buffers, keyed by asset id. */
  private bufferCache: Map<string, AudioBuffer> = new Map()
  /** Currently playing ambient sources, keyed by category. */
  private activePlays: Map<string, ActivePlay> = new Map()

  /** Asset library snapshot. The library page is the canonical source — this
   *  is refreshed via setLibrary() when the listener mounts (and on demand). */
  private library: AmbientAsset[] = []

  /** Last node arrival's tag list. Re-evaluated when a play ends so the engine
   *  doesn't requeue a category that no longer matches the current location. */
  private currentNodeTags: string[] = []

  /** Ambient bus volume (0..1). Multiplicative with the AudioManager master. */
  private _busVolume = 0.7
  private _paused = false

  constructor(audioManager: AudioManager) {
    this.am = audioManager
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

  // ── Lifecycle: pause / resume ──────────────────────────────────────────────

  /**
   * Suspend ambient playback by ducking the bus to silence. Scheduled
   * end-times advance with currentTime; on resume() the engine reads how much
   * AudioContext time elapsed during pause and shifts each play's endTimeS by
   * that delta so a paused play resumes with the same remaining duration.
   *
   * Simpler than restarting the BufferSource from an offset, which would
   * require remembering each source's play position too.
   */
  pause(): void {
    if (this._paused) return
    this._paused = true
    if (!this.ambientBus || !this.context) return
    const now = this.context.currentTime
    this.ambientBus.gain.cancelScheduledValues(now)
    this.ambientBus.gain.setValueAtTime(this.ambientBus.gain.value, now)
    this.ambientBus.gain.linearRampToValueAtTime(0, now + 0.15)
  }

  resume(): void {
    if (!this._paused) return
    this._paused = false
    if (!this.ambientBus || !this.context) return
    const now = this.context.currentTime
    this.ambientBus.gain.cancelScheduledValues(now)
    this.ambientBus.gain.setValueAtTime(this.ambientBus.gain.value, now)
    this.ambientBus.gain.linearRampToValueAtTime(this._busVolume, now + 0.15)
  }

  /** Stop everything immediately — used when the listener leaves the page. */
  stopAll(): void {
    for (const play of this.activePlays.values()) {
      try { play.source.stop() } catch { /* already stopped */ }
      try { play.gain.disconnect() } catch { /* ok */ }
    }
    this.activePlays.clear()
  }

  // ── Public read of active state (for the listener UI chip strip) ─────────

  getActivePlays(): Array<{ category: string; assetName: string; remainingS: number }> {
    if (!this.context) return []
    const now = this.context.currentTime
    const out: Array<{ category: string; assetName: string; remainingS: number }> = []
    for (const [category, play] of this.activePlays.entries()) {
      out.push({
        category,
        assetName: play.asset.name,
        remainingS: Math.max(0, play.endTimeS - now),
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
    if (!this.ensureBus()) return

    const winners = selectActiveAssets(ambientTags, this.library)
    for (const { asset } of winners) {
      if (this.activePlays.has(asset.category)) continue
      if (Math.random() > asset.play_probability) continue
      this._queuePlay(asset)
    }
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  private async _loadBuffer(asset: AmbientAsset): Promise<AudioBuffer | null> {
    if (this.bufferCache.has(asset.id)) return this.bufferCache.get(asset.id)!
    if (!this.context) return null
    try {
      const resp = await fetch(ambientAssetUrl(asset.id))
      if (!resp.ok) return null
      const arr = await resp.arrayBuffer()
      const buf = await this.context.decodeAudioData(arr)
      this.bufferCache.set(asset.id, buf)
      return buf
    } catch {
      return null
    }
  }

  private async _queuePlay(asset: AmbientAsset): Promise<void> {
    if (!this.context || !this.ambientBus) return
    const buf = await this._loadBuffer(asset)
    if (!buf || !this.context || !this.ambientBus) return

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

    source.onended = () => {
      // The source might be the *new* one for this category by the time this
      // fires (rare, but possible if the engine queues another in the same
      // category after this one ended). Guard against clobbering.
      const current = this.activePlays.get(asset.category)
      if (current && current.source === source) {
        this.activePlays.delete(asset.category)
        try { gain.disconnect() } catch { /* ok */ }
        // Re-evaluate against the *current* node — the listener may have
        // wandered to a node where this category no longer matches, or to one
        // where a different asset would win.
        this._maybeRequeueCategory(asset.category)
      }
    }
  }

  private _maybeRequeueCategory(category: string): void {
    if (!this.context || !this.ambientBus) return
    const winners = selectActiveAssets(this.currentNodeTags, this.library)
    const next = winners.find(w => w.asset.category === category)
    if (!next) return
    if (Math.random() > next.asset.play_probability) return
    void this._queuePlay(next.asset)
  }
}
