from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class GameCreate(BaseModel):
    name: str
    slug: str


class GameUpdate(BaseModel):
    name: Optional[str] = None
    slug: Optional[str] = None
    default_graph_id: Optional[str] = None


class GameGraphSummary(BaseModel):
    """A graph belonging to a game, summarized for the game-detail view."""
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    created_at: datetime
    node_count: int = 0
    is_default: bool = False


class GameListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    slug: str
    default_graph_id: Optional[str] = None
    graph_count: int = 0
    created_at: datetime


class GameSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    slug: str
    default_graph_id: Optional[str] = None
    created_at: datetime
    graphs: list[GameGraphSummary] = []
