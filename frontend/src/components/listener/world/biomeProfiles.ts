/**
 * Biome profile types + tag→profile rules + render hint tables.
 *
 * The renderer never reads tags directly — it reads a `BiomeProfile`. That
 * separation lets us evolve the tag vocabulary, the resolution algorithm,
 * and the renderer independently. The resolver
 * (`biomeResolver.resolveBiome`) is the bridge.
 *
 * Tag vocabulary mirrors `scripts/tag_nodes_ambient.py` — when you add a new
 * canonical tag there, add a TAG_RULES entry here.
 */

/**
 * Logical terrain palette. Today only `grass` has shipped frames; the rest
 * are reserved values that future atlas passes will satisfy. The renderer
 * falls back to grass when its requested kind has no available frames.
 */
export type TerrainKind = 'grass' | 'sand' | 'snow' | 'rock' | 'stone' | 'water'
export type TimeOfDay = 'day' | 'dawn' | 'dusk' | 'night'
export type Weather = 'clear' | 'rain' | 'snow' | 'fog'
export type ParticleKind = 'fireflies' | 'insects' | 'leaves' | 'embers'

export interface BiomeProfile {
  /** Base terrain to tile across the scene. */
  primaryTerrain: TerrainKind

  /**
   * 0..1. Bias toward "decorated" terrain frames vs the plain base. With our
   * grass set: 0.0 = all grass-00, 1.0 = uniformly random over the decorated
   * variants. Drives ground-tile texture only; overlay scatter uses the
   * per-kind chances below.
   */
  foliageDensity: number

  /**
   * Per-tile probability of placing a tree at this tile, 0..1. Trees are the
   * largest overlays — the generator enforces a minimum spacing so a forest
   * scene of ~325 tiles ends up with ~6-10 trees rather than dozens.
   */
  treeChance: number

  /** Per-tile probability of placing a bush. Smaller than trees, no spacing rule. */
  bushChance: number

  /** Per-tile probability of placing a grass tuft. Smallest overlay; fine to clump. */
  tuftChance: number

  /** Per-tile probability of placing a rock cluster. Works in any outdoor biome. */
  rockChance: number

  /** Drives the global tint overlay (see TIME_TINTS). */
  timeOfDay: TimeOfDay

  /** Drives the weather tint / particle hints (see WEATHER_TINTS). */
  weather: Weather

  /**
   * Suppresses sky / weather and swaps to a darker base palette. Set by
   * `cave`, `dungeon`, `indoor` tags.
   */
  isIndoor: boolean

  /**
   * Hint for settlement biomes — adds NPC silhouettes and building props
   * once those packs land. Today: just a flag, no visual difference yet.
   */
  isUrban: boolean

  /**
   * Particle kinds to emit, driven by which ambient categories are currently
   * playing. Computed from `activeAmbient` in `resolveBiome`, not from tags.
   */
  ambientParticles: ParticleKind[]
}

export const DEFAULT_PROFILE: BiomeProfile = {
  primaryTerrain: 'grass',
  foliageDensity: 0.15,
  treeChance: 0,
  bushChance: 0.02,
  tuftChance: 0.05,
  rockChance: 0.02,
  timeOfDay: 'day',
  weather: 'clear',
  isIndoor: false,
  isUrban: false,
  ambientParticles: [],
}

/**
 * Tag → partial profile override. `resolveBiome` walks this array in order;
 * later entries win for overlapping fields. The order is "general to
 * specific" so a tag like `night` can override the `forest` entry's
 * `timeOfDay` even though both apply to a "night forest" node.
 *
 * Adding a new tag here gives the renderer something to do with it — no
 * other code touched. Adding a new BiomeProfile *field* requires updating
 * the renderer (pixiWorld) to consume it.
 */
export const TAG_RULES: ReadonlyArray<readonly [string, Partial<BiomeProfile>]> = [
  // Habitat — sets primaryTerrain + baseline foliage densities. The four
  // per-kind chances are calibrated against a 25x13 = 325-tile scene so
  // forest ends up dense (with min-spacing capping trees), field reads as
  // grassland with some shrubs, mountain/desert show mostly rocks, etc.
  ['forest',    { primaryTerrain: 'grass', foliageDensity: 0.5,
                  treeChance: 0.03, bushChance: 0.10, tuftChance: 0.15, rockChance: 0.02 }],
  ['field',     { primaryTerrain: 'grass', foliageDensity: 0.2,
                  treeChance: 0,    bushChance: 0.04, tuftChance: 0.10, rockChance: 0.02 }],
  ['mountain',  { primaryTerrain: 'rock',  foliageDensity: 0.08,
                  treeChance: 0,    bushChance: 0.02, tuftChance: 0.03, rockChance: 0.15 }],
  ['desert',    { primaryTerrain: 'sand',  foliageDensity: 0.03,
                  treeChance: 0,    bushChance: 0,    tuftChance: 0.01, rockChance: 0.10 }],
  ['snow',      { primaryTerrain: 'snow',  foliageDensity: 0.08,
                  treeChance: 0,    bushChance: 0,    tuftChance: 0.02, rockChance: 0.05 }],
  ['winter',    { primaryTerrain: 'snow',  foliageDensity: 0.05, weather: 'snow',
                  treeChance: 0,    bushChance: 0,    tuftChance: 0.02, rockChance: 0.04 }],
  ['river',     { primaryTerrain: 'grass', foliageDensity: 0.3,
                  treeChance: 0.02, bushChance: 0.06, tuftChance: 0.12, rockChance: 0.04 }],
  ['ocean',     { primaryTerrain: 'sand',  foliageDensity: 0.05,
                  treeChance: 0,    bushChance: 0,    tuftChance: 0.02, rockChance: 0.08 }],
  ['urban',     { isUrban: true, foliageDensity: 0.08,
                  treeChance: 0,    bushChance: 0.03, tuftChance: 0.03, rockChance: 0.03 }],

  // Indoor flags — these suppress sky, weather, and ALL overlays. Indoor
  // biomes render only the bg fill (and tiles, if their TerrainKind has
  // matching atlas frames — currently it doesn't, hence dark void).
  ['cave',      { primaryTerrain: 'rock',  isIndoor: true, foliageDensity: 0,
                  treeChance: 0, bushChance: 0, tuftChance: 0, rockChance: 0 }],
  ['dungeon',   { primaryTerrain: 'stone', isIndoor: true, foliageDensity: 0,
                  treeChance: 0, bushChance: 0, tuftChance: 0, rockChance: 0 }],
  ['indoor',    { isIndoor: true, foliageDensity: 0,
                  treeChance: 0, bushChance: 0, tuftChance: 0, rockChance: 0 }],

  // Weather
  ['rain',      { weather: 'rain' }],

  // Time of day — last so it always wins over the habitat default
  ['dawn',      { timeOfDay: 'dawn' }],
  ['day',       { timeOfDay: 'day' }],
  ['dusk',      { timeOfDay: 'dusk' }],
  ['night',     { timeOfDay: 'night' }],
]

/**
 * Active ambient category → particle suggestion. Used only by resolveBiome.
 * The renderer treats these as hints (no particle system shipped yet — they
 * surface in the dev-console snapshot log so the data flow is visible).
 */
export const AMBIENT_PARTICLE_HINTS: Readonly<Record<string, ParticleKind>> = {
  insects: 'insects',
  // birds/water/wind/weather/frogs/settlement/cavern don't have visual
  // particle representations yet; add as the systems land.
}

/**
 * Time-of-day tint overlay. Color is rendered at alpha as a full-screen
 * quad on top of the terrain. We use plain "normal" blend mode rather than
 * multiply — predictable behavior across all base palettes, and visually
 * close to multiply at these alphas.
 */
export const TIME_TINTS: Readonly<Record<TimeOfDay, { color: number; alpha: number }>> = {
  day:   { color: 0xffffff, alpha: 0 },     // no tint
  dawn:  { color: 0xff9c64, alpha: 0.18 },  // soft warm orange
  dusk:  { color: 0x6a4a82, alpha: 0.22 },  // purple-orange
  night: { color: 0x0a1430, alpha: 0.60 },  // deep navy — leaves about 40% of tile color visible
}

/**
 * Weather tint overlay. Today only fog has a visible effect (white wash);
 * rain/snow are slated for proper particle systems and use a small tint
 * placeholder so the resolver doesn't lose them in transit.
 */
export const WEATHER_TINTS: Readonly<Record<Weather, { color: number; alpha: number }>> = {
  clear: { color: 0x000000, alpha: 0 },
  rain:  { color: 0x86a0c0, alpha: 0.12 },
  snow:  { color: 0xffffff, alpha: 0.10 },
  fog:   { color: 0xffffff, alpha: 0.25 },
}

/** Base background colors — drawn as a full-screen rect under the terrain. */
export const INDOOR_BG = 0x12121a
export const OUTDOOR_BG = 0x0a1520
