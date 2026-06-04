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

/**
 * One overlay sprite to draw on top of the terrain grid. Overlays are
 * irregularly sized (tree ~150x215, tuft ~12x10), so they're placed in pixel
 * coordinates rather than tile coordinates. The renderer anchors the sprite
 * at bottom-center, so (x, y) is the *foot* of the sprite — a tree planted at
 * y=200 has its trunk at y=200 and its canopy extending upward.
 */
export interface Overlay {
  /** Frame name in the props atlas (e.g. 'tree-00', 'rock-02'). */
  frame: string
  /** Pixel x of the sprite's bottom-center anchor. */
  x: number
  /** Pixel y of the sprite's bottom-center anchor. */
  y: number
}

export interface TileMap {
  cols: number
  rows: number
  /** Row-major. tiles[row * cols + col]. */
  tiles: Tile[]
  /**
   * Overlay sprites in render order (sorted by y ascending so closer-to-front
   * items naturally paint over things behind them).
   */
  overlays: Overlay[]
  /** Profile this map was generated for — handy for debugging. */
  profile: BiomeProfile
  /** Seed actually used. */
  seed: number
}

export interface GenerateMapOptions {
  cols: number
  rows: number
  /** Tile size in pixels — needed to convert tile coords to pixel coords for overlays. */
  tileSize: number
  /** Frame names available in the terrain atlas (e.g. all keys of Spritesheet.textures). */
  availableFrames: readonly string[]
  /**
   * Frame names available in the props atlas. Empty array → skip overlay
   * generation entirely (atlas not loaded, no overlays to place). The
   * generator groups these by name prefix (`tree-`, `bush-`, `tuft-`, `rock-`)
   * to decide which biome chance applies to each.
   */
  propFrames: readonly string[]
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
  const { cols, rows, tileSize, availableFrames, propFrames } = options

  const rng = mulberry32(seed)

  // ── Tiles ───────────────────────────────────────────────────────────────

  const prefix = TERRAIN_PREFIX[profile.primaryTerrain]
  const matching = availableFrames.filter(f => f.startsWith(prefix))
  let pool: readonly string[]
  if (matching.length > 0) {
    pool = matching
  } else if (profile.isIndoor) {
    // Indoor + no matching terrain → empty tiles AND empty overlays
    // (indoor scenes show the dark bg fill and nothing else).
    return { cols, rows, tiles: [], overlays: [], profile, seed }
  } else {
    pool = availableFrames
  }

  if (pool.length === 0) {
    return { cols, rows, tiles: [], overlays: [], profile, seed }
  }

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

  // ── Overlays ────────────────────────────────────────────────────────────
  //
  // Skip entirely for indoor biomes (no overlays in caves/dungeons) or when
  // the props atlas hasn't loaded any frames.
  const overlays: Overlay[] = []
  if (!profile.isIndoor && propFrames.length > 0) {
    _generateOverlays(rng, profile, { cols, rows, tileSize }, propFrames, overlays)
    // Sort by y ascending so the renderer can paint in order: things lower
    // on screen (larger y) paint over things higher up — natural depth feel.
    overlays.sort((a, b) => a.y - b.y)
  }

  return { cols, rows, tiles, overlays, profile, seed }
}

// ── Overlay placement ────────────────────────────────────────────────────

/**
 * Trees are recognised by frame name and treated specially — they're large
 * sprites and would visually crowd the scene if placed naively. We enforce
 * a minimum tile spacing between trees by tracking claimed cells.
 */
const TREE_PREFIX = 'tree-'
const BUSH_PREFIX = 'bush-'
const TUFT_PREFIX = 'tuft-'
const ROCK_PREFIX = 'rock-'

/** Minimum number of tile cells (Chebyshev distance) between any two trees. */
const TREE_MIN_SPACING = 3

function _generateOverlays(
  rng: () => number,
  profile: BiomeProfile,
  geom: { cols: number; rows: number; tileSize: number },
  propFrames: readonly string[],
  out: Overlay[],
): void {
  const { cols, rows, tileSize } = geom

  const trees = propFrames.filter(f => f.startsWith(TREE_PREFIX))
  const bushes = propFrames.filter(f => f.startsWith(BUSH_PREFIX))
  const tufts = propFrames.filter(f => f.startsWith(TUFT_PREFIX))
  const rocks = propFrames.filter(f => f.startsWith(ROCK_PREFIX))

  // Tile cells already claimed by a tree (for min-spacing). Storing
  // `row * cols + col` as a number for cheap Set membership.
  const treeCells = new Set<number>()

  // Walk tiles in row-major order. Each tile rolls separately against each
  // overlay-kind chance. A single tile can produce at most one overlay
  // (priority: tree > bush > tuft > rock) so we don't pile sprites on top of
  // each other in the same square — sprites already overflow naturally since
  // they're larger than 32x32.
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      // Pixel position: tile-center for x, tile-bottom for y, with a small
      // random jitter so the scatter doesn't look gridded.
      const baseX = c * tileSize + tileSize / 2
      const baseY = (r + 1) * tileSize
      const jitterX = (rng() - 0.5) * tileSize * 0.7
      const jitterY = (rng() - 0.5) * tileSize * 0.4

      // Trees first (largest, claim cells)
      if (trees.length > 0 && rng() < profile.treeChance) {
        if (_treeSpacingOk(c, r, cols, treeCells)) {
          out.push({
            frame: trees[Math.floor(rng() * trees.length)],
            x: baseX + jitterX,
            y: baseY + jitterY,
          })
          _claimTreeCells(c, r, cols, rows, treeCells)
          continue
        }
        // Tree failed spacing — fall through to smaller overlays so the tile
        // isn't necessarily empty.
      }

      if (bushes.length > 0 && rng() < profile.bushChance) {
        out.push({
          frame: bushes[Math.floor(rng() * bushes.length)],
          x: baseX + jitterX,
          y: baseY + jitterY,
        })
        continue
      }

      if (tufts.length > 0 && rng() < profile.tuftChance) {
        out.push({
          frame: tufts[Math.floor(rng() * tufts.length)],
          x: baseX + jitterX,
          y: baseY + jitterY,
        })
        continue
      }

      if (rocks.length > 0 && rng() < profile.rockChance) {
        out.push({
          frame: rocks[Math.floor(rng() * rocks.length)],
          x: baseX + jitterX,
          y: baseY + jitterY,
        })
      }
    }
  }
}

function _treeSpacingOk(c: number, r: number, cols: number, claimed: Set<number>): boolean {
  for (let dr = -TREE_MIN_SPACING; dr <= TREE_MIN_SPACING; dr++) {
    for (let dc = -TREE_MIN_SPACING; dc <= TREE_MIN_SPACING; dc++) {
      if (claimed.has((r + dr) * cols + (c + dc))) return false
    }
  }
  return true
}

function _claimTreeCells(c: number, r: number, cols: number, rows: number, claimed: Set<number>): void {
  // Claim a 3x3 around the tree's tile — that's our exclusion zone for the
  // next tree's spacing check. Lighter than tracking the full canopy area;
  // the spacing check uses the same radius from the *attempt* side.
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const nr = r + dr
      const nc = c + dc
      if (nr < 0 || nc < 0 || nr >= rows || nc >= cols) continue
      claimed.add(nr * cols + nc)
    }
  }
}
