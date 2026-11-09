import asyncio
import logging
import os
from threading import Lock

import numpy as np

logger = logging.getLogger(__name__)

_DIMENSION = 512  # InsightFace buffalo_l embedding size


class FaissIndex:
    def __init__(self) -> None:
        self._index = None
        self._lock = Lock()

    def _load_or_create(self):
        if self._index is not None:
            return self._index

        import faiss
        from app.config import settings

        if os.path.exists(settings.FAISS_INDEX_PATH):
            self._index = faiss.read_index(settings.FAISS_INDEX_PATH)
            logger.info("Loaded FAISS index with %d vectors", self._index.ntotal)
        else:
            self._index = faiss.IndexFlatIP(_DIMENSION)
            logger.info("Created new FAISS index")

        return self._index

    def add_vectors_batch(self, vectors: np.ndarray) -> list[int]:
        """Add normalized vectors to the in-memory index. Returns assigned FAISS IDs."""
        with self._lock:
            index = self._load_or_create()
            start_id = index.ntotal
            index.add(vectors)
            return list(range(start_id, start_id + len(vectors)))

    @property
    def ntotal(self) -> int:
        with self._lock:
            return self._load_or_create().ntotal

    def save(self) -> None:
        """Persist the current index to disk atomically.

        Written to a temp file and renamed into place, so a crash mid-write can
        never leave a truncated index behind — readers see the old file or the
        new one, nothing in between.
        """
        import faiss
        from app.config import settings

        with self._lock:
            if self._index is None:
                return
            path = settings.FAISS_INDEX_PATH
            os.makedirs(os.path.dirname(path), exist_ok=True)
            tmp = f"{path}.tmp"
            try:
                faiss.write_index(self._index, tmp)
                os.replace(tmp, path)
            finally:
                if os.path.exists(tmp):
                    os.remove(tmp)
            logger.info("FAISS index saved (%d vectors)", self._index.ntotal)

    def search(self, query: np.ndarray, k: int = 500) -> list[tuple[int, float]]:
        with self._lock:
            index = self._load_or_create()
            if index.ntotal == 0:
                return []
            k = min(k, index.ntotal)
            scores, ids = index.search(query.reshape(1, -1), k)
            return [
                (int(ids[0][i]), float(scores[0][i]))
                for i in range(k)
                if ids[0][i] >= 0
            ]

    async def search_async(self, query: np.ndarray, k: int = 500) -> list[tuple[int, float]]:
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(None, self.search, query, k)


faiss_index = FaissIndex()
