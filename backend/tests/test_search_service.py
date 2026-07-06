"""Unit tests for search_service — all external I/O is mocked."""
import io

import numpy as np
import pytest
from PIL import Image
from unittest.mock import AsyncMock, MagicMock, patch


def _make_jpeg_bytes() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (100, 100), "blue").save(buf, "JPEG")
    return buf.getvalue()


def _fake_face(bbox=(0, 0, 50, 50), embedding=None):
    face = MagicMock()
    face.bbox = list(bbox)
    face.embedding = embedding if embedding is not None else np.ones(512, dtype=np.float32)
    return face


@pytest.mark.asyncio
async def test_returns_empty_when_no_faces_detected(db_session):
    from app.services.search_service import search_by_selfie

    with patch("app.services.search_service.face_service") as mock_fs:
        mock_fs.detect_faces = AsyncMock(return_value=[])

        result = await search_by_selfie(_make_jpeg_bytes(), db_session)

    assert result.matches == []


@pytest.mark.asyncio
async def test_returns_empty_when_faiss_below_threshold(db_session):
    from app.services.search_service import search_by_selfie

    face = _fake_face()
    embedding = np.ones(512, dtype=np.float32)
    embedding /= np.linalg.norm(embedding)

    with (
        patch("app.services.search_service.face_service") as mock_fs,
        patch("app.services.search_service.faiss_index") as mock_fi,
    ):
        mock_fs.detect_faces = AsyncMock(return_value=[face])
        mock_fs.get_largest_face = MagicMock(return_value=face)
        mock_fs.generate_embedding = AsyncMock(return_value=embedding)
        # All scores below threshold
        mock_fi.search_async = AsyncMock(return_value=[(0, 0.1), (1, 0.2)])

        result = await search_by_selfie(_make_jpeg_bytes(), db_session)

    assert result.matches == []


@pytest.mark.asyncio
async def test_deduplicates_photos_keeping_best_score(db_session):
    """Two face vectors from the same photo → one result with the higher score."""
    from app.models.detected_face import DetectedFace
    from app.models.photo import Photo
    from app.services.search_service import search_by_selfie

    # Insert a photo and two detected faces pointing to FAISS IDs 0 and 1
    photo = Photo(filename="p.jpg", original_path="/p.jpg", thumbnail_path="/t.jpg")
    db_session.add(photo)
    await db_session.flush()
    db_session.add(DetectedFace(photo_id=photo.id, face_index=0, faiss_vector_id=0))
    db_session.add(DetectedFace(photo_id=photo.id, face_index=1, faiss_vector_id=1))
    await db_session.commit()

    embedding = np.ones(512, dtype=np.float32)
    embedding /= np.linalg.norm(embedding)
    face = _fake_face()

    with (
        patch("app.services.search_service.face_service") as mock_fs,
        patch("app.services.search_service.faiss_index") as mock_fi,
    ):
        mock_fs.detect_faces = AsyncMock(return_value=[face])
        mock_fs.get_largest_face = MagicMock(return_value=face)
        mock_fs.generate_embedding = AsyncMock(return_value=embedding)
        mock_fi.search_async = AsyncMock(return_value=[(0, 0.80), (1, 0.95)])

        result = await search_by_selfie(_make_jpeg_bytes(), db_session)

    assert len(result.matches) == 1
    assert result.matches[0].photo_id == photo.id
    assert result.matches[0].confidence == pytest.approx(0.95)


@pytest.mark.asyncio
async def test_results_sorted_by_confidence_descending(db_session):
    from app.models.detected_face import DetectedFace
    from app.models.photo import Photo
    from app.services.search_service import search_by_selfie

    photo_a = Photo(filename="a.jpg", original_path="/a.jpg", thumbnail_path="/ta.jpg")
    photo_b = Photo(filename="b.jpg", original_path="/b.jpg", thumbnail_path="/tb.jpg")
    db_session.add_all([photo_a, photo_b])
    await db_session.flush()
    db_session.add(DetectedFace(photo_id=photo_a.id, face_index=0, faiss_vector_id=0))
    db_session.add(DetectedFace(photo_id=photo_b.id, face_index=0, faiss_vector_id=1))
    await db_session.commit()

    embedding = np.ones(512, dtype=np.float32)
    embedding /= np.linalg.norm(embedding)
    face = _fake_face()

    with (
        patch("app.services.search_service.face_service") as mock_fs,
        patch("app.services.search_service.faiss_index") as mock_fi,
    ):
        mock_fs.detect_faces = AsyncMock(return_value=[face])
        mock_fs.get_largest_face = MagicMock(return_value=face)
        mock_fs.generate_embedding = AsyncMock(return_value=embedding)
        # photo_b has higher score
        mock_fi.search_async = AsyncMock(return_value=[(0, 0.60), (1, 0.90)])

        result = await search_by_selfie(_make_jpeg_bytes(), db_session)

    assert len(result.matches) == 2
    assert result.matches[0].photo_id == photo_b.id
    assert result.matches[0].confidence > result.matches[1].confidence
