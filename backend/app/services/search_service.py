import io
import logging
import uuid
from datetime import datetime

import cv2
import numpy as np
from PIL import Image
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.face.face_service import face_service
from app.face.faiss_index import faiss_index
from app.models.detected_face import DetectedFace
from app.models.photo import Photo
from app.schemas.search import SearchMatch, SearchResponse

logger = logging.getLogger(__name__)


def _validate_image(data: bytes) -> None:
    try:
        with Image.open(io.BytesIO(data)) as img:
            img.verify()
    except Exception as exc:
        raise ValueError("Invalid or corrupted image") from exc


async def _photo_scores_for_face(face, db: AsyncSession) -> dict[uuid.UUID, float]:
    """Search FAISS for one face and return {photo_id: best_confidence}."""
    embedding = await face_service.generate_embedding(face)
    raw = await faiss_index.search_async(embedding, k=10_000_000)
    above = [(fid, score) for fid, score in raw if score >= settings.MATCH_THRESHOLD]
    if not above:
        return {}

    faiss_ids = [fid for fid, _ in above]
    score_map = {fid: score for fid, score in above}

    stmt = select(DetectedFace).where(DetectedFace.faiss_vector_id.in_(faiss_ids))
    rows = (await db.execute(stmt)).scalars().all()

    best: dict[uuid.UUID, float] = {}
    for row in rows:
        s = score_map.get(row.faiss_vector_id, 0.0)
        if s > best.get(row.photo_id, -1.0):
            best[row.photo_id] = s
    return best


async def search_by_image(image_data: bytes, mode: str, db: AsyncSession) -> SearchResponse:
    _validate_image(image_data)

    arr = np.frombuffer(image_data, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Could not decode image")

    faces = await face_service.detect_faces(img)
    if not faces:
        return SearchResponse(matches=[], faces_detected=0)

    faces_detected = len(faces)

    # Build per-face photo→confidence maps
    per_face: list[dict[uuid.UUID, float]] = []
    for face in faces:
        per_face.append(await _photo_scores_for_face(face, db))

    if mode == "intersection":
        # Only photos where ALL faces match; confidence = average across faces
        if any(len(fb) == 0 for fb in per_face):
            combined: dict[uuid.UUID, float] = {}
        else:
            common = set(per_face[0].keys()).intersection(*(set(fb.keys()) for fb in per_face[1:]))
            combined = {
                pid: sum(fb[pid] for fb in per_face) / faces_detected
                for pid in common
            }
    else:  # union (default)
        # Every photo matching any face; confidence = max across faces
        combined = {}
        for face_best in per_face:
            for pid, score in face_best.items():
                if score > combined.get(pid, -1.0):
                    combined[pid] = score

    # Order results by capture time (EXIF), falling back to filename for photos
    # with no usable date — reconstructs the event's timeline rather than
    # ordering by match confidence.
    if not combined:
        return SearchResponse(matches=[], faces_detected=faces_detected)

    meta_rows = (
        await db.execute(
            select(Photo.id, Photo.taken_at, Photo.filename).where(Photo.id.in_(combined.keys()))
        )
    ).all()
    meta = {pid: (taken_at, filename) for pid, taken_at, filename in meta_rows}

    def _order_key(pid: uuid.UUID):
        taken_at, filename = meta.get(pid, (None, ""))
        return (taken_at is None, taken_at or datetime.min, filename or "")

    matches = [
        SearchMatch(
            photo_id=pid,
            confidence=round(combined[pid], 4),
            taken_at=meta.get(pid, (None, ""))[0],
        )
        for pid in sorted(combined.keys(), key=_order_key)
    ]
    return SearchResponse(matches=matches, faces_detected=faces_detected)
