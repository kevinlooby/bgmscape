from __future__ import annotations

import shutil
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.api.deps import get_db
from backend.config import settings
from backend.models.graph import Edge, Graph, Node
from backend.schemas.graph import GraphCreate, GraphListItem, GraphSchema, GraphUpdate

router = APIRouter(prefix="/graphs", tags=["graphs"])


@router.get("", response_model=list[GraphListItem])
def list_graphs(db: Session = Depends(get_db)):
    graphs = db.query(Graph).all()
    result = []
    for g in graphs:
        node_count = db.query(Node).filter(Node.graph_id == g.id).count()
        result.append(GraphListItem(
            id=g.id,
            name=g.name,
            game_title=g.game_title,
            created_at=g.created_at,
            node_count=node_count,
        ))
    return result


@router.post("", response_model=GraphSchema, status_code=201)
def create_graph(payload: GraphCreate, db: Session = Depends(get_db)):
    graph = Graph(name=payload.name, game_title=payload.game_title)
    db.add(graph)
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
    if payload.game_title is not None:
        graph.game_title = payload.game_title
    db.commit()
    db.refresh(graph)
    return graph


@router.delete("/{graph_id}", status_code=204)
def delete_graph(graph_id: str, db: Session = Depends(get_db)):
    graph = db.query(Graph).filter(Graph.id == graph_id).first()
    if not graph:
        raise HTTPException(status_code=404, detail="Graph not found")
    db.delete(graph)
    db.commit()
    # Remove audio files directory for this graph
    audio_dir = Path(settings.AUDIO_STORAGE_PATH) / graph_id
    if audio_dir.exists():
        shutil.rmtree(audio_dir)
