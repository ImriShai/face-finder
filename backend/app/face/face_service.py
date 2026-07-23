import asyncio
import logging

import numpy as np

logger = logging.getLogger(__name__)


class FaceService:
    def __init__(self) -> None:
        self._model = None

    def _get_model(self):
        if self._model is None:
            import onnxruntime as ort
            from insightface.app import FaceAnalysis
            from app.config import settings

            # Use the GPU only when this image was built with onnxruntime-gpu AND
            # a CUDA device is reachable; otherwise fall back to CPU. This keeps
            # the default (CPU) build and CPU-only machines working unchanged —
            # on CPU onnxruntime, CUDAExecutionProvider simply isn't available.
            if "CUDAExecutionProvider" in ort.get_available_providers():
                providers = ["CUDAExecutionProvider", "CPUExecutionProvider"]
                ctx_id = 0
            else:
                providers = ["CPUExecutionProvider"]
                ctx_id = -1
            logger.info("InsightFace providers=%s (ctx_id=%s)", providers, ctx_id)

            self._model = FaceAnalysis(
                name=settings.INSIGHTFACE_MODEL,
                providers=providers,
            )
            self._model.prepare(ctx_id=ctx_id, det_size=(640, 640))
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
