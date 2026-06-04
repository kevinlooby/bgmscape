# Third-party notices

bgmscape ships with art and sound assets created by third parties. This file
documents every shipped pack — its creator, license terms, and source URL —
so attribution and license obligations are visible at a glance.

The repository is structured so that **compiled atlases** under
`frontend/public/world/` are checked in, but **raw source PNGs** from packs
that disallow redistribution are not. Anyone building from source who needs
the raw art should follow the download links below.

Audio assets live elsewhere (per-game soundtracks are gitignored; ambient
library sources are listed in the project memory). This file focuses on the
**pixel-art world simulation** introduced by the foundation PR.

---

## Pixel-art assets — planned

The world simulation is being built up across several PRs. This list is the
*plan*; entries marked **(not yet shipped)** are listed for tracking but
have not yet been packed into atlases or committed to `frontend/public/world/`.

### Foundation terrain

#### Cainos — Pixel Art Top Down – Basic
- **Creator**: Cainos
- **Source**: <https://cainos.itch.io/pixel-art-top-down-basic>
- **Pack version shipped**: v1.2.3
- **License**: Pay-what-you-want via itch.io. Commercial use permitted.
  **Redistribution of the raw asset files is not permitted** — bundled
  spritesheets under `frontend/public/world/` are derivative compositions
  used inside the app, not redistribution of the original pack.
- **Used for**: foundation terrain tiles. Initial revision ships only 5
  grass variants (plain grass and decorated grass with small leaves /
  flowers / tufts) composed into `frontend/public/world/terrain.png` +
  `terrain.json`. Stone paths and stone-floor tiles are deferred to a
  follow-up that adds proper autotile rendering and supplemental packs
  for solid stone floors. See `scripts/build_world_atlas.py` for the
  exact source-coordinate map (`EXTRACTS`).
- **Frames shipped**: `grass-00` … `grass-04`
- **Status**: shipped (terrain atlas only — plants/props/path deferred)

#### Kenney — Tiny Dungeon
- **Creator**: Kenney
- **Source**: <https://kenney.nl/assets/tiny-dungeon>
- **License**: CC0 1.0 Universal (public domain).
- **Used for**: interior cave/dungeon tiles for `isIndoor` biomes (Fire/Spirit/
  Shadow/Water Temple, Inside Ganon's Castle, Hazy Maze Cave).
- **Status**: (not yet shipped)

### Biome backdrops + tilesets

#### Eder Muniz — Free Pixel Art Forest
- **Creator**: Eder Muniz (edermunizz)
- **Source**: <https://edermunizz.itch.io/free-pixel-art-forest>
- **License**: Commercial use permitted with credit. No NFT / crypto use.
- **Used for**: parallax background for `forest` biomes.
- **Status**: (not yet shipped)

#### Eder Muniz — Free Pixel Art Winter Forest
- **Creator**: Eder Muniz (edermunizz)
- **Source**: <https://edermunizz.itch.io/free-pixel-art-winter-forest>
- **License**: Commercial use permitted with credit. No NFT / crypto use.
- **Used for**: parallax background for `winter` + `snow` biomes.
- **Status**: (not yet shipped)

#### Elthen — 2D Pixel Art Volcanic / Lava Tileset
- **Creator**: Elthen
- **Source**: <https://elthen.itch.io/2d-pixel-art-volcanic-lava-tileset>
- **License**: Commercial use permitted; no crypto / NFT use; no LLM training.
- **Used for**: terrain for `volcano` + `lava` biomes (Death Mountain Crater,
  Lethal Lava Land).
- **Status**: (not yet shipped)

#### Ansimuz — Magic Cliffs Environment
- **Creator**: Luis Zuno (ansimuz)
- **Source**: <https://ansimuz.itch.io/magic-cliffs-environment>
- **License**: CC0 1.0 Universal (confirmed on ansimuz's CC0 itch list).
- **Used for**: parallax cliffside backdrop for `mountain` biomes.
- **Status**: (not yet shipped)

#### Ansimuz — Sunny Land
- **Creator**: Luis Zuno (ansimuz)
- **Source**: <https://ansimuz.itch.io/sunny-land-pixel-game-art>
- **License**: Permissive — "use them any way you want." We credit anyway.
- **Used for**: beach + ocean parallax + props (Zora's Domain, Lake Hylia).
- **Status**: (not yet shipped)

#### Ventilatore — The Fantasy Tileset – Desert Oasis
- **Creator**: Ventilatore
- **Source**: <https://ventilatore.itch.io/the-fantasy-tileset-desert-oasis>
- **License**: **Verify on pack page before shipping.** Currently undetermined
  from the itch summary — re-confirm by reading the in-pack `LICENSE.txt` or
  the itch page's "More information" panel before bundling.
- **Used for**: terrain + foliage for `desert` biomes (Gerudo Desert,
  Shifting Sand Land).
- **Status**: (not yet shipped — blocked on license verification)

#### Vryell — Tiny Adventure Pack Plus
- **Creator**: Vryell
- **Source**: <https://vryell.itch.io/tiny-adventure-pack-plus>
- **License**: Commercial use permitted; **redistribution of source PNGs not
  permitted.**
- **Used for**: trees, bushes, fences, signposts, rocks across multiple
  biomes.
- **Status**: (not yet shipped)

#### PixelFrog — Pixel Adventure 1
- **Creator**: Pixel Frog (pixelfrog-assets)
- **Source**: <https://pixelfrog-assets.itch.io/pixel-adventure-1>
- **License**: CC0.
- **Used for**: decorative props (mushrooms, chests, flags).
- **Status**: (not yet shipped)

### Animals + ambient critters

#### OpenGameArt — [LPC] Birds
- **Creator**: bagzie, et al. (Liberated Pixel Cup contributors)
- **Source**: <https://opengameart.org/content/lpc-birds>
- **License**: CC-BY-SA 3.0 / GPLv3 (dual).
- **Used for**: bird sprites in scenes where the `birds` ambient category is
  active. Attribution required; the share-alike clause means our shipped
  composite of LPC content is dual-licensed under CC-BY-SA / GPL.
- **Status**: (not yet shipped)

#### OpenGameArt — Animated Birds (32×32)
- **Creator**: Calciumtrice
- **Source**: <https://opengameart.org/content/animated-birds-32x32>
- **License**: CC0.
- **Used for**: simpler flock sprites for silhouette use.
- **Status**: (not yet shipped)

#### OpenGameArt — Animated top-down creatures
- **Creator**: Curt
- **Source**: <https://opengameart.org/content/animated-top-down-creatures>
- **License**: CC0.
- **Used for**: frogs, rats, small mammals.
- **Status**: (not yet shipped)

#### Elthen — squirrel / cat / fox sprites
- **Creator**: Elthen
- **Source**: <https://elthen.itch.io/>
- **License**: Commercial use permitted; no crypto / NFT use; no LLM training.
- **Used for**: forest critter variety.
- **Status**: (not yet shipped)

### Weather + effects

#### CodeManu — Free Pixel Effects Pack
- **Creator**: CodeManu
- **Source**: <https://codemanu.itch.io/pixelart-effect-pack>
- **License**: Public domain.
- **Used for**: VFX sprites (sparkles, magic, hits).
- **Status**: (not yet shipped)

#### Free Game Assets — Weather Effects Pack
- **Creator**: Free Game Assets
- **Source**: <https://free-game-assets.itch.io/weather-effects-assets-pack-pixel-art>
- **License**: Commercial use permitted (paid pack, ~$0.60).
- **Used for**: rain, downpour, snow, lightning, water flow.
- **Status**: (not yet shipped)

### Settlements / NPCs (optional — defer purchase decision)

#### Cainos — Pixel Art Top Down – Village (paid expansion)
- **Creator**: Cainos
- **Source**: <https://cainos.itch.io/pixel-art-top-down-village>
- **License**: Same as Cainos Top Down – Basic. **$39.99 paid pack.**
- **Used for**: settlement art that matches the foundation style. Optional —
  decision deferred until the urban biome reads poorly with placeholders.
- **Status**: (not yet shipped — purchase decision pending)

#### PixelFrog — Tiny Swords
- **Creator**: Pixel Frog
- **Source**: <https://pixelfrog-assets.itch.io/tiny-swords>
- **License**: Free, commercial use permitted, **no redistribution of source PNGs.**
- **Used for**: peasant / NPC silhouettes for settlement biomes.
- **Status**: (not yet shipped)

---

## Rejected packs (documented for posterity)

These packs were considered but rejected on license grounds during the
plan-mode interview. **Do not ship these** without a license re-check:

- **LimeZu Modern Interiors free tier** — private projects only.
- **Sprout Lands free tier** — non-commercial only.
- **Mystic Woods free tier** — non-commercial / no redistribution.

---

## How to update this file

When you bundle a new pack into an atlas under `frontend/public/world/`:

1. Find the entry above and flip its **Status** to "shipped — frame ranges
   pulled from `<source-pack-name>` into `terrain.json` (or whichever atlas)".
2. If the pack isn't yet listed, add an entry following the same format.
3. If a pack is dropped after being shipped, update the status — don't delete
   the entry. License obligations attach to the deployed artifacts; the
   record needs to survive.
