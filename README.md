# Face Finder

Upload a selfie, get back every photo from an event gallery you appear in.

An admin uploads a ZIP of event photos → the backend detects every face, generates
embeddings, and indexes them in FAISS. A guest then uploads a selfie → the backend
embeds it and returns every photo whose faces match above a configurable similarity
threshold, sorted by confidence.

## Contents

- [Architecture](#architecture)
- [Quick start (Docker)](#quick-start-docker)
- [Configuration](#configuration)
- [Using the app](#using-the-app)
- [Ingesting a gallery](#ingesting-a-gallery)
- [Local development (without Docker)](#local-development-without-docker)
- [Database & migrations](#database--migrations)
- [API reference](#api-reference)
- [Testing](#testing)
- [Storage layout](#storage-layout)
- [Project structure](#project-structure)
- [Troubleshooting](#troubleshooting)

---

## Architecture

```
┌────────────┐      ┌─────────────┐      ┌──────────────────┐
│  Frontend  │ ───▶ │   Backend   │ ───▶ │   PostgreSQL      │  photo/face metadata
│  (React,   │ /api │  (FastAPI)  │      └──────────────────┘
│  nginx)    │◀─── │             │ ───▶ ┌──────────────────┐
└────────────┘      │             │      │   FAISS index     │  face embeddings
                     │             │      │   (on disk)       │  (cosine similarity)
                     │             │ ───▶ ┌──────────────────┐
                     └─────────────┘      │  /storage volume  │  originals, thumbnails,
                                           │                    │  previews
                                           └──────────────────┘
```

- **Frontend**: React + TypeScript + Vite + MUI. Built to static files and served by nginx,
  which proxies `/api` to the backend.
- **Backend**: FastAPI + SQLAlchemy 2.0 (async) + Alembic. Face detection/embedding via
  InsightFace (`buffalo_l` model, downloaded on first run), similarity search via FAISS
  (cosine similarity over normalized embeddings).
- **Database**: PostgreSQL stores `Photo` and `DetectedFace` metadata (one photo → many
  faces). The FAISS index itself lives on disk in the `storage` volume, not in Postgres —
  `DetectedFace.faiss_vector_id` links a face row to its vector.
- **Storage**: originals, thumbnails (WebP, 400×400), and previews (WebP, ~2000px) all live
  under `/storage` inside the backend container (a named Docker volume in Compose).
  Uploaded search selfies are processed in memory and never written to disk permanently.

No user accounts, no payments, no social features. There's a single **admin** password
(gallery management) and an optional **viewer** password (gate the whole site).

---

## Quick start (Docker)

Requirements: Docker + Docker Compose.

```bash
cp .env.example .env
# edit .env — at minimum change ADMIN_PASSWORD and VIEWER_PASSWORD
docker compose up --build
```

This starts three services: `postgres`, `backend` (runs Alembic migrations on boot, then
Uvicorn), and `frontend` (nginx serving the built React app). First boot also downloads the
InsightFace model (~300 MB) into a named volume so subsequent restarts are fast.

- Frontend: http://localhost:5173
- Backend API: http://localhost:8000 (docs at `/docs`)
- Health check: http://localhost:8000/health

Stop everything:

```bash
docker compose down        # keep data
docker compose down -v     # also wipe postgres_data, storage_data, insightface_models
```

---

## Configuration

All configuration is environment variables, read from `.env` at the repo root (used by
Compose) and by `app/config.py` (`pydantic-settings`, same `.env` file when running the
backend directly).

| Variable            | Used by            | Purpose                                                              |
|----------------------|---------------------|------------------------------------------------------------------------|
| `POSTGRES_USER`      | postgres, backend  | DB username                                                            |
| `POSTGRES_PASSWORD`  | postgres, backend  | DB password                                                            |
| `POSTGRES_DB`        | postgres, backend  | DB name                                                                |
| `DATABASE_URL`       | backend            | Full async SQLAlchemy URL, e.g. `postgresql+asyncpg://user:pass@postgres:5432/db` |
| `ADMIN_PASSWORD`     | backend, frontend  | Required for all `/admin/*` endpoints (sent as `X-Admin-Password` header) |
| `VIEWER_PASSWORD`    | backend, frontend  | If non-empty, gates `/search` and photo/download endpoints behind a login cookie. Leave empty to make the site public |

Other tunables live only in `app/config.py` (edit and rebuild, or override via env vars of
the same name — every `Settings` field is env-overridable):

| Setting                | Default       | Meaning                                             |
|--------------------------|---------------|--------------------------------------------------------|
| `MATCH_THRESHOLD`         | `0.45`        | Minimum cosine similarity to count as a match           |
| `MAX_UPLOAD_SIZE`         | 500 MB        | Max ZIP size for `/admin/upload-gallery`                |
| `SEARCH_RATE_LIMIT`       | `10/minute`   | Rate limit on `/search`, per client IP                  |
| `INSIGHTFACE_MODEL`       | `buffalo_l`   | InsightFace model pack                                  |
| `THUMBNAIL_SIZE`          | `(400, 400)`  | Thumbnail max dimensions                                |

---

## Using the app

1. Open the frontend, go to **Admin** (`/admin`), sign in with `ADMIN_PASSWORD`.
2. Drag a ZIP of event photos onto the uploader. The backend extracts it, generates
   thumbnails/previews, detects faces, embeds them, and indexes them — all in a background
   task, so the upload request returns immediately with a queued count.
3. Watch the gallery grid fill in as ingestion proceeds (refresh or re-open Admin).
4. On the homepage, a guest uploads a selfie (drag-and-drop) and clicks **Find Photos**.
   If multiple faces are in the selfie, the largest one is used. Results are sorted by
   confidence, with an empty state if nothing matches.
5. From the results page (or Admin gallery), select photos and download them individually
   or as a ZIP; a progress bar shows percentage and estimated size while it streams.

---

## Ingesting a gallery

There are two ways to get photos in:

### 1. Through the Admin UI / API (small-to-medium ZIPs)

`POST /admin/upload-gallery` (multipart ZIP), capped at `MAX_UPLOAD_SIZE` (default 500 MB).
Good for day-to-day use. Validates extensions/MIME types, sanitizes filenames, and guards
against ZIP Slip (path traversal) during extraction.

### 2. `scripts/ingest_gallery.py` (large ZIPs, bypasses the HTTP upload limit)

For galleries too large to comfortably upload over HTTP, run the ingestion script directly
inside the backend container. It streams the ZIP's central directory, reads one photo at a
time, and commits to the DB in batches — memory stays flat regardless of ZIP size.

```bash
# Option A — bind-mount the directory holding the zip (zero copy, recommended)
docker run --rm \
  --network face-finder_default \
  -v /path/to/dir:/mnt/imports:ro \
  -v face-finder_storage_data:/storage \
  -e DATABASE_URL=postgresql+asyncpg://postgres:changeme@postgres:5432/facefinder \
  -e ADMIN_PASSWORD=changeme \
  -e BACKEND_URL=http://backend:8000 \
  face-finder-backend \
  python scripts/ingest_gallery.py /mnt/imports/gallery.zip

# Option B — copy into an already-running container (slower for large files)
docker cp /path/to/gallery.zip face-finder-backend-1:/tmp/gallery.zip
docker exec face-finder-backend-1 python scripts/ingest_gallery.py /tmp/gallery.zip
```

Useful flags:

- `--dry-run` — count images in the ZIP and exit, no writes.
- `--skip-existing` — skip photos whose filename is already in the DB (safe to re-run after
  a partial failure/interruption).

On completion the script POSTs to `/admin/reload-index` so the running backend picks up the
new FAISS vectors without a restart (it prints a manual `curl` fallback if that call fails).

### Re-deriving thumbnails/previews or reloading the index manually

```bash
curl -X POST http://localhost:8000/admin/regen-thumbnails -H "X-Admin-Password: $ADMIN_PASSWORD"
curl -X POST http://localhost:8000/admin/regen-previews   -H "X-Admin-Password: $ADMIN_PASSWORD"
curl -X POST http://localhost:8000/admin/reload-index      -H "X-Admin-Password: $ADMIN_PASSWORD"
curl http://localhost:8000/admin/index-status               -H "X-Admin-Password: $ADMIN_PASSWORD"
```

---

## Local development (without Docker)

Postgres still needs to run somewhere reachable (Docker is the easiest way to get just
that piece: `docker compose up -d postgres`).

### Backend

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt   # installs requirements.txt too
cp ../.env.example ../.env            # if not already created; DATABASE_URL should point at localhost, not `postgres`
alembic upgrade head
uvicorn app.main:app --reload
```

When running outside Docker, point `DATABASE_URL` at `localhost` instead of the `postgres`
service hostname, e.g.:

```
DATABASE_URL=postgresql+asyncpg://postgres:changeme@localhost:5432/facefinder
```

### Frontend

```bash
cd frontend
npm install
npm run dev      # http://localhost:5173, proxies /api → http://localhost:8000
```

### Common backend commands

```bash
pytest                                  # full suite (uses an in-memory SQLite DB, no Postgres needed)
pytest tests/test_storage_service.py    # single file
alembic revision -m "message"           # new migration
alembic upgrade head                    # apply migrations
alembic downgrade -1                    # revert last migration
```

### Common frontend commands

```bash
npm run dev          # dev server
npm run build         # production build (tsc -b && vite build)
npm run test:run       # run Vitest suite once
npm run coverage       # coverage report
npm run lint           # eslint
```

---

## Database & migrations

Two tables, managed by Alembic (`backend/alembic/versions/`):

- **`photos`**: `id` (UUID), `filename`, `original_path`, `thumbnail_path`, `created_at`.
- **`detected_faces`**: `id`, `photo_id` (FK → photos), `face_index`, `faiss_vector_id`.
  One photo can have many faces.

The FAISS index is not a table — it's a flat binary file on disk
(`FAISS_INDEX_PATH`, default `/storage/faiss.index`) mapping vector IDs to embeddings.
`detected_faces.faiss_vector_id` is the join key between Postgres and FAISS.

Migrations run automatically on backend container start (`alembic upgrade head` in the
Docker `CMD`). To create a new migration after changing a model:

```bash
cd backend
alembic revision -m "add some_column to photos"
# edit the generated file under alembic/versions/
alembic upgrade head
```

---

## API reference

All endpoints are under the backend root; the frontend calls them via `/api/*` (nginx/Vite
strip the `/api` prefix). Interactive docs: `GET /docs`.

| Method & path                         | Auth            | Purpose |
|----------------------------------------|-----------------|---------|
| `GET /health`                          | none            | Liveness check |
| `GET /auth/config`                     | none            | Whether a viewer password is required |
| `POST /auth/login`                     | none            | Viewer login, sets `viewer_token` cookie |
| `POST /auth/logout`                    | none            | Clears the viewer cookie |
| `GET /auth/verify`                     | viewer cookie   | Checks the current session is still valid |
| `POST /search`                         | viewer          | Upload a selfie, get back matching photos (rate-limited) |
| `GET /photos/{id}`                     | viewer          | Original photo file |
| `GET /photos/{id}/preview`             | viewer          | ~2000px WebP preview (generated on first request) |
| `GET /thumbnails/{id}`                 | none            | 400×400 thumbnail |
| `POST /photos/download-zip-token`      | viewer          | Resolve a photo-ID selection to a short-lived download token + estimated ZIP size |
| `GET /photos/download-zip/{token}`     | token           | Streams the ZIP for a token from `download-zip-token` |
| `POST /admin/upload-gallery`           | admin           | Upload a ZIP of event photos (background-processed) |
| `POST /admin/reload-index`             | admin           | Hot-swap the in-memory FAISS index from disk |
| `GET /admin/index-status`              | admin           | In-memory vs on-disk FAISS vector counts |
| `POST /admin/regen-thumbnails`         | admin           | Regenerate all thumbnails as WebP (background) |
| `POST /admin/regen-previews`           | admin           | Generate missing previews (background) |
| `GET /admin/photos`                    | admin           | Paginated photo list for the admin gallery |

"admin" auth = `X-Admin-Password` header. "viewer" auth = `viewer_token` cookie (set via
`/auth/login`) or `X-Viewer-Password` header; both are no-ops if `VIEWER_PASSWORD` is unset.

Search response shape:

```json
{
  "matches": [
    { "photo_id": "d290f1ee-6c54-4b01-90e6-d701748f0851", "confidence": 0.93 }
  ],
  "faces_detected": 1
}
```

---

## Testing

- **Backend**: `pytest` (from `backend/`, inside the venv). Uses an in-memory SQLite DB via
  `httpx.AsyncClient` against the FastAPI app — no running Postgres required. Covers face
  detection/embedding, search accuracy, gallery upload, and storage handling.
- **Frontend**: `npm run test:run` (Vitest + Testing Library, jsdom environment).

Both suites are also good smoke tests after a dependency bump — run them before rebuilding
Docker images.

---

## Storage layout

Inside the backend container (the `storage_data` volume in Compose):

```
/storage/
  gallery/       # original uploaded photos, sanitized filenames
  thumbnails/    # <photo_id>.webp, 400×400
  previews/      # <photo_id>.webp, ~2000px, generated lazily on first request
  faiss.index    # binary FAISS index file
```

The InsightFace model itself is cached separately in `/root/.insightface` inside the
container, backed by the `insightface_models` named volume — so it survives container
recreation but is downloaded fresh the first time that volume is created.

Selfies uploaded for search are processed entirely in memory and are never written here.

---

## Project structure

```
backend/
  app/
    api/          # thin FastAPI routers (admin, auth, health, photos, search)
    services/      # business logic (search_service, storage_service helpers)
    face/          # InsightFace wrapper (face_service) + FAISS index (faiss_index)
    database/      # SQLAlchemy session/engine setup
    models/        # SQLAlchemy ORM models (Photo, DetectedFace)
    schemas/       # Pydantic request/response models
    workers/       # background gallery ingestion (gallery_worker)
    storage/       # file storage helpers (zip extraction, thumbnails, previews)
  alembic/         # migrations
  scripts/         # ingest_gallery.py — out-of-band large-ZIP ingestion
  tests/

frontend/
  src/
    pages/         # HomePage, ResultsPage, AdminPage
    components/     # PhotoGallery, PhotoModal, ZipUploader, ConfidenceChip, ...
    services/       # api.ts — all backend calls
    hooks/          # usePhotoFeed (paginated/infinite-scroll admin gallery)
    utils/          # formatBytes, preloadRadius
    types/
```

---

## Troubleshooting

- **`docker compose up` fails on first boot / backend keeps restarting** — check
  `docker compose logs backend`; the most common cause is Postgres not being healthy yet
  (Compose already waits on `service_healthy`, but a slow first-time volume init can still
  race) or a bad `DATABASE_URL`.
- **Search returns no matches for a face you know is in the gallery** — confirm ingestion
  actually finished (`GET /admin/index-status`, compare `in_memory_vectors` to
  `on_disk_vectors`; if they differ, `POST /admin/reload-index`), and consider whether
  `MATCH_THRESHOLD` (default `0.45`) is too strict for that image quality.
- **Thumbnails look wrong after a code change to thumbnail generation** —
  `POST /admin/regen-thumbnails` / `POST /admin/regen-previews` regenerate everything from
  the stored originals; nothing needs re-uploading.
- **Frontend can't reach the backend in dev** — `npm run dev` proxies `/api` to
  `http://localhost:8000` (see `frontend/vite.config.ts`); make sure the backend is running
  on that port, or edit the proxy target.
