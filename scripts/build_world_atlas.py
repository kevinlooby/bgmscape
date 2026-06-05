"""
build_world_atlas.py — Compose derivative pixel-art atlases for the listener
world simulation from the Cainos "Pixel Art Top Down - Basic" source pack.

The Cainos license permits commercial use but **not redistribution of the raw
asset files**. We respect that by reading the source PNGs only at build time
and emitting derivative compositions: each output PNG is a re-packed atlas
of hand-picked sprite regions, accompanied by a Pixi.js v8 spritesheet JSON
naming each frame.

Only the derivative atlases (and this script) live in the repo. The raw
Cainos PNGs stay on the user's machine — point `--cainos-dir` at the
unzipped pack's `Texture/` folder when running.

Two atlases are produced:

  - `terrain.png` + `terrain.json` — uniform 32x32 ground tiles (grass,
    later also stone/sand). Single-row layout, easy to scan visually.
  - `props.png`   + `props.json`   — irregular-size overlay sprites
    (trees, bushes, grass tufts, rocks, …). Shelf-packed because sprite
    sizes vary wildly (tree ~150x215, tuft ~12x10).

Usage (from the bgmscape/ root):

    python scripts/build_world_atlas.py \\
        --cainos-dir "C:/Users/kevin/Downloads/Pixel Art Top Down - Basic v1.2.3/Texture"

Options:
    --cainos-dir PATH    Source pack Texture/ folder  [required]
    --out-dir PATH       Where to write atlases  [default: frontend/public/world]
    --atlas {terrain,props,all}  Which atlas(es) to build  [default: all]

Re-running the script with the same input is fully deterministic — same
EXTRACTS in, same atlas bytes out. The EXTRACTS list below is the canonical
record of which Cainos sprites bgmscape ships.

If the Cainos pack version changes and frame positions shift, update the
extracts in `TERRAIN_EXTRACTS` / `PROPS_EXTRACTS`, re-run the script, and
commit the regenerated PNG + JSON together.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from dataclasses import dataclass

from PIL import Image


# Standard tile size for ground-terrain frames. Props ignore this — they
# carry their own width/height.
TILE = 32

# Atlas-canvas width cap. Cainos source files are 512px wide; matching keeps
# the output PNG dimensions sane and the shelf packer's row breaks predictable.
MAX_ATLAS_W = 512


@dataclass(frozen=True)
class Extract:
    """One sprite region to pull from a Cainos source PNG into an atlas.

    Coordinates and sizes are in source-image pixels. `tile()` below builds
    an Extract with the old 32x32 grid semantics so terrain entries stay
    terse.
    """
    source: str    # filename within --cainos-dir (e.g. "TX Tileset Grass.png")
    src_x: int     # source pixel x
    src_y: int     # source pixel y
    width: int     # sprite width in source pixels
    height: int    # sprite height in source pixels
    name: str      # frame name used by the renderer


def tile(source: str, col: int, row: int, name: str) -> Extract:
    """Convenience constructor for a 32x32 tile pulled from a (col, row) grid."""
    return Extract(source, col * TILE, row * TILE, TILE, TILE, name)


# ── Terrain (uniform 32x32 grid tiles) ────────────────────────────────────

# Grass tileset (256x256, 8x8 grid): top half (rows 0-3) is grass with small
# scattered debris; bottom half (rows 4-7) is the autotile stone-path cluster.
# We only mine the top half here — autotile-aware path rendering is a future
# concern. Picking grass variants that range from completely plain to lightly
# decorated keeps a procedural sprinkle from looking littered.
TERRAIN_EXTRACTS: list[Extract] = [
    tile('TX Tileset Grass.png', 0, 0, 'grass-00'),  # plain
    tile('TX Tileset Grass.png', 1, 0, 'grass-01'),  # plain w/ tiny mark
    tile('TX Tileset Grass.png', 2, 0, 'grass-02'),  # plain w/ tiny mark
    tile('TX Tileset Grass.png', 5, 1, 'grass-03'),  # small flower cluster
    tile('TX Tileset Grass.png', 6, 2, 'grass-04'),  # grass tufts
    # New in this pass — five additional decoration variants from the top
    # half of the tileset. Add more visual variety to the procedural sprinkle.
    tile('TX Tileset Grass.png', 4, 0, 'grass-05'),
    tile('TX Tileset Grass.png', 6, 0, 'grass-06'),
    tile('TX Tileset Grass.png', 3, 1, 'grass-07'),
    tile('TX Tileset Grass.png', 4, 2, 'grass-08'),
    tile('TX Tileset Grass.png', 7, 3, 'grass-09'),
]


# ── Props (irregular-size overlay sprites) ────────────────────────────────

# Plants from TX Plant.png + rocks from TX Props.png. Pixel coords were
# determined by visual inspection (PIL getbbox over rough crops, then
# spot-confirmed via 4x preview).
#
# Frame names follow the prefix convention used by the procedural generator:
#   tree-NN  — large overlay, generator enforces minimum spacing
#   bush-NN  — medium overlay, no spacing rule
#   tuft-NN  — tiny grass tuft, no spacing rule
#   rock-NN  — small or large rock sprite, no spacing rule
#
# Trees include their trunks — anchor at bottom-center in the renderer so
# the trunk plants on the ground.
PROPS_EXTRACTS: list[Extract] = [
    # Trees (the three full canopy+trunk silhouettes from TX Plant.png)
    Extract('TX Plant.png',  24,  14, 136, 206, 'tree-00'),
    Extract('TX Plant.png', 160,  17, 160, 214, 'tree-01'),
    Extract('TX Plant.png', 320,  31,  66, 194, 'tree-02'),

    # Bushes (six variants, smallest to largest)
    Extract('TX Plant.png',  38, 198,  22,  19, 'bush-00'),
    Extract('TX Plant.png',  98, 195,  27,  25, 'bush-01'),
    Extract('TX Plant.png', 156, 190,  24,  31, 'bush-02'),
    Extract('TX Plant.png', 216, 185,  44,  42, 'bush-03'),
    Extract('TX Plant.png', 260, 186,  61,  44, 'bush-04'),
    Extract('TX Plant.png', 346, 190,  40,  35, 'bush-05'),

    # Grass tufts (small, scattered freely as background detail)
    Extract('TX Plant.png',   8, 394,  17,   9, 'tuft-00'),
    Extract('TX Plant.png',  41, 394,  16,  10, 'tuft-01'),
    Extract('TX Plant.png',  73, 394,  15,  10, 'tuft-02'),
    Extract('TX Plant.png', 102, 394,  15,  11, 'tuft-03'),
    Extract('TX Plant.png',   9, 426,  12,  10, 'tuft-04'),
    Extract('TX Plant.png',  43, 427,  13,   9, 'tuft-05'),
    Extract('TX Plant.png',  74, 427,  13,   9, 'tuft-06'),
    Extract('TX Plant.png', 104, 428,  14,   7, 'tuft-07'),

    # Rocks. Some "small" entries are actually small clusters (a bigger and
    # a smaller pebble together) — that's fine, reads as a natural rock pile.
    Extract('TX Props.png',   3, 430,  57,  40, 'rock-00'),  # large flat
    Extract('TX Props.png',  10, 470,  40,  34, 'rock-01'),  # cluster
    Extract('TX Props.png',  50, 487,  40,  19, 'rock-02'),  # pair
    Extract('TX Props.png',  90, 487,  34,  19, 'rock-03'),  # small pair
    Extract('TX Props.png', 130, 482,  45,  27, 'rock-04'),  # mixed
    Extract('TX Props.png', 175, 482,  14,  27, 'rock-05'),  # single tall pebble
]


# ── Packing + emit ─────────────────────────────────────────────────────────

def _shelf_pack(extracts: list[Extract], max_w: int) -> tuple[int, int, list[tuple[Extract, int, int]]]:
    """Shelf-pack extracts into a max-width canvas. Returns (atlas_w, atlas_h,
    placements: [(extract, dst_x, dst_y)]).

    Algorithm: sort by height descending, lay out left-to-right in rows; when
    the next item would exceed max_w, start a new row at y = sum-of-previous-
    row-heights. Within a row the y is the row's top — items don't bottom-
    align, which means short items in a tall row have empty space below them.
    That's fine for our scale (atlases stay tiny).
    """
    by_h = sorted(extracts, key=lambda e: e.height, reverse=True)
    placements: list[tuple[Extract, int, int]] = []
    row_y = 0
    row_x = 0
    row_h = 0
    used_w = 0
    for ex in by_h:
        if row_x + ex.width > max_w and row_x > 0:
            # Wrap to a new row.
            row_y += row_h
            row_x = 0
            row_h = 0
        placements.append((ex, row_x, row_y))
        row_x += ex.width
        row_h = max(row_h, ex.height)
        used_w = max(used_w, row_x)
    atlas_h = row_y + row_h
    return used_w, atlas_h, placements


def _build_atlas(
    cainos_dir: str,
    out_dir: str,
    extracts: list[Extract],
    atlas_png: str,
    atlas_json: str,
    source_label: str,
    *,
    single_row: bool = False,
) -> None:
    """Build one atlas PNG + JSON from a list of Extracts.

    `single_row=True` packs everything into one horizontal row at fixed height
    (=max sprite height). Cleaner for the uniform-tile terrain atlas. Otherwise
    `_shelf_pack` is used.
    """
    # Cache each source image so we open it once even when extracting many
    # frames from the same file.
    sources: dict[str, Image.Image] = {}
    for ex in extracts:
        if ex.source not in sources:
            src_path = os.path.join(cainos_dir, ex.source)
            if not os.path.isfile(src_path):
                sys.exit(f"missing Cainos source file: {src_path}")
            sources[ex.source] = Image.open(src_path).convert('RGBA')

    if single_row:
        atlas_w = sum(ex.width for ex in extracts)
        atlas_h = max(ex.height for ex in extracts)
        placements = []
        x = 0
        for ex in extracts:
            placements.append((ex, x, 0))
            x += ex.width
    else:
        atlas_w, atlas_h, placements = _shelf_pack(extracts, MAX_ATLAS_W)

    atlas = Image.new('RGBA', (atlas_w, atlas_h), (0, 0, 0, 0))
    frames: dict[str, dict] = {}

    for ex, dst_x, dst_y in placements:
        src = sources[ex.source]
        if ex.src_x + ex.width > src.width or ex.src_y + ex.height > src.height:
            sys.exit(
                f"frame {ex.name}: ({ex.src_x}, {ex.src_y}, {ex.width}x{ex.height}) "
                f"out of bounds for {ex.source} ({src.width}x{src.height})"
            )
        crop = src.crop((ex.src_x, ex.src_y, ex.src_x + ex.width, ex.src_y + ex.height))
        atlas.paste(crop, (dst_x, dst_y))
        frames[ex.name] = {
            'frame': {'x': dst_x, 'y': dst_y, 'w': ex.width, 'h': ex.height},
            'rotated': False,
            'trimmed': False,
            'spriteSourceSize': {'x': 0, 'y': 0, 'w': ex.width, 'h': ex.height},
            'sourceSize': {'w': ex.width, 'h': ex.height},
        }

    os.makedirs(out_dir, exist_ok=True)
    atlas.save(os.path.join(out_dir, atlas_png), optimize=True)

    sheet = {
        'frames': frames,
        'meta': {
            'image': atlas_png,
            'format': 'RGBA8888',
            'size': {'w': atlas_w, 'h': atlas_h},
            'scale': '1',
            'source': source_label,
        },
    }
    with open(os.path.join(out_dir, atlas_json), 'w', encoding='utf-8') as f:
        json.dump(sheet, f, indent=2)

    print(f"wrote {os.path.join(out_dir, atlas_png)} ({atlas.size[0]}x{atlas.size[1]})")
    print(f"wrote {os.path.join(out_dir, atlas_json)} ({len(frames)} frames)")


SOURCE_LABEL = 'Cainos — Pixel Art Top Down - Basic v1.2.3 (derivative composition)'


def main() -> None:
    here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    default_out = os.path.join(here, 'frontend', 'public', 'world')

    parser = argparse.ArgumentParser(description=__doc__.split('\n')[1])
    parser.add_argument(
        '--cainos-dir',
        required=True,
        help='Path to the Cainos pack Texture/ folder',
    )
    parser.add_argument(
        '--out-dir',
        default=default_out,
        help=f'Where to write atlases (default: {default_out})',
    )
    parser.add_argument(
        '--atlas',
        choices=['terrain', 'props', 'all'],
        default='all',
        help='Which atlas to build (default: all)',
    )
    args = parser.parse_args()

    if not os.path.isdir(args.cainos_dir):
        sys.exit(f"--cainos-dir does not exist: {args.cainos_dir}")

    if args.atlas in ('terrain', 'all'):
        _build_atlas(
            args.cainos_dir, args.out_dir,
            TERRAIN_EXTRACTS, 'terrain.png', 'terrain.json',
            SOURCE_LABEL,
            single_row=True,
        )

    if args.atlas in ('props', 'all'):
        _build_atlas(
            args.cainos_dir, args.out_dir,
            PROPS_EXTRACTS, 'props.png', 'props.json',
            SOURCE_LABEL,
            single_row=False,
        )


if __name__ == '__main__':
    main()
