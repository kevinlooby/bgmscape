from __future__ import annotations

import shutil
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.api.deps import get_db
from backend.config import settings
from backend.models.graph import Edge, Graph, Node
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
    return GraphExport(name=graph.name, game_title=graph.game_title, nodes=nodes, edges=edges)


@router.post("/import", response_model=GraphSchema, status_code=201)
def import_graph(payload: GraphExport, db: Session = Depends(get_db)):
    """
    Create a new graph from an exported JSON document.
    New IDs are generated for all entities so existing graphs are never overwritten.
    Node/edge relationships are remapped to the new IDs.
    """
    # Remap old IDs → new IDs
    node_id_map: dict[str, str] = {n.id: str(uuid.uuid4()) for n in payload.nodes}

    graph = Graph(name=payload.name, game_title=payload.game_title)
    db.add(graph)
    db.flush()  # assign graph.id

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
