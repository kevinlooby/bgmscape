from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

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
from backend.services.wander import plan_path, plan_step

router = APIRouter(prefix="/sessions", tags=["sessions"])

# wander_history is kept as a recent-visits display log (used by the
# breadcrumb trail UI). The actual novelty / LRU decisions are driven by
# `node_last_visited` + `step_index`, which together cover every node
# visited in the session — much more than HISTORY_CAP can hold.
HISTORY_CAP = 10
LOOKAHEAD_TARGET = 16


def _append_history(history: list[str], node_id: str) -> list[str]:
    updated = list(history) + [node_id]
    return updated[-HISTORY_CAP:]


def _edges_for(graph: Graph) -> list[dict]:
    return [
        {
            "source_node_id": e.source_node_id,
            "target_node_id": e.target_node_id,
            "weight": e.weight,
            "bidirectional": e.bidirectional,
        }
        for e in graph.edges
    ]


def _mark_visited(session: PlaybackSession, node_id: str) -> None:
    """
    Increment the session step counter and record this node's visit.

    Using a fresh dict assignment (rather than in-place mutation of the
    existing JSON column value) is what triggers SQLAlchemy's change
    tracking on JSON-typed columns — otherwise the update silently
    doesn't persist. ``flag_modified`` covers the in-place case as a
    belt-and-braces safeguard.
    """
    session.step_index = (session.step_index or 0) + 1
    visited = dict(session.node_last_visited or {})
    visited[node_id] = session.step_index
    session.node_last_visited = visited
    flag_modified(session, "node_last_visited")


def _refill_lookahead(
    session: PlaybackSession,
    graph: Graph,
    *,
    target: int = LOOKAHEAD_TARGET,
) -> None:
    """
    Top up session.lookahead_queue to ``target`` items by planning from the
    last committed step (or from current_node_id when the queue is empty).

    Uses a scratch copy of the session's visited set / LRU map that already
    accounts for the items currently in the queue, so the new plan doesn't
    re-suggest them.
    """
    queue = list(session.lookahead_queue or [])
    needed = target - len(queue)
    if needed <= 0:
        return

    start_id = queue[-1] if queue else session.current_node_id
    if not start_id:
        return

    # Project the session state forward to account for already-queued items.
    sim_visited = set((session.node_last_visited or {}).keys())
    sim_lru = dict(session.node_last_visited or {})
    step = session.step_index or 0
    for q_id in queue:
        step += 1
        sim_visited.add(q_id)
        sim_lru[q_id] = step

    new_ids = plan_path(
        current_node_id=start_id,
        edges=_edges_for(graph),
        visited=sim_visited,
        last_visited_step=sim_lru,
        start_step=step + 1,
        horizon=needed,
    )
    if not new_ids:
        return
    session.lookahead_queue = queue + new_ids


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
        # The starting node counts as the first visit so the planner won't
        # immediately suggest it again.
        node_last_visited={starting_node_id: 1} if starting_node_id else {},
        step_index=1 if starting_node_id else 0,
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
        # so the next refill starts from the steered destination.
        next_node_id = session.nominated_next_node_id
        session.nominated_next_node_id = None
        session.lookahead_queue = []
    elif queue:
        next_node_id = queue.pop(0)
        session.lookahead_queue = queue
    else:
        # Queue empty (first advance before /lookahead has been called, or
        # right after a steer/teleport cleared it) — plan one step live.
        graph = db.query(Graph).filter(Graph.id == session.graph_id).first()
        if not graph:
            raise HTTPException(status_code=404, detail="Graph not found")
        next_node_id = plan_step(
            current_node_id=session.current_node_id,
            edges=_edges_for(graph),
            visited=set((session.node_last_visited or {}).keys()),
            last_visited_step=dict(session.node_last_visited or {}),
        )

    next_node = db.query(Node).filter(Node.id == next_node_id).first()
    if not next_node:
        raise HTTPException(status_code=500, detail="Wander engine returned invalid node")

    session.current_node_id = next_node_id
    session.wander_history = _append_history(list(session.wander_history or []), next_node_id)
    _mark_visited(session, next_node_id)

    # Top the queue back up so the visible lookahead never empties out and
    # so the next advance has cheap state to consume. Only do the extra
    # graph load if we actually need to refill.
    if len(list(session.lookahead_queue or [])) < LOOKAHEAD_TARGET:
        graph = db.query(Graph).filter(Graph.id == session.graph_id).first()
        if graph:
            _refill_lookahead(session, graph)

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
        # A steer invalidates the pre-planned path — clear it so the next
        # /lookahead call replans from the steered destination.
        session.lookahead_queue = []
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

    _refill_lookahead(session, graph)
    db.commit()

    queue = list(session.lookahead_queue or [])

    result: list[LookaheadStep] = []
    for node_id in queue[:steps]:
        node = nodes_by_id.get(node_id)
        if not node:
            break
        result.append(LookaheadStep(
            node_id=node_id,
            node_name=node.name,
            region=node.region,
            audio_file_path=node.audio_file_path,
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
    # A teleport is the user expressing intent to visit a specific node —
    # it counts as a visit for novelty purposes.
    _mark_visited(session, payload.node_id)
    session.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(session)
    return session
