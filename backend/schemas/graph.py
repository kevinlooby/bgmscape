from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class NodeBase(BaseModel):
    name: str
    audio_file_path: Optional[str] = None
    region: Optional[str] = None
    canvas_x: float = 0.0
    canvas_y: float = 0.0
    loop_start: Optional[float] = None
    loop_end: Optional[float] = None
    is_transition: bool = False
    ambient_tags: list[str] = []


class NodeCreate(NodeBase):
    pass


class NodeUpdate(BaseModel):
    name: Optional[str] = None
    audio_file_path: Optional[str] = None
    region: Optional[str] = None
    canvas_x: Optional[float] = None
    canvas_y: Optional[float] = None
    loop_start: Optional[float] = None
    loop_end: Optional[float] = None
    is_transition: Optional[bool] = None
    ambient_tags: Optional[list[str]] = None


class NodeSchema(NodeBase):
    model_config = ConfigDict(from_attributes=True)
    id: str
    graph_id: str


class EdgeBase(BaseModel):
    source_node_id: str
    target_node_id: str
    weight: float = 1.0
    bidirectional: bool = True


class EdgeCreate(EdgeBase):
    pass


class EdgeUpdate(BaseModel):
    weight: Optional[float] = None
    bidirectional: Optional[bool] = None


class EdgeSchema(EdgeBase):
    model_config = ConfigDict(from_attributes=True)
    id: str
    graph_id: str


class GraphCreate(BaseModel):
    name: str
    game_id: str


class GraphUpdate(BaseModel):
    name: Optional[str] = None
    # game_id intentionally not editable here — moving a graph between games is
    # not a supported operation; recreate it under the target game instead.


class GraphListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    game_id: Optional[str] = None
    created_at: datetime
    node_count: int = 0


class GraphSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    game_id: Optional[str] = None
    created_at: datetime
    nodes: list[NodeSchema] = []
    edges: list[EdgeSchema] = []


class SessionCreate(BaseModel):
    graph_id: str
    starting_node_id: Optional[str] = None


class SessionUpdate(BaseModel):
    wander_active: Optional[bool] = None
    nominated_next_node_id: Optional[str] = None


class TeleportRequest(BaseModel):
    node_id: str


class AdvanceResponse(BaseModel):
    next_node_id: str
    node_name: str
    audio_file_path: Optional[str]


class PlaybackSessionSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    graph_id: str
    current_node_id: Optional[str]
    wander_active: bool
    nominated_next_node_id: Optional[str]
    wander_history: list[str]
    # Novelty + LRU state exposed for debugging / API inspection. The
    # frontend doesn't need these — the planner runs server-side — but
    # surfacing them keeps the session model transparent.
    node_last_visited: dict[str, int] = {}
    step_index: int = 0
    created_at: datetime
    updated_at: datetime


class AudioUploadResponse(BaseModel):
    file_path: str
    filename: str
    size_bytes: int


class LoopAnalysisResult(BaseModel):
    loop_start: float
    loop_end: float
    duration: float
    confidence: float


# ── Graph export / import ────────────────────────────────────────────────────

class NodeExport(BaseModel):
    """Node representation for export (omits audio path — files are local)."""
    model_config = ConfigDict(extra='ignore')
    id: str
    name: str
    region: Optional[str] = None
    canvas_x: float
    canvas_y: float
    loop_start: Optional[float] = None
    loop_end: Optional[float] = None
    is_transition: bool = False
    ambient_tags: list[str] = []


class EdgeExport(BaseModel):
    id: str
    source_node_id: str
    target_node_id: str
    weight: float
    bidirectional: bool


class GraphExport(BaseModel):
    """Self-contained graph definition for JSON export/import.

    `game_slug` is the canonical way to attach an imported graph to a game.
    `game_title` is accepted for backward compatibility with pre-game-entity
    export files; if no slug matches, the importer falls back to looking up a
    Game by name. New exports always include `game_slug`.
    """
    model_config = ConfigDict(extra='ignore')
    version: str = "1"
    name: str
    game_slug: Optional[str] = None
    game_title: Optional[str] = None
    nodes: list[NodeExport]
    edges: list[EdgeExport]


# ── Lookahead ────────────────────────────────────────────────────────────────

class LookaheadStep(BaseModel):
    node_id: str
    node_name: str
    region: Optional[str]
    # Needed by the frontend's cluster-aware dwell scheduler: when several
    # adjacent lookahead steps share the same audio_file_path they're
    # treated as one "cluster" and given a compressed total listening
    # budget (logarithmic) split evenly across the nodes. Without this on
    # the step payload, the scheduler can't see clusters ahead of time.
    audio_file_path: Optional[str] = None


class LookaheadResponse(BaseModel):
    steps: list[LookaheadStep]
