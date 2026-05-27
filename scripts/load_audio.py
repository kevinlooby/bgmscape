"""
load_audio.py — Import the OOT graph and bulk-upload FLAC audio files.

Usage (from the bgmscape/ root with .venv active):

    python scripts/load_audio.py --audio-dir "C:\\path\\to\\flac"

Options:
    --audio-dir PATH     Directory containing the FLAC files  [required]
    --seed PATH          Graph seed JSON  [default: data/oot_v1.bgmscape.json]
    --map PATH           Audio map JSON   [default: data/oot_audio_map.json]
    --base-url URL       Backend URL      [default: http://localhost:8000]
    --dry-run            Preview matches without uploading anything
    --detect-loops       Run loop-point detection after each upload (slow; needs librosa)
    --skip-import        Reuse an existing graph by name instead of importing a new one
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


# ── Core steps ────────────────────────────────────────────────────────────────

def find_existing_graph(base: str, name: str) -> str | None:
    """Return the graph ID if a graph with this name already exists."""
    r = requests.get(f"{base}/api/graphs", timeout=10)
    r.raise_for_status()
    for g in r.json():
        if g["name"] == name:
            return g["id"]
    return None


def import_graph(base: str, seed_path: Path) -> str:
    """Import the seed JSON and return the new graph ID."""
    payload = json.loads(seed_path.read_text(encoding="utf-8"))
    r = requests.post(f"{base}/api/graphs/import", json=payload, timeout=30)
    if not r.ok:
        die(f"Graph import failed ({r.status_code}): {r.text}")
    graph_id = r.json()["id"]
    ok(f"Graph imported → id={graph_id}")
    return graph_id


def fetch_nodes(base: str, graph_id: str) -> dict[str, dict]:
    """Return a mapping of node_name → node dict."""
    r = requests.get(f"{base}/api/graphs/{graph_id}", timeout=10)
    r.raise_for_status()
    return {n["name"]: n for n in r.json()["nodes"]}


def upload_file(base: str, graph_id: str, file_path: Path) -> str:
    """Upload a FLAC file and return the stored file_path (graph_id/filename)."""
    with file_path.open("rb") as fh:
        r = requests.post(
            f"{base}/api/audio/{graph_id}/upload",
            files={"file": (file_path.name, fh, "audio/flac")},
            timeout=120,
        )
    if not r.ok:
        die(f"Upload failed for {file_path.name} ({r.status_code}): {r.text}")
    return r.json()["file_path"]


def patch_node(base: str, node_id: str, **fields) -> None:
    r = requests.patch(f"{base}/api/nodes/{node_id}", json=fields, timeout=10)
    if not r.ok:
        die(f"Node patch failed ({r.status_code}): {r.text}")


def detect_loops(base: str, graph_id: str, filename: str, node_id: str) -> None:
    """Run loop-point detection and patch the node with results."""
    encoded = requests.utils.quote(filename, safe="")
    r = requests.post(
        f"{base}/api/audio/{graph_id}/{encoded}/analyze",
        timeout=300,
    )
    if r.status_code == 503:
        info("Loop detection unavailable (librosa not installed) — skipping")
        return
    if not r.ok:
        info(f"Loop detection failed ({r.status_code}): {r.text} — skipping")
        return
    result = r.json()
    patch_node(base, node_id, loop_start=result["loop_start"], loop_end=result["loop_end"])
    info(f"Loop points → start={result['loop_start']:.3f}s  end={result['loop_end']:.3f}s  "
         f"confidence={result['confidence']:.2f}")


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--audio-dir", required=True, help="Directory containing FLAC files")
    parser.add_argument("--seed",      default="data/oot_v2.bgmscape.json")
    parser.add_argument("--map",       default="data/oot_audio_map.json")
    parser.add_argument("--base-url",  default="http://localhost:8000")
    parser.add_argument("--dry-run",   action="store_true", help="Preview only — no uploads")
    parser.add_argument("--detect-loops", action="store_true", help="Run loop detection after upload")
    parser.add_argument("--skip-import",  action="store_true", help="Reuse existing graph by name")
    args = parser.parse_args()

    audio_dir = Path(args.audio_dir)
    seed_path = Path(args.seed)
    map_path  = Path(args.map)
    base      = args.base_url.rstrip("/")

    # ── Validate paths ───────────────────────────────────────────────────────
    if not audio_dir.is_dir():
        die(f"--audio-dir does not exist: {audio_dir}")
    if not seed_path.exists():
        die(f"Seed file not found: {seed_path}")
    if not map_path.exists():
        die(f"Map file not found: {map_path}")

    # ── Load map config ──────────────────────────────────────────────────────
    raw_map: dict = json.loads(map_path.read_text(encoding="utf-8"))
    # Separate nodes-with-audio from explicitly-silent nodes (value is null).
    # Keys starting with "_" are metadata comments and are always excluded.
    audio_map   = {k: v for k, v in raw_map.items() if not k.startswith("_") and v is not None}
    silent_nodes = {k      for k, v in raw_map.items() if not k.startswith("_") and v is None}

    # ── Check backend is up ──────────────────────────────────────────────────
    try:
        requests.get(f"{base}/api/health", timeout=5).raise_for_status()
    except Exception as exc:
        die(f"Backend not reachable at {base}: {exc}\nMake sure uvicorn is running.")

    # ── Load seed to get graph name ──────────────────────────────────────────
    seed = json.loads(seed_path.read_text(encoding="utf-8"))
    graph_name = seed["name"]

    # ── Import or reuse graph ────────────────────────────────────────────────
    existing_id = find_existing_graph(base, graph_name)
    if existing_id and not args.skip_import:
        print(f"\n⚠  A graph named '{graph_name}' already exists (id={existing_id}).")
        answer = input("   (r)euse it, (a)bort, or (i)mport fresh duplicate? [r/a/i]: ").strip().lower()
        if answer == "a":
            die("Aborted.")
        elif answer == "i":
            graph_id = import_graph(base, seed_path)
        else:
            graph_id = existing_id
            ok(f"Reusing existing graph → id={graph_id}")
    elif args.skip_import and existing_id:
        graph_id = existing_id
        ok(f"Reusing existing graph → id={graph_id}")
    else:
        if args.dry_run:
            graph_id = "<dry-run>"
            ok(f"[DRY RUN] Would import graph from {seed_path}")
        else:
            graph_id = import_graph(base, seed_path)

    # ── Fetch node list ──────────────────────────────────────────────────────
    if not args.dry_run:
        nodes_by_name = fetch_nodes(base, graph_id)
    else:
        nodes_by_name = {n["name"]: n for n in seed["nodes"]}

    # ── Match and report ─────────────────────────────────────────────────────
    print(f"\n{'─'*60}")
    print(f"{'NODE':<28}  {'FILE':<28}  STATUS")
    print(f"{'─'*60}")

    matched:   list[tuple[str, Path]] = []   # (node_name, file_path)
    unmatched: list[str] = []

    for node_name, filename in audio_map.items():
        file_path = audio_dir / filename
        if file_path.exists():
            matched.append((node_name, file_path))
            print(f"  {node_name:<36}  {filename:<32}  ✓ found")
        else:
            unmatched.append(node_name)
            print(f"  {node_name:<36}  {filename:<32}  ✗ NOT FOUND")

    # Silent nodes — explicitly null in the audio map, no upload needed
    for node_name in sorted(silent_nodes):
        print(f"  {node_name:<36}  {'(silent)':<32}  — no audio")

    # Nodes present in the graph but missing from the audio map entirely
    for node_name in nodes_by_name:
        if node_name not in audio_map and node_name not in silent_nodes:
            print(f"  {node_name:<36}  {'(not in audio map)':<32}  ⚠ unmapped")

    print(f"{'─'*60}")
    print(f"  Matched: {len(matched)}   Missing: {len(unmatched)}   Silent: {len(silent_nodes)}")

    if args.dry_run:
        print("\n[DRY RUN] No files uploaded. Fix missing entries in the map file and rerun.")
        return

    if silent_nodes:
        print(f"\n   {len(silent_nodes)} silent node(s) intentionally have no audio — skipping upload for those.")
    if unmatched:
        print(f"\n⚠  {len(unmatched)} audio file(s) not found — those nodes will have no audio.")
        answer = input("   Continue anyway? [y/N]: ").strip().lower()
        if answer != "y":
            die("Aborted.")

    # ── Upload ───────────────────────────────────────────────────────────────
    print(f"\nUploading {len(matched)} files…\n")
    errors = 0
    for i, (node_name, file_path) in enumerate(matched, 1):
        node = nodes_by_name.get(node_name)
        if not node:
            info(f"[{i}/{len(matched)}] {node_name}: node not found in graph — skipping")
            errors += 1
            continue

        print(f"[{i}/{len(matched)}] {node_name}")
        info(f"uploading {file_path.name} ({file_path.stat().st_size / 1_048_576:.1f} MB)")

        stored_path = upload_file(base, graph_id, file_path)
        patch_node(base, node["id"], audio_file_path=stored_path)
        ok(f"audio_file_path = {stored_path}")

        if args.detect_loops:
            filename_stored = stored_path.split("/")[-1]
            info("detecting loop points…")
            detect_loops(base, graph_id, filename_stored, node["id"])

        print()

    # ── Summary ──────────────────────────────────────────────────────────────
    print(f"{'─'*60}")
    print(f"Done.  Uploaded: {len(matched) - errors}  Errors: {errors}  Missing: {len(unmatched)}  Silent: {len(silent_nodes)}")
    print(f"\nOpen the listener: http://localhost:5173/listen/{graph_id}")


if __name__ == "__main__":
    main()
