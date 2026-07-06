import numpy as np
import pytest

from app.face.face_service import FaceService


class _FakeFace:
    def __init__(self, bbox, embedding):
        self.bbox = bbox  # [x1, y1, x2, y2]
        self.embedding = np.array(embedding, dtype=np.float32)


class TestGetLargestFace:
    def setup_method(self):
        self.svc = FaceService()

    def test_returns_none_for_empty_list(self):
        assert self.svc.get_largest_face([]) is None

    def test_returns_single_face(self):
        face = _FakeFace([0, 0, 100, 100], [1.0])
        assert self.svc.get_largest_face([face]) is face

    def test_returns_face_with_largest_area(self):
        small = _FakeFace([0, 0, 10, 10], [1.0])   # area = 100
        large = _FakeFace([0, 0, 50, 50], [1.0])   # area = 2500
        tiny  = _FakeFace([0, 0, 5, 5],   [1.0])   # area = 25
        assert self.svc.get_largest_face([small, large, tiny]) is large


class TestGenerateEmbedding:
    @pytest.mark.asyncio
    async def test_normalizes_embedding(self):
        svc = FaceService()
        raw = np.array([3.0, 4.0] + [0.0] * 510, dtype=np.float32)
        face = _FakeFace([0, 0, 10, 10], raw)

        result = await svc.generate_embedding(face)

        assert abs(np.linalg.norm(result) - 1.0) < 1e-6

    @pytest.mark.asyncio
    async def test_returns_float32(self):
        svc = FaceService()
        face = _FakeFace([0, 0, 10, 10], np.ones(512))
        result = await svc.generate_embedding(face)
        assert result.dtype == np.float32

    @pytest.mark.asyncio
    async def test_zero_vector_does_not_divide_by_zero(self):
        svc = FaceService()
        face = _FakeFace([0, 0, 10, 10], np.zeros(512))
        result = await svc.generate_embedding(face)
        assert not np.any(np.isnan(result))
