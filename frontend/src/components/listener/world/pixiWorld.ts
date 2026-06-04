/**
 * PixiWorld — imperative controller for the listener-page pixel-art scene.
 *
 * Owns one Pixi v8 `Application` and the layered Containers that make up the
 * scene (background, terrain, props, critters, particles, overlay). React's
 * `WorldSimulation` component is a thin shell that constructs an instance,
 * calls `mount(el)`, pushes state via `update(snapshot)`, and calls `destroy()`
 * on unmount. No state lives in React — Pixi's scene graph is the source of
 * truth for what's on screen.
 *
 * The class is intentionally **plain JS without React**: declarative scene
 * description via `@pixi/react` adds bundle weight and reconciler overhead we
 * don't need for an animation-only view. The procedurally generated map
 * doesn't map well to a virtual-DOM model.
 *
 * StrictMode safety: `destroy()` is safe to call at any point in the
 * lifecycle — before `mount()` resolves, after it resolves, or repeatedly.
 * Internal `_destroyed` flag short-circuits double-destroys and lets the
 * async mount path abort if cleanup ran first.
 */

import { Application, Container, Sprite, TextureSource } from 'pixi.js'
import { loadWorldAssets } from './assets'

// Use nearest-neighbor filtering globally so pixel art stays crisp at any
// scale. Set once at module load — affects every TextureSource created
// afterward, which is all of them.
TextureSource.defaultOptions.scaleMode = 'nearest'

export interface WorldSnapshot {
  /** Current node id (or null if no session). Drives biome resolution. */
  currentNodeId: string | null
  /** Current node name — humans-readable for debugging. */
  currentNodeName: string | null
  /** Current node ambient_tags — drives biome variant selection. */
  ambientTags: string[]
  /** Live ambient categories playing right now ('birds', 'water', …). */
  activeAmbient: string[]
  /** True while the music engine is mid-crossfade. */
  transitioning: boolean
}

export interface PixiWorldOptions {
  /** Logical canvas width in pixels. Defaults to 800. */
  width?: number
  /** Logical canvas height in pixels. Defaults to 416. */
  height?: number
  /** Background colour shown when no terrain is drawn. */
  background?: number
}

const DEFAULTS: Required<PixiWorldOptions> = {
  width: 800,
  height: 416,
  background: 0x0a1520,
}

const TILE_SIZE = 32

export class PixiWorld {
  private opts: Required<PixiWorldOptions>
  private app: Application | null = null
  /** Set to true the moment destroy() is called. Async paths that started
   *  before destroy must check this and bail before mutating the scene. */
  private _destroyed = false
  /** Resolves when mount finishes successfully OR rejects when destroyed
   *  before mount could finish. Lets tests / callers await the scene. */
  private _ready: Promise<void> | null = null

  constructor(options: PixiWorldOptions = {}) {
    this.opts = { ...DEFAULTS, ...options }
  }

  /**
   * Attach the Pixi canvas to a parent element and build the initial scene.
   *
   * Async because Pixi v8's `Application.init` is async and we also wait on
   * `loadWorldAssets()`. Safe to discard the returned promise — callers that
   * don't need to wait can fire-and-forget. The cleanup contract: if the
   * caller calls destroy() before this promise settles, the in-flight scene
   * setup detects it and bails before touching the DOM.
   */
  async mount(parent: HTMLElement): Promise<void> {
    if (this._destroyed) return
    if (this.app) return  // already mounted

    this._ready = (async () => {
      const app = new Application()
      await app.init({
        width: this.opts.width,
        height: this.opts.height,
        backgroundColor: this.opts.background,
        antialias: false,
        autoDensity: true,
        // Cap at the device pixel ratio so retina screens stay crisp without
        // tanking perf on a 3x display.
        resolution: Math.min(window.devicePixelRatio || 1, 2),
      })

      // If destroy was called while init() was awaiting, throw away the new
      // Application before it touches the DOM.
      if (this._destroyed) {
        app.destroy({ removeView: true }, true)
        return
      }

      this.app = app
      parent.appendChild(app.canvas)

      // Build the initial scene. From here on, scene mutations happen
      // synchronously and don't need to re-check _destroyed.
      await this._buildScene()
    })()

    return this._ready
  }

  /**
   * Push a state snapshot from React into the scene. Today this is mostly a
   * placeholder — we log the snapshot so we can see the data flowing during
   * development. Future PRs read this to swap biomes, trigger transitions,
   * spawn critters, etc.
   */
  update(snapshot: WorldSnapshot): void {
    if (!this.app || this._destroyed) return
    // Intentionally inert in PR B — the next PR wires biome selection here.
    // Kept as a debug hook so it's visible that data is reaching the scene
    // and ready to drive behaviour.
    // eslint-disable-next-line no-console
    if (import.meta.env.DEV) console.debug('[PixiWorld] snapshot', snapshot)
  }

  /**
   * Tear down the Pixi application and detach its canvas. Idempotent. Safe
   * to call before mount() resolves (the in-flight mount detects the flag
   * and skips the appendChild).
   */
  destroy(): void {
    if (this._destroyed) return
    this._destroyed = true

    if (this.app) {
      // Pass true / true so the canvas is removed AND all GPU resources
      // (textures, geometry, contexts) are freed. Without this, repeated
      // mount/unmount under StrictMode leaks WebGL contexts.
      this.app.destroy({ removeView: true }, true)
      this.app = null
    }
  }

  // ── private ─────────────────────────────────────────────────────────────

  /**
   * Build the initial scene. PR B renders a single tiled grass field as a
   * smoke test for the renderer + asset loader. Replaced by the biome /
   * proc-gen generator in the next PR.
   */
  private async _buildScene(): Promise<void> {
    if (!this.app) return

    const terrainLayer = new Container()
    terrainLayer.label = 'terrain'
    this.app.stage.addChild(terrainLayer)

    const assets = await loadWorldAssets()
    if (this._destroyed || !this.app) return

    if (!assets.terrain) {
      // No atlas yet — leave the background colour visible. PR B's smoke
      // test still works (you see a dark blue rectangle), and the loader
      // logs the failure so dev can spot the missing atlas.
      return
    }

    const grassFrameNames = Object.keys(assets.terrain.textures).filter(n =>
      n.startsWith('grass-')
    )
    if (grassFrameNames.length === 0) return

    // Tile a deterministic grid based on a fixed seed. PR C will swap the
    // seed for one derived from the current node id so each location has a
    // stable, repeatable layout.
    const rng = mulberry32(0xbeef)
    const cols = Math.floor(this.opts.width / TILE_SIZE)
    const rows = Math.floor(this.opts.height / TILE_SIZE)

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const name = grassFrameNames[Math.floor(rng() * grassFrameNames.length)]
        const sprite = new Sprite(assets.terrain.textures[name])
        sprite.x = col * TILE_SIZE
        sprite.y = row * TILE_SIZE
        terrainLayer.addChild(sprite)
      }
    }
  }
}

// ── helpers ───────────────────────────────────────────────────────────────

/**
 * Tiny seeded PRNG (Mulberry32). Good enough for cosmetic tile placement —
 * deterministic for a given seed, very small, no allocations per call.
 * Same algorithm we'll use in PR C for per-node proc-gen seeds.
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
