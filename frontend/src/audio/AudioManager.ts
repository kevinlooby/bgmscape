// AudioManager — Web Audio API based audio engine for bgmscape.
// Framework-agnostic: no React imports. Wrap with useAudio.ts for React usage.

import type { AudioFetcher } from '../api/audio'
import { httpFetcher } from '../api/audio'

const DEFAULT_FADE_IN_DURATION   = 1    // seconds
const DEFAULT_FADE_OUT_DURATION  = 1.5  // seconds

export class AudioManager {
  private context: AudioContext | null = null
  // Signal chain:
  //   music source ─> currentGain ─> musicBus ─> masterGain ─> destination
  //   ambient ────────────────────> ambientBus ─┘
  //
  // masterGain is the pause/fade chokepoint — it stays at unity (1.0) during
  // normal playback and ramps to 0 on pause / back to 1 on unpause. The
  // per-stream volume sliders scale their own bus instead so that pulling
  // "music" to 0 does not also silence ambient (and vice versa). The
  // AmbientEngine attaches its own bus to masterGain via getEngineHandles().
  private masterGain: GainNode | null = null
  private musicBus: GainNode | null = null
  private fetcher: AudioFetcher

  /**
   * The fetcher decides how a URL-like key is turned into bytes. Defaulting
   * to `httpFetcher` preserves the historical behavior; in static-deploy mode
   * the App passes a fetcher that resolves keys against a local directory
   * handle instead of the network.
   */
  constructor(fetcher: AudioFetcher = httpFetcher) {
    this.fetcher = fetcher
  }

  // Currently playing source + its gain node
  private currentSource: AudioBufferSourceNode | null = null
  private currentGain: GainNode | null = null
  // True when the current source has stopped on its own (non-looping source
  // reached the end of its buffer). _teardownCurrent uses this to skip the
  // fade-out ramp on an already-silent source — relevant for transition nodes
  // (`is_transition: true`) where the track plays once and ends naturally.
  private currentSourceEnded = false

  // Buffer cache keyed by URL
  private bufferCache: Map<string, AudioBuffer> = new Map()

  // Music-bus volume tracking. Restored to the music bus whenever the audio
  // context (re)comes up. Independent of pause/unpause, which ramp the
  // master gain instead and leave _volume alone.
  private _volume = 1

  // Pending AudioContext suspend after the pause fade-out completes.
  // Tracked so a quick pause → unpause cycle within the fade window can
  // cancel it before the context actually suspends.
  private _pendingSuspendTimer: ReturnType<typeof setTimeout> | null = null
  // How long the fade-to-silence on pause takes (matches the ramp below),
  // plus a small slack so we suspend *after* the ramp has finished applying.
  private static readonly PAUSE_FADE_MS = 150
  private static readonly PAUSE_FADE_SLACK_MS = 50

  // ── Context lifecycle ────────────────────────────────────────────────────

  /** Create or resume the AudioContext. Must be called from a user gesture. */
  async resume(): Promise<void> {
    if (!this.context) {
      this.context = new AudioContext()
      this.masterGain = this.context.createGain()
      // Master starts at unity. Pause/unpause ramp it to 0 / back to 1 —
      // they no longer use the music-volume value, since that's the
      // music bus's job now.
      this.masterGain.gain.setValueAtTime(1, this.context.currentTime)
      this.masterGain.connect(this.context.destination)
      // Music bus sits between music sources and master. Its gain reflects
      // the user's music-volume slider value at the time the context comes
      // up (which may have been adjusted before any session started — e.g.
      // on the Settings page).
      this.musicBus = this.context.createGain()
      this.musicBus.gain.setValueAtTime(this._volume, this.context.currentTime)
      this.musicBus.connect(this.masterGain)
    }
    if (this.context.state === 'suspended') {
      await this.context.resume()
    }
  }

  private getContext(): AudioContext {
    if (!this.context) throw new Error('AudioContext not initialised — call resume() first')
    return this.context
  }

  private getMusicBus(): GainNode {
    if (!this.musicBus) throw new Error('Music bus not initialised — call resume() first')
    return this.musicBus
  }

  // ── Buffer loading ───────────────────────────────────────────────────────

  /** Fetch and decode an audio file, caching the result. */
  async loadTrack(url: string): Promise<AudioBuffer> {
    if (this.bufferCache.has(url)) {
      return this.bufferCache.get(url)!
    }
    const ctx = this.getContext()
    const arrayBuffer = await this.fetcher(url)
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer)
    this.bufferCache.set(url, audioBuffer)
    return audioBuffer
  }

  isLoaded(url: string): boolean {
    return this.bufferCache.has(url)
  }

  /**
   * Return the AudioContext and masterGain for engines that mix alongside the
   * music chain (e.g. the AmbientEngine). Returns null until resume() has
   * created the context. Used to attach a sibling bus so ambient audio runs
   * through the same master output as music but with an independent gain.
   */
  getEngineHandles(): { context: AudioContext; masterGain: GainNode } | null {
    if (!this.context || !this.masterGain) return null
    return { context: this.context, masterGain: this.masterGain }
  }

  /**
   * Duration in seconds of a cached buffer, or null if the buffer hasn't been
   * decoded yet. Used by the wander engine to size dwell time to the actual
   * track length so a track always plays at least once through.
   */
  getDuration(url: string): number | null {
    return this.bufferCache.get(url)?.duration ?? null
  }

  // ── Playback helpers ─────────────────────────────────────────────────────

  private createSource(
    buffer: AudioBuffer,
    options: { loop: boolean; loopStart: number; loopEnd?: number }
  ): AudioBufferSourceNode {
    const ctx = this.getContext()
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.loop = options.loop
    if (options.loop) {
      source.loopStart = options.loopStart
      source.loopEnd = options.loopEnd ?? buffer.duration
    }
    return source
  }

  // ── Public playback API ──────────────────────────────────────────────────

  /**
   * Start playing a track, fading in from silence.
   * Used for the very first track when a session starts.
   */
  async play(
    url: string,
    options: { loopStart?: number; loopEnd?: number; fadeInDuration?: number; loop?: boolean } = {}
  ): Promise<void> {
    const { loopStart = 0, loopEnd, fadeInDuration = DEFAULT_FADE_IN_DURATION, loop = true } = options
    const ctx = this.getContext()
    const buffer = await this.loadTrack(url)

    // Fade out and tear down any currently playing source
    await this._teardownCurrent(0.1)

    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0, ctx.currentTime)
    gain.gain.linearRampToValueAtTime(1, ctx.currentTime + fadeInDuration)
    gain.connect(this.getMusicBus())

    const source = this.createSource(buffer, { loop, loopStart, loopEnd })
    source.connect(gain)
    source.start()

    this.currentSource = source
    this.currentGain = gain
    this.currentSourceEnded = false
    source.onended = () => {
      if (this.currentSource === source) this.currentSourceEnded = true
    }
  }

  /**
   * Fade the current track to silence, optionally wait for a silent "travel"
   * period, then fade in the next track. Loading the next track overlaps the
   * fade-out (and the silence period) so audio is ready when the silence ends.
   */
  async transitionTo(
    url: string,
    options: { fadeOutDuration?: number; fadeInDuration?: number; silenceDuration?: number; loopStart?: number; loopEnd?: number; loop?: boolean } = {}
  ): Promise<void> {
    const { fadeOutDuration = DEFAULT_FADE_OUT_DURATION, fadeInDuration = DEFAULT_FADE_IN_DURATION, silenceDuration = 0, loopStart = 0, loopEnd, loop = true } = options

    // Load next track in parallel with the fade-out (and the silence period)
    const bufferPromise = this.loadTrack(url)
    await this._teardownCurrent(fadeOutDuration)

    // Optional silent travel period between tracks. Buffer continues loading
    // in the background during this wait.
    if (silenceDuration > 0) {
      await new Promise(resolve => setTimeout(resolve, silenceDuration * 1000))
    }

    const buffer = await bufferPromise

    const ctx = this.getContext()
    const inGain = ctx.createGain()
    inGain.gain.setValueAtTime(0, ctx.currentTime)
    inGain.gain.linearRampToValueAtTime(1, ctx.currentTime + fadeInDuration)
    inGain.connect(this.getMusicBus())

    const inSource = this.createSource(buffer, { loop, loopStart, loopEnd })
    inSource.connect(inGain)
    inSource.start()

    this.currentSource = inSource
    this.currentGain = inGain
    this.currentSourceEnded = false
    inSource.onended = () => {
      if (this.currentSource === inSource) this.currentSourceEnded = true
    }

    return new Promise(resolve => setTimeout(resolve, fadeInDuration * 1000))
  }

  /**
   * Fade the current track to silence and stop it.
   * Used before teleport or session end.
   */
  async fadeOut(duration = DEFAULT_FADE_OUT_DURATION): Promise<void> {
    await this._teardownCurrent(duration)
  }

  /**
   * Set the music-bus output gain (0.0 – 1.0). Affects the music track only —
   * ambient mixes through its own bus and is unaffected. Value is remembered
   * so it's reapplied when the audio context is (re)created.
   */
  setVolume(gain: number): void {
    this._volume = Math.max(0, Math.min(1, gain))
    if (this.musicBus && this.context) {
      this.musicBus.gain.setValueAtTime(this._volume, this.context.currentTime)
    }
  }

  /**
   * Pause everything: fade the master gain to silence, then suspend the
   * AudioContext so the music BufferSource actually freezes (instead of
   * silently advancing under the muted gain). The per-bus volumes are
   * preserved so they come back at their previous levels on unpause.
   *
   * The suspend is deferred until after the gain ramp completes — a
   * suspended context can't render the ramp, so we'd hear a click otherwise.
   * If unpause() fires during the fade window it cancels the pending suspend.
   */
  pause(): void {
    if (!this.masterGain || !this.context) return
    const ctx = this.context
    const now = ctx.currentTime
    this.masterGain.gain.cancelScheduledValues(now)
    this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now)
    this.masterGain.gain.linearRampToValueAtTime(0, now + AudioManager.PAUSE_FADE_MS / 1000)

    if (this._pendingSuspendTimer) clearTimeout(this._pendingSuspendTimer)
    this._pendingSuspendTimer = setTimeout(() => {
      this._pendingSuspendTimer = null
      if (this.context?.state === 'running') {
        void this.context.suspend()
      }
    }, AudioManager.PAUSE_FADE_MS + AudioManager.PAUSE_FADE_SLACK_MS)
  }

  /**
   * Unpause: cancel any pending suspend, resume the context if it's
   * suspended, then ramp master gain back to unity. The per-bus volumes
   * carry through unchanged.
   */
  unpause(): void {
    if (this._pendingSuspendTimer) {
      clearTimeout(this._pendingSuspendTimer)
      this._pendingSuspendTimer = null
    }
    if (!this.masterGain || !this.context) return
    const ctx = this.context

    const rampUp = () => {
      // Guard against the racy unpause → pause → (resume resolves) sequence.
      // If pause() ran again while ctx.resume() was in flight, a pending
      // suspend timer is now set; let pause's gain ramp win.
      if (this._pendingSuspendTimer) return
      if (!this.masterGain || !this.context) return
      const now = this.context.currentTime
      this.masterGain.gain.cancelScheduledValues(now)
      this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now)
      this.masterGain.gain.linearRampToValueAtTime(1, now + AudioManager.PAUSE_FADE_MS / 1000)
    }

    if (ctx.state === 'suspended') {
      // Resume first so the scheduled gain ramp can actually be processed.
      void ctx.resume().then(rampUp)
    } else {
      rampUp()
    }
  }

  // ── Internal helpers ─────────────────────────────────────────────────────

  private async _teardownCurrent(fadeDuration: number): Promise<void> {
    if (!this.currentGain || !this.currentSource) return
    const ctx = this.getContext()
    const gain = this.currentGain
    const source = this.currentSource
    const alreadyEnded = this.currentSourceEnded

    // If the source has already ended (non-looping track played through to its
    // end), skip the fade ramp and the wait — there's nothing left to fade. The
    // wander code path for a transition node would otherwise wait ~1.5s on a
    // silent gain node before kicking off the travel-silence period.
    if (!alreadyEnded) {
      const now = ctx.currentTime
      gain.gain.cancelScheduledValues(now)
      gain.gain.setValueAtTime(gain.gain.value, now)
      gain.gain.linearRampToValueAtTime(0, now + fadeDuration)
      await new Promise<void>(resolve => setTimeout(resolve, fadeDuration * 1000 + 50))
    }

    try { source.stop() } catch (_) { /* already stopped */ }
    gain.disconnect()

    if (this.currentSource === source) {
      this.currentSource = null
      this.currentSourceEnded = false
    }
    if (this.currentGain === gain) this.currentGain = null
  }
}
