from __future__ import annotations

import mimetypes
from pathlib import Path

# Register FLAC MIME type — not present in the Windows system MIME database
mimetypes.add_type("audio/flac", ".flac")
mimetypes.add_type("audio/flac", ".FLAC")

import aiofiles
from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from backend.api.deps import get_db
from backend.config import settings
from backend.models.graph import Game
from backend.schemas.graph import AudioUploadResponse, LoopAnalysisResult

router = APIRouter(prefix="/audio", tags=["audio"])

CHUNK_SIZE = 1024 * 256  # 256 KB

_AUDIO_EXTS = {".mp3", ".flac", ".ogg", ".wav", ".aac", ".m4a", ".opus", ".wma", ".aiff"}


def _is_audio(content_type: str, filename: str) -> bool:
    ext = Path(filename or "").suffix.lower()
    return content_type.startswith("audio/") or ext in _AUDIO_EXTS


@router.post("/games/{game_id}/upload", response_model=AudioUploadResponse, status_code=201)
async def upload_audio_for_game(game_id: str, file: UploadFile, db: Session = Depends(get_db)):
    game = db.query(Game).filter(Game.id == game_id).first()
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")

    content_type = file.content_type or ""
    if not _is_audio(content_type, file.filename or ""):
        raise HTTPException(status_code=422, detail="File must be an audio file (audio/* MIME type)")

    dest_dir = Path(settings.AUDIO_STORAGE_PATH) / game_id
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest_path = dest_dir / file.filename

    content = await file.read()
    async with aiofiles.open(dest_path, "wb") as f:
        await f.write(content)

    relative_path = f"{game_id}/{file.filename}"
    return AudioUploadResponse(
        file_path=relative_path,
        filename=file.filename,
        size_bytes=len(content),
    )


@router.get("/{folder}/{filename}")
async def stream_audio(folder: str, filename: str, request: Request):
    """Stream an audio file from {AUDIO_STORAGE_PATH}/{folder}/{filename}.

    `folder` is treated as opaque — typically a game_id, but legacy callers
    that still hold a graph_id-keyed path will resolve correctly as long as
    the file exists on disk.
    """
    file_path = Path(settings.AUDIO_STORAGE_PATH) / folder / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Audio file not found")

    file_size = file_path.stat().st_size
    content_type, _ = mimetypes.guess_type(str(file_path))
    content_type = content_type or "audio/mpeg"

    range_header = request.headers.get("Range")
    if range_header:
        # Parse "bytes=start-end"
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

    # No range header — stream the full file
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


@router.delete("/{folder}/{filename}", status_code=204)
async def delete_audio(folder: str, filename: str):
    file_path = Path(settings.AUDIO_STORAGE_PATH) / folder / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Audio file not found")
    file_path.unlink()


@router.post("/{folder}/{filename}/analyze", response_model=LoopAnalysisResult)
async def analyze_loop(folder: str, filename: str):
    """
    Run loop-point detection on an uploaded audio file.
    Returns loop_start, loop_end (seconds), duration, and confidence (0–1).
    Requires librosa to be installed in the backend environment.
    """
    file_path = Path(settings.AUDIO_STORAGE_PATH) / folder / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Audio file not found")

    try:
        from backend.services.loop_detector import find_loop_point  # noqa: PLC0415
        result = await _run_in_thread(find_loop_point, str(file_path))
        return LoopAnalysisResult(**result)
    except ImportError as exc:
        raise HTTPException(
            status_code=503,
            detail=f"Loop detection unavailable: {exc}. Install librosa in the backend venv.",
        ) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Analysis failed: {exc}") from exc


async def _run_in_thread(fn, *args):
    """Run a blocking function in a thread pool so it doesn't block the event loop."""
    import asyncio
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, fn, *args)
