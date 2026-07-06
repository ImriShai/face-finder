"""API endpoint tests — heavy dependencies (InsightFace, FAISS) are mocked."""
import io
import zipfile

import pytest
from httpx import AsyncClient
from PIL import Image


def _make_jpeg_bytes() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (100, 100), "green").save(buf, "JPEG")
    return buf.getvalue()


def _make_zip_bytes(filenames: list[str] | None = None) -> bytes:
    if filenames is None:
        filenames = ["photo.jpg"]
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        for name in filenames:
            zf.writestr(name, _make_jpeg_bytes())
    return buf.getvalue()


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_health(client: AsyncClient):
    resp = await client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


# ---------------------------------------------------------------------------
# Admin upload
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_upload_gallery_rejects_non_zip(client: AsyncClient):
    resp = await client.post(
        "/admin/upload-gallery",
        files={"file": ("photo.jpg", _make_jpeg_bytes(), "image/jpeg")},
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_upload_gallery_rejects_empty_zip(client: AsyncClient, tmp_path):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w"):
        pass
    resp = await client.post(
        "/admin/upload-gallery",
        files={"file": ("gallery.zip", buf.getvalue(), "application/zip")},
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_upload_gallery_accepts_valid_zip(client: AsyncClient, mocker):
    mocker.patch("app.api.admin.process_gallery")
    resp = await client.post(
        "/admin/upload-gallery",
        files={"file": ("gallery.zip", _make_zip_bytes(), "application/zip")},
    )
    assert resp.status_code == 202
    body = resp.json()
    assert body["status"] == "accepted"
    assert body["photos_queued"] == 1


# ---------------------------------------------------------------------------
# Search
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_search_rejects_non_image(client: AsyncClient):
    resp = await client.post(
        "/search",
        files={"file": ("not_image.txt", b"hello world", "text/plain")},
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_search_returns_empty_when_no_face_detected(client: AsyncClient, mocker):
    from app.schemas.search import SearchResponse
    mocker.patch(
        "app.api.search.search_by_selfie",
        return_value=SearchResponse(matches=[]),
    )
    resp = await client.post(
        "/search",
        files={"file": ("selfie.jpg", _make_jpeg_bytes(), "image/jpeg")},
    )
    assert resp.status_code == 200
    assert resp.json() == {"matches": []}


@pytest.mark.asyncio
async def test_search_returns_matches(client: AsyncClient, mocker):
    from app.schemas.search import SearchMatch, SearchResponse
    mocker.patch(
        "app.api.search.search_by_selfie",
        return_value=SearchResponse(matches=[SearchMatch(photo_id=1, confidence=0.91)]),
    )
    resp = await client.post(
        "/search",
        files={"file": ("selfie.jpg", _make_jpeg_bytes(), "image/jpeg")},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["matches"]) == 1
    assert data["matches"][0]["photo_id"] == 1
    assert data["matches"][0]["confidence"] == pytest.approx(0.91)


# ---------------------------------------------------------------------------
# Photos / Thumbnails
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_get_photo_not_found(client: AsyncClient):
    resp = await client.get("/photos/99999")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_get_thumbnail_not_found(client: AsyncClient):
    resp = await client.get("/thumbnails/99999")
    assert resp.status_code == 404
