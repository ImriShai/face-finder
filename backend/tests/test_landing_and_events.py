"""Landing branding (title + background video) and event sections."""
import io
import os

import pytest
from httpx import AsyncClient

from app.config import settings
from app.services import events_service, landing_service

ADMIN = {"X-Admin-Password": settings.ADMIN_PASSWORD}


@pytest.fixture(autouse=True)
def isolated_storage(tmp_path, monkeypatch):
    """Point both services at a per-test storage directory."""
    monkeypatch.setattr(settings, "STORAGE_DIR", str(tmp_path))
    branding = tmp_path / "branding"
    monkeypatch.setattr(landing_service, "_DIR", str(branding))
    monkeypatch.setattr(landing_service, "_CONFIG", str(branding / "landing.json"))
    monkeypatch.setattr(landing_service, "_VIDEO_STEM", str(branding / "background"))
    return tmp_path


def _branding_files(root) -> list[str]:
    d = root / "branding"
    return sorted(os.listdir(d)) if d.exists() else []


# ── events ───────────────────────────────────────────────────────────────────

async def test_events_roundtrip(client: AsyncClient):
    assert (await client.get("/events")).json() == []
    body = [
        {"label": "Ceremony", "starts_at": "2025-06-01T18:00:00"},
        {"label": "חתונה", "starts_at": "2025-06-01T20:30:00"},
    ]
    resp = await client.put("/admin/events", json=body, headers=ADMIN)
    assert resp.status_code == 200
    assert resp.json() == {"status": "saved", "count": 2}
    assert (await client.get("/events")).json() == body


async def test_events_require_admin(client: AsyncClient):
    resp = await client.put("/admin/events", json=[])
    assert resp.status_code == 401


def test_malformed_events_file_reads_as_empty(isolated_storage):
    (isolated_storage / "events_config.json").write_text("{not json")
    assert events_service.read_events() == []


# ── landing title ────────────────────────────────────────────────────────────

async def test_landing_title_roundtrip(client: AsyncClient):
    assert (await client.get("/landing-config")).json() == {"title": None, "has_video": False}
    await client.put("/admin/landing-config", json={"title": "Dana & Yoav"}, headers=ADMIN)
    assert (await client.get("/landing-config")).json()["title"] == "Dana & Yoav"
    await client.put("/admin/landing-config", json={"title": ""}, headers=ADMIN)
    assert (await client.get("/landing-config")).json()["title"] is None


# ── background video ─────────────────────────────────────────────────────────

async def _upload(client, name: str, data: bytes):
    return await client.post(
        "/admin/background-video",
        files={"file": (name, io.BytesIO(data), "application/octet-stream")},
        headers=ADMIN,
    )


async def test_video_upload_serve_and_delete(client: AsyncClient):
    assert (await client.get("/background-video")).status_code == 404

    assert (await _upload(client, "clip.mp4", b"mp4-bytes")).status_code == 200
    assert (await client.get("/landing-config")).json()["has_video"] is True
    resp = await client.get("/background-video")
    assert resp.status_code == 200
    assert resp.content == b"mp4-bytes"
    assert resp.headers["content-type"] == "video/mp4"

    assert (await client.delete("/admin/background-video", headers=ADMIN)).status_code == 200
    assert (await client.get("/background-video")).status_code == 404


async def test_video_replace_with_other_extension(client: AsyncClient, isolated_storage):
    await _upload(client, "clip.mp4", b"old")
    await _upload(client, "clip.webm", b"new")
    assert _branding_files(isolated_storage) == ["background.webm"]
    assert (await client.get("/background-video")).content == b"new"


async def test_video_rejects_bad_extension(client: AsyncClient, isolated_storage):
    resp = await _upload(client, "clip.exe", b"x")
    assert resp.status_code == 400
    assert _branding_files(isolated_storage) == []


async def test_video_rejects_empty_file(client: AsyncClient, isolated_storage):
    assert (await _upload(client, "clip.mp4", b"")).status_code == 400
    assert _branding_files(isolated_storage) == []


async def test_oversized_video_keeps_previous_and_leaves_no_temp(
    client: AsyncClient, isolated_storage, monkeypatch
):
    await _upload(client, "clip.mp4", b"keep me")
    monkeypatch.setattr(settings, "MAX_VIDEO_UPLOAD_SIZE", 10)

    resp = await _upload(client, "big.webm", b"x" * 11)
    assert resp.status_code == 400
    assert "limit" in resp.json()["detail"]
    # The existing video is untouched and no partial/temp file is left behind.
    assert _branding_files(isolated_storage) == ["background.mp4"]
    assert (await client.get("/background-video")).content == b"keep me"


async def test_video_upload_requires_admin(client: AsyncClient):
    resp = await client.post(
        "/admin/background-video", files={"file": ("clip.mp4", io.BytesIO(b"x"), "video/mp4")}
    )
    assert resp.status_code == 401
