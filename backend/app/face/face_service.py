import asyncio
import logging

import numpy as np

logger = logging.getLogger(__name__)


class FaceService:
    def __init__(self) -> None:
        self._model = None

    def _get_model(self):
        if self._model is None:
            from insightface.app import FaceAnalysis
            from app.config import settings

            self._model = FaceAnalysis(
                name=settings.INSIGHTFACE_MODEL,
                providers=["CPUExecutionProvider"],
            )
            self._model.prepare(ctx_id=-1, det_size=(640, 640))
        return self._model

    async def detect_faces(self, image: np.ndarray) -> list:
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(None, self._detect_sync, image)

    def _detect_sync(self, image: np.ndarray) -> list:
        return self._get_model().get(image)

    async def generate_embedding(self, face) -> np.ndarray:
        embedding = face.embedding.copy().astype(np.float32)
        norm = np.linalg.norm(embedding)
        if norm > 0:
            embedding /= norm
        return embedding

    def get_largest_face(self, faces: list):
        if not faces:
            return None
        return max(faces, key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]))


face_service = FaceService()
