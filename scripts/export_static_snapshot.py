"""
export_static_snapshot.py — Build the JSON snapshot that the static (Vercel)
frontend reads in place of the live API.

Reads the local SQLite DB directly via the existing SQLAlchemy models, then
writes `frontend/public/data/snapshot.json` containing:

  - every Game (with its graph summaries)
  - every Graph that is referenced by some game's default_graph_id, fully
    populated with nodes and edges
  - every AmbientAsset

Listener-reachable data only. Editor-only graphs (non-default graphs under a
game) are intentionally excluded — the deployed app is listen-only by design,
and a smaller bundle is a faster page-load.

Usage (from the bgmscape/ root with .venv active, backend NOT running):

    .venv/Scripts/python scripts/export_static_snapshot.py

Or via PowerShell with the anaconda PATH fix (same as start_backend.ps1):

    $env:PATH = "C:\\Users\\kevin\\anaconda3\\Library\\bin;$env:PATH"
    .venv\\Scripts\\python scripts\\export_static_snapshot.py

Idempotent: writes are atomic (temp file + rename), and re-running with no DB
changes produces the same file.
"""
from __future__ import annotations

import json
import os
import sys
import tempfile
from datetime import datetime
from pathlib import Path

# Make `import backend...` work when running from the project root.
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from backend.db.session import SessionLocal  # noqa: E402
from backend.models.graph import Edge, Game, Graph, Node  # noqa: E402
from backend.models.ambient import AmbientAsset  # noqa: E402


SNAPSHOT_VERSION = 1
OUTPUT_PATH = ROOT / "frontend" / "public" / "data" / "snapshot.json"


def _serialize_game(game: Game) -> dict:
    return {
        "id": game.id,
        "name": game.name,
        "slug": game.slug,
        "default_graph_id": game.default_graph_id,
        "created_at": game.created_at.isoformat() if game.created_at else None,
        # Mirrors the listener API's GameGraphSummary shape so the frontend
        # can use the same types in HTTP and static mode.
        "graphs": [
            {
                "id": g.id,
                "name": g.name,
                "created_at": g.created_at.isoformat() if g.created_at else None,
                "node_count": len(g.nodes),
                "is_default": g.id == game.default_graph_id,
            }
            for g in sorted(game.graphs, key=lambda g: g.created_at or datetime.min)
        ],
    }


def _serialize_node(node: Node) -> dict:
    return {
        "id": node.id,
        "graph_id": node.graph_id,
        "name": node.name,
        "audio_file_path": node.audio_file_path,
        "region": node.region,
        "canvas_x": node.canvas_x,
        "canvas_y": node.canvas_y,
        "loop_start": node.loop_start,
        "loop_end": node.loop_end,
        "is_transition": bool(node.is_transition),
        "ambient_tags": list(node.ambient_tags or []),
    }


def _serialize_edge(edge: Edge) -> dict:
    return {
        "id": edge.id,
        "graph_id": edge.graph_id,
        "source_node_id": edge.source_node_id,
        "target_node_id": edge.target_node_id,
        "weight": edge.weight,
        "bidirectional": bool(edge.bidirectional),
    }


def _serialize_graph(graph: Graph) -> dict:
    return {
        "id": graph.id,
        "name": graph.name,
        "game_id": graph.game_id,
        "created_at": graph.created_at.isoformat() if graph.created_at else None,
        "nodes": [_serialize_node(n) for n in graph.nodes],
        "edges": [_serialize_edge(e) for e in graph.edges],
    }


def _serialize_ambient_asset(asset: AmbientAsset) -> dict:
    return {
        "id": asset.id,
        "name": asset.name,
        "file_path": asset.file_path,
        "category": asset.category,
        "tags": list(asset.tags or []),
        "default_volume": asset.default_volume,
        "play_probability": asset.play_probability,
        "min_play_duration_s": asset.min_play_duration_s,
        "max_play_duration_s": asset.max_play_duration_s,
        "fade_in_ms": asset.fade_in_ms,
        "fade_out_ms": asset.fade_out_ms,
        "license": asset.license,
        "created_at": asset.created_at.isoformat() if asset.created_at else None,
    }


def _atomic_write_json(path: Path, data: dict) -> None:
    """Write JSON to `path` via a temp file + rename so partial writes never
    leave the snapshot in an unreadable state."""
    path.parent.mkdir(parents=True, exist_ok=True)
    # delete=False because we close the file before renaming so Windows lets
    # us move it. The named temp file lives alongside the target so the
    # rename stays on the same filesystem (atomic on POSIX, near-atomic on NTFS).
    fd, tmp_path = tempfile.mkstemp(prefix=".snapshot.", suffix=".json", dir=str(path.parent))
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False, sort_keys=False)
            f.write("\n")
        os.replace(tmp_path, path)
    except Exception:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        raise


def main() -> int:
    with SessionLocal() as db:
        games = db.query(Game).all()
        ambient_assets = db.query(AmbientAsset).all()

        # Listener-reachable graphs only: every default graph referenced by a
        # game. A game with no default is skipped entirely (the listener UI
        # disables its Listen button anyway).
        wanted_graph_ids = {g.default_graph_id for g in games if g.default_graph_id}
        graphs: list[Graph] = []
        for graph_id in wanted_graph_ids:
            graph = db.query(Graph).filter(Graph.id == graph_id).first()
            if graph is None:
                print(
                    f"WARN: game references missing default_graph_id={graph_id} — skipped",
                    file=sys.stderr,
                )
                continue
            graphs.append(graph)

        snapshot = {
            "version": SNAPSHOT_VERSION,
            "exported_at": datetime.utcnow().isoformat() + "Z",
            "games": [_serialize_game(g) for g in games],
            "graphs": [_serialize_graph(g) for g in graphs],
            "ambient_assets": [_serialize_ambient_asset(a) for a in ambient_assets],
        }

    _atomic_write_json(OUTPUT_PATH, snapshot)

    rel = OUTPUT_PATH.relative_to(ROOT)
    print(
        f"wrote {rel}: "
        f"{len(snapshot['games'])} games, "
        f"{len(snapshot['graphs'])} graphs "
        f"({sum(len(g['nodes']) for g in snapshot['graphs'])} nodes, "
        f"{sum(len(g['edges']) for g in snapshot['graphs'])} edges), "
        f"{len(snapshot['ambient_assets'])} ambient assets"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
