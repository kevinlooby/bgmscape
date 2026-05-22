// AudioManager — Web Audio API based audio engine for bgmscape.
// Framework-agnostic: no React imports. Wrap with useAudio.ts for React usage.

const DEFAULT_CROSSFADE_DURATION = 3    // seconds
const DEFAULT_FADE_IN_DURATION   = 1    // seconds
const DEFAULT_FADE_OUT_DURATION  = 1.5  // seconds

export class AudioManager {
  private context: AudioContext | null = null
  private masterGain: GainNode | null = null

  // Currently playing source + its gain node
  private currentSource: AudioBufferSourceNode | null = null
  private currentGain: GainNode | null = null

  // Buffer cache keyed by URL
  private bufferCache: Map<string, AudioBuffer> = new Map()

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

  // ── Playback helpers ─────────────────────────────────────────────────────

  private createLoopingSource(
    buffer: AudioBuffer,
    loopStart = 0,
    loopEnd?: number
  ): AudioBufferSourceNode {
    const ctx = this.getContext()
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.loop = true
    source.loopStart = loopStart
    source.loopEnd = loopEnd ?? buffer.duration
    return source
  }

  // ── Public playback API ──────────────────────────────────────────────────

  /**
   * Start playing a track, fading in from silence.
   * Used for the very first track when a session starts.
   */
  async play(
    url: string,
    options: { loopStart?: number; loopEnd?: number; fadeInDuration?: number } = {}
  ): Promise<void> {
    const { loopStart = 0, loopEnd, fadeInDuration = DEFAULT_FADE_IN_DURATION } = options
    const ctx = this.getContext()
    const buffer = await this.loadTrack(url)

    // Fade out and tear down any currently playing source
    await this._teardownCurrent(0.1)

    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0, ctx.currentTime)
    gain.gain.linearRampToValueAtTime(1, ctx.currentTime + fadeInDuration)
    gain.connect(this.getMasterGain())

    const source = this.createLoopingSource(buffer, loopStart, loopEnd)
    source.connect(gain)
    source.start()

    this.currentSource = source
    this.currentGain = gain
  }

  /**
   * Crossfade from the currently playing track to a new one.
   * Outgoing: gain 1 → 0 over crossfadeDuration.
   * Incoming: gain 0 → 1 over crossfadeDuration (starts simultaneously).
   */
  async crossfadeTo(
    url: string,
    options: { crossfadeDuration?: number; loopStart?: number; loopEnd?: number } = {}
  ): Promise<void> {
    const { crossfadeDuration = DEFAULT_CROSSFADE_DURATION, loopStart = 0, loopEnd } = options
    const ctx = this.getContext()

    // Preload next track before starting any fade
    const buffer = await this.loadTrack(url)

    const now = ctx.currentTime
    const fadeEnd = now + crossfadeDuration

    // ── Fade out outgoing ────────────────────────────────────────────────
    if (this.currentGain) {
      const outGain = this.currentGain
      const outSource = this.currentSource
      outGain.gain.cancelScheduledValues(now)
      outGain.gain.setValueAtTime(outGain.gain.value, now)
      outGain.gain.linearRampToValueAtTime(0, fadeEnd)
      // Disconnect after fade
      setTimeout(() => {
        try { outSource?.stop() } catch (_) { /* already stopped */ }
        outGain.disconnect()
      }, crossfadeDuration * 1000 + 50)
    }

    // ── Fade in incoming ─────────────────────────────────────────────────
    const inGain = ctx.createGain()
    inGain.gain.setValueAtTime(0, now)
    inGain.gain.linearRampToValueAtTime(1, fadeEnd)
    inGain.connect(this.getMasterGain())

    const inSource = this.createLoopingSource(buffer, loopStart, loopEnd)
    inSource.connect(inGain)
    inSource.start()

    this.currentSource = inSource
    this.currentGain = inGain

    // Resolve after the crossfade completes
    return new Promise(resolve => setTimeout(resolve, crossfadeDuration * 1000))
  }

  /**
   * Fade the current track to silence and stop it.
   * Used before teleport or session end.
   */
  async fadeOut(duration = DEFAULT_FADE_OUT_DURATION): Promise<void> {
    await this._teardownCurrent(duration)
  }

  /** Set master output volume (0.0 – 1.0). */
  setVolume(gain: number): void {
    if (this.masterGain) {
      this.masterGain.gain.setValueAtTime(
        Math.max(0, Math.min(1, gain)),
        this.getContext().currentTime
      )
    }
  }

  // ── Internal helpers ─────────────────────────────────────────────────────

  private async _teardownCurrent(fadeDuration: number): Promise<void> {
    if (!this.currentGain || !this.currentSource) return
    const ctx = this.getContext()
    const now = ctx.currentTime
    const gain = this.currentGain
    const source = this.currentSource

    gain.gain.cancelScheduledValues(now)
    gain.gain.setValueAtTime(gain.gain.value, now)
    gain.gain.linearRampToValueAtTime(0, now + fadeDuration)

    await new Promise<void>(resolve => setTimeout(resolve, fadeDuration * 1000 + 50))
    try { source.stop() } catch (_) { /* already stopped */ }
    gain.disconnect()

    if (this.currentSource === source) this.currentSource = null
    if (this.currentGain === gain) this.currentGain = null
  }
}
