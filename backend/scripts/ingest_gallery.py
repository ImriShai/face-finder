#!/usr/bin/env python3
"""
Ingest a large ZIP file of event photos directly into the face-finder system.
Bypasses the HTTP upload limit — works with files of any size.

The ZIP is opened once and read sequentially; individual images are never
fully loaded into memory beyond one photo at a time.

Usage (inside the backend container):
    python scripts/ingest_gallery.py /path/to/gallery.zip
    python scripts/ingest_gallery.py /path/to/gallery.zip --dry-run

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
import sys
import time
import urllib.request
import uuid
import zipfile
from pathlib import Path

# Make `app` importable whether the script runs from /app or elsewhere
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import cv2
import numpy as np
from PIL import Image as PILImage

from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database.session import AsyncSessionLocal
from app.face.face_service import face_service
from app.face.faiss_index import faiss_index
from app.models.detected_face import DetectedFace
from app.models.photo import Photo
from app.storage.storage_service import ALLOWED_IMAGE_EXTENSIONS, PREVIEW_EXT, PREVIEW_SIZE, THUMBNAIL_EXT, THUMBNAIL_SIZE

# Commit to the DB every N successfully processed photos.
# Larger batches = fewer round-trips; smaller = less re-work if interrupted.
_COMMIT_BATCH = 25

# ── helpers ───────────────────────────────────────────────────────────────────

def _sanitize(raw: str) -> str:
    name = Path(raw).name
    name = re.sub(r"[^\w\-._]", "_", name)
    return name[:200]


def _safe_dest(directory: str, filename: str) -> str:
    dest = os.path.join(directory, filename)
    if not os.path.exists(dest):
        return dest
    stem, suffix = Path(filename).stem, Path(filename).suffix
    n = 1
    while os.path.exists(dest):
        dest = os.path.join(directory, f"{stem}_{n}{suffix}")
        n += 1
    return dest


def _make_resized(bgr: np.ndarray, dest_path: str, max_size: tuple[int, int]) -> None:
    os.makedirs(os.path.dirname(dest_path), exist_ok=True)
    rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
    pil = PILImage.fromarray(rgb)
    pil.thumbnail(max_size, PILImage.LANCZOS)
    pil.save(dest_path, "WEBP", quality=85, method=4)


def _make_thumbnail(bgr: np.ndarray, dest_path: str) -> None:
    _make_resized(bgr, dest_path, THUMBNAIL_SIZE)


def _make_preview(bgr: np.ndarray, dest_path: str) -> None:
    _make_resized(bgr, dest_path, PREVIEW_SIZE)


def _format_eta(seconds: float) -> str:
    if seconds < 60:
        return f"{int(seconds)}s"
    if seconds < 3600:
        return f"{int(seconds // 60)}m {int(seconds % 60)}s"
    return f"{seconds / 3600:.1f}h"


def _progress(idx: int, total: int, t0: float, ok: int, faces: int) -> None:
    elapsed = time.time() - t0 or 0.001
    rate = ok / elapsed
    eta = _format_eta((total - idx) / rate) if rate > 0 else "?"
    pct = idx / total * 100
    print(
        f"\r  [{idx:>{len(str(total))}}/{total}] {pct:5.1f}%  "
        f"{rate:5.1f} img/s  ETA {eta:>8}  faces {faces}",
        end="",
        flush=True,
    )


# ── core ──────────────────────────────────────────────────────────────────────

async def ingest(zip_path: str, *, dry_run: bool = False, skip_existing: bool = False) -> None:
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

    if dry_run:
        print("[dry-run] No files written. Exiting.")
        return

    if total == 0:
        print("Nothing to process.")
        return

    os.makedirs(settings.GALLERY_DIR, exist_ok=True)
    os.makedirs(settings.THUMBNAILS_DIR, exist_ok=True)
    os.makedirs(settings.PREVIEWS_DIR, exist_ok=True)

    print("Loading face recognition model (downloads on first run) …")
    face_service._get_model()
    print("Model ready.\n")

    loop = asyncio.get_running_loop()
    t0 = time.time()
    ok = skipped = total_faces = 0

    # Pre-load existing filenames so --skip-existing can check without per-photo queries.
    existing_filenames: set[str] = set()
    if skip_existing:
        async with AsyncSessionLocal() as check_db:
            result = await check_db.execute(sa_select(Photo.filename))
            existing_filenames = set(result.scalars().all())
        print(f"  Skip-existing: {len(existing_filenames):,} photos already in DB.\n")

    # Accumulate DB rows here; flushed every _COMMIT_BATCH photos.
    # UUIDs are generated Python-side (default=uuid.uuid4) so photo.id is
    # available immediately — no per-row flush needed.
    photo_batch: list[Photo] = []
    face_batch: list[DetectedFace] = []

    async def _flush_batch(db: AsyncSession) -> None:
        if photo_batch:
            db.add_all(photo_batch)
            photo_batch.clear()
        if face_batch:
            db.add_all(face_batch)
            face_batch.clear()
        await db.commit()

    with zipfile.ZipFile(zip_path, "r") as zf:
        async with AsyncSessionLocal() as db:
            for idx, member in enumerate(members, 1):
                # Snapshot batch sizes so we can roll back just this photo on failure.
                photo_checkpoint = len(photo_batch)
                face_checkpoint = len(face_batch)
                try:
                    safe_name = _sanitize(member.filename)
                    if not safe_name:
                        skipped += 1
                        continue

                    if skip_existing and safe_name in existing_filenames:
                        skipped += 1
                        _progress(idx, total, t0, ok, total_faces)
                        continue

                    # ── 1. Read compressed bytes from ZIP ────────────────────
                    image_bytes = await loop.run_in_executor(None, zf.read, member.filename)

                    # ── 2. Decode once ───────────────────────────────────────
                    arr = np.frombuffer(image_bytes, dtype=np.uint8)
                    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
                    del arr  # frombuffer is zero-copy; arr and image_bytes share memory
                    if img is None:
                        del image_bytes
                        skipped += 1
                        continue

                    # ── 3. Write original to gallery dir ─────────────────────
                    dest_path = _safe_dest(settings.GALLERY_DIR, safe_name)
                    await loop.run_in_executor(
                        None, lambda p=dest_path, b=image_bytes: Path(p).write_bytes(b)
                    )
                    del image_bytes  # on disk now — free the compressed buffer

                    # ── 4. Build Photo row — generate UUID explicitly so photo.id is
                    #       available now (SQLAlchemy's default= fires at INSERT time, not here)
                    photo_id = uuid.uuid4()
                    photo = Photo(id=photo_id, filename=safe_name, original_path=dest_path, thumbnail_path="")

                    # ── 5. Thumbnail and preview from already-decoded img (no disk re-read)
                    thumb_path = os.path.join(settings.THUMBNAILS_DIR, f"{photo_id}{THUMBNAIL_EXT}")
                    await loop.run_in_executor(None, _make_thumbnail, img, thumb_path)
                    photo.thumbnail_path = thumb_path

                    preview_path = os.path.join(settings.PREVIEWS_DIR, f"{photo_id}{PREVIEW_EXT}")
                    await loop.run_in_executor(None, _make_preview, img, preview_path)

                    # ── 6. Face detection & embedding ────────────────────────
                    faces = await face_service.detect_faces(img)
                    del img  # face detection is done — free the decoded image

                    if faces:
                        embeddings = np.array(
                            [await face_service.generate_embedding(f) for f in faces],
                            dtype=np.float32,
                        )
                        faiss_ids = await loop.run_in_executor(
                            None, faiss_index.add_vectors_batch, embeddings
                        )
                        del embeddings
                        for face_idx, faiss_id in enumerate(faiss_ids):
                            face_batch.append(DetectedFace(
                                photo_id=photo_id,
                                face_index=face_idx,
                                faiss_vector_id=faiss_id,
                            ))
                        total_faces += len(faces)

                    photo_batch.append(photo)
                    ok += 1

                    # ── 7. Bulk commit every _COMMIT_BATCH photos ────────────
                    if len(photo_batch) >= _COMMIT_BATCH:
                        await _flush_batch(db)

                except Exception as exc:
                    print(f"\n  [skip] {member.filename}: {exc}")
                    # Trim batches back to the checkpoint — previously accumulated
                    # photos in this batch are kept; only this photo's rows are dropped.
                    del photo_batch[photo_checkpoint:]
                    del face_batch[face_checkpoint:]
                    skipped += 1

                # Nudge GC every 100 photos to reclaim fragmented memory sooner
                if idx % 100 == 0:
                    gc.collect()

                _progress(idx, total, t0, ok, total_faces)

            if photo_batch or face_batch:
                await _flush_batch(db)

    print()  # end progress line

    print("Saving FAISS index …")
    await loop.run_in_executor(None, faiss_index.save)

    elapsed = time.time() - t0
    print(f"\n{'─' * 40}")
    print(f"  Finished in  {_format_eta(elapsed)}")
    print(f"  Processed    {ok:,} photos")
    print(f"  Skipped      {skipped:,}")
    print(f"  Faces found  {total_faces:,}")
    print(f"{'─' * 40}")

    # Tell the live backend to hot-reload the FAISS index from disk.
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
            body = resp.read().decode()
            print(f"\n  Backend index reloaded: {body}")
    except Exception as exc:
        print(f"\n  [warn] Could not auto-reload backend index: {exc}")
        print("  Run:  curl -X POST http://localhost:8000/admin/reload-index \\")
        print(f"             -H 'X-Admin-Password: {admin_password}'")


# ── entry point ───────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Ingest a ZIP of event photos into face-finder.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument("zip_file", help="Path to the ZIP archive (inside the container)")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Count images in the archive and exit without processing",
    )
    parser.add_argument(
        "--skip-existing",
        action="store_true",
        help="Skip photos whose filename is already in the database (useful to re-run after partial failures)",
    )
    args = parser.parse_args()

    if not os.path.isfile(args.zip_file):
        print(f"error: file not found: {args.zip_file}", file=sys.stderr)
        sys.exit(1)

    asyncio.run(ingest(args.zip_file, dry_run=args.dry_run, skip_existing=args.skip_existing))


if __name__ == "__main__":
    main()
