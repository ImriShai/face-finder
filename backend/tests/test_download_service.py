import io
import os
import zipfile
from pathlib import Path

import pytest
from PIL import Image
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.photo import Photo
from app.services import download_service


def _write_jpeg(path: str, size: tuple[int, int] = (320, 240)) -> None:
    Image.new("RGB", size, "red").save(path, "JPEG")


@pytest.fixture
async def photos(db_session: AsyncSession, tmp_path, monkeypatch) -> list[Photo]:
    monkeypatch.setattr(settings, "PREVIEWS_DIR", str(tmp_path / "previews"))
    result = []
    for name in ("first.jpg", "second.jpg"):
        original = tmp_path / name
        _write_jpeg(str(original))
        photo = Photo(filename=name, original_path=str(original), thumbnail_path="")
        db_session.add(photo)
        result.append(photo)
    await db_session.commit()
    return result


async def test_resolve_entries_original(db_session: AsyncSession, photos: list[Photo]):
    entries = await download_service.resolve_entries([p.id for p in photos], db_session)
    assert entries == [(p.original_path, p.filename) for p in photos]


async def test_resolve_entries_skips_missing_files(db_session: AsyncSession, photos: list[Photo]):
    missing = Photo(filename="gone.jpg", original_path="/nowhere/gone.jpg", thumbnail_path="")
    db_session.add(missing)
    await db_session.commit()

    entries = await download_service.resolve_entries(
        [photos[0].id, missing.id], db_session
    )
    assert entries == [(photos[0].original_path, photos[0].filename)]


async def test_resolve_entries_web_generates_and_uses_previews(
    db_session: AsyncSession, photos: list[Photo], tmp_path
):
    entries = await download_service.resolve_entries(
        [p.id for p in photos], db_session, quality="web"
    )

    assert [name for _, name in entries] == ["first.webp", "second.webp"]
    for path, _ in entries:
        assert path.startswith(str(tmp_path / "previews"))
        assert (tmp_path / "previews").joinpath(path.rsplit("/", 1)[1]).exists()


async def test_web_entries_are_smaller_than_originals(
    db_session: AsyncSession, photos: list[Photo], tmp_path
):
    original = tmp_path / "big.jpg"
    _write_jpeg(str(original), size=(4000, 3000))
    photo = Photo(filename="big.jpg", original_path=str(original), thumbnail_path="")
    db_session.add(photo)
    await db_session.commit()

    [(web_path, _)] = await download_service.resolve_entries([photo.id], db_session, quality="web")

    assert os.path.getsize(web_path) < os.path.getsize(str(original))
    with Image.open(web_path) as img:
        assert max(img.size) <= 2000


async def test_web_quality_falls_back_to_original_for_corrupt_photo(
    db_session: AsyncSession, photos: list[Photo], tmp_path
):
    corrupt = tmp_path / "corrupt.jpg"
    corrupt.write_bytes(b"not a real image")
    photo = Photo(filename="corrupt.jpg", original_path=str(corrupt), thumbnail_path="")
    db_session.add(photo)
    await db_session.commit()

    entries = await download_service.resolve_entries(
        [photos[0].id, photo.id], db_session, quality="web"
    )

    # The healthy photo gets its preview; the corrupt one falls back to the
    # original file instead of failing the whole batch.
    assert entries[0][1] == "first.webp"
    assert entries[1] == (str(corrupt), "corrupt.jpg")


def test_stream_zip_produces_valid_archive(tmp_path):
    paths = []
    for name in ("a.jpg", "b.jpg"):
        p = tmp_path / name
        _write_jpeg(str(p))
        paths.append((str(p), name))

    data = b"".join(download_service.stream_zip(paths))

    with zipfile.ZipFile(io.BytesIO(data)) as zf:
        assert zf.namelist() == ["a.jpg", "b.jpg"]
        assert zf.testzip() is None
        for path, name in paths:
            assert zf.read(name) == Path(path).read_bytes()


def test_token_roundtrip():
    entries = [("/some/path.jpg", "path.jpg")]
    token = download_service.create_token(entries)
    assert download_service.pop_token(token) == entries
    assert download_service.pop_token(token) is None  # single-use


async def test_download_token_endpoint_web_quality(client, photos: list[Photo]):
    resp = await client.post(
        "/photos/download-zip-token",
        json={"photo_ids": [str(p.id) for p in photos], "quality": "web"},
        headers={"X-Viewer-Password": settings.VIEWER_PASSWORD},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["file_count"] == 2

    zip_resp = await client.get(f"/photos/download-zip/{body['token']}")
    assert zip_resp.status_code == 200
    with zipfile.ZipFile(io.BytesIO(zip_resp.content)) as zf:
        assert sorted(zf.namelist()) == ["first.webp", "second.webp"]


async def test_download_token_endpoint_rejects_bad_quality(client, photos: list[Photo]):
    resp = await client.post(
        "/photos/download-zip-token",
        json={"photo_ids": [str(photos[0].id)], "quality": "huge"},
        headers={"X-Viewer-Password": settings.VIEWER_PASSWORD},
    )
    assert resp.status_code == 422
