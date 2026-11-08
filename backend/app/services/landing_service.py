"""Admin-configurable landing branding: an optional title and background video,
persisted under the storage volume so they survive restarts."""
import asyncio
import json
import os

from fastapi import UploadFile

from app.config import settings

_DIR = os.path.join(settings.STORAGE_DIR, "branding")
_CONFIG = os.path.join(_DIR, "landing.json")
_VIDEO_STEM = os.path.join(_DIR, "background")

# Extensions we accept for the background video, mapped to their media type.
_VIDEO_TYPES = {
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mov": "video/quicktime",
    ".ogg": "video/ogg",
}


def _read() -> dict:
    if not os.path.exists(_CONFIG):
        return {}
    try:
        with open(_CONFIG, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def _write(data: dict) -> None:
    os.makedirs(_DIR, exist_ok=True)
    tmp = f"{_CONFIG}.tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    os.replace(tmp, _CONFIG)


def video_path() -> str | None:
    for ext in _VIDEO_TYPES:
        candidate = f"{_VIDEO_STEM}{ext}"
        if os.path.exists(candidate):
            return candidate
    return None


def video_media_type(path: str) -> str:
    return _VIDEO_TYPES.get(os.path.splitext(path)[1].lower(), "application/octet-stream")


def get_config() -> dict:
    data = _read()
    return {"title": data.get("title"), "has_video": video_path() is not None}


def set_title(title: str | None) -> None:
    data = _read()
    data["title"] = title or None
    _write(data)


def _delete_video_files() -> None:
    for ext in _VIDEO_TYPES:
        candidate = f"{_VIDEO_STEM}{ext}"
        if os.path.exists(candidate):
            os.remove(candidate)


_COPY_CHUNK = 1024 * 1024  # 1 MB


def _write_video(src, dest: str) -> None:
    """Copy the upload to a temp file, enforcing the size cap, then swap it in.

    The previous video is only removed once the new one is fully written, so a
    failed or oversized upload leaves the current background untouched and never
    leaves a truncated file behind.
    """
    tmp = f"{dest}.tmp"
    written = 0
    try:
        with open(tmp, "wb") as out:
            while chunk := src.read(_COPY_CHUNK):
                written += len(chunk)
                if written > settings.MAX_VIDEO_UPLOAD_SIZE:
                    raise ValueError(
                        f"Video exceeds the {settings.MAX_VIDEO_UPLOAD_SIZE // (1024 * 1024)} MB limit"
                    )
                out.write(chunk)
        if written == 0:
            raise ValueError("Uploaded video is empty")
        for ext in _VIDEO_TYPES:  # only one background video at a time
            other = f"{_VIDEO_STEM}{ext}"
            if other != dest and os.path.exists(other):
                os.remove(other)
        os.replace(tmp, dest)
    finally:
        if os.path.exists(tmp):
            os.remove(tmp)


async def save_video(upload: UploadFile) -> None:
    ext = os.path.splitext(upload.filename or "")[1].lower()
    if ext not in _VIDEO_TYPES:
        raise ValueError(f"Unsupported video type '{ext}'. Allowed: {', '.join(_VIDEO_TYPES)}")
    os.makedirs(_DIR, exist_ok=True)
    dest = f"{_VIDEO_STEM}{ext}"
    # Stream from the upload's spooled temp file in a worker thread — never load
    # the whole video into memory or block the event loop on disk I/O.
    loop = asyncio.get_running_loop()
    await loop.run_in_executor(None, _write_video, upload.file, dest)


def delete_video() -> None:
    _delete_video_files()
