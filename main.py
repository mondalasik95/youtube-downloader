"""FastAPI application — YouTube Downloader local server."""

from __future__ import annotations

import asyncio
import logging
import uuid
import json
import os
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from typing import Any, AsyncGenerator

import uvicorn
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import ValidationError
from sse_starlette.sse import EventSourceResponse  # type: ignore[import-untyped]

from downloader import (
    check_ffmpeg,
    check_ytdlp,
    download_and_merge,
    download_audio_only,
    download_best,
    download_best_mp4,
    download_format,
    fetch_video_info,
)
from models import (
    DownloadAction,
    DownloadProgress,
    DownloadRequest,
    DownloadStatus,
    ErrorResponse,
    VideoInfoRequest,
    HistoryItem,
)

# ---------------------------------------------------------------------------
# History File Management
# ---------------------------------------------------------------------------
HISTORY_DIR = "history"

if not os.path.exists(HISTORY_DIR):
    os.makedirs(HISTORY_DIR)


def _load_history_file(filepath: str) -> list[dict]:
    if not os.path.exists(filepath):
        return []
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return []


def _save_history(item: HistoryItem) -> None:
    date_str = datetime.now().strftime("%Y-%m-%d")
    filepath = os.path.join(HISTORY_DIR, f"{date_str}.json")

    history = _load_history_file(filepath)

    # Deduplicate: remove existing entry with same URL
    history = [h for h in history if h.get("url") != item.url]

    # Add new entry at top
    history.insert(0, item.model_dump())

    with open(filepath, "w", encoding="utf-8") as f:
        # compact dump for performance; change to indent=2 for readability if needed
        json.dump(history, f, separators=(',', ':'))

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
)
logger = logging.getLogger("youtube-downloader")

# ---------------------------------------------------------------------------
# In-memory task store (use asyncio.Queue for cross-thread signaling)
# ---------------------------------------------------------------------------

_task_queues: dict[str, asyncio.Queue[DownloadProgress]] = {}
_cancel_flags: dict[str, bool] = {}
_executor = ThreadPoolExecutor(max_workers=4)


def _progress_callback(task_id: str, loop: asyncio.AbstractEventLoop) -> Any:
    """Return a callback that schedules progress updates onto the event loop queue for *task_id*."""

    def _cb(progress: DownloadProgress) -> None:
        if _cancel_flags.get(task_id):
            raise ValueError("CANCELLED_BY_USER")

        queue = _task_queues.get(task_id)
        if queue is None:
            # No consumer available; drop update
            return

        # Schedule putting into the asyncio.Queue from the worker thread
        loop.call_soon_threadsafe(queue.put_nowait, progress)

    return _cb


async def _delayed_cleanup(task_id: str, delay: float = 60.0) -> None:
    """Remove task state after a delay to allow clients to fetch final state."""
    await asyncio.sleep(delay)
    _task_queues.pop(task_id, None)
    _cancel_flags.pop(task_id, None)

# ---------------------------------------------------------------------------
# Lifespan
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    logger.info("YouTube Downloader server starting…")
    yield
    _executor.shutdown(wait=False, cancel_futures=True)
    logger.info("Server shut down.")


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = FastAPI(
    title="YouTube Downloader",
    version="1.0.0",
    lifespan=lifespan,
)

# Serve static files
app.mount("/static", StaticFiles(directory="static"), name="static")


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/", response_class=HTMLResponse)
async def index() -> FileResponse:
    """Serve the single-page frontend using FileResponse (non-blocking file handling).

    StaticFiles is already mounted at /static so we serve the single page directly
    to avoid blocking the event loop with open(...).read().
    """
    return FileResponse("static/index.html", media_type="text/html")


@app.get("/api/check-deps")
async def check_deps() -> dict[str, Any]:
    """Check whether FFmpeg and yt-dlp are available without blocking the event loop."""
    ffmpeg_task = asyncio.to_thread(check_ffmpeg)
    ytdlp_task = asyncio.to_thread(check_ytdlp)
    ffmpeg, ytdlp = await asyncio.gather(ffmpeg_task, ytdlp_task)
    return {
        "ffmpeg": ffmpeg,
        "ytdlp": ytdlp,
    }


@app.get("/api/history")
async def get_history() -> list[dict[str, Any]]:
    """Return download history grouped by date."""
    if not os.path.exists(HISTORY_DIR):
        return []

    files = await asyncio.to_thread(lambda: [f for f in os.listdir(HISTORY_DIR) if f.endswith('.json')])
    files.sort(reverse=True)  # Newest dates first

    grouped: list[dict[str, Any]] = []
    for f in files:
        date_str = f.replace(".json", "")
        filepath = os.path.join(HISTORY_DIR, f)
        items = await asyncio.to_thread(_load_history_file, filepath)
        if items:
            grouped.append({
                "date": date_str,
                "items": items,
            })
    return grouped


@app.post("/api/info")
async def video_info(req: VideoInfoRequest) -> Any:
    """Fetch video metadata and available formats."""
    try:
        loop = asyncio.get_running_loop()
        info = await loop.run_in_executor(_executor, fetch_video_info, req.url)
        return info.model_dump()
    except ValueError as exc:
        msg = str(exc)
        if "::" in msg:
            error_type, friendly = msg.split("::", 1)
            raise HTTPException(status_code=400, detail={"error": friendly, "error_type": error_type})
        raise HTTPException(status_code=400, detail={"error": msg, "error_type": "validation"})
    except Exception as exc:
        logger.exception("Error fetching video info")
        raise HTTPException(status_code=500, detail={"error": str(exc), "error_type": "unknown"})


@app.post("/api/download/cancel/{task_id}")
async def cancel_download(task_id: str) -> dict[str, str]:
    """Flag a download task to be cancelled."""
    if task_id in _task_queues:
        _cancel_flags[task_id] = True
        return {"status": "cancelling"}
    raise HTTPException(status_code=404, detail={"error": "Task not found"})


@app.post("/api/download")
async def start_download(req: DownloadRequest) -> dict[str, str]:
    """Start a download task and return its task_id."""
    task_id = uuid.uuid4().hex[:12]

    # Create per-task queue for progress; this is safe to do on the event loop
    _task_queues[task_id] = asyncio.Queue()
    _cancel_flags[task_id] = False

    loop = asyncio.get_running_loop()

    def _run() -> None:
        cb = _progress_callback(task_id, loop)
        try:
            kwargs = {
                "start_time": req.start_time,
                "end_time": req.end_time,
                "download_subtitles": req.download_subtitles,
            }
            if req.action == DownloadAction.BEST:
                filepath = download_best(req.url, task_id, cb, **kwargs)
            elif req.action == DownloadAction.BEST_MP4:
                filepath = download_best_mp4(req.url, task_id, cb, **kwargs)
            elif req.action == DownloadAction.AUDIO_ONLY:
                filepath = download_audio_only(req.url, task_id, cb, start_time=req.start_time, end_time=req.end_time)
            elif req.action == DownloadAction.MERGE:
                if not req.format_id:
                    cb(DownloadProgress(
                        task_id=task_id,
                        status=DownloadStatus.ERROR,
                        message="No format ID provided for merge",
                    ))
                    return
                filepath = download_and_merge(req.url, req.format_id, task_id, cb, **kwargs)
            else:
                # SELECTED
                if not req.format_id:
                    cb(DownloadProgress(
                        task_id=task_id,
                        status=DownloadStatus.ERROR,
                        message="No format ID selected",
                    ))
                    return
                filepath = download_format(req.url, req.format_id, task_id, cb, **kwargs)

            # Save to history off the event loop
            title = req.title or "Unknown Title"
            thumbnail = req.thumbnail or ""
            history_item = HistoryItem(
                title=title,
                url=req.url,
                thumbnail=thumbnail,
                filepath=filepath,
                download_date=datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            )

            # Schedule saving history on the main loop (which will delegate to a thread)
            loop.call_soon_threadsafe(asyncio.create_task, asyncio.to_thread(_save_history, history_item))

            # Emit final COMPLETE progress
            cb(DownloadProgress(
                task_id=task_id,
                status=DownloadStatus.COMPLETE,
                percentage=100,
                message="Download complete!",
                filename=filepath,
            ))

            # Schedule delayed cleanup in case no client connects to SSE
            loop.call_soon_threadsafe(asyncio.create_task, _delayed_cleanup(task_id))

        except ValueError as exc:
            if str(exc) == "CANCELLED_BY_USER":
                logger.info("Download cancelled for task %s", task_id)
                _cancel_flags[task_id] = False
                cb(DownloadProgress(
                    task_id=task_id,
                    status=DownloadStatus.ERROR,
                    message="Download cancelled by user.",
                ))
            else:
                logger.exception("Download validation error for task %s", task_id)
                _cancel_flags[task_id] = False
                cb(DownloadProgress(
                    task_id=task_id,
                    status=DownloadStatus.ERROR,
                    message=f"Download failed: {exc}",
                ))
        except Exception as exc:
            logger.exception("Download error for task %s", task_id)
            _cancel_flags[task_id] = False
            cb(DownloadProgress(
                task_id=task_id,
                status=DownloadStatus.ERROR,
                message=f"Download failed: {exc}",
            ))

    loop.run_in_executor(_executor, _run)
    return {"task_id": task_id}


@app.get("/api/download/progress/{task_id}")
async def download_progress(task_id: str, request: Request) -> EventSourceResponse:
    """SSE endpoint streaming download progress for a given task using an asyncio.Queue."""

    queue = _task_queues.get(task_id)
    if queue is None:
        raise HTTPException(status_code=404, detail={"error": "Task not found"})

    async def event_generator() -> AsyncGenerator[dict[str, str], None]:
        while True:
            if await request.is_disconnected():
                break

            try:
                update: DownloadProgress = await queue.get()
            except asyncio.CancelledError:
                break

            yield {"data": update.model_dump_json()}

            if update.status in (DownloadStatus.COMPLETE, DownloadStatus.ERROR):
                # Clean up immediately
                _task_queues.pop(task_id, None)
                _cancel_flags.pop(task_id, None)
                return

    return EventSourceResponse(event_generator())


# ---------------------------------------------------------------------------
# Exception handlers
# ---------------------------------------------------------------------------

@app.exception_handler(ValidationError)
async def validation_error_handler(request: Request, exc: ValidationError) -> JSONResponse:
    errors = exc.errors()
    msg = errors[0].get("msg", "Validation error") if errors else "Validation error"
    return JSONResponse(
        status_code=422,
        content=ErrorResponse(error=str(msg), error_type="validation").model_dump(),
    )


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=False,
        log_level="info",
    )
