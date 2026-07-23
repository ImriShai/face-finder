"""Admin-configurable landing branding: an optional title and background video,
persisted under the storage volume so they survive restarts."""
import json
import os
import shutil

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


async def save_video(upload: UploadFile) -> None:
    ext = os.path.splitext(upload.filename or "")[1].lower()
    if ext not in _VIDEO_TYPES:
        raise ValueError(f"Unsupported video type '{ext}'. Allowed: {', '.join(_VIDEO_TYPES)}")
    os.makedirs(_DIR, exist_ok=True)
    _delete_video_files()  # only one background video at a time
    dest = f"{_VIDEO_STEM}{ext}"
    # Stream from the upload's spooled temp file — never load the whole video
    # into memory.
    with open(dest, "wb") as out:
        shutil.copyfileobj(upload.file, out)


def delete_video() -> None:
    _delete_video_files()
