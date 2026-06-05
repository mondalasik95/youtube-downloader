"""Pydantic models for the YouTube Downloader API."""

from __future__ import annotations

from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field, field_validator
import re


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

class FormatType(str, Enum):
    VIDEO_AUDIO = "Video + Audio"
    VIDEO_ONLY = "Video Only"
    AUDIO_ONLY = "Audio Only"


class DownloadAction(str, Enum):
    SELECTED = "selected"
    BEST = "best"
    BEST_MP4 = "best_mp4"
    AUDIO_ONLY = "audio_only"
    MERGE = "merge"


class DownloadStatus(str, Enum):
    QUEUED = "queued"
    DOWNLOADING = "downloading"
    MERGING = "merging"
    COMPLETE = "complete"
    ERROR = "error"


# ---------------------------------------------------------------------------
# Request models
# ---------------------------------------------------------------------------

class VideoInfoRequest(BaseModel):
    url: str = Field(..., description="YouTube video URL")

    @field_validator("url")
    @classmethod
    def validate_youtube_url(cls, v: str) -> str:
        patterns = [
            r"(https?://)?(www\.)?youtube\.com/watch\?v=[\w-]+",
            r"(https?://)?(www\.)?youtube\.com/shorts/[\w-]+",
            r"(https?://)?(www\.)?youtube\.com/playlist\?list=[\w-]+",
            r"(https?://)?youtu\.be/[\w-]+",
            r"(https?://)?(www\.)?youtube\.com/embed/[\w-]+",
            r"(https?://)?m\.youtube\.com/watch\?v=[\w-]+",
            r"^ytsearch\d*:.*"  # Allow native ytsearch queries
        ]
        if not any(re.match(p, v.strip()) for p in patterns):
            raise ValueError("Invalid YouTube URL")
        return v.strip()


class DownloadRequest(BaseModel):
    url: str
    action: DownloadAction = DownloadAction.SELECTED
    format_id: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    download_subtitles: bool = False
    title: Optional[str] = None
    thumbnail: Optional[str] = None


# ---------------------------------------------------------------------------
# Response models
# ---------------------------------------------------------------------------

class FormatInfo(BaseModel):
    format_id: str
    resolution: str = "N/A"
    container: str = "N/A"
    filesize: Optional[int] = None
    filesize_approx: Optional[int] = None
    vcodec: str = "none"
    acodec: str = "none"
    fps: Optional[float] = None
    type_label: FormatType = FormatType.VIDEO_AUDIO
    tbr: Optional[float] = None
    abr: Optional[float] = None
    vbr: Optional[float] = None
    width: Optional[int] = None
    height: Optional[int] = None

    @property
    def effective_filesize(self) -> Optional[int]:
        return self.filesize or self.filesize_approx


class VideoInfoResponse(BaseModel):
    id: Optional[str] = None
    title: str
    thumbnail: str
    duration: int = 0
    duration_string: str = "0:00"
    channel: str = "Unknown"
    view_count: Optional[int] = None
    upload_date: Optional[str] = None
    formats: list[FormatInfo] = []
    url: Optional[str] = None  # To track the URL in playlists

class PlaylistResponse(BaseModel):
    title: str
    entries: list[VideoInfoResponse] = []
    extractor: Optional[str] = None
    id: Optional[str] = None


class DownloadProgress(BaseModel):
    task_id: str
    status: DownloadStatus = DownloadStatus.QUEUED
    percentage: float = 0.0
    speed: str = ""
    eta: str = ""
    filename: str = ""
    message: str = ""


class ErrorResponse(BaseModel):
    error: str
    error_type: str = "unknown"

class HistoryItem(BaseModel):
    title: str
    url: str
    thumbnail: str
    filepath: str
    download_date: str
