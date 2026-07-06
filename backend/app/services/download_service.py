import os
import secrets
import shutil
import threading
import time
import uuid
import zipfile
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.photo import Photo

_COPY_BUF = 1 << 20  # 1 MB — vs zipfile's hardcoded 8 KB default

# Short-lived download tokens: token -> (entries, expiry_timestamp)
# Single-worker deployment so in-memory is fine.
_TOKEN_TTL = 300  # seconds
_download_tokens: dict[str, tuple[list[tuple[str, str]], float]] = {}

# Per-entry ZIP overhead (local header + data descriptor + central directory
# record for a ZIP64/STORED entry, excluding filename bytes counted separately)
# plus the end-of-central-directory record. Used only to give the client a
# size to show progress against — it doesn't need to be byte-exact.
_ZIP_OVERHEAD_PER_ENTRY = 150
_ZIP_OVERHEAD_END = 200


def stream_zip(entries: list[tuple[str, str]]):
    """Stream ZIP bytes via OS pipe with large-buffer file copies."""
    r_fd, w_fd = os.pipe()
    try:
        import fcntl
        fcntl.fcntl(w_fd, 1031, _COPY_BUF)  # F_SETPIPE_SZ — increase kernel pipe buffer
    except Exception:
        pass

    # Populated by _worker on failure. A failed build still closes the pipe, which
    # looks like a clean EOF to the reader below — without this, a truncated ZIP
    # would be streamed out looking exactly like a complete, successful download.
    errors: list[Exception] = []

    def _worker() -> None:
        try:
            with os.fdopen(w_fd, "wb", buffering=_COPY_BUF) as w:
                with zipfile.ZipFile(w, "w", zipfile.ZIP_STORED, allowZip64=True) as zf:
                    seen: set[str] = set()
                    for path, name in entries:
                        arc_name = name
                        if arc_name in seen:
                            stem, ext = Path(name).stem, Path(name).suffix
                            n = 1
                            while arc_name in seen:
                                arc_name = f"{stem}_{n}{ext}"
                                n += 1
                        seen.add(arc_name)
                        with open(path, "rb") as src, zf.open(arc_name, "w", force_zip64=True) as dst:
                            shutil.copyfileobj(src, dst, length=_COPY_BUF)
        except Exception as exc:
            errors.append(exc)
            try:
                os.close(w_fd)
            except OSError:
                pass

    thread = threading.Thread(target=_worker, daemon=True)
    thread.start()
    with os.fdopen(r_fd, "rb") as r:
        while chunk := r.read(1 << 18):
            yield chunk

    # The pipe only closes once the worker thread has returned, so it has already
    # finished (and populated `errors`, if any) by this point — join() just makes
    # that happen-before relationship explicit rather than relying on it silently.
    thread.join()
    if errors:
        raise RuntimeError("ZIP build failed partway through") from errors[0]


async def resolve_entries(photo_ids: list[uuid.UUID], db: AsyncSession) -> list[tuple[str, str]]:
    result = await db.execute(select(Photo).where(Photo.id.in_(photo_ids)))
    photos_by_id = {p.id: p for p in result.scalars().all()}
    return [
        (photos_by_id[pid].original_path, photos_by_id[pid].filename)
        for pid in photo_ids
        if pid in photos_by_id and os.path.exists(photos_by_id[pid].original_path)
    ]


def estimate_zip_size(entries: list[tuple[str, str]]) -> int:
    total = _ZIP_OVERHEAD_END
    for path, name in entries:
        try:
            size = os.path.getsize(path)
        except OSError:
            continue
        total += size + _ZIP_OVERHEAD_PER_ENTRY + 2 * len(name.encode("utf-8"))
    return total


def create_token(entries: list[tuple[str, str]]) -> str:
    """Cache `entries` under a fresh opaque token, evicting any expired tokens."""
    now = time.monotonic()
    expired = [k for k, (_, exp) in _download_tokens.items() if exp < now]
    for k in expired:
        del _download_tokens[k]

    token = secrets.token_urlsafe(16)
    _download_tokens[token] = (entries, now + _TOKEN_TTL)
    return token


def pop_token(token: str) -> list[tuple[str, str]] | None:
    """Consume a token, returning its entries — or None if unknown/expired."""
    now = time.monotonic()
    record = _download_tokens.pop(token, None)
    if record is None or record[1] < now:
        return None
    return record[0]
