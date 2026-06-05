/**
 * World-simulation asset loader.
 *
 * Loads the pixel-art atlases that feed the listener-page world simulation.
 * Atlases live under `frontend/public/world/` and are referenced at runtime as
 * absolute paths (e.g. `/world/terrain.json`) — works identically in dev,
 * production, and `VITE_STATIC_MODE` because Vite copies `public/` verbatim.
 *
 * The loader is **lazy and memoised**: the first caller kicks off the load,
 * every subsequent caller awaits the same promise. Safe to call from React
 * mount effects without worrying about duplicate fetches under StrictMode.
 *
 * Until the actual atlases are added to `public/world/`, this stub resolves
 * to `ready: false`. Callers should branch on that flag and fall back to
 * drawing placeholder Pixi.Graphics primitives — keeps PR B (the Pixi mount
 * lifecycle) unblocked while the atlases are still being prepared.
 */

import { Assets, type Spritesheet } from 'pixi.js'

export interface WorldAssets {
  /** True once every atlas listed in MANIFEST has loaded successfully. */
  ready: boolean
  /** Foundation terrain spritesheet (Cainos Top Down – Basic, flat subset). */
  terrain: Spritesheet | null
  /**
   * Overlay sprites that sit *on top* of the terrain tiles — trees, bushes,
   * grass tufts, rocks, etc. Variable-size frames, generally larger than a
   * tile. Renderer anchors at bottom-center so the sprite "plants" naturally
   * on its source tile.
   */
  props: Spritesheet | null
  /** Birds + ambient creatures. */
  critters: Spritesheet | null
  /** Weather + particle textures. */
  effects: Spritesheet | null
}

/**
 * Atlas manifest. Each entry is a Pixi `Assets.load`-able URL — typically a
 * `.json` spritesheet definition that references its sibling `.png`.
 *
 * `null` means "atlas not yet authored" — the loader skips that slot and
 * leaves the corresponding `WorldAssets` field null. Fill these in as the
 * real packs arrive.
 *
 * `terrain.json` is built by `scripts/build_world_atlas.py` from the Cainos
 * "Pixel Art Top Down – Basic" source pack. Re-run that script (with
 * `--cainos-dir` pointing at the unzipped pack) any time the EXTRACTS list
 * changes; commit the regenerated PNG + JSON together.
 */
const MANIFEST: Record<keyof Omit<WorldAssets, 'ready'>, string | null> = {
  terrain: '/world/terrain.json',
  /**
   * Plants (trees / bushes / tufts) and rocks composed from the Cainos pack
   * by the same `scripts/build_world_atlas.py --atlas props` invocation that
   * produces terrain. Frame names follow the convention `<kind>-NN`
   * (`tree-00`, `bush-03`, `tuft-07`, `rock-02`) — the procedural generator
   * filters by prefix to decide what category each frame belongs to.
   */
  props: '/world/props.json',
  critters: null,  // → '/world/critters.json' once bird + critter pack is packed
  effects: null,   // → '/world/effects.json' once weather + VFX pack is packed
}

let _loadPromise: Promise<WorldAssets> | null = null

/**
 * Returns a memoised promise that resolves to the loaded world assets.
 *
 * Failures on individual atlases are tolerated — the loader resolves with
 * `ready: false` and that specific field set to null, rather than rejecting.
 * This keeps the simulation visible (as placeholder graphics) even if one
 * atlas is missing or corrupt.
 */
export function loadWorldAssets(): Promise<WorldAssets> {
  if (_loadPromise) return _loadPromise

  _loadPromise = (async () => {
    const result: WorldAssets = {
      ready: false,
      terrain: null,
      props: null,
      critters: null,
      effects: null,
    }

    const entries = Object.entries(MANIFEST) as Array<[keyof typeof MANIFEST, string | null]>
    const pending = entries.filter(([, url]) => url !== null) as Array<[keyof typeof MANIFEST, string]>

    if (pending.length === 0) {
      // No atlases authored yet — return the stub so PR B can render
      // placeholder rectangles via Pixi.Graphics without waiting on art.
      return result
    }

    const loaded = await Promise.allSettled(
      pending.map(async ([key, url]) => {
        const sheet = (await Assets.load(url)) as Spritesheet
        return [key, sheet] as const
      })
    )

    let allOk = true
    for (const settled of loaded) {
      if (settled.status === 'fulfilled') {
        const [key, sheet] = settled.value
        result[key] = sheet
      } else {
        allOk = false
        // Console-warn rather than throw — a missing atlas degrades the visual
        // quality but should not break the listener page.
        console.warn('[world/assets] atlas failed to load:', settled.reason)
      }
    }
    result.ready = allOk
    return result
  })()

  return _loadPromise
}

/** Test/HMR helper: clear the memoised promise so the next call re-loads. */
export function _resetWorldAssetsForTest(): void {
  _loadPromise = null
}
