"""scripts/ingest_gallery.py — parallel preparation and crash-safe checkpointing.

Face detection is faked; everything else (ZIP reading, decoding, file writes,
FAISS persistence, DB commits) runs for real against a temp dir and SQLite.
"""
import asyncio
import importlib.util
import io
import os
import zipfile
from pathlib import Path
from unittest.mock import MagicMock

import faiss
import numpy as np
import pytest
from PIL import Image
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings
from app.database.session import Base
from app.face.faiss_index import FaissIndex
from app.models.detected_face import DetectedFace
from app.models.photo import Photo

_SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "ingest_gallery.py"
_spec = importlib.util.spec_from_file_location("ingest_gallery", _SCRIPT)
ingest_gallery = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(ingest_gallery)

FACES_PER_PHOTO = 2


def _jpeg(color: str, size=(1200, 900), exif_time: str | None = None) -> bytes:
    img = Image.new("RGB", size, color)
    exif = img.getexif()
    if exif_time:
        exif.get_ifd(0x8769)[36867] = exif_time
    buf = io.BytesIO()
    img.save(buf, "JPEG", exif=exif)
    return buf.getvalue()


def _make_zip(path: Path, entries: dict[str, bytes]) -> str:
    with zipfile.ZipFile(path, "w") as zf:
        for name, data in entries.items():
            zf.writestr(name, data)
    return str(path)


class _FakeFaceService:
    """Returns FACES_PER_PHOTO faces with distinct embeddings per call."""

    def __init__(self, fail_on_call: int | None = None, on_call=None):
        self.calls = 0
        self.fail_on_call = fail_on_call
        self.on_call = on_call

    def _get_model(self):
        return None

    async def detect_faces(self, image):
        self.calls += 1
        if self.on_call:
            self.on_call(self.calls)
        if self.fail_on_call == self.calls:
            # BaseException: escapes the per-photo error handling, like a crash.
            raise KeyboardInterrupt("simulated crash")
        rng = np.random.default_rng(self.calls)
        faces = []
        for _ in range(FACES_PER_PHOTO):
            f = MagicMock()
            f.embedding = rng.standard_normal(512).astype(np.float32)
            faces.append(f)
        return faces

    async def generate_embedding(self, face):
        e = face.embedding / np.linalg.norm(face.embedding)
        return e.astype(np.float32)


@pytest.fixture
async def env(tmp_path, monkeypatch):
    """Temp storage + file-backed SQLite shared by every session the script opens."""
    storage = tmp_path / "storage"
    for key, sub in [("GALLERY_DIR", "gallery"), ("THUMBNAILS_DIR", "thumbnails"), ("PREVIEWS_DIR", "previews")]:
        monkeypatch.setattr(settings, key, str(storage / sub))
    monkeypatch.setattr(settings, "FAISS_INDEX_PATH", str(storage / "faiss.index"))

    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'db.sqlite'}")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    monkeypatch.setattr(ingest_gallery, "AsyncSessionLocal", factory)
    monkeypatch.setattr(ingest_gallery, "faiss_index", FaissIndex())

    yield {"tmp": tmp_path, "storage": storage, "db": factory}
    await engine.dispose()


async def _db_state(factory):
    async with factory() as s:
        photos = (await s.execute(select(Photo))).scalars().all()
        faces = (await s.execute(select(DetectedFace))).scalars().all()
    return photos, faces


def _disk_index_size() -> int:
    if not os.path.exists(settings.FAISS_INDEX_PATH):
        return 0
    return faiss.read_index(settings.FAISS_INDEX_PATH).ntotal


async def _run(zip_path, **kw):
    kw.setdefault("reload_backend", False)
    return await ingest_gallery.ingest(zip_path, **kw)


@pytest.mark.parametrize("workers", [1, 4])
async def test_full_run_writes_files_rows_and_index(env, monkeypatch, workers):
    monkeypatch.setattr(ingest_gallery, "face_service", _FakeFaceService())
    entries = {f"p{i}.jpg": _jpeg("red") for i in range(6)}
    entries["dated.jpg"] = _jpeg("blue", exif_time="2025:06:01 18:30:00")
    entries["broken.jpg"] = b"not an image"
    entries["notes.txt"] = b"ignored"
    zip_path = _make_zip(env["tmp"] / "g.zip", entries)

    stats = await _run(zip_path, workers=workers, checkpoint_every=3)

    assert stats == {"processed": 7, "skipped": 1, "faces": 7 * FACES_PER_PHOTO, "interrupted": False}
    photos, faces = await _db_state(env["db"])
    assert len(photos) == 7
    assert len(faces) == 7 * FACES_PER_PHOTO
    assert _disk_index_size() == len(faces)
    assert sorted(f.faiss_vector_id for f in faces) == list(range(len(faces)))
    assert {p.filename: p.taken_at for p in photos}["dated.jpg"].isoformat() == "2025-06-01T18:30:00"
    for p in photos:
        assert os.path.exists(p.original_path)
        assert os.path.exists(p.thumbnail_path)
        assert os.path.exists(os.path.join(settings.PREVIEWS_DIR, f"{p.id}.webp"))
        with Image.open(p.thumbnail_path) as t:
            assert max(t.size) <= 800
    assert not os.path.exists(settings.FAISS_INDEX_PATH + ".tmp")


async def test_same_name_in_subfolders_gets_distinct_files(env, monkeypatch):
    monkeypatch.setattr(ingest_gallery, "face_service", _FakeFaceService())
    zip_path = _make_zip(env["tmp"] / "g.zip", {"a/1.jpg": _jpeg("red"), "b/1.jpg": _jpeg("green")})

    await _run(zip_path, workers=4)

    photos, _ = await _db_state(env["db"])
    paths = {p.original_path for p in photos}
    assert len(paths) == 2
    assert all(os.path.exists(p) for p in paths)


async def test_crash_never_leaves_db_faces_without_vectors_and_resume_completes(env, monkeypatch):
    zip_path = _make_zip(env["tmp"] / "g.zip", {f"p{i}.jpg": _jpeg("red") for i in range(10)})

    # Crash while detecting the 6th photo; checkpoints every 2 photos.
    monkeypatch.setattr(ingest_gallery, "face_service", _FakeFaceService(fail_on_call=6))
    with pytest.raises(KeyboardInterrupt):
        await _run(zip_path, workers=3, checkpoint_every=2)

    photos, faces = await _db_state(env["db"])
    assert len(photos) == 4  # two completed checkpoints
    on_disk = _disk_index_size()
    assert faces and max(f.faiss_vector_id for f in faces) < on_disk

    # A fresh process resumes from the saved index without reusing vector ids.
    monkeypatch.setattr(ingest_gallery, "faiss_index", FaissIndex())
    monkeypatch.setattr(ingest_gallery, "face_service", _FakeFaceService())
    stats = await _run(zip_path, workers=3, checkpoint_every=2, skip_existing=True)

    assert stats["processed"] == 6 and stats["skipped"] == 4
    photos, faces = await _db_state(env["db"])
    assert sorted(p.filename for p in photos) == sorted(f"p{i}.jpg" for i in range(10))
    ids = [f.faiss_vector_id for f in faces]
    assert len(ids) == len(set(ids)) == 10 * FACES_PER_PHOTO
    assert max(ids) < _disk_index_size()


async def test_graceful_stop_checkpoints_everything_processed(env, monkeypatch):
    zip_path = _make_zip(env["tmp"] / "g.zip", {f"p{i}.jpg": _jpeg("red") for i in range(20)})

    handlers = {}
    loop = asyncio.get_running_loop()
    monkeypatch.setattr(loop, "add_signal_handler", lambda sig, cb: handlers.setdefault(sig, cb))

    def on_call(n):
        if n == 3:  # SIGTERM arrives while the 3rd photo is being detected
            handlers[ingest_gallery.signal.SIGTERM]()

    monkeypatch.setattr(ingest_gallery, "face_service", _FakeFaceService(on_call=on_call))
    stats = await _run(zip_path, workers=2, checkpoint_every=100)

    assert stats["interrupted"] is True
    assert 3 <= stats["processed"] < 20  # drained what was in flight, then stopped
    photos, faces = await _db_state(env["db"])
    assert len(photos) == stats["processed"]
    assert _disk_index_size() == len(faces) == stats["processed"] * FACES_PER_PHOTO


async def test_index_save_is_atomic(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "FAISS_INDEX_PATH", str(tmp_path / "faiss.index"))
    idx = FaissIndex()
    idx.add_vectors_batch(np.eye(3, 512, dtype=np.float32))
    idx.save()
    assert faiss.read_index(settings.FAISS_INDEX_PATH).ntotal == 3

    def boom(index, path):
        Path(path).write_bytes(b"partial")
        raise OSError("disk full")

    monkeypatch.setattr(faiss, "write_index", boom)
    idx.add_vectors_batch(np.eye(1, 512, dtype=np.float32))
    with pytest.raises(OSError):
        idx.save()
    # Old index intact, no temp file left behind.
    monkeypatch.undo()
    assert faiss.read_index(str(tmp_path / "faiss.index")).ntotal == 3
    assert not (tmp_path / "faiss.index.tmp").exists()
