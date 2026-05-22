from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.api.deps import get_db
from backend.models.graph import Edge, Graph, Node, PlaybackSession
from backend.schemas.graph import NodeCreate, NodeSchema, NodeUpdate

router = APIRouter(tags=["nodes"])


@router.post("/graphs/{graph_id}/nodes", response_model=NodeSchema, status_code=201)
def create_node(graph_id: str, payload: NodeCreate, db: Session = Depends(get_db)):
    graph = db.query(Graph).filter(Graph.id == graph_id).first()
    if not graph:
        raise HTTPException(status_code=404, detail="Graph not found")
    node = Node(graph_id=graph_id, **payload.model_dump())
    db.add(node)
    db.commit()
    db.refresh(node)
    return node


@router.patch("/nodes/{node_id}", response_model=NodeSchema)
def update_node(node_id: str, payload: NodeUpdate, db: Session = Depends(get_db)):
    node = db.query(Node).filter(Node.id == node_id).first()
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(node, field, value)
    db.commit()
    db.refresh(node)
    return node


@router.delete("/nodes/{node_id}", status_code=204)
def delete_node(node_id: str, db: Session = Depends(get_db)):
    node = db.query(Node).filter(Node.id == node_id).first()
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    # Delete all edges referencing this node
    db.query(Edge).filter(
        (Edge.source_node_id == node_id) | (Edge.target_node_id == node_id)
    ).delete(synchronize_session=False)
    # Remove node from wander histories in active sessions
    sessions = db.query(PlaybackSession).filter(PlaybackSession.graph_id == node.graph_id).all()
    for session in sessions:
        session.wander_history = [n for n in (session.wander_history or []) if n != node_id]
        if session.current_node_id == node_id:
            session.current_node_id = None
        if session.nominated_next_node_id == node_id:
            session.nominated_next_node_id = None
    db.delete(node)
    db.commit()
