"""yt-dlp wrapper — metadata extraction, format classification, and download."""

from __future__ import annotations

import logging
import os
import re
import shutil
import subprocess
from pathlib import Path
from typing import Any, Callable, Optional

import yt_dlp

from models import (
    DownloadProgress,
    DownloadStatus,
    FormatInfo,
    FormatType,
    VideoInfoResponse,
    PlaylistResponse,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

DOWNLOAD_DIR = Path.home() / "Downloads" / "YTDownloader"
ANSI_ESCAPE = re.compile(r'\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])')


def ensure_download_dir() -> Path:
    """Create the download directory if it doesn't exist."""
    DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)
    return DOWNLOAD_DIR


# ---------------------------------------------------------------------------
# Dependency checks
# ---------------------------------------------------------------------------

def check_ffmpeg() -> bool:
    """Return True if FFmpeg is available on the system."""
    return shutil.which("ffmpeg") is not None


def check_ytdlp() -> bool:
    """Return True if yt-dlp is importable."""
    try:
        import yt_dlp as _  # noqa: F401
        return True
    except ImportError:
        return False


# ---------------------------------------------------------------------------
# Format classification
# ---------------------------------------------------------------------------

def classify_format(fmt: dict[str, Any]) -> FormatType:
    """Determine whether a format is Video+Audio, Video Only, or Audio Only."""
    vcodec = fmt.get("vcodec", "none") or "none"
    acodec = fmt.get("acodec", "none") or "none"

    has_video = vcodec != "none"
    has_audio = acodec != "none"

    if has_video and has_audio:
        return FormatType.VIDEO_AUDIO
    elif has_video and not has_audio:
        return FormatType.VIDEO_ONLY
    else:
        return FormatType.AUDIO_ONLY


def _parse_resolution(fmt: dict[str, Any]) -> str:
    """Build a human-readable resolution string."""
    height = fmt.get("height")
    width = fmt.get("width")
    if height and width:
        return f"{width}x{height}"
    if height:
        return f"{height}p"
    # For audio-only formats
    abr = fmt.get("abr")
    if abr:
        return f"{int(abr)}kbps"
    return "N/A"


def _build_format_info(fmt: dict[str, Any]) -> FormatInfo:
    """Convert a raw yt-dlp format dict into a FormatInfo model."""
    return FormatInfo(
        format_id=str(fmt.get("format_id", "")),
        resolution=_parse_resolution(fmt),
        container=fmt.get("ext", "N/A"),
        filesize=fmt.get("filesize"),
        filesize_approx=fmt.get("filesize_approx"),
        vcodec=fmt.get("vcodec", "none") or "none",
        acodec=fmt.get("acodec", "none") or "none",
        fps=fmt.get("fps"),
        type_label=classify_format(fmt),
        tbr=fmt.get("tbr"),
        abr=fmt.get("abr"),
        vbr=fmt.get("vbr"),
        width=fmt.get("width"),
        height=fmt.get("height"),
    )


# ---------------------------------------------------------------------------
# Metadata extraction
# ---------------------------------------------------------------------------

def _build_video_info(info: dict[str, Any]) -> VideoInfoResponse:
    raw_formats = info.get("formats") or []
    formats = [_build_format_info(f) for f in raw_formats if f.get("format_id")]

    duration = int(info.get("duration") or 0)
    minutes, seconds = divmod(duration, 60)
    hours, minutes = divmod(minutes, 60)
    if hours:
        duration_str = f"{hours}:{minutes:02d}:{seconds:02d}"
    else:
        duration_str = f"{minutes}:{seconds:02d}"

    return VideoInfoResponse(
        id=info.get("id"),
        title=info.get("title", "Unknown"),
        thumbnail=info.get("thumbnail", ""),
        duration=duration,
        duration_string=duration_str,
        channel=info.get("channel", info.get("uploader", "Unknown")),
        view_count=info.get("view_count"),
        upload_date=info.get("upload_date"),
        formats=formats,
        url=info.get("webpage_url") or info.get("url"),
    )


def fetch_video_info(url: str) -> VideoInfoResponse | PlaylistResponse:
    """Extract video metadata and available formats using yt-dlp. Supports playlists."""
    ydl_opts: dict[str, Any] = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "extract_flat": "in_playlist", # Extracts playlist info but full info for single videos
        "extractor_args": {"youtube": {"player_client": ["android_vr", "web"]}},
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info: dict[str, Any] = ydl.extract_info(url, download=False)  # type: ignore[arg-type]
    except yt_dlp.utils.DownloadError as exc:
        _raise_friendly_error(exc)

    if info is None:
        raise ValueError("Could not extract video information")

    if info.get("_type") == "playlist":
        entries = []
        for entry in info.get("entries", []):
            if entry:
                entries.append(_build_video_info(entry))
        return PlaylistResponse(
            title=info.get("title", "Unknown Playlist"),
            entries=entries,
            extractor=info.get("extractor"),
            id=info.get("id")
        )
    
    return _build_video_info(info)


# ---------------------------------------------------------------------------
# Download helpers
# ---------------------------------------------------------------------------

ProgressCallback = Callable[[DownloadProgress], None]


def _make_progress_hook(
    task_id: str,
    callback: ProgressCallback,
    label: str = "",
) -> Callable[[dict[str, Any]], None]:
    """Create a yt-dlp progress hook that forwards updates via *callback*."""

    def hook(d: dict[str, Any]) -> None:
        status = d.get("status", "")
        progress = DownloadProgress(task_id=task_id)

        if status == "downloading":
            progress.status = DownloadStatus.DOWNLOADING
            total = d.get("total_bytes") or d.get("total_bytes_estimate") or 0
            downloaded = d.get("downloaded_bytes", 0)
            if total > 0:
                progress.percentage = round((downloaded / total) * 100, 1)
            else:
                # try the _percent_str
                pct_str = d.get("_percent_str", "0%").strip().rstrip("%")
                try:
                    progress.percentage = float(pct_str)
                except ValueError:
                    progress.percentage = 0.0

            speed = d.get("_speed_str", "")
            eta = d.get("_eta_str", "")
            
            # Strip ANSI color codes
            speed = ANSI_ESCAPE.sub('', speed).strip() if speed else ""
            eta = ANSI_ESCAPE.sub('', eta).strip() if eta else ""
            filename = d.get("filename", "")
            
            progress.speed = speed
            progress.eta = eta
            progress.filename = filename
            progress.message = f"Downloading{f' {label}' if label else ''}… {progress.percentage}%"

        elif status == "finished":
            progress.status = DownloadStatus.DOWNLOADING
            progress.percentage = 100.0
            progress.message = f"Download{f' {label}' if label else ''} complete, processing…"
            progress.filename = d.get("filename", "")

        elif status == "error":
            progress.status = DownloadStatus.ERROR
            progress.message = "Download failed"

        callback(progress)

    return hook

def _parse_time(time_str: str | None) -> int | None:
    if not time_str:
        return None
    try:
        parts = time_str.split(':')
        if len(parts) == 3:
            return int(parts[0]) * 3600 + int(parts[1]) * 60 + int(parts[2])
        elif len(parts) == 2:
            return int(parts[0]) * 60 + int(parts[1])
        return int(parts[0])
    except ValueError:
        return None

def _build_base_ydl_opts(
    task_id: str,
    callback: ProgressCallback,
    start_time: str | None = None,
    end_time: str | None = None,
    download_subtitles: bool = False,
    embed_thumbnail: bool = True,
) -> dict[str, Any]:
    ensure_download_dir()
    outtmpl = str(DOWNLOAD_DIR / "%(title)s [%(id)s].%(ext)s")
    
    opts: dict[str, Any] = {
        "outtmpl": outtmpl,
        "progress_hooks": [_make_progress_hook(task_id, callback)],
        "quiet": True,
        "no_warnings": True,
        "color": "no_color",
        "extractor_args": {"youtube": {"player_client": ["android_vr", "web"]}},
        "postprocessors": [
            {"key": "FFmpegMetadata", "add_metadata": True},
        ],
    }

    if embed_thumbnail:
        opts["writethumbnail"] = True
        opts["postprocessors"].append({"key": "EmbedThumbnail", "already_have_thumbnail": False})

    if download_subtitles:
        opts["writesubtitles"] = True
        opts["subtitleslangs"] = ["en", ".*"] # try english, fallback to any
        opts["postprocessors"].append({"key": "FFmpegSubtitlesConvertor", "format": "srt"})
        opts["postprocessors"].append({"key": "FFmpegEmbedSubtitle"})

    s_sec = _parse_time(start_time)
    e_sec = _parse_time(end_time)
    if s_sec is not None or e_sec is not None:
        opts["download_ranges"] = yt_dlp.utils.download_range_func(None, [(s_sec or 0, e_sec or 999999)])
        # When downloading ranges, yt-dlp uses ffmpeg directly, which is fine.
        opts["force_keyframes_at_cuts"] = True

    return opts


def download_format(
    url: str,
    format_id: str,
    task_id: str,
    callback: ProgressCallback,
    start_time: str | None = None,
    end_time: str | None = None,
    download_subtitles: bool = False,
) -> str:
    """Download a single specific format. Returns the output file path."""
    # Do not embed thumbnail for raw formats because WebM does not support it and will crash
    ydl_opts = _build_base_ydl_opts(task_id, callback, start_time, end_time, download_subtitles, embed_thumbnail=False)
    ydl_opts["format"] = format_id

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=True)

    if info is None:
        raise RuntimeError("Download returned no info")

    return ydl.prepare_filename(info)


def download_best(
    url: str,
    task_id: str,
    callback: ProgressCallback,
    start_time: str | None = None,
    end_time: str | None = None,
    download_subtitles: bool = False,
) -> str:
    """Download the best available quality (video+audio merged)."""
    ydl_opts = _build_base_ydl_opts(task_id, callback, start_time, end_time, download_subtitles)
    ydl_opts["format"] = "bestvideo+bestaudio/best"
    ydl_opts["merge_output_format"] = "mp4"
    ydl_opts["postprocessors"].insert(0, {"key": "FFmpegVideoConvertor", "preferedformat": "mp4"})

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=True)

    if info is None:
        raise RuntimeError("Download returned no info")

    filepath = ydl.prepare_filename(info)
    mp4_path = Path(filepath).with_suffix(".mp4")
    return str(mp4_path) if mp4_path.exists() else filepath


def download_best_mp4(
    url: str,
    task_id: str,
    callback: ProgressCallback,
    start_time: str | None = None,
    end_time: str | None = None,
    download_subtitles: bool = False,
) -> str:
    """Download the best MP4 (video+audio)."""
    ydl_opts = _build_base_ydl_opts(task_id, callback, start_time, end_time, download_subtitles)
    ydl_opts["format"] = "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best"
    ydl_opts["merge_output_format"] = "mp4"

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=True)

    if info is None:
        raise RuntimeError("Download returned no info")

    filepath = ydl.prepare_filename(info)
    mp4_path = Path(filepath).with_suffix(".mp4")
    return str(mp4_path) if mp4_path.exists() else filepath


def download_audio_only(
    url: str,
    task_id: str,
    callback: ProgressCallback,
    start_time: str | None = None,
    end_time: str | None = None,
) -> str:
    """Download audio only and convert to MP3."""
    ydl_opts = _build_base_ydl_opts(task_id, callback, start_time, end_time, download_subtitles=False)
    ydl_opts["format"] = "bestaudio/best"
    ydl_opts["postprocessors"].insert(0, {
        "key": "FFmpegExtractAudio",
        "preferredcodec": "mp3",
        "preferredquality": "320",
    })

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=True)

    if info is None:
        raise RuntimeError("Download returned no info")

    filepath = ydl.prepare_filename(info)
    mp3_path = Path(filepath).with_suffix(".mp3")
    return str(mp3_path) if mp3_path.exists() else filepath


def download_and_merge(
    url: str,
    video_format_id: str,
    task_id: str,
    callback: ProgressCallback,
    start_time: str | None = None,
    end_time: str | None = None,
    download_subtitles: bool = False,
) -> str:
    """Download a video-only format + best audio and merge with FFmpeg."""
    ydl_opts = _build_base_ydl_opts(task_id, callback, start_time, end_time, download_subtitles)
    ydl_opts["format"] = f"{video_format_id}+bestaudio/best"
    ydl_opts["merge_output_format"] = "mp4"

    callback(DownloadProgress(
        task_id=task_id,
        status=DownloadStatus.DOWNLOADING,
        percentage=0,
        message="Starting video + audio download for merge…",
    ))

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=True)

    if info is None:
        raise RuntimeError("Download returned no info")

    callback(DownloadProgress(
        task_id=task_id,
        status=DownloadStatus.MERGING,
        percentage=100,
        message="Merging video and audio with FFmpeg…",
    ))

    filepath = ydl.prepare_filename(info)
    mp4_path = Path(filepath).with_suffix(".mp4")
    final = str(mp4_path) if mp4_path.exists() else filepath

    callback(DownloadProgress(
        task_id=task_id,
        status=DownloadStatus.COMPLETE,
        percentage=100,
        message="Merge complete!",
        filename=final,
    ))

    return final


# ---------------------------------------------------------------------------
# Error helpers
# ---------------------------------------------------------------------------

_ERROR_PATTERNS: list[tuple[str, str, str]] = [
    (r"(is private|private video)", "This video is private and cannot be accessed.", "private"),
    (r"(age.?restrict|sign in to confirm your age)", "This video is age-restricted.", "age_restricted"),
    (r"(unavailable|not available|been removed|does not exist)", "This video is unavailable or has been removed.", "unavailable"),
    (r"(copyright)", "This video is blocked due to copyright.", "copyright"),
    (r"(live event|premieres)", "Live events cannot be downloaded until they finish.", "live"),
    (r"(geo.?restrict|not available in your country)", "This video is not available in your region.", "geo_restricted"),
]


def _raise_friendly_error(exc: Exception) -> None:
    """Re-raise a yt-dlp DownloadError with a user-friendly message."""
    msg = str(exc).lower()
    for pattern, friendly_msg, error_type in _ERROR_PATTERNS:
        if re.search(pattern, msg):
            raise ValueError(f"{error_type}::{friendly_msg}") from exc
    # Fallback
    raise ValueError(f"ytdlp_error::Download error: {exc}") from exc
