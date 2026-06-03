from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator


ReviewStatus = Literal["unreviewed", "included", "marked_for_removal"]


class AmbientAssetBase(BaseModel):
    """Shared fields for ambient asset create/update/read schemas."""

    name: str
    category: str
    tags: list[str] = []
    default_volume: float = Field(0.5, ge=0.0, le=1.0)
    play_probability: float = Field(1.0, ge=0.0, le=1.0)
    min_play_duration_s: float = Field(45.0, gt=0.0)
    max_play_duration_s: float = Field(120.0, gt=0.0)
    fade_in_ms: int = Field(2000, ge=0)
    fade_out_ms: int = Field(3000, ge=0)
    license: Optional[str] = None
    review_status: ReviewStatus = "unreviewed"

    @model_validator(mode="after")
    def _check_duration_range(self) -> "AmbientAssetBase":
        if self.min_play_duration_s > self.max_play_duration_s:
            raise ValueError("min_play_duration_s must be <= max_play_duration_s")
        return self


class AmbientAssetCreate(AmbientAssetBase):
    """Metadata for a new asset. The audio file is uploaded separately
    (see POST /ambient/assets — multipart form with `file` + `metadata` JSON)."""


class AmbientAssetUpdate(BaseModel):
    """All fields optional; only provided fields are applied."""
    name: Optional[str] = None
    category: Optional[str] = None
    tags: Optional[list[str]] = None
    default_volume: Optional[float] = Field(None, ge=0.0, le=1.0)
    play_probability: Optional[float] = Field(None, ge=0.0, le=1.0)
    min_play_duration_s: Optional[float] = Field(None, gt=0.0)
    max_play_duration_s: Optional[float] = Field(None, gt=0.0)
    fade_in_ms: Optional[int] = Field(None, ge=0)
    fade_out_ms: Optional[int] = Field(None, ge=0)
    license: Optional[str] = None
    review_status: Optional[ReviewStatus] = None


class AmbientAssetSchema(AmbientAssetBase):
    model_config = ConfigDict(from_attributes=True)
    id: str
    file_path: str
    created_at: datetime
