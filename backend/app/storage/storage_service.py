import os
import re
import uuid
import zipfile
from pathlib import Path

from PIL import Image

from app.config import settings

ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tiff", ".tif"}


def sanitize_filename(raw: str) -> str:
    """Strip path components and replace unsafe characters."""
    name = Path(raw).name
    name = re.sub(r"[^\w\-._]", "_", name)
    return name[:200]


def _is_safe_zip_member(member_name: str, extract_dir: str) -> bool:
    resolved = os.path.realpath(os.path.join(extract_dir, member_name))
    return resolved.startswith(os.path.realpath(extract_dir) + os.sep)


def _unique_dest(directory: str, filename: str) -> str:
    dest = os.path.join(directory, filename)
    if not os.path.exists(dest):
        return dest
    stem = Path(filename).stem
    suffix = Path(filename).suffix
    counter = 1
    while os.path.exists(dest):
        dest = os.path.join(directory, f"{stem}_{counter}{suffix}")
        counter += 1
    return dest


def extract_zip(zip_path: str, extract_dir: str) -> list[str]:
    """
    Extract image files from a ZIP into extract_dir.
    Guards against ZIP Slip and non-image content.
    Returns list of extracted absolute paths.
    """
    extracted: list[str] = []
    os.makedirs(extract_dir, exist_ok=True)

    with zipfile.ZipFile(zip_path, "r") as zf:
        for member in zf.infolist():
            if member.filename.endswith("/"):
                continue
            ext = Path(member.filename).suffix.lower()
            if ext not in ALLOWED_IMAGE_EXTENSIONS:
                continue

            safe_name = sanitize_filename(member.filename)
            if not safe_name or not _is_safe_zip_member(safe_name, extract_dir):
                continue

            dest = _unique_dest(extract_dir, safe_name)
            with zf.open(member) as src, open(dest, "wb") as dst:
                dst.write(src.read())
            extracted.append(dest)

    return extracted


THUMBNAIL_SIZE = (800, 800)
THUMBNAIL_EXT = ".webp"

PREVIEW_SIZE = (2000, 2000)
PREVIEW_EXT = ".webp"


def _save_resized(img: Image.Image, dest_path: str, max_size: tuple[int, int]) -> None:
    os.makedirs(os.path.dirname(dest_path), exist_ok=True)
    img = img.convert("RGB")
    img.thumbnail(max_size, Image.LANCZOS)
    # Write to a temp file and rename: concurrent readers (FileResponse, zip
    # streaming) never see a half-written image, and a crash mid-save can't
    # leave a truncated file that later exists-checks would trust.
    tmp_path = f"{dest_path}.{uuid.uuid4().hex}.tmp"
    try:
        img.save(tmp_path, "WEBP", quality=85, method=4)
        os.replace(tmp_path, dest_path)
    finally:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)


def create_thumbnail(source_path: str, dest_path: str) -> None:
    with Image.open(source_path) as img:
        _save_resized(img, dest_path, THUMBNAIL_SIZE)


def create_preview(source_path: str, dest_path: str) -> None:
    with Image.open(source_path) as img:
        _save_resized(img, dest_path, PREVIEW_SIZE)


def preview_path(photo_id: uuid.UUID | str) -> str:
    return os.path.join(settings.PREVIEWS_DIR, f"{photo_id}{PREVIEW_EXT}")


def ensure_preview(source_path: str, photo_id: uuid.UUID | str) -> str:
    """Return the photo's preview path, generating the preview if missing.

    Blocking (PIL decode/encode) — call via an executor from async code.
    """
    dest = preview_path(photo_id)
    if not os.path.exists(dest):
        create_preview(source_path, dest)
    return dest
