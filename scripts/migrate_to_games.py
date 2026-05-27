"""
migrate_to_games.py — One-time migration: introduce the Game entity.

Before this change, each Graph row had a free-text `game_title`. Audio files
lived under ./audio_files/{graph_id}/. This script:

  1. Reads distinct game_title values from the graphs table.
  2. Creates a Game row for each, with a derived slug.
  3. Sets each graph's game_id to its matching new Game.
  4. Sets each game's default_graph_id to its most-recently-created graph.
  5. Copies audio from ./audio_files/{graph_id}/ to ./audio_files/{game_id}/,
     verifies every node's path resolves, then deletes the old graph folders.

The script is idempotent — graphs that already have a game_id are skipped,
and audio files that already exist at the target are skipped.

Usage (from the bgmscape/ root with .venv active):

    python scripts/migrate_to_games.py [--dry-run]

The backend MUST NOT be running while this script executes — it talks directly
to SQLite via SQLAlchemy, not through the API.
"""
from __future__ import annotations

import argparse
import re
import shutil
import sys
import uuid
from datetime import datetime
from pathlib import Path

# Make backend importable when running this from the repo root
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import text
from sqlalchemy.orm import Session

from backend.config import settings
from backend.db.base import Base
from backend.db.session import engine
import backend.models.graph  # noqa: F401  (registers models)
from backend.models.graph import Game, Graph, Node


# Known game titles → preferred slugs. Auto-slugify produces verbose URLs
# like "the-legend-of-zelda-ocarina-of-time"; the map gives clean ones.
# Add to this mapping when running the migration over a DB that has other games.
KNOWN_SLUGS: dict[str, str] = {
    "The Legend of Zelda: Ocarina of Time": "oot",
    "Super Mario 64": "sm64",
}


def slugify(name: str) -> str:
    if name in KNOWN_SLUGS:
        return KNOWN_SLUGS[name]
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", name.strip().lower()).strip("-")
    return slug or "game"


def info(msg: str) -> None:
    print(f"   {msg}")


def ok(msg: str) -> None:
    print(f"✓  {msg}")


def warn(msg: str) -> None:
    print(f"!  {msg}")


def die(msg: str, *, exit_code: int = 1) -> None:
    print(f"\n✗  {msg}", file=sys.stderr)
    sys.exit(exit_code)


def ensure_game_id_column() -> None:
    """Add graphs.game_id if the legacy DB doesn't have it yet."""
    from sqlalchemy import inspect
    inspector = inspect(engine)
    cols = {c["name"] for c in inspector.get_columns("graphs")}
    if "game_id" not in cols:
        with engine.connect() as conn:
            conn.execute(text("ALTER TABLE graphs ADD COLUMN game_id VARCHAR(36)"))
            conn.commit()
        info("Added graphs.game_id column (was missing)")


def drop_legacy_columns(*, dry_run: bool) -> None:
    """Remove legacy NOT NULL columns that the current model no longer uses.

    - graphs.game_title  (replaced by graphs.game_id → games.name)
    - nodes.stay_probability  (was per-node stay logic; superseded by per-session
      dwell time controls in the listener)

    Requires SQLite >= 3.35 for DROP COLUMN.
    """
    from sqlalchemy import inspect
    legacy = [
        ("graphs", "game_title"),
        ("nodes", "stay_probability"),
    ]
    inspector = inspect(engine)
    for table, column in legacy:
        cols = {c["name"] for c in inspector.get_columns(table)}
        if column not in cols:
            continue
        if dry_run:
            info(f"[dry-run] would drop legacy {table}.{column} column")
            continue
        with engine.connect() as conn:
            conn.execute(text(f"ALTER TABLE {table} DROP COLUMN {column}"))
            conn.commit()
        info(f"Dropped legacy {table}.{column} column")


def read_legacy_graphs(session: Session) -> list[dict]:
    """Return all graphs with their legacy game_title column.

    Reads game_title via raw SQL since the column has been removed from the
    SQLAlchemy model. Falls back gracefully when the column no longer exists.
    """
    from sqlalchemy import inspect
    inspector = inspect(engine)
    cols = {c["name"] for c in inspector.get_columns("graphs")}
    has_title = "game_title" in cols

    sql_cols = "id, name, created_at, game_id"
    if has_title:
        sql_cols += ", game_title"
    rows = session.execute(text(f"SELECT {sql_cols} FROM graphs")).mappings().all()
    return [dict(r) for r in rows]


def find_or_create_game(session: Session, title: str, used_slugs: set[str]) -> Game:
    """Look up by name first; if missing, create one with a unique slug."""
    existing = session.query(Game).filter(Game.name == title).first()
    if existing:
        used_slugs.add(existing.slug)
        return existing

    base_slug = slugify(title)
    candidate = base_slug
    n = 1
    while candidate in used_slugs or session.query(Game).filter(Game.slug == candidate).first():
        n += 1
        candidate = f"{base_slug}-{n}"

    game = Game(id=str(uuid.uuid4()), name=title, slug=candidate, created_at=datetime.utcnow())
    session.add(game)
    session.flush()
    used_slugs.add(game.slug)
    ok(f"Created Game name={title!r} slug={candidate} id={game.id}")
    return game


def migrate_audio_for_game(
    session: Session,
    game: Game,
    graph_ids: list[str],
    *,
    storage_root: Path,
    dry_run: bool,
) -> None:
    """Consolidate per-graph audio folders into a single per-game folder.

    Source priority: the most-recently-created graph that has an on-disk folder
    is treated as the canonical audio source. Other graphs' files are merged in
    only when their filename isn't already present.
    """
    target_dir = storage_root / game.id
    source_dirs: list[tuple[str, Path]] = []
    for gid in graph_ids:
        d = storage_root / gid
        if d.is_dir():
            source_dirs.append((gid, d))

    if not source_dirs and not target_dir.is_dir():
        info(f"  No audio folders found for {game.slug} — nothing to copy")
        return

    if not dry_run:
        target_dir.mkdir(parents=True, exist_ok=True)

    copied = 0
    skipped = 0
    for gid, src in source_dirs:
        for f in src.iterdir():
            if not f.is_file():
                continue
            dst = target_dir / f.name
            if dst.exists():
                skipped += 1
                continue
            if dry_run:
                info(f"  [dry-run] would copy {gid}/{f.name} -> {game.id}/{f.name}")
            else:
                shutil.copy2(f, dst)
            copied += 1

    ok(f"  Audio: copied {copied} file(s), skipped {skipped} already-present")

    # Rewrite node.audio_file_path for every node in graphs belonging to this game.
    nodes = (
        session.query(Node)
        .join(Graph, Node.graph_id == Graph.id)
        .filter(Graph.game_id == game.id, Node.audio_file_path.isnot(None))
        .all()
    )
    rewritten = 0
    for node in nodes:
        path = node.audio_file_path
        if not path:
            continue
        head, _, filename = path.partition("/")
        if not filename:
            continue  # malformed — leave alone
        new_path = f"{game.id}/{filename}"
        if path == new_path:
            continue
        if not dry_run:
            node.audio_file_path = new_path
        rewritten += 1
    ok(f"  Rewrote audio_file_path on {rewritten} node(s)")

    # Verify on-disk presence for every (non-null) node path before deleting old folders.
    if not dry_run:
        session.flush()
    missing: list[str] = []
    for node in nodes:
        path = node.audio_file_path or ""
        if not path:
            continue
        if not (storage_root / path).exists():
            missing.append(f"{node.id} ({node.name}) -> {path}")

    if missing:
        warn(f"  {len(missing)} node(s) reference missing audio files after rewrite:")
        for m in missing[:10]:
            info(f"    {m}")
        die(
            f"Aborting before deleting old folders. Inspect the listed nodes and "
            f"either re-upload the missing audio under ./audio_files/{game.id}/ "
            f"or set those nodes' audio_file_path to NULL, then rerun the migration."
        )

    # Safe to delete the old per-graph folders now.
    for gid, src in source_dirs:
        if dry_run:
            info(f"  [dry-run] would delete ./audio_files/{gid}/")
        else:
            shutil.rmtree(src)
            info(f"  Deleted ./audio_files/{gid}/")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dry-run", action="store_true", help="Report what would change without writing")
    args = parser.parse_args()

    storage_root = Path(settings.AUDIO_STORAGE_PATH).resolve()
    print(f"Audio storage: {storage_root}")
    print(f"Database:      {settings.DATABASE_URL}")
    print()

    # Ensure schema is current (creates games table if missing, etc.)
    Base.metadata.create_all(bind=engine)
    ensure_game_id_column()

    with Session(engine) as session:
        rows = read_legacy_graphs(session)
        if not rows:
            ok("No graphs found — nothing to migrate.")
            return

        # Group rows by game_title (legacy) for ones not yet migrated.
        # Already-migrated rows (game_id is not null) are grouped by their existing game.
        pending: dict[str, list[dict]] = {}
        already_migrated_count = 0
        for r in rows:
            if r.get("game_id"):
                already_migrated_count += 1
                continue
            title = r.get("game_title") or "Untitled"
            pending.setdefault(title, []).append(r)

        info(f"Found {len(rows)} graph(s) — already migrated: {already_migrated_count}, pending: {sum(len(v) for v in pending.values())}")

        if not pending:
            ok("All graphs already have a game_id assigned.")
            # Fall through to the drop-legacy-column step in case a previous
            # run committed data but failed to drop the column.
            drop_legacy_columns(dry_run=args.dry_run)
            return

        used_slugs: set[str] = {g.slug for g in session.query(Game).all()}

        for title, group in pending.items():
            print(f"\n── Game: {title!r} ─────────────────────────────")
            info(f"{len(group)} graph(s) in this group")
            game = find_or_create_game(session, title, used_slugs)

            # Sort by created_at to determine the default (most recent).
            group_sorted = sorted(group, key=lambda r: r["created_at"] or datetime.min)
            for r in group_sorted:
                graph = session.query(Graph).filter(Graph.id == r["id"]).first()
                if not graph:
                    warn(f"  Graph {r['id']} not loadable via ORM — skipping")
                    continue
                if args.dry_run:
                    info(f"  [dry-run] would set graphs.{graph.id}.game_id = {game.id}")
                else:
                    graph.game_id = game.id
                info(f"  {graph.name} (id={graph.id}, created_at={r['created_at']})")

            # Default = most-recent.
            default_graph_id = group_sorted[-1]["id"]
            if game.default_graph_id is None or game.default_graph_id not in {r["id"] for r in group_sorted}:
                if args.dry_run:
                    info(f"  [dry-run] would set default_graph_id = {default_graph_id}")
                else:
                    game.default_graph_id = default_graph_id
                ok(f"  Default graph for {game.slug}: {default_graph_id}")

            if not args.dry_run:
                session.flush()

            migrate_audio_for_game(
                session,
                game,
                [r["id"] for r in group_sorted],
                storage_root=storage_root,
                dry_run=args.dry_run,
            )

        if args.dry_run:
            print("\n[dry-run] No changes committed.")
            session.rollback()
        else:
            session.commit()
            print("\n✓ Migration committed.")

    # Drop legacy column AFTER committing the data migration so we never lose
    # the source of truth before backfilling completes.
    drop_legacy_columns(dry_run=args.dry_run)


if __name__ == "__main__":
    main()
