import asyncio
import os
import uuid

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.storage.storage_service import create_preview

from app.api.deps import verify_viewer
from app.config import settings
from app.database.session import get_db
from app.models.photo import Photo
from app.schemas.photo import DownloadZipRequest
from app.services import download_service

router = APIRouter(tags=["photos"], dependencies=[Depends(verify_viewer)])

# Routes authenticated by a single-use download token instead of the viewer
# cookie (router-level dependencies would still apply if these lived on
# `router`, so they need their own).
token_router = APIRouter(tags=["photos"])


async def _get_photo_or_404(photo_id: uuid.UUID, db: AsyncSession) -> Photo:
    result = await db.execute(select(Photo).where(Photo.id == photo_id))
    photo = result.scalar_one_or_none()
    if not photo:
        raise HTTPException(404, "Photo not found")
    return photo


_CACHE_FOREVER = "public, max-age=31536000, immutable"


@router.get("/photos/{photo_id}")
async def get_photo(photo_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> FileResponse:
    photo = await _get_photo_or_404(photo_id, db)
    if not os.path.exists(photo.original_path):
        raise HTTPException(404, "Photo file not found on disk")
    return FileResponse(
        photo.original_path,
        headers={
            "Content-Disposition": f'inline; filename="{photo.filename}"',
            "Cache-Control": _CACHE_FOREVER,
        },
    )


@router.get("/photos/{photo_id}/preview")
async def get_preview(photo_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> FileResponse:
    preview_path = os.path.join(settings.PREVIEWS_DIR, f"{photo_id}.webp")
    if not os.path.exists(preview_path):
        photo = await _get_photo_or_404(photo_id, db)
        if not os.path.exists(photo.original_path):
            raise HTTPException(404, "Photo file not found on disk")
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(None, create_preview, photo.original_path, preview_path)
    return FileResponse(preview_path, media_type="image/webp", headers={"Cache-Control": _CACHE_FOREVER})


@router.get("/thumbnails/{photo_id}")
async def get_thumbnail(photo_id: uuid.UUID) -> FileResponse:
    # Prefer WebP (new); fall back to legacy JPEG for thumbnails not yet regenerated.
    for ext, mime in ((".webp", "image/webp"), (".jpg", "image/jpeg")):
        thumb_path = os.path.join(settings.THUMBNAILS_DIR, f"{photo_id}{ext}")
        if os.path.exists(thumb_path):
            return FileResponse(thumb_path, media_type=mime, headers={"Cache-Control": _CACHE_FOREVER})
    raise HTTPException(404, "Thumbnail not found")


# ── ZIP download ───────────────────────────────────────────────────────────────


@router.post("/photos/download-zip-token")
async def create_download_token(
    request: DownloadZipRequest,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Resolve photo paths once, estimate the resulting ZIP size, and issue a
    short-lived opaque token. The client fetches GET /photos/download-zip/{token}
    and uses the estimated size to report download progress.
    """
    entries = await download_service.resolve_entries(request.photo_ids, db, request.quality)
    if not entries:
        raise HTTPException(404, "None of the requested photos exist on disk")

    token = download_service.create_token(entries)
    return {
        "token": token,
        "estimated_size": download_service.estimate_zip_size(entries),
        "file_count": len(entries),
    }


@token_router.get("/photos/download-zip/{token}")
async def download_zip_by_token(token: str) -> StreamingResponse:
    """
    Stream the ZIP for a previously issued download token.
    Auth is satisfied by the token itself: single-use, unguessable, 5-minute TTL,
    issued only to authenticated viewers. No viewer-cookie check here so the
    browser can hit this as a plain navigation.
    """
    entries = download_service.pop_token(token)
    if entries is None:
        raise HTTPException(404, "Download link expired or not found")

    return StreamingResponse(
        download_service.stream_zip(entries),
        media_type="application/zip",
        headers={"Content-Disposition": 'attachment; filename="photos.zip"'},
    )
