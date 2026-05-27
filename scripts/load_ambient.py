"""
load_ambient.py — Bulk-import ambient/atmospheric audio assets.

Reads a seed JSON describing the global ambient library and uploads each
asset's audio file to the backend. Idempotent: if an asset with the same
`name` already exists, its metadata is PATCH-updated and the audio file is
left in place.

Usage (from the bgmscape/ root with .venv active and the backend running):

    python scripts/load_ambient.py --audio-dir "C:\\path\\to\\ambient-audio"

Options:
    --audio-dir PATH     Directory containing the source audio files  [required]
    --seed PATH          Library seed JSON  [default: data/ambient_library_seed.json]
    --base-url URL       Backend URL        [default: http://localhost:8000]
    --dry-run            Preview what would happen without writing anything

Seed file format (see data/ambient_library_seed.json for a starter):

    {
      "assets": [
        {
          "name": "wind-light-meadow",
          "file": "wind-light-meadow.mp3",
          "category": "wind",
          "tags": ["field", "day"],
          "default_volume": 0.4,
          "play_probability": 1.0,
          "min_play_duration_s": 45,
          "max_play_duration_s": 120,
          "fade_in_ms": 2000,
          "fade_out_ms": 3000,
          "license": "Pixabay"
        }
      ]
    }
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import requests


# ── Helpers ──────────────────────────────────────────────────────────────────

def die(msg: str) -> None:
    print(f"\n✗  {msg}", file=sys.stderr)
    sys.exit(1)


def ok(msg: str) -> None:
    print(f"✓  {msg}")


def info(msg: str) -> None:
    print(f"   {msg}")


# ── Core ──────────────────────────────────────────────────────────────────────

METADATA_FIELDS = [
    "name", "category", "tags",
    "default_volume", "play_probability",
    "min_play_duration_s", "max_play_duration_s",
    "fade_in_ms", "fade_out_ms",
    "license",
]


def list_existing(base: str) -> dict[str, dict]:
    r = requests.get(f"{base}/api/ambient/assets", timeout=10)
    r.raise_for_status()
    return {a["name"]: a for a in r.json()}


def upload_asset(base: str, audio_dir: Path, entry: dict) -> None:
    filename = entry["file"]
    src = audio_dir / filename
    if not src.exists():
        die(f"Audio file not found: {src}")

    metadata = {k: entry[k] for k in METADATA_FIELDS if k in entry}

    mime = "audio/flac" if src.suffix.lower() == ".flac" else "audio/mpeg"
    with src.open("rb") as fh:
        r = requests.post(
            f"{base}/api/ambient/assets",
            files={"file": (src.name, fh, mime)},
            data={"metadata": json.dumps(metadata)},
            timeout=300,
        )
    if not r.ok:
        die(f"Upload failed for {filename} ({r.status_code}): {r.text}")
    ok(f"Uploaded {entry['name']}  ←  {filename}")


def patch_asset(base: str, asset_id: str, entry: dict) -> None:
    payload = {k: entry[k] for k in METADATA_FIELDS if k in entry}
    r = requests.patch(f"{base}/api/ambient/assets/{asset_id}", json=payload, timeout=30)
    if not r.ok:
        die(f"Patch failed for {entry['name']} ({r.status_code}): {r.text}")
    ok(f"Updated metadata: {entry['name']}")


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--audio-dir", required=True, type=Path, help="Directory containing source audio files")
    parser.add_argument("--seed", type=Path, default=Path("data/ambient_library_seed.json"))
    parser.add_argument("--base-url", default="http://localhost:8000")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    if not args.seed.exists():
        die(f"Seed file not found: {args.seed}")
    if not args.audio_dir.exists() or not args.audio_dir.is_dir():
        die(f"Audio directory not found: {args.audio_dir}")

    seed = json.loads(args.seed.read_text(encoding="utf-8"))
    assets = seed.get("assets", [])
    if not assets:
        die("Seed has no 'assets' entries")
    info(f"Seed has {len(assets)} asset(s)")

    try:
        existing = list_existing(args.base_url)
    except requests.RequestException as exc:
        die(f"Cannot reach backend at {args.base_url}: {exc}")

    info(f"Backend currently has {len(existing)} ambient asset(s)")

    for entry in assets:
        name = entry.get("name")
        if not name:
            die(f"Entry missing 'name': {entry}")

        if name in existing:
            if args.dry_run:
                info(f"DRY-RUN: would PATCH metadata for {name}")
                continue
            patch_asset(args.base_url, existing[name]["id"], entry)
        else:
            if args.dry_run:
                info(f"DRY-RUN: would UPLOAD {entry.get('file')} as {name}")
                continue
            upload_asset(args.base_url, args.audio_dir, entry)

    ok("Done.")


if __name__ == "__main__":
    main()
