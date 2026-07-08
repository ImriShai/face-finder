import csv
import io
from collections.abc import Sequence

from app.models.photo import Photo


def build_photos_csv(photos: Sequence[Photo]) -> str:
    """Render photo metadata (id, original filename, created_at) as CSV."""
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["id", "filename", "created_at"])
    for photo in photos:
        writer.writerow([
            str(photo.id),
            photo.filename,
            photo.created_at.isoformat() if photo.created_at else "",
        ])
    return buf.getvalue()
