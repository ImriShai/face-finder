import csv
import io

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.photo import Photo


@pytest.fixture
async def photos(db_session: AsyncSession) -> list[Photo]:
    result = []
    for name in ("first.jpg", 'quo"ted,name.jpg'):
        photo = Photo(filename=name, original_path=f"/gallery/{name}", thumbnail_path="")
        db_session.add(photo)
        result.append(photo)
    await db_session.commit()
    return result


async def test_export_requires_admin_auth(client):
    resp = await client.get("/admin/photos/export.csv")
    assert resp.status_code == 401


async def test_export_returns_csv_of_all_photos(client, photos: list[Photo]):
    resp = await client.get(
        "/admin/photos/export.csv",
        headers={"X-Admin-Password": settings.ADMIN_PASSWORD},
    )
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/csv")
    assert "photos.csv" in resp.headers["content-disposition"]

    rows = list(csv.reader(io.StringIO(resp.text)))
    assert rows[0] == ["id", "filename", "created_at"]
    assert len(rows) == 1 + len(photos)
    filenames = {row[1] for row in rows[1:]}
    ids = {row[0] for row in rows[1:]}
    assert filenames == {"first.jpg", 'quo"ted,name.jpg'}  # quoting survives round-trip
    assert ids == {str(p.id) for p in photos}
