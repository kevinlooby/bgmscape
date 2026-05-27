// AudioManager — Web Audio API based audio engine for bgmscape.
// Framework-agnostic: no React imports. Wrap with useAudio.ts for React usage.

const DEFAULT_FADE_IN_DURATION   = 1    // seconds
const DEFAULT_FADE_OUT_DURATION  = 1.5  // seconds

export class AudioManager {
  private context: AudioContext | null = null
  private masterGain: GainNode | null = null

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

  // Master volume tracking (separate from the muted state)
  private _volume = 1
  private _muted = false

  // ── Context lifecycle ────────────────────────────────────────────────────

  /** Create or resume the AudioContext. Must be called from a user gesture. */
  async resume(): Promise<void> {
    if (!this.context) {
      this.context = new AudioContext()
      this.masterGain = this.context.createGain()
      this.masterGain.connect(this.context.destination)
    }
    if (this.context.state === 'suspended') {
      await this.context.resume()
    }
  }

  private getContext(): AudioContext {
    if (!this.context) throw new Error('AudioContext not initialised — call resume() first')
    return this.context
  }

  private getMasterGain(): GainNode {
    if (!this.masterGain) throw new Error('Master gain not initialised — call resume() first')
    return this.masterGain
  }

  // ── Buffer loading ───────────────────────────────────────────────────────

  /** Fetch and decode an audio file, caching the result. */
  async loadTrack(url: string): Promise<AudioBuffer> {
    if (this.bufferCache.has(url)) {
      return this.bufferCache.get(url)!
    }
    const ctx = this.getContext()
    const response = await fetch(url)
    if (!response.ok) throw new Error(`Failed to fetch audio: ${url} (${response.status})`)
    const arrayBuffer = await response.arrayBuffer()
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
    gain.connect(this.getMasterGain())

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
    inGain.connect(this.getMasterGain())

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

  /** Set master output volume (0.0 – 1.0). Remembered across pause/unpause. */
  setVolume(gain: number): void {
    this._volume = Math.max(0, Math.min(1, gain))
    if (!this._muted && this.masterGain) {
      this.masterGain.gain.setValueAtTime(this._volume, this.getContext().currentTime)
    }
  }

  /** Fade master gain to silence quickly. Audio processing continues underneath. */
  pause(): void {
    this._muted = true
    if (!this.masterGain) return
    const ctx = this.getContext()
    const now = ctx.currentTime
    this.masterGain.gain.cancelScheduledValues(now)
    this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now)
    this.masterGain.gain.linearRampToValueAtTime(0, now + 0.15)
  }

  /** Fade master gain back to the stored volume. */
  unpause(): void {
    this._muted = false
    if (!this.masterGain) return
    const ctx = this.getContext()
    const now = ctx.currentTime
    this.masterGain.gain.cancelScheduledValues(now)
    this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now)
    this.masterGain.gain.linearRampToValueAtTime(this._volume, now + 0.15)
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
