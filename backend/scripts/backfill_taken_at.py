#!/usr/bin/env python3
"""
Backfill Photo.taken_at from each stored original's EXIF capture time.

For galleries ingested before the taken_at column existed. Reads the timestamp
from the originals already in the storage volume — no re-ingest, no face
processing. Only opens image headers, so it's fast. Safe to re-run; by default
only fills rows whose taken_at is still NULL.

Run inside the backend container:
    python scripts/backfill_taken_at.py
Add --all to re-read every photo.
"""
import argparse
import asyncio
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sqlalchemy import select, update

from app.database.session import AsyncSessionLocal
from app.models.photo import Photo
from app.storage.storage_service import read_capture_time

_COMMIT_BATCH = 200


async def backfill(only_missing: bool = True) -> None:
    stmt = select(Photo.id, Photo.original_path)
    if only_missing:
        stmt = stmt.where(Photo.taken_at.is_(None))

    async with AsyncSessionLocal() as session:
        rows = (await session.execute(stmt)).all()

    total = len(rows)
    print(f"{total:,} photos to scan.", flush=True)
    updated = no_exif = missing = 0

    async with AsyncSessionLocal() as session:
        for pid, path in rows:
            if not path or not os.path.exists(path):
                missing += 1
                continue
            taken = read_capture_time(path)
            if taken is None:
                no_exif += 1
                continue
            await session.execute(update(Photo).where(Photo.id == pid).values(taken_at=taken))
            updated += 1
            if updated % _COMMIT_BATCH == 0:
                await session.commit()
                print(f"  … {updated:,} updated", flush=True)
        await session.commit()

    print(
        f"Done. scanned={total:,} updated={updated:,} no_exif={no_exif:,} missing_file={missing:,}",
        flush=True,
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Backfill Photo.taken_at from EXIF.")
    parser.add_argument("--all", action="store_true", help="Re-read every photo, not just NULLs.")
    args = parser.parse_args()
    asyncio.run(backfill(only_missing=not args.all))


if __name__ == "__main__":
    main()
