from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect, text

from backend.config import settings
from backend.db.base import Base
from backend.db.session import engine
from backend.api.routes import games, graphs, nodes, edges, audio, sessions

# Import models so SQLAlchemy registers them before create_all
import backend.models.graph  # noqa: F401

app = FastAPI(title="bgmscape API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(games.router, prefix="/api")
app.include_router(graphs.router, prefix="/api")
app.include_router(nodes.router, prefix="/api")
app.include_router(edges.router, prefix="/api")
app.include_router(audio.router, prefix="/api")
app.include_router(sessions.router, prefix="/api")


@app.on_event("startup")
def startup():
    # Create any missing tables
    Base.metadata.create_all(bind=engine)

    # Lightweight column migrations for SQLite (create_all won't add new columns)
    _ensure_columns("nodes", {
        "loop_start": "REAL",
        "loop_end": "REAL",
        "is_transition": "BOOLEAN NOT NULL DEFAULT 0",
    })
    _ensure_columns("playback_sessions", {
        "lookahead_queue": "JSON",
    })
    # Add the game_id column to graphs if a pre-game-entity DB is being opened.
    # The migrate_to_games.py script then backfills the values and assigns defaults.
    _ensure_columns("graphs", {
        "game_id": "VARCHAR(36)",
    })


def _ensure_columns(table: str, columns: dict[str, str]) -> None:
    """Add any missing columns to an existing SQLite table."""
    with engine.connect() as conn:
        inspector = inspect(engine)
        existing = {c["name"] for c in inspector.get_columns(table)}
        for col, col_type in columns.items():
            if col not in existing:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} {col_type}"))
        conn.commit()


@app.get("/api/health")
def health():
    return {"status": "ok"}
