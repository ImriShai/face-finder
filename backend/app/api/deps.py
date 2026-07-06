from fastapi import Cookie, HTTPException
from fastapi import Header as FastAPIHeader

from app.config import settings


async def verify_viewer(
    viewer_token: str | None = Cookie(default=None),
    x_viewer_password: str | None = FastAPIHeader(default=None),
) -> None:
    if not settings.VIEWER_PASSWORD:
        return
    provided = viewer_token or x_viewer_password
    if provided != settings.VIEWER_PASSWORD:
        raise HTTPException(status_code=401, detail="Viewer access requires authentication")
