import csv
import io

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.photo import Photo

_ADMIN = {"X-Admin-Password": settings.ADMIN_PASSWORD}


@pytest.fixture
async def photos(db_session: AsyncSession) -> list[Photo]:
    result = []
    for name in ("first.jpg", 'quo"ted,name.jpg', "third.jpg"):
        photo = Photo(filename=name, original_path=f"/gallery/{name}", thumbnail_path="")
        db_session.add(photo)
        result.append(photo)
    await db_session.commit()
    return result


async def test_export_requires_admin_auth(client, photos: list[Photo]):
    resp = await client.post(
        "/admin/photos/export.csv", json={"photo_ids": [str(photos[0].id)]}
    )
    assert resp.status_code == 401


async def test_export_rejects_empty_selection(client):
    resp = await client.post("/admin/photos/export.csv", json={"photo_ids": []}, headers=_ADMIN)
    assert resp.status_code == 422


async def test_export_returns_csv_of_selected_photos_only(client, photos: list[Photo]):
    selected = photos[:2]
    resp = await client.post(
        "/admin/photos/export.csv",
        json={"photo_ids": [str(p.id) for p in selected]},
        headers=_ADMIN,
    )
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/csv")
    assert "photos.csv" in resp.headers["content-disposition"]

    rows = list(csv.reader(io.StringIO(resp.text)))
    assert rows[0] == ["id", "filename", "created_at"]
    assert len(rows) == 1 + len(selected)  # third.jpg not included
    assert {row[0] for row in rows[1:]} == {str(p.id) for p in selected}
    assert {row[1] for row in rows[1:]} == {"first.jpg", 'quo"ted,name.jpg'}


async def test_export_unknown_ids_returns_404(client, photos: list[Photo]):
    resp = await client.post(
        "/admin/photos/export.csv",
        json={"photo_ids": ["00000000-0000-0000-0000-000000000000"]},
        headers=_ADMIN,
    )
    assert resp.status_code == 404
