import asyncio
import logging
import os
import tempfile

import faiss
from fastapi import APIRouter, BackgroundTasks, Depends, File, Header, HTTPException, UploadFile
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database.session import AsyncSessionLocal, get_db
from app.face.faiss_index import faiss_index
from app.models.photo import Photo
from app.schemas.photo import PhotoListResponse, PhotoResponse
from app.storage.storage_service import (
    ALLOWED_IMAGE_EXTENSIONS,
    THUMBNAIL_EXT,
    create_thumbnail,
    ensure_preview,
    extract_zip,
    preview_path,
)
from app.workers.gallery_worker import process_gallery

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin", tags=["admin"])


async def verify_admin(x_admin_password: str | None = Header(default=None)) -> None:
    if x_admin_password != settings.ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="Invalid admin password")


@router.post("/upload-gallery", status_code=202, dependencies=[Depends(verify_admin)])
async def upload_gallery(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
) -> dict:
    if not file.filename or not file.filename.lower().endswith(".zip"):
        raise HTTPException(400, "Only ZIP files are accepted")

    data = await file.read()
    if len(data) > settings.MAX_UPLOAD_SIZE:
        raise HTTPException(413, f"File exceeds the {settings.MAX_UPLOAD_SIZE // 1_048_576} MB limit")

    with tempfile.NamedTemporaryFile(delete=False, suffix=".zip") as tmp:
        tmp.write(data)
        zip_path = tmp.name

    os.makedirs(settings.GALLERY_DIR, exist_ok=True)
    try:
        extracted = extract_zip(zip_path, settings.GALLERY_DIR)
    except Exception as exc:
        os.remove(zip_path)
        raise HTTPException(400, f"Could not read ZIP: {exc}") from exc

    if not extracted:
        os.remove(zip_path)
        raise HTTPException(
            400,
            f"ZIP contains no supported image files ({', '.join(ALLOWED_IMAGE_EXTENSIONS)})",
        )

    background_tasks.add_task(process_gallery, zip_path, extracted)
    return {"status": "accepted", "photos_queued": len(extracted)}


@router.post("/reload-index", dependencies=[Depends(verify_admin)])
async def reload_index() -> dict:
    """Hot-swap the in-memory FAISS index from disk without restarting the server."""
    loop = asyncio.get_running_loop()

    def _reload() -> dict:
        if not os.path.exists(settings.FAISS_INDEX_PATH):
            return {"status": "no_index_file", "vectors": 0}
        new_index = faiss.read_index(settings.FAISS_INDEX_PATH)
        with faiss_index._lock:
            faiss_index._index = new_index
        return {"status": "reloaded", "vectors": new_index.ntotal}

    return await loop.run_in_executor(None, _reload)


@router.get("/index-status", dependencies=[Depends(verify_admin)])
async def index_status() -> dict:
    """Return current in-memory FAISS vector count and disk file state."""
    in_memory = faiss_index._index.ntotal if faiss_index._index is not None else None
    on_disk: int | None = None
    if os.path.exists(settings.FAISS_INDEX_PATH):
        idx = faiss.read_index(settings.FAISS_INDEX_PATH)
        on_disk = idx.ntotal
    return {"in_memory_vectors": in_memory, "on_disk_vectors": on_disk}


async def _regen_thumbnails_task() -> None:
    """Regenerate all thumbnails as WebP 800×800, removing legacy JPEGs afterward."""
    loop = asyncio.get_running_loop()
    ok = skipped = errors = 0
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Photo))
        photos = result.scalars().all()

    for photo in photos:
        new_path = os.path.join(settings.THUMBNAILS_DIR, f"{photo.id}{THUMBNAIL_EXT}")
        try:
            if not os.path.exists(photo.original_path):
                skipped += 1
                continue
            await loop.run_in_executor(None, create_thumbnail, photo.original_path, new_path)
            # Remove legacy JPEG if the new WebP was written successfully
            legacy = os.path.join(settings.THUMBNAILS_DIR, f"{photo.id}.jpg")
            if os.path.exists(legacy) and legacy != new_path:
                os.remove(legacy)
            ok += 1
        except Exception:
            logger.exception("Failed to regen thumbnail for photo %s", photo.id)
            errors += 1

    logger.info("Thumbnail regen complete: %d ok, %d skipped, %d errors", ok, skipped, errors)


@router.post("/regen-thumbnails", dependencies=[Depends(verify_admin)])
async def regen_thumbnails(background_tasks: BackgroundTasks) -> dict:
    """Regenerate all thumbnails as high-quality WebP in the background."""
    background_tasks.add_task(_regen_thumbnails_task)
    return {"status": "started"}


async def _regen_previews_task() -> None:
    """Generate 2000px WebP previews for all photos that don't have one yet."""
    loop = asyncio.get_running_loop()
    ok = skipped = errors = 0
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Photo))
        photos = result.scalars().all()

    for photo in photos:
        try:
            if os.path.exists(preview_path(photo.id)):
                skipped += 1
                continue
            if not os.path.exists(photo.original_path):
                skipped += 1
                continue
            await loop.run_in_executor(None, ensure_preview, photo.original_path, photo.id)
            ok += 1
        except Exception:
            logger.exception("Failed to generate preview for photo %s", photo.id)
            errors += 1

    logger.info("Preview regen complete: %d ok, %d skipped, %d errors", ok, skipped, errors)


@router.post("/regen-previews", dependencies=[Depends(verify_admin)])
async def regen_previews(background_tasks: BackgroundTasks) -> dict:
    """Generate 2000px WebP previews for all photos in the background."""
    background_tasks.add_task(_regen_previews_task)
    return {"status": "started"}


@router.get("/photos", response_model=PhotoListResponse, dependencies=[Depends(verify_admin)])
async def list_photos(
    page: int = 1,
    page_size: int = 48,
    db: AsyncSession = Depends(get_db),
) -> PhotoListResponse:
    page_size = min(max(page_size, 1), 100)
    offset = (page - 1) * page_size

    base = select(Photo).order_by(Photo.created_at.desc())
    count_base = select(func.count(Photo.id))

    total = await db.scalar(count_base) or 0
    result = await db.execute(base.offset(offset).limit(page_size))
    photos = result.scalars().all()

    return PhotoListResponse(
        total=total,
        page=page,
        page_size=page_size,
        photos=[PhotoResponse.model_validate(p) for p in photos],
    )
