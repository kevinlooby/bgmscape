from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, Float, Integer, JSON, String, DateTime
from sqlalchemy.orm import Mapped, mapped_column

from backend.db.base import Base


class AmbientAsset(Base):
    """A single ambient/atmospheric audio asset in the global library.

    Ambient assets are global (no game_id) — the same wind loop can play in
    any game's "field" location. They live on disk under
    `{AUDIO_STORAGE_PATH}/_ambient/{filename}`; the `_ambient` prefix cannot
    collide with a game_id because game IDs are UUIDs.
    """

    __tablename__ = "ambient_assets"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String, nullable=False)
    file_path: Mapped[str] = mapped_column(String, nullable=False)
    category: Mapped[str] = mapped_column(String, nullable=False, index=True)
    # Free-form list of strings; matched against Node.ambient_tags at runtime.
    tags: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    default_volume: Mapped[float] = mapped_column(Float, default=0.5, nullable=False)
    play_probability: Mapped[float] = mapped_column(Float, default=1.0, nullable=False)
    min_play_duration_s: Mapped[float] = mapped_column(Float, default=45.0, nullable=False)
    max_play_duration_s: Mapped[float] = mapped_column(Float, default=120.0, nullable=False)
    fade_in_ms: Mapped[int] = mapped_column(Integer, default=2000, nullable=False)
    fade_out_ms: Mapped[int] = mapped_column(Integer, default=3000, nullable=False)
    # License is captured so future distribution decisions can filter
    # (e.g. "drop all non-CC0 for app-store build"). Free-form string.
    license: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    # Vetting state set from the Vetting tab in /ambient. `marked_for_removal`
    # is excluded by the runtime ambient engine (selectActiveAssets) so the
    # listener stops hearing the track immediately, before deletion.
    review_status: Mapped[str] = mapped_column(String(20), nullable=False, default="unreviewed")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    def __repr__(self) -> str:
        return f"<AmbientAsset id={self.id} name={self.name!r} category={self.category!r}>"
