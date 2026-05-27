from __future__ import annotations

import re
import shutil
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.api.deps import get_db
from backend.config import settings
from backend.models.graph import Game, Graph, Node
from backend.schemas.game import (
    GameCreate,
    GameGraphSummary,
    GameListItem,
    GameSchema,
    GameUpdate,
)

router = APIRouter(prefix="/games", tags=["games"])


SLUG_PATTERN = re.compile(r"^[a-z0-9][a-z0-9-]*$")


def _validate_slug(slug: str) -> None:
    if not SLUG_PATTERN.match(slug):
        raise HTTPException(
            status_code=422,
            detail="slug must be lowercase, start with a letter or digit, and contain only letters, digits, and hyphens",
        )


def _game_to_list_item(db: Session, game: Game) -> GameListItem:
    graph_count = db.query(Graph).filter(Graph.game_id == game.id).count()
    return GameListItem(
        id=game.id,
        name=game.name,
        slug=game.slug,
        default_graph_id=game.default_graph_id,
        graph_count=graph_count,
        created_at=game.created_at,
    )


@router.get("", response_model=list[GameListItem])
def list_games(db: Session = Depends(get_db)):
    games = db.query(Game).order_by(Game.created_at).all()
    return [_game_to_list_item(db, g) for g in games]


@router.get("/{game_id}", response_model=GameSchema)
def get_game(game_id: str, db: Session = Depends(get_db)):
    game = db.query(Game).filter(Game.id == game_id).first()
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")

    graphs = db.query(Graph).filter(Graph.game_id == game.id).order_by(Graph.created_at).all()
    summaries: list[GameGraphSummary] = []
    for g in graphs:
        node_count = db.query(Node).filter(Node.graph_id == g.id).count()
        summaries.append(GameGraphSummary(
            id=g.id,
            name=g.name,
            created_at=g.created_at,
            node_count=node_count,
            is_default=(game.default_graph_id == g.id),
        ))

    return GameSchema(
        id=game.id,
        name=game.name,
        slug=game.slug,
        default_graph_id=game.default_graph_id,
        created_at=game.created_at,
        graphs=summaries,
    )


@router.get("/by-slug/{slug}", response_model=GameSchema)
def get_game_by_slug(slug: str, db: Session = Depends(get_db)):
    game = db.query(Game).filter(Game.slug == slug).first()
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")
    return get_game(game.id, db)


@router.post("", response_model=GameSchema, status_code=201)
def create_game(payload: GameCreate, db: Session = Depends(get_db)):
    _validate_slug(payload.slug)
    existing = db.query(Game).filter(Game.slug == payload.slug).first()
    if existing:
        raise HTTPException(status_code=409, detail=f"Game with slug '{payload.slug}' already exists")

    game = Game(name=payload.name, slug=payload.slug)
    db.add(game)
    db.commit()
    db.refresh(game)
    return get_game(game.id, db)


@router.patch("/{game_id}", response_model=GameSchema)
def update_game(game_id: str, payload: GameUpdate, db: Session = Depends(get_db)):
    game = db.query(Game).filter(Game.id == game_id).first()
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")

    if payload.name is not None:
        game.name = payload.name

    if payload.slug is not None:
        _validate_slug(payload.slug)
        if payload.slug != game.slug:
            collision = db.query(Game).filter(Game.slug == payload.slug, Game.id != game.id).first()
            if collision:
                raise HTTPException(status_code=409, detail=f"Game with slug '{payload.slug}' already exists")
            game.slug = payload.slug

    if payload.default_graph_id is not None:
        # Empty string clears the default; otherwise validate ownership.
        if payload.default_graph_id == "":
            game.default_graph_id = None
        else:
            graph = db.query(Graph).filter(Graph.id == payload.default_graph_id).first()
            if not graph:
                raise HTTPException(status_code=404, detail="Graph not found")
            if graph.game_id != game.id:
                raise HTTPException(status_code=400, detail="Graph does not belong to this game")
            game.default_graph_id = payload.default_graph_id

    db.commit()
    db.refresh(game)
    return get_game(game.id, db)


@router.delete("/{game_id}", status_code=204)
def delete_game(game_id: str, db: Session = Depends(get_db)):
    game = db.query(Game).filter(Game.id == game_id).first()
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")

    db.delete(game)
    db.commit()

    audio_dir = Path(settings.AUDIO_STORAGE_PATH) / game_id
    if audio_dir.exists():
        shutil.rmtree(audio_dir)
