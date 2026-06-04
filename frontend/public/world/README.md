# Pixel-art world assets

This folder holds the sprite atlases that feed the listener-page world simulation
(see `frontend/src/components/listener/world/`).

## File layout (planned)

```
public/world/
  terrain.png        # foundation tiles (Cainos Top Down – Basic, flat-terrain subset)
  terrain.json       # texture atlas frames for terrain.png
  critters.png       # birds + ambient creatures
  critters.json
  effects.png        # weather, particle textures, sparkles
  effects.json
  backdrops/
    forest.png       # Eder Muniz Free Pixel Art Forest (parallax bg)
    forest-winter.png
    cliffs.png       # Ansimuz Magic Cliffs Environment
```

## Where atlases come from

Atlases are built from upstream pack PNGs with TexturePacker (free) or `spritesmith`.
Source PNGs are **not** checked in — only the compiled atlases. See
`THIRD_PARTY_NOTICES.md` at the repo root for the list of packs, their licenses,
and download URLs.

## Why atlases and not loose PNGs

A single texture atlas means one HTTP request and one GPU texture upload per
category, instead of hundreds. Critical for the static-mode deploy.

## Adding new biome assets

1. Download the pack from itch / OpenGameArt / Kenney to `data/world_sources/`
   (gitignored — keep raw PNGs out of the repo).
2. Add an entry to `THIRD_PARTY_NOTICES.md` if it's a new pack.
3. Compose the relevant frames into the appropriate atlas with TexturePacker.
4. Copy the resulting `.png` + `.json` here.
5. Reference the new frames in `frontend/src/components/listener/world/biomeProfiles.ts`.
