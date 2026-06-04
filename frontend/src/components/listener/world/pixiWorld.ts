/**
 * PixiWorld — imperative controller for the listener-page pixel-art scene.
 *
 * Owns one Pixi v8 `Application` and the layered Containers that make up the
 * scene (background fill, terrain, then tint overlays for time-of-day and
 * weather). The React `WorldSimulation` component is a thin shell that
 * constructs an instance, calls `mount(el)`, pushes state via
 * `update(snapshot)`, and calls `destroy()` on unmount.
 *
 * Why imperative (no `@pixi/react`): the scene is procedurally generated,
 * not declaratively composed. Reconciling tens of thousands of tiles every
 * React render would burn cycles for no benefit; pushing a snapshot once
 * per state change is cheaper and more predictable.
 *
 * StrictMode safety: `destroy()` is safe to call at any point in the
 * lifecycle — before `mount()` resolves, after it resolves, or repeatedly.
 * Internal `_destroyed` flag short-circuits double-destroys and lets the
 * async mount path abort if cleanup ran first.
 *
 * Re-render strategy: tiles only regenerate when the *node id* changes
 * (cheap path: just twiddle alpha on the tint overlays). This keeps the
 * 500ms ambient-poll → snapshot push lightweight.
 */

import { Application, Container, Graphics, Sprite, TextureSource } from 'pixi.js'
import type { Spritesheet } from 'pixi.js'
import { loadWorldAssets } from './assets'
import { resolveBiome } from './biomeResolver'
import {
  INDOOR_BG,
  OUTDOOR_BG,
  TIME_TINTS,
  WEATHER_TINTS,
  type BiomeProfile,
} from './biomeProfiles'
import { generateMap, seedFromString, type TileMap } from './proceduralMap'

// Use nearest-neighbor filtering globally so pixel art stays crisp at any
// scale. Set once at module load — affects every TextureSource created
// afterward, which is all of them.
TextureSource.defaultOptions.scaleMode = 'nearest'

const TILE_SIZE = 32

/**
 * Used for the very first scene (before any snapshot arrives) and as a
 * fallback when currentNodeId is null (e.g. session not yet started).
 * Picked so the empty-state scene still looks intentional, not broken.
 */
const FALLBACK_SEED = 0xbeef

export interface WorldSnapshot {
  /** Current node id (or null if no session). Drives biome + seed. */
  currentNodeId: string | null
  /** Current node name — humans-readable for debugging. */
  currentNodeName: string | null
  /** Current node ambient_tags — drives biome resolution. */
  ambientTags: string[]
  /** Live ambient categories playing right now ('birds', 'water', …). */
  activeAmbient: string[]
  /** True while the music engine is mid-crossfade. */
  transitioning: boolean
}

export interface PixiWorldOptions {
  width?: number
  height?: number
  background?: number
}

const DEFAULTS: Required<PixiWorldOptions> = {
  width: 800,
  height: 416,
  background: OUTDOOR_BG,
}

export class PixiWorld {
  private opts: Required<PixiWorldOptions>
  private app: Application | null = null
  /** Persistent layers — created once in mount, populated on each snapshot. */
  private bgLayer: Graphics | null = null
  private terrainLayer: Container | null = null
  private propsLayer: Container | null = null
  private timeTintLayer: Graphics | null = null
  private weatherTintLayer: Graphics | null = null

  /** Loaded once on mount; null until the assets promise resolves. */
  private terrainSheet: Spritesheet | null = null
  private propsSheet: Spritesheet | null = null

  /** Set the moment destroy() is called. */
  private _destroyed = false
  /** Set once mount's async setup finishes successfully. */
  private _ready = false
  /** Stash the most recent snapshot when update() arrives before _ready. */
  private _pendingSnapshot: WorldSnapshot | null = null
  /** Last seed actually rendered — skip tile regeneration if unchanged. */
  private _lastRenderedSeed: number | null = null

  constructor(options: PixiWorldOptions = {}) {
    this.opts = { ...DEFAULTS, ...options }
  }

  // ── public lifecycle ────────────────────────────────────────────────────

  async mount(parent: HTMLElement): Promise<void> {
    if (this._destroyed) return
    if (this.app) return

    const app = new Application()
    await app.init({
      width: this.opts.width,
      height: this.opts.height,
      backgroundColor: this.opts.background,
      antialias: false,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
    })

    // Cleanup may have fired during init. Throw away the new Application
    // before it touches the DOM.
    if (this._destroyed) {
      app.destroy({ removeView: true }, true)
      return
    }

    this.app = app
    parent.appendChild(app.canvas)

    // Layer order, bottom to top:
    //   bgLayer          — solid color rect (cheaper than re-clearing renderer.bg)
    //   terrainLayer     — tile sprites
    //   propsLayer       — overlay sprites (trees, bushes, tufts, rocks)
    //   weatherTintLayer — fog / rain / snow wash
    //   timeTintLayer    — day / dawn / dusk / night
    this.bgLayer = new Graphics()
    this.terrainLayer = new Container()
    this.terrainLayer.label = 'terrain'
    this.propsLayer = new Container()
    this.propsLayer.label = 'props'
    this.weatherTintLayer = new Graphics()
    this.timeTintLayer = new Graphics()
    app.stage.addChild(
      this.bgLayer,
      this.terrainLayer,
      this.propsLayer,
      this.weatherTintLayer,
      this.timeTintLayer,
    )

    // Kick off the asset load — when it resolves, apply the latest snapshot
    // (which may have arrived before assets were ready).
    const assets = await loadWorldAssets()
    if (this._destroyed) return
    this.terrainSheet = assets.terrain
    this.propsSheet = assets.props
    this._ready = true

    // Apply whatever snapshot is current, or the empty-state default.
    this._applySnapshot(this._pendingSnapshot ?? null)
  }

  update(snapshot: WorldSnapshot): void {
    if (this._destroyed) return
    if (!this._ready) {
      this._pendingSnapshot = snapshot
      return
    }
    this._applySnapshot(snapshot)
  }

  destroy(): void {
    if (this._destroyed) return
    this._destroyed = true

    if (this.app) {
      this.app.destroy({ removeView: true }, true)
      this.app = null
    }
    this.bgLayer = null
    this.terrainLayer = null
    this.propsLayer = null
    this.weatherTintLayer = null
    this.timeTintLayer = null
    this.terrainSheet = null
    this.propsSheet = null
  }

  // ── private ─────────────────────────────────────────────────────────────

  /**
   * Apply a snapshot to the scene. Cheap path (tints only) when the node id
   * hasn't changed; full path (regenerate tiles) when it has. Null snapshot
   * → render the empty-state scene with the default profile.
   */
  private _applySnapshot(snapshot: WorldSnapshot | null): void {
    if (!this.app || !this.terrainLayer || !this.bgLayer) return

    const profile = snapshot
      ? resolveBiome(snapshot.ambientTags, snapshot.activeAmbient)
      : resolveBiome([], [])

    const seed = snapshot?.currentNodeId ? seedFromString(snapshot.currentNodeId) : FALLBACK_SEED

    // Scene regen is the expensive bit — only do it when seed has changed.
    if (seed !== this._lastRenderedSeed) {
      this._renderScene(seed, profile)
      this._lastRenderedSeed = seed
    }

    this._updateBg(profile)
    this._updateTints(profile)

    // Dev log so we can see snapshots driving the scene without opening
    // Pixi devtools. Stays in dev only; production builds strip it.
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.debug(
        '[PixiWorld] apply',
        snapshot ? snapshot.currentNodeName : '(empty)',
        profile,
      )
    }
  }

  private _renderScene(seed: number, profile: BiomeProfile): void {
    if (!this.terrainLayer || !this.propsLayer) return

    // Clear old sprites from both layers + free GPU resources. Sprite.destroy()
    // with default options keeps the underlying texture cached on the sheet —
    // only the per-sprite allocation is reclaimed.
    for (const child of this.terrainLayer.removeChildren()) {
      child.destroy()
    }
    for (const child of this.propsLayer.removeChildren()) {
      child.destroy()
    }

    if (!this.terrainSheet) return

    const availableFrames = Object.keys(this.terrainSheet.textures)
    const propFrames = this.propsSheet ? Object.keys(this.propsSheet.textures) : []
    const cols = Math.floor(this.opts.width / TILE_SIZE)
    const rows = Math.floor(this.opts.height / TILE_SIZE)
    const tilemap: TileMap = generateMap(seed, profile, {
      cols, rows, tileSize: TILE_SIZE, availableFrames, propFrames,
    })

    // ── Tiles ──────────────────────────────────────────────────────────────
    // Indoor + no terrain frames → tilemap.tiles is empty and bg shows through.
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const tile = tilemap.tiles[r * cols + c]
        if (!tile) continue
        const texture = this.terrainSheet.textures[tile.frame]
        if (!texture) continue  // frame name no longer in atlas (shouldn't happen)
        const sprite = new Sprite(texture)
        sprite.x = c * TILE_SIZE
        sprite.y = r * TILE_SIZE
        this.terrainLayer.addChild(sprite)
      }
    }

    // ── Overlays ──────────────────────────────────────────────────────────
    // Already y-sorted by generateMap. Each sprite is anchored at
    // bottom-center, so (overlay.x, overlay.y) is the *foot* of the sprite —
    // a tree's trunk lands at that y, canopy extends upward into the scene.
    if (this.propsSheet && tilemap.overlays.length > 0) {
      for (const overlay of tilemap.overlays) {
        const texture = this.propsSheet.textures[overlay.frame]
        if (!texture) continue
        const sprite = new Sprite(texture)
        sprite.anchor.set(0.5, 1.0)
        sprite.x = overlay.x
        sprite.y = overlay.y
        this.propsLayer.addChild(sprite)
      }
    }
  }

  private _updateBg(profile: BiomeProfile): void {
    if (!this.bgLayer) return
    const color = profile.isIndoor ? INDOOR_BG : OUTDOOR_BG
    this.bgLayer
      .clear()
      .rect(0, 0, this.opts.width, this.opts.height)
      .fill({ color, alpha: 1 })
  }

  private _updateTints(profile: BiomeProfile): void {
    if (!this.timeTintLayer || !this.weatherTintLayer) return
    const t = TIME_TINTS[profile.timeOfDay]
    const w = WEATHER_TINTS[profile.weather]
    this.timeTintLayer
      .clear()
      .rect(0, 0, this.opts.width, this.opts.height)
      .fill({ color: t.color, alpha: t.alpha })
    this.weatherTintLayer
      .clear()
      .rect(0, 0, this.opts.width, this.opts.height)
      .fill({ color: w.color, alpha: w.alpha })
  }
}
