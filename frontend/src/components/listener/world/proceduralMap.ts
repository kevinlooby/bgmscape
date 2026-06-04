/**
 * Procedural map generation — deterministic tilemap output per (seed, profile).
 *
 * Same node ID always produces the same map: revisiting Hyrule Field shows
 * the same scattered flowers in the same spots. That stability matters more
 * than visual variety — the listener should feel like they're going BACK to
 * a known place, not to a fresh randomization.
 *
 * The generator is renderer-agnostic — it emits a plain JS `TileMap`. The
 * renderer (PixiWorld) consumes it and turns tiles into Sprites. Keeping
 * the data structure pure means we can swap renderers, write unit tests,
 * and snapshot-test maps without spinning up Pixi.
 */

import type { BiomeProfile, TerrainKind } from './biomeProfiles'

export interface Tile {
  /** Frame name to look up in the terrain atlas (e.g. 'grass-00'). */
  frame: string
}

export interface TileMap {
  cols: number
  rows: number
  /** Row-major. tiles[row * cols + col]. */
  tiles: Tile[]
  /** Profile this map was generated for — handy for debugging. */
  profile: BiomeProfile
  /** Seed actually used. */
  seed: number
}

export interface GenerateMapOptions {
  cols: number
  rows: number
  /** Frame names available in the atlas (e.g. all keys of Spritesheet.textures). */
  availableFrames: readonly string[]
}

/**
 * TerrainKind → frame-name prefix. The renderer's atlas frame keys follow
 * the convention `<kind>-NN` (e.g. `grass-00`, `sand-00`). Frames without a
 * matching prefix are ignored; if no frames match at all, we fall back to
 * whatever is available (typical case today since only grass-* shipped).
 */
const TERRAIN_PREFIX: Readonly<Record<TerrainKind, string>> = {
  grass: 'grass-',
  sand:  'sand-',
  snow:  'snow-',
  rock:  'rock-',
  stone: 'stone-',
  water: 'water-',
}

/**
 * Convert a node id (or any string) into a stable 32-bit seed via FNV-1a.
 * Same input → same seed across processes / sessions / machines.
 */
export function seedFromString(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/**
 * Mulberry32 — small seeded PRNG. Fast, deterministic, good enough quality
 * for tile placement. Returns numbers in [0, 1).
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

/**
 * Generate a tilemap for one location.
 *
 * Rules:
 * - Indoor biomes with no matching terrain frames return an empty tile
 *   array — the renderer falls through to the bg fill, which is dark for
 *   indoor. (Better to show a dim void than mismatched grass for a cave.)
 * - Outdoor biomes without matching frames fall back to *any* available
 *   frame, so a desert biome still renders as grass until sand-* lands.
 * - Within the chosen frame pool, `profile.foliageDensity` controls the
 *   ratio of plain (index 0) to decorated (index 1+) frames. With density
 *   0.5 and 5 frames, roughly half the field carries small natural debris.
 */
export function generateMap(
  seed: number,
  profile: BiomeProfile,
  options: GenerateMapOptions,
): TileMap {
  const { cols, rows, availableFrames } = options

  const prefix = TERRAIN_PREFIX[profile.primaryTerrain]
  const matching = availableFrames.filter(f => f.startsWith(prefix))
  let pool: readonly string[]
  if (matching.length > 0) {
    pool = matching
  } else if (profile.isIndoor) {
    return { cols, rows, tiles: [], profile, seed }
  } else {
    pool = availableFrames
  }

  if (pool.length === 0) {
    return { cols, rows, tiles: [], profile, seed }
  }

  const rng = mulberry32(seed)
  const plain = pool[0]
  const decorated = pool.slice(1)
  const tiles: Tile[] = new Array(cols * rows)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const useDecorated = decorated.length > 0 && rng() < profile.foliageDensity
      const frame = useDecorated
        ? decorated[Math.floor(rng() * decorated.length)]
        : plain
      tiles[r * cols + c] = { frame }
    }
  }
  return { cols, rows, tiles, profile, seed }
}
