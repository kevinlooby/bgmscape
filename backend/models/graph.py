from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, Float, ForeignKey, JSON, String, DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.db.base import Base


class Game(Base):
    __tablename__ = "games"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String, nullable=False)
    slug: Mapped[str] = mapped_column(String, nullable=False, unique=True, index=True)
    # Nullable so a game can exist before any graph is created under it.
    # The API rejects setting this to a graph that belongs to a different game.
    default_graph_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    graphs: Mapped[list["Graph"]] = relationship(
        "Graph",
        back_populates="game",
        cascade="all, delete-orphan",
        foreign_keys="Graph.game_id",
    )

    def __repr__(self) -> str:
        return f"<Game id={self.id} slug={self.slug!r}>"


class Graph(Base):
    __tablename__ = "graphs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String, nullable=False)
    # game_id may be temporarily nullable during the in-place migration from the
    # old schema. New rows always have it set; the migration script fills it
    # before any new writes happen, and the games API requires it on create.
    game_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("games.id"), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    game: Mapped[Optional[Game]] = relationship("Game", back_populates="graphs", foreign_keys=[game_id])
    nodes: Mapped[list[Node]] = relationship("Node", back_populates="graph", cascade="all, delete-orphan", foreign_keys="Node.graph_id")
    edges: Mapped[list[Edge]] = relationship("Edge", back_populates="graph", cascade="all, delete-orphan")

    def __repr__(self) -> str:
        return f"<Graph id={self.id} name={self.name!r}>"


class Node(Base):
    __tablename__ = "nodes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    graph_id: Mapped[str] = mapped_column(String(36), ForeignKey("graphs.id"), nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    audio_file_path: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    region: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    canvas_x: Mapped[float] = mapped_column(Float, default=0.0)
    canvas_y: Mapped[float] = mapped_column(Float, default=0.0)
    # Loop points in seconds (set manually or via auto-detection)
    loop_start: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    loop_end: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    graph: Mapped[Graph] = relationship("Graph", back_populates="nodes", foreign_keys=[graph_id])

    def __repr__(self) -> str:
        return f"<Node id={self.id} name={self.name!r}>"


class Edge(Base):
    __tablename__ = "edges"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    graph_id: Mapped[str] = mapped_column(String(36), ForeignKey("graphs.id"), nullable=False)
    source_node_id: Mapped[str] = mapped_column(String(36), ForeignKey("nodes.id"), nullable=False)
    target_node_id: Mapped[str] = mapped_column(String(36), ForeignKey("nodes.id"), nullable=False)
    weight: Mapped[float] = mapped_column(Float, default=1.0)
    bidirectional: Mapped[bool] = mapped_column(Boolean, default=True)

    graph: Mapped[Graph] = relationship("Graph", back_populates="edges")

    def __repr__(self) -> str:
        return f"<Edge id={self.id} {self.source_node_id} -> {self.target_node_id}>"


class PlaybackSession(Base):
    __tablename__ = "playback_sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    graph_id: Mapped[str] = mapped_column(String(36), ForeignKey("graphs.id"), nullable=False)
    current_node_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("nodes.id"), nullable=True)
    wander_active: Mapped[bool] = mapped_column(Boolean, default=False)
    nominated_next_node_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("nodes.id"), nullable=True)
    wander_history: Mapped[list] = mapped_column(JSON, default=list)
    lookahead_queue: Mapped[list] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def __repr__(self) -> str:
        return f"<PlaybackSession id={self.id} graph={self.graph_id}>"
