from __future__ import annotations

import random
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.api.deps import get_db
from backend.models.graph import Edge, Graph, Node, PlaybackSession
from backend.schemas.graph import (
    AdvanceResponse,
    LookaheadResponse,
    LookaheadStep,
    PlaybackSessionSchema,
    SessionCreate,
    SessionUpdate,
    TeleportRequest,
)
from backend.services.wander import get_next_node

router = APIRouter(prefix="/sessions", tags=["sessions"])

HISTORY_CAP = 10
LOOKAHEAD_TARGET = 16


def _append_history(history: list[str], node_id: str) -> list[str]:
    updated = list(history) + [node_id]
    return updated[-HISTORY_CAP:]


def _build_lookahead(
    start_id: str,
    base_history: list[str],
    queue_prefix: list[str],
    nodes_by_id: dict,
    edge_dicts: list[dict],
    n: int,
) -> list[str]:
    """Simulate n future steps from start_id and return pre-committed node IDs."""
    history = list(base_history)
    for node_id in queue_prefix:
        history = (history + [node_id])[-HISTORY_CAP:]
    current_id = start_id
    result = []
    for _ in range(n):
        node = nodes_by_id.get(current_id)
        if not node:
            break
        next_id = get_next_node(
            current_node_id=current_id,
            edges=edge_dicts,
            wander_history=history,
        )
        result.append(next_id)
        history = (history + [next_id])[-HISTORY_CAP:]
        current_id = next_id
    return result


@router.post("", response_model=PlaybackSessionSchema, status_code=201)
def create_session(payload: SessionCreate, db: Session = Depends(get_db)):
    graph = db.query(Graph).filter(Graph.id == payload.graph_id).first()
    if not graph:
        raise HTTPException(status_code=404, detail="Graph not found")

    starting_node_id = payload.starting_node_id
    if not starting_node_id:
        node = db.query(Node).filter(Node.graph_id == payload.graph_id).first()
        if node:
            starting_node_id = node.id

    session = PlaybackSession(
        graph_id=payload.graph_id,
        current_node_id=starting_node_id,
        wander_history=[starting_node_id] if starting_node_id else [],
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


@router.get("/{session_id}", response_model=PlaybackSessionSchema)
def get_session(session_id: str, db: Session = Depends(get_db)):
    session = db.query(PlaybackSession).filter(PlaybackSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@router.post("/{session_id}/advance", response_model=AdvanceResponse)
def advance_session(session_id: str, db: Session = Depends(get_db)):
    session = db.query(PlaybackSession).filter(PlaybackSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if not session.current_node_id:
        raise HTTPException(status_code=400, detail="Session has no current node")

    queue = list(session.lookahead_queue or [])

    if session.nominated_next_node_id:
        # Steer nomination overrides the committed path — clear the queue
        next_node_id = session.nominated_next_node_id
        session.nominated_next_node_id = None
        session.lookahead_queue = []
    elif queue:
        next_node_id = queue.pop(0)
        session.lookahead_queue = queue
    else:
        # Fallback: queue empty (first advance before /lookahead, or after a clear)
        current_node = db.query(Node).filter(Node.id == session.current_node_id).first()
        if not current_node:
            raise HTTPException(status_code=400, detail="Current node not found")

        edges = db.query(Edge).filter(Edge.graph_id == session.graph_id).all()
        edge_dicts = [
            {
                "source_node_id": e.source_node_id,
                "target_node_id": e.target_node_id,
                "weight": e.weight,
                "bidirectional": e.bidirectional,
            }
            for e in edges
        ]

        next_node_id = get_next_node(
            current_node_id=session.current_node_id,
            edges=edge_dicts,
            wander_history=list(session.wander_history or []),
        )
        session.lookahead_queue = []

    next_node = db.query(Node).filter(Node.id == next_node_id).first()
    if not next_node:
        raise HTTPException(status_code=500, detail="Wander engine returned invalid node")

    session.current_node_id = next_node_id
    session.wander_history = _append_history(list(session.wander_history or []), next_node_id)
    session.updated_at = datetime.utcnow()
    db.commit()

    return AdvanceResponse(
        next_node_id=next_node_id,
        node_name=next_node.name,
        audio_file_path=next_node.audio_file_path,
    )


@router.patch("/{session_id}", response_model=PlaybackSessionSchema)
def update_session(session_id: str, payload: SessionUpdate, db: Session = Depends(get_db)):
    session = db.query(PlaybackSession).filter(PlaybackSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if payload.wander_active is not None:
        session.wander_active = payload.wander_active
    if payload.nominated_next_node_id is not None:
        # Validate the nominated node belongs to this graph
        node = db.query(Node).filter(
            Node.id == payload.nominated_next_node_id,
            Node.graph_id == session.graph_id,
        ).first()
        if not node:
            raise HTTPException(status_code=404, detail="Nominated node not found in this graph")
        session.nominated_next_node_id = payload.nominated_next_node_id
    elif "nominated_next_node_id" in payload.model_fields_set:
        # Explicit null — clear nomination
        session.nominated_next_node_id = None
    session.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(session)
    return session


@router.post("/{session_id}/lookahead", response_model=LookaheadResponse)
def lookahead_session(
    session_id: str,
    steps: int = 12,
    db: Session = Depends(get_db),
):
    """
    Return the pre-committed sequence of future wander steps, topping up the
    stored queue if it has fewer than LOOKAHEAD_TARGET items.
    """
    session = db.query(PlaybackSession).filter(PlaybackSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if not session.current_node_id:
        raise HTTPException(status_code=400, detail="Session has no current node")

    steps = max(1, min(steps, 50))

    graph = db.query(Graph).filter(Graph.id == session.graph_id).first()
    if not graph:
        raise HTTPException(status_code=404, detail="Graph not found")

    nodes_by_id = {n.id: n for n in graph.nodes}
    edge_dicts = [
        {
            "source_node_id": e.source_node_id,
            "target_node_id": e.target_node_id,
            "weight": e.weight,
            "bidirectional": e.bidirectional,
        }
        for e in graph.edges
    ]

    queue = list(session.lookahead_queue or [])
    if len(queue) < LOOKAHEAD_TARGET:
        sim_start = queue[-1] if queue else session.current_node_id
        new_ids = _build_lookahead(
            start_id=sim_start,
            base_history=list(session.wander_history or []),
            queue_prefix=queue,
            nodes_by_id=nodes_by_id,
            edge_dicts=edge_dicts,
            n=LOOKAHEAD_TARGET - len(queue),
        )
        queue.extend(new_ids)
        session.lookahead_queue = queue
        db.commit()

    result: list[LookaheadStep] = []
    for node_id in queue[:steps]:
        node = nodes_by_id.get(node_id)
        if not node:
            break
        result.append(LookaheadStep(
            node_id=node_id,
            node_name=node.name,
            region=node.region,
        ))

    return LookaheadResponse(steps=result)


@router.post("/{session_id}/teleport", response_model=PlaybackSessionSchema)
def teleport_session(session_id: str, payload: TeleportRequest, db: Session = Depends(get_db)):
    session = db.query(PlaybackSession).filter(PlaybackSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    node = db.query(Node).filter(
        Node.id == payload.node_id,
        Node.graph_id == session.graph_id,
    ).first()
    if not node:
        raise HTTPException(status_code=404, detail="Node not found in this graph")

    session.current_node_id = payload.node_id
    session.nominated_next_node_id = None
    session.lookahead_queue = []
    session.wander_history = _append_history(list(session.wander_history or []), payload.node_id)
    session.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(session)
    return session
