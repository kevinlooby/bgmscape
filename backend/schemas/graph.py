from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class NodeBase(BaseModel):
    name: str
    audio_file_path: Optional[str] = None
    stay_probability: float = 0.3
    region: Optional[str] = None
    canvas_x: float = 0.0
    canvas_y: float = 0.0
    loop_start: Optional[float] = None
    loop_end: Optional[float] = None


class NodeCreate(NodeBase):
    pass


class NodeUpdate(BaseModel):
    name: Optional[str] = None
    audio_file_path: Optional[str] = None
    stay_probability: Optional[float] = None
    region: Optional[str] = None
    canvas_x: Optional[float] = None
    canvas_y: Optional[float] = None
    loop_start: Optional[float] = None
    loop_end: Optional[float] = None


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


class GraphBase(BaseModel):
    name: str
    game_title: str


class GraphCreate(GraphBase):
    pass


class GraphUpdate(BaseModel):
    name: Optional[str] = None
    game_title: Optional[str] = None


class GraphListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    game_title: str
    created_at: datetime
    node_count: int = 0


class GraphSchema(GraphBase):
    model_config = ConfigDict(from_attributes=True)
    id: str
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
    id: str
    name: str
    stay_probability: float
    region: Optional[str] = None
    canvas_x: float
    canvas_y: float
    loop_start: Optional[float] = None
    loop_end: Optional[float] = None


class EdgeExport(BaseModel):
    id: str
    source_node_id: str
    target_node_id: str
    weight: float
    bidirectional: bool


class GraphExport(BaseModel):
    """Self-contained graph definition for JSON export/import."""
    version: str = "1"
    name: str
    game_title: str
    nodes: list[NodeExport]
    edges: list[EdgeExport]
