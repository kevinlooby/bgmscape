from __future__ import annotations

import mimetypes
from pathlib import Path

import aiofiles
from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from backend.api.deps import get_db
from backend.config import settings
from backend.models.graph import Graph
from backend.schemas.graph import AudioUploadResponse, LoopAnalysisResult

router = APIRouter(prefix="/audio", tags=["audio"])

CHUNK_SIZE = 1024 * 256  # 256 KB


@router.post("/{graph_id}/upload", response_model=AudioUploadResponse, status_code=201)
async def upload_audio(graph_id: str, file: UploadFile, db: Session = Depends(get_db)):
    graph = db.query(Graph).filter(Graph.id == graph_id).first()
    if not graph:
        raise HTTPException(status_code=404, detail="Graph not found")

    content_type = file.content_type or ""
    if not content_type.startswith("audio/"):
        raise HTTPException(status_code=422, detail="File must be an audio file (audio/* MIME type)")

    dest_dir = Path(settings.AUDIO_STORAGE_PATH) / graph_id
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest_path = dest_dir / file.filename

    content = await file.read()
    async with aiofiles.open(dest_path, "wb") as f:
        await f.write(content)

    relative_path = f"{graph_id}/{file.filename}"
    return AudioUploadResponse(
        file_path=relative_path,
        filename=file.filename,
        size_bytes=len(content),
    )


@router.get("/{graph_id}/{filename}")
async def stream_audio(graph_id: str, filename: str, request: Request):
    file_path = Path(settings.AUDIO_STORAGE_PATH) / graph_id / filename
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


@router.delete("/{graph_id}/{filename}", status_code=204)
async def delete_audio(graph_id: str, filename: str):
    file_path = Path(settings.AUDIO_STORAGE_PATH) / graph_id / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Audio file not found")
    file_path.unlink()


@router.post("/{graph_id}/{filename}/analyze", response_model=LoopAnalysisResult)
async def analyze_loop(graph_id: str, filename: str):
    """
    Run loop-point detection on an uploaded audio file.
    Returns loop_start, loop_end (seconds), duration, and confidence (0–1).
    Requires librosa to be installed in the backend environment.
    """
    file_path = Path(settings.AUDIO_STORAGE_PATH) / graph_id / filename
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
