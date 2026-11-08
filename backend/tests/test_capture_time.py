"""EXIF capture-time extraction and capture-time ordering of search results."""
import io
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch

import numpy as np
from PIL import Image

from app.storage.storage_service import read_capture_time


def _jpeg(*, original: str | None = None, base: str | None = None) -> bytes:
    img = Image.new("RGB", (32, 32), "red")
    exif = img.getexif()
    if base:
        exif[306] = base
    if original:
        exif.get_ifd(0x8769)[36867] = original
    buf = io.BytesIO()
    img.save(buf, "JPEG", exif=exif)
    return buf.getvalue()


class TestReadCaptureTime:
    def test_prefers_datetime_original(self):
        data = _jpeg(original="2025:06:01 18:30:00", base="2025:07:01 09:00:00")
        assert read_capture_time(data) == datetime(2025, 6, 1, 18, 30)

    def test_falls_back_to_base_datetime(self):
        assert read_capture_time(_jpeg(base="2025:07:01 09:00:00")) == datetime(2025, 7, 1, 9, 0)

    def test_reads_from_path(self, tmp_path):
        path = tmp_path / "p.jpg"
        path.write_bytes(_jpeg(original="2024:12:31 23:59:59"))
        assert read_capture_time(str(path)) == datetime(2024, 12, 31, 23, 59, 59)

    def test_none_without_exif(self):
        assert read_capture_time(_jpeg()) is None

    def test_none_for_unparseable_value(self):
        assert read_capture_time(_jpeg(base="not a date")) is None

    def test_none_for_garbage_bytes(self):
        assert read_capture_time(b"definitely not an image") is None


async def test_search_orders_by_capture_time_then_filename(db_session):
    from app.models.detected_face import DetectedFace
    from app.models.photo import Photo
    from app.services.search_service import search_by_image

    late = Photo(filename="a.jpg", original_path="/a", thumbnail_path="/ta",
                 taken_at=datetime(2025, 6, 1, 22, 0))
    early = Photo(filename="b.jpg", original_path="/b", thumbnail_path="/tb",
                  taken_at=datetime(2025, 6, 1, 18, 0))
    undated_z = Photo(filename="z.jpg", original_path="/z", thumbnail_path="/tz")
    undated_c = Photo(filename="c.jpg", original_path="/c", thumbnail_path="/tc")
    photos = [late, early, undated_z, undated_c]
    db_session.add_all(photos)
    await db_session.flush()
    for i, p in enumerate(photos):
        db_session.add(DetectedFace(photo_id=p.id, face_index=0, faiss_vector_id=i))
    await db_session.commit()

    face = MagicMock()
    face.bbox = [0, 0, 50, 50]
    with (
        patch("app.services.search_service.face_service") as fs,
        patch("app.services.search_service.faiss_index") as fi,
    ):
        fs.detect_faces = AsyncMock(return_value=[face])
        fs.generate_embedding = AsyncMock(return_value=np.ones(512, dtype=np.float32))
        # Confidence order is the opposite of the expected output order.
        fi.search_async = AsyncMock(return_value=[(0, 0.99), (1, 0.50), (2, 0.98), (3, 0.60)])
        result = await search_by_image(_jpeg(), "union", db_session)

    assert [m.photo_id for m in result.matches] == [early.id, late.id, undated_c.id, undated_z.id]
    assert result.matches[0].taken_at == datetime(2025, 6, 1, 18, 0)
    assert result.matches[2].taken_at is None
    assert result.matches[1].confidence == 0.99


async def test_gallery_worker_records_capture_time(db_session, tmp_path):
    """Admin-UI uploads (gallery_worker) must store taken_at, like ingest_gallery.py."""
    from sqlalchemy import select

    from app.models.photo import Photo
    from app.workers import gallery_worker

    dated = tmp_path / "dated.jpg"
    dated.write_bytes(_jpeg(original="2025:06:01 18:30:00"))
    undated = tmp_path / "undated.jpg"
    undated.write_bytes(_jpeg())

    class _Session:
        async def __aenter__(self):
            return db_session

        async def __aexit__(self, *exc):
            return False

    with (
        patch("app.database.session.AsyncSessionLocal", _Session),
        patch.object(gallery_worker, "create_thumbnail"),
        patch.object(gallery_worker, "ensure_preview"),
        patch.object(gallery_worker, "faiss_index"),
        patch.object(gallery_worker, "face_service") as fs,
    ):
        fs.detect_faces = AsyncMock(return_value=[])
        await gallery_worker.process_gallery(str(tmp_path / "gone.zip"), [str(dated), str(undated)])

    rows = {p.filename: p.taken_at for p in (await db_session.execute(select(Photo))).scalars()}
    assert rows == {"dated.jpg": datetime(2025, 6, 1, 18, 30), "undated.jpg": None}
