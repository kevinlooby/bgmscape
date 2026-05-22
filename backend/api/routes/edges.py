from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.api.deps import get_db
from backend.models.graph import Edge, Graph
from backend.schemas.graph import EdgeCreate, EdgeSchema, EdgeUpdate

router = APIRouter(tags=["edges"])


@router.post("/graphs/{graph_id}/edges", response_model=EdgeSchema, status_code=201)
def create_edge(graph_id: str, payload: EdgeCreate, db: Session = Depends(get_db)):
    graph = db.query(Graph).filter(Graph.id == graph_id).first()
    if not graph:
        raise HTTPException(status_code=404, detail="Graph not found")
    edge = Edge(graph_id=graph_id, **payload.model_dump())
    db.add(edge)
    db.commit()
    db.refresh(edge)
    return edge


@router.patch("/edges/{edge_id}", response_model=EdgeSchema)
def update_edge(edge_id: str, payload: EdgeUpdate, db: Session = Depends(get_db)):
    edge = db.query(Edge).filter(Edge.id == edge_id).first()
    if not edge:
        raise HTTPException(status_code=404, detail="Edge not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(edge, field, value)
    db.commit()
    db.refresh(edge)
    return edge


@router.delete("/edges/{edge_id}", status_code=204)
def delete_edge(edge_id: str, db: Session = Depends(get_db)):
    edge = db.query(Edge).filter(Edge.id == edge_id).first()
    if not edge:
        raise HTTPException(status_code=404, detail="Edge not found")
    db.delete(edge)
    db.commit()
