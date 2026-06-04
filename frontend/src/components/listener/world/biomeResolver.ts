/**
 * Pure function bridge: bgmscape state → renderer-friendly BiomeProfile.
 *
 * Takes a node's `ambient_tags` plus the live list of ambient categories
 * the audio engine is currently playing, and produces a `BiomeProfile` the
 * renderer can consume without any knowledge of bgmscape's tag vocabulary.
 *
 * Why pure: testable in isolation (no Pixi, no React, no audio), and the
 * renderer never has to re-derive overlapping tag combos. Calling code can
 * memoise on (tags, activeAmbient) pairs.
 */

import {
  AMBIENT_PARTICLE_HINTS,
  DEFAULT_PROFILE,
  TAG_RULES,
  type BiomeProfile,
  type ParticleKind,
} from './biomeProfiles'

/**
 * Resolve a BiomeProfile by cascading TAG_RULES — last matching tag wins
 * per field. Active ambient categories add particle hints on top; they
 * never override tag-driven fields.
 *
 * Examples:
 *   resolveBiome(['forest', 'night'], [])
 *     → forest base + night timeOfDay
 *
 *   resolveBiome(['cave', 'night'], ['water'])
 *     → indoor cave, night tint, water particle hint (when shipped)
 */
export function resolveBiome(
  tags: readonly string[],
  activeAmbientCategories: readonly string[],
): BiomeProfile {
  let profile: BiomeProfile = { ...DEFAULT_PROFILE }

  if (tags.length > 0) {
    const tagSet = new Set(tags)
    for (const [tag, override] of TAG_RULES) {
      if (tagSet.has(tag)) profile = { ...profile, ...override }
    }
  }

  const particles: ParticleKind[] = []
  for (const cat of activeAmbientCategories) {
    const hint = AMBIENT_PARTICLE_HINTS[cat]
    if (hint && !particles.includes(hint)) particles.push(hint)
  }
  profile.ambientParticles = particles

  return profile
}
