"""
seed_biome_test.py — Import the biome-test graph into a running backend.

Creates (or refreshes) a "Biome Test" game whose default graph is a 16-node
spread covering every canonical ambient_tag + time-of-day combination the
listener-page world simulation knows how to render. Use it for fast visual
testing of the biome resolver without wandering an entire real game graph.

Usage (from the bgmscape/ root with the backend running):

    python scripts/seed_biome_test.py

By default the script reuses an existing biome-test graph if one is found.
Pass --reimport to forcefully add a fresh duplicate (the old graph stays in
the DB; flip the default with the editor if you want to switch).

The seed JSON intentionally has no audio_file_path on any node — the wander
engine falls back to a 30-second dwell so each biome is on screen long
enough to inspect but you can also Teleport from the listener header to
jump around freely. Ambient sounds still play normally because the ambient
engine fires from the node's `ambient_tags`, not from the music track.

Open the result at:  http://localhost:5173/listen/biome-test?world=1
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import requests


# Windows consoles default to cp1252 and trip over the ✓/✗ glyphs we print.
# Reconfigure to UTF-8 if available (Python 3.7+). Mirrors load_ambient.py
# usage style — keep this near the top so the very first print statement
# below never fails on a fresh Windows install.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")


GAME_SLUG = "biome-test"
DEFAULT_SEED = "data/biome_test_v1.bgmscape.json"


def die(msg: str) -> None:
    print(f"\n✗  {msg}", file=sys.stderr)
    sys.exit(1)


def ok(msg: str) -> None:
    print(f"✓  {msg}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--seed",     default=DEFAULT_SEED, help=f"Seed JSON path  [default: {DEFAULT_SEED}]")
    parser.add_argument("--base-url", default="http://localhost:8000")
    parser.add_argument("--reimport", action="store_true",
                        help="Force a fresh import even if the graph already exists.")
    args = parser.parse_args()

    seed_path = Path(args.seed)
    if not seed_path.exists():
        die(f"Seed file not found: {seed_path}")
    base = args.base_url.rstrip("/")

    # ── Backend up? ─────────────────────────────────────────────────────────
    try:
        requests.get(f"{base}/api/health", timeout=5).raise_for_status()
    except Exception as exc:
        die(f"Backend not reachable at {base}: {exc}\nMake sure uvicorn is running.")

    # ── Load + sanity-check the seed ────────────────────────────────────────
    seed = json.loads(seed_path.read_text(encoding="utf-8"))
    if seed.get("game_slug") != GAME_SLUG:
        die(f"Seed game_slug is {seed.get('game_slug')!r}, expected {GAME_SLUG!r}.")
    graph_name = seed["name"]

    # ── Game exists? ────────────────────────────────────────────────────────
    games = requests.get(f"{base}/api/games", timeout=10).json()
    game = next((g for g in games if g["slug"] == GAME_SLUG), None)
    if game is None:
        # The /api/graphs/import endpoint also creates the game from the seed's
        # game_slug + game_title, so we don't need to POST /api/games first.
        ok(f"No existing '{GAME_SLUG}' game — will be created via graph import.")
    else:
        ok(f"Game: {game['name']} (id={game['id']})")

    # ── Existing graph with the same name? ──────────────────────────────────
    existing_id: str | None = None
    if game:
        graphs = requests.get(f"{base}/api/graphs", params={"game_id": game["id"]}, timeout=10).json()
        for g in graphs:
            if g["name"] == graph_name:
                existing_id = g["id"]
                break

    if existing_id and not args.reimport:
        ok(f"Graph '{graph_name}' already exists (id={existing_id}). Nothing to do.")
        print(f"\nOpen the listener:  {base.replace(':8000', ':5173')}/listen/{GAME_SLUG}?world=1")
        return

    # ── Import ──────────────────────────────────────────────────────────────
    r = requests.post(f"{base}/api/graphs/import", json=seed, timeout=30)
    if not r.ok:
        die(f"Graph import failed ({r.status_code}): {r.text}")
    graph = r.json()
    ok(f"Graph imported → id={graph['id']}  ({len(graph['nodes'])} nodes, {len(graph['edges'])} edges)")

    # ── Make sure this is the game's default graph ──────────────────────────
    # Re-fetch the game in case it was just created by /import.
    games = requests.get(f"{base}/api/games", timeout=10).json()
    game = next((g for g in games if g["slug"] == GAME_SLUG), None)
    if game is None:
        die("Game wasn't created by graphs/import — that's unexpected; check backend logs.")
    if game.get("default_graph_id") != graph["id"]:
        rp = requests.patch(f"{base}/api/games/{game['id']}",
                            json={"default_graph_id": graph["id"]}, timeout=10)
        if rp.ok:
            ok(f"Set default_graph_id = {graph['id']}")
        else:
            print(f"⚠  Could not set default_graph_id ({rp.status_code}): {rp.text}")
            print("   Set it manually in the editor if listener resolution complains.")

    print()
    print(f"Open the listener:  {base.replace(':8000', ':5173')}/listen/{GAME_SLUG}?world=1")
    print(f"Edit the graph:     {base.replace(':8000', ':5173')}/games/{GAME_SLUG}/edit")


if __name__ == "__main__":
    main()
