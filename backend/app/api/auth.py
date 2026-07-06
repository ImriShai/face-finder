from fastapi import APIRouter, Cookie, HTTPException, Response
from fastapi import Header as FastAPIHeader
from pydantic import BaseModel

from app.config import settings

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    password: str


@router.get("/config")
async def auth_config() -> dict:
    return {"requires_viewer_password": bool(settings.VIEWER_PASSWORD)}


@router.post("/login")
async def viewer_login(body: LoginRequest, response: Response) -> dict:
    if settings.VIEWER_PASSWORD and body.password != settings.VIEWER_PASSWORD:
        raise HTTPException(status_code=401, detail="Incorrect password")
    response.set_cookie(
        key="viewer_token",
        value=body.password,
        path="/",
        httponly=True,
        samesite="strict",
        max_age=86400 * 30,  # 30 days
    )
    return {"status": "ok"}


@router.post("/logout")
async def viewer_logout(response: Response) -> dict:
    response.delete_cookie("viewer_token", path="/")
    return {"status": "ok"}


@router.get("/verify")
async def viewer_verify(
    viewer_token: str | None = Cookie(default=None),
    x_viewer_password: str | None = FastAPIHeader(default=None),
) -> Response:
    """Lightweight auth check — cookie or header only, never query params."""
    if not settings.VIEWER_PASSWORD:
        return Response(status_code=200)
    provided = viewer_token or x_viewer_password
    if provided == settings.VIEWER_PASSWORD:
        return Response(status_code=200)
    raise HTTPException(status_code=401, detail="Unauthorized")
