#!/usr/bin/env python3
"""
Ingest a large ZIP file of event photos directly into the face-finder system.
Bypasses the HTTP upload limit — works with files of any size.

Photos are prepared in parallel (read from the ZIP, decoded, original written,
preview + thumbnail generated) by a pool of worker threads, while the main loop
runs face detection on each prepared photo. Only a bounded number of decoded
photos are held in memory at once.

Progress is checkpointed: every --checkpoint photos the FAISS index is saved to
disk and only THEN are the matching DB rows committed. So an interrupted run
never leaves photos in the DB whose face vectors were lost — re-run with
--skip-existing to continue. SIGTERM/SIGINT (docker stop, Ctrl+C) finish the
photos in flight, checkpoint, and exit cleanly.

Usage (inside the backend container):
    python scripts/ingest_gallery.py /path/to/gallery.zip
    python scripts/ingest_gallery.py /path/to/gallery.zip --dry-run
    python scripts/ingest_gallery.py /path/to/gallery.zip --skip-existing --workers 8

Getting the file into the container — two options:

  Option A  Bind-mount the directory that holds the zip (zero copy, recommended):
    docker run --rm \\
      --network face-finder_default \\
      -v /path/to/dir:/mnt/imports:ro \\
      -v face-finder_storage_data:/storage \\
      -e DATABASE_URL=... -e ADMIN_PASSWORD=... -e BACKEND_URL=http://backend:8000 \\
      face-finder-backend \\
      python scripts/ingest_gallery.py /mnt/imports/gallery.zip

  Option B  Copy into a running container (slow for large files):
      docker cp /path/to/gallery.zip face-finder-backend-1:/tmp/gallery.zip
      docker exec face-finder-backend-1 python scripts/ingest_gallery.py /tmp/gallery.zip
"""
import argparse
import asyncio
import gc
import os
import re
import signal
import sys
import threading
import time
import urllib.request
import uuid
import zipfile
from collections import deque
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

# Make `app` importable whether the script runs from /app or elsewhere
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import cv2
import numpy as np
from PIL import Image as PILImage

from app.config import settings
from app.database.session import AsyncSessionLocal
from app.face.face_service import face_service
from app.face.faiss_index import faiss_index
from app.models.detected_face import DetectedFace
from app.models.photo import Photo
from app.storage.storage_service import ALLOWED_IMAGE_EXTENSIONS, PREVIEW_EXT, PREVIEW_SIZE, THUMBNAIL_EXT, THUMBNAIL_SIZE, read_capture_time

# Save the FAISS index + commit DB rows every N processed photos. Each
# checkpoint rewrites the whole index file, so don't make this tiny; anything
# after the last checkpoint is redone by a --skip-existing re-run.
DEFAULT_CHECKPOINT = 100

DEFAULT_WORKERS = min(8, os.cpu_count() or 1)

# Non-TTY output (docker logs) only shows complete lines, so print a progress
# line at least this often instead of redrawing one with \r.
_LOG_PROGRESS_EVERY_S = 15.0

# ── helpers ───────────────────────────────────────────────────────────────────

def _sanitize(raw: str) -> str:
    name = Path(raw).name
    name = re.sub(r"[^\w\-._]", "_", name)
    return name[:200]


class _DestAllocator:
    """Unique destination paths in the gallery dir.

    Allocated on the main thread before work is handed to the pool, so two
    ZIP members with the same sanitized name (e.g. ``a/1.jpg`` and ``b/1.jpg``)
    can't race each other onto the same file.
    """

    def __init__(self, directory: str) -> None:
        self._directory = directory
        self._reserved: set[str] = set()

    def allocate(self, filename: str) -> str:
        dest = os.path.join(self._directory, filename)
        stem, suffix = Path(filename).stem, Path(filename).suffix
        n = 1
        while dest in self._reserved or os.path.exists(dest):
            dest = os.path.join(self._directory, f"{stem}_{n}{suffix}")
            n += 1
        self._reserved.add(dest)
        return dest


def _save_webp(pil: PILImage.Image, dest_path: str) -> None:
    os.makedirs(os.path.dirname(dest_path), exist_ok=True)
    pil.save(dest_path, "WEBP", quality=85, method=4)


@dataclass
class _Prepared:
    """A photo whose files are on disk and is ready for face detection."""

    photo_id: uuid.UUID
    safe_name: str
    dest_path: str
    thumb_path: str
    taken_at: datetime | None
    image: np.ndarray  # decoded BGR, full resolution — face detection needs it


_thread_local = threading.local()


def _zip_for_thread(zip_path: str) -> zipfile.ZipFile:
    # ZipFile objects aren't safe to share across threads; give each its own.
    zf = getattr(_thread_local, "zf", None)
    if zf is None:
        zf = _thread_local.zf = zipfile.ZipFile(zip_path, "r")
    return zf


def _prepare(zip_path: str, member_name: str, safe_name: str, dest_path: str) -> _Prepared | None:
    """Worker-thread step: read, decode, and write all files for one photo.

    cv2 and Pillow release the GIL for decoding, resizing and encoding, so
    several of these run truly in parallel.
    """
    image_bytes = _zip_for_thread(zip_path).read(member_name)
    img = cv2.imdecode(np.frombuffer(image_bytes, dtype=np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        return None

    taken_at = read_capture_time(image_bytes)
    Path(dest_path).write_bytes(image_bytes)
    del image_bytes

    photo_id = uuid.uuid4()
    # Preview from the original, thumbnail from the preview: the second resize
    # works on ~2000px instead of e.g. 24MP, with no visible difference at 800px.
    pil = PILImage.fromarray(cv2.cvtColor(img, cv2.COLOR_BGR2RGB))
    pil.thumbnail(PREVIEW_SIZE, PILImage.LANCZOS)
    _save_webp(pil, os.path.join(settings.PREVIEWS_DIR, f"{photo_id}{PREVIEW_EXT}"))
    pil.thumbnail(THUMBNAIL_SIZE, PILImage.LANCZOS)
    thumb_path = os.path.join(settings.THUMBNAILS_DIR, f"{photo_id}{THUMBNAIL_EXT}")
    _save_webp(pil, thumb_path)

    return _Prepared(photo_id, safe_name, dest_path, thumb_path, taken_at, img)


def _format_eta(seconds: float) -> str:
    if seconds < 60:
        return f"{int(seconds)}s"
    if seconds < 3600:
        return f"{int(seconds // 60)}m {int(seconds % 60)}s"
    return f"{seconds / 3600:.1f}h"


class _Progress:
    def __init__(self, total: int) -> None:
        self.total = total
        self.t0 = time.time()
        self._tty = sys.stdout.isatty()
        self._last_line = 0.0

    def update(self, idx: int, ok: int, faces: int, *, force: bool = False) -> None:
        elapsed = time.time() - self.t0 or 0.001
        rate = ok / elapsed
        eta = _format_eta((self.total - idx) / rate) if rate > 0 else "?"
        text = (
            f"  [{idx:>{len(str(self.total))}}/{self.total}] {idx / self.total * 100:5.1f}%  "
            f"{rate:5.2f} img/s  ETA {eta:>8}  faces {faces}"
        )
        if self._tty:
            print(f"\r{text}", end="", flush=True)
        elif force or time.time() - self._last_line >= _LOG_PROGRESS_EVERY_S:
            self._last_line = time.time()
            print(text, flush=True)

    def finish(self) -> None:
        if self._tty:
            print()


# ── core ──────────────────────────────────────────────────────────────────────

async def ingest(
    zip_path: str,
    *,
    dry_run: bool = False,
    skip_existing: bool = False,
    workers: int = DEFAULT_WORKERS,
    checkpoint_every: int = DEFAULT_CHECKPOINT,
    reload_backend: bool = True,
) -> dict:
    from sqlalchemy import select as sa_select

    print(f"Reading central directory of {zip_path} …")
    with zipfile.ZipFile(zip_path, "r") as zf:
        members = [
            m for m in zf.infolist()
            if not m.filename.endswith("/")
            and Path(m.filename).suffix.lower() in ALLOWED_IMAGE_EXTENSIONS
        ]

    total = len(members)
    print(f"Found {total:,} images.")
    stats = {"processed": 0, "skipped": 0, "faces": 0, "interrupted": False}

    if dry_run:
        print("[dry-run] No files written. Exiting.")
        return stats
    if total == 0:
        print("Nothing to process.")
        return stats

    for d in (settings.GALLERY_DIR, settings.THUMBNAILS_DIR, settings.PREVIEWS_DIR):
        os.makedirs(d, exist_ok=True)

    print("Loading face recognition model (downloads on first run) …")
    face_service._get_model()
    print(f"Model ready. Preparing photos with {workers} worker thread(s).\n")

    loop = asyncio.get_running_loop()

    # Graceful stop: finish what's in flight, checkpoint, exit.
    stop = asyncio.Event()
    for sig in (signal.SIGTERM, signal.SIGINT):
        try:
            loop.add_signal_handler(sig, stop.set)
        except (NotImplementedError, RuntimeError, ValueError):
            pass  # not on the main thread / platform without signal support

    existing_filenames: set[str] = set()
    if skip_existing:
        async with AsyncSessionLocal() as check_db:
            result = await check_db.execute(sa_select(Photo.filename))
            existing_filenames = set(result.scalars().all())
        print(f"  Skip-existing: {len(existing_filenames):,} photos already in DB.\n")

    progress = _Progress(total)
    dests = _DestAllocator(settings.GALLERY_DIR)
    photo_batch: list[Photo] = []
    face_batch: list[DetectedFace] = []

    async def _checkpoint(db) -> None:
        # Vectors first, then the rows that reference them. A crash between the
        # two leaves only unreferenced vectors, which search ignores.
        await loop.run_in_executor(None, faiss_index.save)
        if photo_batch or face_batch:
            db.add_all(photo_batch)
            db.add_all(face_batch)
            photo_batch.clear()
            face_batch.clear()
        await db.commit()

    # Decoded full-resolution photos are big (a 24MP photo is ~70MB as an
    # array), so cap how many are prepared ahead of face detection.
    max_in_flight = workers * 2
    pending: deque[tuple[str, asyncio.Future]] = deque()
    member_iter = iter(enumerate(members, 1))
    idx = 0
    since_checkpoint = 0

    def _submit_next(pool: ThreadPoolExecutor) -> bool:
        nonlocal idx
        for idx, member in member_iter:
            safe_name = _sanitize(member.filename)
            if not safe_name or (skip_existing and safe_name in existing_filenames):
                stats["skipped"] += 1
                continue
            dest = dests.allocate(safe_name)
            fut = loop.run_in_executor(pool, _prepare, zip_path, member.filename, safe_name, dest)
            pending.append((member.filename, fut))
            return True
        return False

    with ThreadPoolExecutor(max_workers=workers, thread_name_prefix="prep") as pool:
        async with AsyncSessionLocal() as db:
            while len(pending) < max_in_flight and _submit_next(pool):
                pass

            while pending:
                member_name, fut = pending.popleft()
                if not stop.is_set():
                    _submit_next(pool)

                try:
                    prepared = await fut
                except Exception as exc:
                    print(f"\n  [skip] {member_name}: {exc}", flush=True)
                    stats["skipped"] += 1
                    continue
                if prepared is None:
                    print(f"\n  [skip] {member_name}: could not decode image", flush=True)
                    stats["skipped"] += 1
                    continue

                try:
                    faces = await face_service.detect_faces(prepared.image)
                    prepared.image = None  # free the decoded photo ASAP
                    photo = Photo(
                        id=prepared.photo_id,
                        filename=prepared.safe_name,
                        original_path=prepared.dest_path,
                        thumbnail_path=prepared.thumb_path,
                        taken_at=prepared.taken_at,
                    )
                    if faces:
                        embeddings = np.array(
                            [await face_service.generate_embedding(f) for f in faces],
                            dtype=np.float32,
                        )
                        faiss_ids = await loop.run_in_executor(
                            None, faiss_index.add_vectors_batch, embeddings
                        )
                        face_batch.extend(
                            DetectedFace(photo_id=prepared.photo_id, face_index=i, faiss_vector_id=fid)
                            for i, fid in enumerate(faiss_ids)
                        )
                        stats["faces"] += len(faces)
                    photo_batch.append(photo)
                    stats["processed"] += 1
                    since_checkpoint += 1
                except Exception as exc:
                    print(f"\n  [skip] {member_name}: {exc}", flush=True)
                    stats["skipped"] += 1

                if since_checkpoint >= checkpoint_every:
                    await _checkpoint(db)
                    since_checkpoint = 0
                    gc.collect()

                progress.update(idx - len(pending), stats["processed"], stats["faces"])

            # Final checkpoint (also runs after a graceful stop).
            await _checkpoint(db)

    progress.update(idx, stats["processed"], stats["faces"], force=True)
    progress.finish()

    elapsed = time.time() - progress.t0
    stats["interrupted"] = stop.is_set()
    rate = stats["processed"] / elapsed if elapsed else 0
    print(f"\n{'─' * 40}")
    if stats["interrupted"]:
        print("  Stopped early — progress saved. Re-run with --skip-existing to continue.")
    print(f"  Finished in  {_format_eta(elapsed)}  ({rate:.2f} img/s)")
    print(f"  Processed    {stats['processed']:,} photos")
    print(f"  Skipped      {stats['skipped']:,}")
    print(f"  Faces found  {stats['faces']:,}")
    print(f"{'─' * 40}", flush=True)

    if reload_backend:
        _reload_backend_index()
    return stats


def _reload_backend_index() -> None:
    """Tell the live backend to hot-reload the FAISS index from disk."""
    backend_url = os.environ.get("BACKEND_URL", "http://localhost:8000")
    admin_password = os.environ.get("ADMIN_PASSWORD", settings.ADMIN_PASSWORD)
    try:
        req = urllib.request.Request(
            f"{backend_url}/admin/reload-index",
            method="POST",
            headers={"X-Admin-Password": admin_password, "Content-Length": "0"},
            data=b"",
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            print(f"\n  Backend index reloaded: {resp.read().decode()}")
    except Exception as exc:
        print(f"\n  [warn] Could not auto-reload backend index: {exc}")
        print(f"  Run:  curl -X POST {backend_url}/admin/reload-index -H 'X-Admin-Password: <ADMIN_PASSWORD>'")


# ── entry point ───────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Ingest a ZIP of event photos into face-finder.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument("zip_file", help="Path to the ZIP archive (inside the container)")
    parser.add_argument("--dry-run", action="store_true", help="Count images in the archive and exit without processing")
    parser.add_argument(
        "--skip-existing",
        action="store_true",
        help="Skip photos whose filename is already in the database (use to continue an interrupted run)",
    )
    parser.add_argument(
        "--workers",
        type=int,
        default=DEFAULT_WORKERS,
        help=f"Threads preparing photos in parallel (default: {DEFAULT_WORKERS})",
    )
    parser.add_argument(
        "--checkpoint",
        type=int,
        default=DEFAULT_CHECKPOINT,
        help=f"Save the index and commit to the DB every N photos (default: {DEFAULT_CHECKPOINT})",
    )
    args = parser.parse_args()

    if not os.path.isfile(args.zip_file):
        print(f"error: file not found: {args.zip_file}", file=sys.stderr)
        sys.exit(1)
    if args.workers < 1 or args.checkpoint < 1:
        parser.error("--workers and --checkpoint must be >= 1")

    stats = asyncio.run(ingest(
        args.zip_file,
        dry_run=args.dry_run,
        skip_existing=args.skip_existing,
        workers=args.workers,
        checkpoint_every=args.checkpoint,
    ))
    sys.exit(130 if stats["interrupted"] else 0)


if __name__ == "__main__":
    main()
