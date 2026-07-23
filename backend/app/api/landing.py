import os

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from app.schemas.landing import LandingConfig
from app.services import landing_service

router = APIRouter(tags=["landing"])


@router.get("/landing-config", response_model=LandingConfig)
async def get_landing_config() -> LandingConfig:
    """Public: the landing title and whether a background video is configured."""
    return LandingConfig(**landing_service.get_config())


@router.get("/background-video")
async def background_video() -> FileResponse:
    """Public: stream the admin-uploaded background video (supports range requests)."""
    path = landing_service.video_path()
    if not path or not os.path.exists(path):
        raise HTTPException(404, "No background video configured")
    return FileResponse(path, media_type=landing_service.video_media_type(path))
