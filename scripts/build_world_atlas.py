"""
build_world_atlas.py — Compose a derivative pixel-art atlas for the listener
world simulation from the Cainos "Pixel Art Top Down - Basic" source pack.

The Cainos license permits commercial use but **not redistribution of the raw
asset files**. We respect that by reading the source PNGs only at build time
and emitting a derivative composition: a single PNG atlas that re-packs a
hand-picked subset of 32x32 tiles into a custom layout, plus a Pixi.js v8
spritesheet JSON that names each frame for the renderer.

Only the derivative atlas (and this script) live in the repo. The raw Cainos
PNGs stay on the user's machine — point `--cainos-dir` at the unzipped pack's
`Texture/` folder when running.

Usage (from the bgmscape/ root):

    python scripts/build_world_atlas.py \
        --cainos-dir "C:/Users/kevin/Downloads/Pixel Art Top Down - Basic v1.2.3/Texture"

Output:
    frontend/public/world/terrain.png
    frontend/public/world/terrain.json

Re-running the script with the same input is fully deterministic — same tile
coords in, same atlas bytes out. The EXTRACTS list below is the canonical
record of which Cainos tiles bgmscape ships.

If the Cainos pack version changes and tiles shift positions, update EXTRACTS,
re-run the script, and commit the regenerated atlas + JSON together.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from dataclasses import dataclass

from PIL import Image


TILE = 32  # Cainos top-down basic uses a 32x32 grid throughout.


@dataclass(frozen=True)
class Extract:
    """One frame to pull from a Cainos source PNG and into the atlas."""
    source: str       # filename within --cainos-dir (e.g. "TX Tileset Grass.png")
    src_col: int      # source tile column (in 32px units)
    src_row: int      # source tile row (in 32px units)
    name: str         # frame name used by the renderer


# Hand-picked tiles. Order = packing order in the atlas (left-to-right, single row).
#
# Grass tileset (256x256, 8x8 grid): top half (rows 0-3) is grass with small
# scattered debris; bottom half (rows 4-7) is a stone-path autotile cluster.
#
# This first revision ships ONLY grass tiles. The Cainos path system is an
# autotile blend (every path tile has visible grass on at least one edge as
# part of the transition) and the Stone Ground sheet is for composing large
# multi-tile slabs, not a tilable floor — neither can be dropped into a
# random tilemap and still look right. They come back in a follow-up PR that
# adds proper autotile rendering and pack supplements for solid stone floors.
EXTRACTS: list[Extract] = [
    # Five grass variants — first three plain (so a procedural sprinkle
    # mostly uses these), the last two with small natural debris (leaves,
    # flowers, grass tufts) so the field has occasional visual texture
    # without looking littered.
    Extract('TX Tileset Grass.png', 0, 0, 'grass-00'),
    Extract('TX Tileset Grass.png', 1, 0, 'grass-01'),
    Extract('TX Tileset Grass.png', 2, 0, 'grass-02'),
    Extract('TX Tileset Grass.png', 5, 1, 'grass-03'),
    Extract('TX Tileset Grass.png', 6, 2, 'grass-04'),
]

ATLAS_PNG = 'terrain.png'
ATLAS_JSON = 'terrain.json'


def build(cainos_dir: str, out_dir: str) -> None:
    if not os.path.isdir(cainos_dir):
        sys.exit(f"--cainos-dir does not exist: {cainos_dir}")
    os.makedirs(out_dir, exist_ok=True)

    # Cache each source image so we read once even if we extract several
    # frames from the same file.
    sources: dict[str, Image.Image] = {}

    # Single-row atlas — width = N tiles, height = 1 tile. Easy to inspect by
    # eye; trivial for the spritesheet JSON.
    atlas = Image.new('RGBA', (TILE * len(EXTRACTS), TILE), (0, 0, 0, 0))

    frames: dict[str, dict] = {}

    for i, ex in enumerate(EXTRACTS):
        src_path = os.path.join(cainos_dir, ex.source)
        if ex.source not in sources:
            if not os.path.isfile(src_path):
                sys.exit(f"missing Cainos source file: {src_path}")
            sources[ex.source] = Image.open(src_path).convert('RGBA')
        src = sources[ex.source]

        sx, sy = ex.src_col * TILE, ex.src_row * TILE
        if sx + TILE > src.width or sy + TILE > src.height:
            sys.exit(
                f"frame {ex.name}: requested ({ex.src_col}, {ex.src_row}) "
                f"is outside source {ex.source} ({src.width}x{src.height})"
            )

        crop = src.crop((sx, sy, sx + TILE, sy + TILE))
        atlas.paste(crop, (i * TILE, 0))

        # Pixi v8 spritesheet frame schema.
        frames[ex.name] = {
            'frame': {'x': i * TILE, 'y': 0, 'w': TILE, 'h': TILE},
            'rotated': False,
            'trimmed': False,
            'spriteSourceSize': {'x': 0, 'y': 0, 'w': TILE, 'h': TILE},
            'sourceSize': {'w': TILE, 'h': TILE},
        }

    atlas.save(os.path.join(out_dir, ATLAS_PNG), optimize=True)

    sheet = {
        'frames': frames,
        'meta': {
            'image': ATLAS_PNG,
            'format': 'RGBA8888',
            'size': {'w': atlas.width, 'h': atlas.height},
            'scale': '1',
            # Provenance string. Helps a future reader trace any frame back to
            # the upstream pack without grepping THIRD_PARTY_NOTICES.
            'source': 'Cainos — Pixel Art Top Down - Basic v1.2.3 (derivative composition)',
        },
    }
    with open(os.path.join(out_dir, ATLAS_JSON), 'w', encoding='utf-8') as f:
        json.dump(sheet, f, indent=2)

    print(f"wrote {os.path.join(out_dir, ATLAS_PNG)} ({atlas.size[0]}x{atlas.size[1]})")
    print(f"wrote {os.path.join(out_dir, ATLAS_JSON)} ({len(frames)} frames)")


def main() -> None:
    here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    default_out = os.path.join(here, 'frontend', 'public', 'world')

    parser = argparse.ArgumentParser(description=__doc__.split('\n')[1])
    parser.add_argument(
        '--cainos-dir',
        required=True,
        help='Path to the Cainos pack Texture/ folder (e.g. ".../Pixel Art Top Down - Basic v1.2.3/Texture")',
    )
    parser.add_argument(
        '--out-dir',
        default=default_out,
        help=f'Where to write the atlas (default: {default_out})',
    )
    args = parser.parse_args()
    build(args.cainos_dir, args.out_dir)


if __name__ == '__main__':
    main()
