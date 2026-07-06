from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database.session import get_db
from app.api.deps import verify_viewer
from app.limiter import limiter
from app.schemas.search import SearchResponse
from app.services.search_service import search_by_image

router = APIRouter(tags=["search"])

_MAX_SELFIE_BYTES = 10 * 1024 * 1024  # 10 MB


@router.post("/search", response_model=SearchResponse, dependencies=[Depends(verify_viewer)])
@limiter.limit(settings.SEARCH_RATE_LIMIT)
async def search(
    request: Request,
    file: UploadFile = File(...),
    mode: str = Form(default="union"),
    db: AsyncSession = Depends(get_db),
) -> SearchResponse:
    data = await file.read()
    if len(data) > _MAX_SELFIE_BYTES:
        raise HTTPException(413, "Selfie image exceeds the 10 MB limit")

    if mode not in ("union", "intersection"):
        mode = "union"

    try:
        return await search_by_image(data, mode, db)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
