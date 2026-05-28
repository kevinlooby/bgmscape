from __future__ import annotations

import json
import mimetypes
from pathlib import Path
from typing import Optional

import aiofiles
from fastapi import APIRouter, Depends, Form, HTTPException, Request, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import ValidationError
from sqlalchemy.orm import Session

from backend.api.deps import get_db
from backend.api.routes.audio import _is_audio
from backend.config import settings
from backend.models.ambient import AmbientAsset
from backend.models.graph import Node
from backend.schemas.ambient import (
    AmbientAssetCreate,
    AmbientAssetSchema,
    AmbientAssetUpdate,
)

router = APIRouter(prefix="/ambient", tags=["ambient"])

CHUNK_SIZE = 1024 * 256  # 256 KB

# Storage prefix under AUDIO_STORAGE_PATH. The leading underscore makes it
# impossible to collide with a game_id (which is always a 36-char UUID).
AMBIENT_FOLDER = "_ambient"


def _ambient_dir() -> Path:
    return Path(settings.AUDIO_STORAGE_PATH) / AMBIENT_FOLDER


# ── List / get ────────────────────────────────────────────────────────────────

@router.get("/assets", response_model=list[AmbientAssetSchema])
def list_assets(db: Session = Depends(get_db)):
    return db.query(AmbientAsset).order_by(AmbientAsset.created_at).all()


@router.get("/assets/{asset_id}", response_model=AmbientAssetSchema)
def get_asset(asset_id: str, db: Session = Depends(get_db)):
    asset = db.query(AmbientAsset).filter(AmbientAsset.id == asset_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Ambient asset not found")
    return asset


# ── Tags autocomplete ─────────────────────────────────────────────────────────

@router.get("/tags", response_model=list[str])
def list_tags(db: Session = Depends(get_db)):
    """Distinct tag list across all assets and all node ambient_tags.

    Used by the editor's ambient-tag picker for autocomplete suggestions.
    Authors can still type new tags freely.
    """
    seen: set[str] = set()
    for asset in db.query(AmbientAsset).all():
        for tag in asset.tags or []:
            seen.add(tag)
    for node in db.query(Node).all():
        for tag in node.ambient_tags or []:
            seen.add(tag)
    return sorted(seen)


# ── Create / update / delete ─────────────────────────────────────────────────

@router.post("/assets", response_model=AmbientAssetSchema, status_code=201)
async def create_asset(
    file: UploadFile,
    metadata: str = Form(...),
    db: Session = Depends(get_db),
):
    """Create a new ambient asset.

    Multipart form: `file` (audio file) + `metadata` (JSON-encoded
    AmbientAssetCreate). Writes the file under `{AUDIO_STORAGE_PATH}/_ambient/`.
    """
    try:
        payload_dict = json.loads(metadata)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=422, detail=f"metadata must be valid JSON: {exc}") from exc
    try:
        payload = AmbientAssetCreate.model_validate(payload_dict)
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=exc.errors()) from exc

    content_type = file.content_type or ""
    if not _is_audio(content_type, file.filename or ""):
        raise HTTPException(status_code=422, detail="File must be an audio file (audio/* MIME type)")

    dest_dir = _ambient_dir()
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest_path = dest_dir / file.filename
    if dest_path.exists():
        raise HTTPException(
            status_code=409,
            detail=f"An ambient file named '{file.filename}' already exists",
        )

    content = await file.read()
    async with aiofiles.open(dest_path, "wb") as f:
        await f.write(content)

    relative_path = f"{AMBIENT_FOLDER}/{file.filename}"
    asset = AmbientAsset(
        file_path=relative_path,
        **payload.model_dump(),
    )
    db.add(asset)
    db.commit()
    db.refresh(asset)
    return asset


@router.patch("/assets/{asset_id}", response_model=AmbientAssetSchema)
def update_asset(asset_id: str, payload: AmbientAssetUpdate, db: Session = Depends(get_db)):
    asset = db.query(AmbientAsset).filter(AmbientAsset.id == asset_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Ambient asset not found")

    updates = payload.model_dump(exclude_unset=True)
    # Validate min<=max against the post-update combined view, not just the
    # subset provided in the patch.
    new_min = updates.get("min_play_duration_s", asset.min_play_duration_s)
    new_max = updates.get("max_play_duration_s", asset.max_play_duration_s)
    if new_min > new_max:
        raise HTTPException(
            status_code=422,
            detail="min_play_duration_s must be <= max_play_duration_s",
        )

    for field, value in updates.items():
        setattr(asset, field, value)
    db.commit()
    db.refresh(asset)
    return asset


@router.delete("/assets/{asset_id}", status_code=204)
def delete_asset(asset_id: str, db: Session = Depends(get_db)):
    asset = db.query(AmbientAsset).filter(AmbientAsset.id == asset_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Ambient asset not found")

    file_path = Path(settings.AUDIO_STORAGE_PATH) / asset.file_path
    db.delete(asset)
    db.commit()

    if file_path.exists():
        try:
            file_path.unlink()
        except OSError:
            pass


# ── Streaming (range-aware, mirrors audio.py) ────────────────────────────────

@router.get("/assets/{asset_id}/file")
async def stream_asset(asset_id: str, request: Request, db: Session = Depends(get_db)):
    asset = db.query(AmbientAsset).filter(AmbientAsset.id == asset_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Ambient asset not found")

    file_path = Path(settings.AUDIO_STORAGE_PATH) / asset.file_path
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Ambient file missing from disk")

    file_size = file_path.stat().st_size
    content_type, _ = mimetypes.guess_type(str(file_path))
    content_type = content_type or "audio/mpeg"

    range_header = request.headers.get("Range")
    if range_header:
        range_value = range_header.strip().replace("bytes=", "")
        parts = range_value.split("-")
        start = int(parts[0]) if parts[0] else 0
        end = int(parts[1]) if parts[1] else file_size - 1
        end = min(end, file_size - 1)
        content_length = end - start + 1

        async def ranged_file_sender():
            async with aiofiles.open(file_path, "rb") as f:
                await f.seek(start)
                remaining = content_length
                while remaining > 0:
                    chunk = await f.read(min(CHUNK_SIZE, remaining))
                    if not chunk:
                        break
                    remaining -= len(chunk)
                    yield chunk

        return StreamingResponse(
            ranged_file_sender(),
            status_code=206,
            media_type=content_type,
            headers={
                "Content-Range": f"bytes {start}-{end}/{file_size}",
                "Accept-Ranges": "bytes",
                "Content-Length": str(content_length),
            },
        )

    async def full_file_sender():
        async with aiofiles.open(file_path, "rb") as f:
            while chunk := await f.read(CHUNK_SIZE):
                yield chunk

    return StreamingResponse(
        full_file_sender(),
        media_type=content_type,
        headers={
            "Accept-Ranges": "bytes",
            "Content-Length": str(file_size),
        },
    )
