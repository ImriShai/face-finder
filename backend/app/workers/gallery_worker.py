import asyncio
import logging
import os
import uuid

import cv2
import numpy as np

from app.config import settings
from app.face.face_service import face_service
from app.face.faiss_index import faiss_index
from app.storage.storage_service import PREVIEW_EXT, THUMBNAIL_EXT, create_preview, create_thumbnail

logger = logging.getLogger(__name__)

_COMMIT_BATCH = 25


async def process_gallery(zip_path: str, extracted_paths: list[str]) -> None:
    """
    Background task: detect faces in every extracted photo, generate embeddings,
    store metadata in DB, and index vectors in FAISS.
    Creates its own DB session because the request session closes before this runs.
    """
    from app.database.session import AsyncSessionLocal
    from app.models.detected_face import DetectedFace
    from app.models.photo import Photo

    loop = asyncio.get_running_loop()
    processed = 0

    photo_batch: list[Photo] = []
    face_batch: list[DetectedFace] = []

    async def _flush(db) -> None:
        if photo_batch:
            db.add_all(photo_batch)
            photo_batch.clear()
        if face_batch:
            db.add_all(face_batch)
            face_batch.clear()
        await db.commit()

    async with AsyncSessionLocal() as db:
        for image_path in extracted_paths:
            photo_checkpoint = len(photo_batch)
            face_checkpoint = len(face_batch)
            try:
                img = await loop.run_in_executor(None, cv2.imread, image_path)
                if img is None:
                    logger.warning("Could not read image: %s", image_path)
                    continue

                filename = os.path.basename(image_path)

                # Generate UUID explicitly — SQLAlchemy's default= fires at INSERT
                # time, so photo.id would be None until flush otherwise.
                photo_id = uuid.uuid4()
                photo = Photo(id=photo_id, filename=filename, original_path=image_path, thumbnail_path="")

                thumb_path = os.path.join(settings.THUMBNAILS_DIR, f"{photo_id}{THUMBNAIL_EXT}")
                await loop.run_in_executor(None, create_thumbnail, image_path, thumb_path)
                photo.thumbnail_path = thumb_path

                preview_path = os.path.join(settings.PREVIEWS_DIR, f"{photo_id}{PREVIEW_EXT}")
                await loop.run_in_executor(None, create_preview, image_path, preview_path)

                faces = await face_service.detect_faces(img)
                if faces:
                    embeddings = np.array(
                        [await face_service.generate_embedding(f) for f in faces],
                        dtype=np.float32,
                    )
                    faiss_ids = await loop.run_in_executor(
                        None, faiss_index.add_vectors_batch, embeddings
                    )
                    for face_idx, faiss_id in enumerate(faiss_ids):
                        face_batch.append(DetectedFace(
                            photo_id=photo_id,
                            face_index=face_idx,
                            faiss_vector_id=faiss_id,
                        ))

                photo_batch.append(photo)
                processed += 1

                if len(photo_batch) >= _COMMIT_BATCH:
                    await _flush(db)

            except Exception:
                logger.exception("Failed to process %s", image_path)
                del photo_batch[photo_checkpoint:]
                del face_batch[face_checkpoint:]

        if photo_batch or face_batch:
            await _flush(db)

    await loop.run_in_executor(None, faiss_index.save)
    logger.info("Gallery ingestion complete: %d/%d photos processed", processed, len(extracted_paths))

    if os.path.exists(zip_path):
        os.remove(zip_path)
