from __future__ import annotations

import shutil
import uuid
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from backend.api.deps import get_db
from backend.config import settings
from backend.models.graph import Edge, Game, Graph, Node
from backend.schemas.graph import (
    EdgeExport,
    GraphCreate,
    GraphExport,
    GraphListItem,
    GraphSchema,
    GraphUpdate,
    NodeExport,
)

router = APIRouter(prefix="/graphs", tags=["graphs"])


def _graph_to_list_item(db: Session, g: Graph) -> GraphListItem:
    node_count = db.query(Node).filter(Node.graph_id == g.id).count()
    return GraphListItem(
        id=g.id,
        name=g.name,
        game_id=g.game_id,
        created_at=g.created_at,
        node_count=node_count,
    )


@router.get("", response_model=list[GraphListItem])
def list_graphs(
    game_id: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
):
    query = db.query(Graph)
    if game_id is not None:
        query = query.filter(Graph.game_id == game_id)
    graphs = query.order_by(Graph.created_at).all()
    return [_graph_to_list_item(db, g) for g in graphs]


@router.post("", response_model=GraphSchema, status_code=201)
def create_graph(payload: GraphCreate, db: Session = Depends(get_db)):
    game = db.query(Game).filter(Game.id == payload.game_id).first()
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")

    graph = Graph(name=payload.name, game_id=payload.game_id)
    db.add(graph)

    # If the game has no default yet, make this graph the default.
    if game.default_graph_id is None:
        db.flush()
        game.default_graph_id = graph.id

    db.commit()
    db.refresh(graph)
    return graph


@router.get("/{graph_id}", response_model=GraphSchema)
def get_graph(graph_id: str, db: Session = Depends(get_db)):
    graph = db.query(Graph).filter(Graph.id == graph_id).first()
    if not graph:
        raise HTTPException(status_code=404, detail="Graph not found")
    return graph


@router.patch("/{graph_id}", response_model=GraphSchema)
def update_graph(graph_id: str, payload: GraphUpdate, db: Session = Depends(get_db)):
    graph = db.query(Graph).filter(Graph.id == graph_id).first()
    if not graph:
        raise HTTPException(status_code=404, detail="Graph not found")
    if payload.name is not None:
        graph.name = payload.name
    db.commit()
    db.refresh(graph)
    return graph


@router.delete("/{graph_id}", status_code=204)
def delete_graph(graph_id: str, db: Session = Depends(get_db)):
    graph = db.query(Graph).filter(Graph.id == graph_id).first()
    if not graph:
        raise HTTPException(status_code=404, detail="Graph not found")

    # If this graph is its game's default, clear the default first.
    if graph.game_id:
        game = db.query(Game).filter(Game.id == graph.game_id).first()
        if game and game.default_graph_id == graph.id:
            game.default_graph_id = None

    db.delete(graph)
    db.commit()
    # Note: per-game audio folder is shared across graphs in the same game.
    # Deleting a graph no longer removes audio files. Use DELETE /api/games/{id}
    # to wipe a game's audio.


@router.get("/{graph_id}/export", response_model=GraphExport)
def export_graph(graph_id: str, db: Session = Depends(get_db)):
    """Export a graph as a self-contained JSON document (audio files not included)."""
    graph = db.query(Graph).filter(Graph.id == graph_id).first()
    if not graph:
        raise HTTPException(status_code=404, detail="Graph not found")

    nodes = [
        NodeExport(
            id=n.id,
            name=n.name,
            region=n.region,
            canvas_x=n.canvas_x,
            canvas_y=n.canvas_y,
            loop_start=n.loop_start,
            loop_end=n.loop_end,
        )
        for n in graph.nodes
    ]
    edges = [
        EdgeExport(
            id=e.id,
            source_node_id=e.source_node_id,
            target_node_id=e.target_node_id,
            weight=e.weight,
            bidirectional=e.bidirectional,
        )
        for e in graph.edges
    ]
    game = graph.game
    return GraphExport(
        name=graph.name,
        game_slug=game.slug if game else None,
        game_title=game.name if game else None,
        nodes=nodes,
        edges=edges,
    )


def _slugify(name: str) -> str:
    """Best-effort slug derivation for a game name when no slug is provided."""
    import re
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", name.strip().lower()).strip("-")
    return slug or "game"


def _resolve_or_create_game(db: Session, slug: Optional[str], title: Optional[str]) -> Game:
    """Look up a Game by slug (preferred) or by name (legacy fallback). Create if missing."""
    if slug:
        game = db.query(Game).filter(Game.slug == slug).first()
        if game:
            return game
        # Create a new game using the slug; derive a display name from the title or the slug itself.
        display_name = title or slug
        game = Game(name=display_name, slug=slug)
        db.add(game)
        db.flush()
        return game

    # No slug — try name match for legacy export files.
    if title:
        game = db.query(Game).filter(Game.name == title).first()
        if game:
            return game
        new_slug = _slugify(title)
        # Ensure uniqueness by suffixing if needed.
        n = 1
        candidate = new_slug
        while db.query(Game).filter(Game.slug == candidate).first():
            n += 1
            candidate = f"{new_slug}-{n}"
        game = Game(name=title, slug=candidate)
        db.add(game)
        db.flush()
        return game

    raise HTTPException(status_code=422, detail="Import payload must include game_slug or game_title")


@router.post("/import", response_model=GraphSchema, status_code=201)
def import_graph(payload: GraphExport, db: Session = Depends(get_db)):
    """
    Create a new graph from an exported JSON document.

    The target game is resolved by `game_slug` (preferred) or `game_title`
    (legacy fallback). A new Game is created if no match exists.

    New IDs are generated for all entities so existing graphs are never
    overwritten. Node/edge relationships are remapped to the new IDs.
    """
    game = _resolve_or_create_game(db, payload.game_slug, payload.game_title)

    node_id_map: dict[str, str] = {n.id: str(uuid.uuid4()) for n in payload.nodes}

    graph = Graph(name=payload.name, game_id=game.id)
    db.add(graph)
    db.flush()  # assign graph.id

    # If the target game has no default graph yet, make this one the default.
    if game.default_graph_id is None:
        game.default_graph_id = graph.id

    for n in payload.nodes:
        node = Node(
            id=node_id_map[n.id],
            graph_id=graph.id,
            name=n.name,
            region=n.region,
            canvas_x=n.canvas_x,
            canvas_y=n.canvas_y,
            loop_start=n.loop_start,
            loop_end=n.loop_end,
        )
        db.add(node)

    for e in payload.edges:
        src = node_id_map.get(e.source_node_id)
        tgt = node_id_map.get(e.target_node_id)
        if not src or not tgt:
            continue  # skip edges referencing unknown nodes
        edge = Edge(
            graph_id=graph.id,
            source_node_id=src,
            target_node_id=tgt,
            weight=e.weight,
            bidirectional=e.bidirectional,
        )
        db.add(edge)

    db.commit()
    db.refresh(graph)
    return graph
