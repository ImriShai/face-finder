# Face Finder

Upload a selfie, get back every photo from an event gallery you appear in.

An admin uploads a ZIP of event photos → the backend detects every face, generates
embeddings, and indexes them in FAISS. A guest then uploads a selfie → the backend
embeds it and returns every photo whose faces match above a configurable similarity
threshold, in the order they were taken (EXIF capture time). Guests can favorite photos, download selections as a
ZIP in web or original quality, and come back later without retaking a selfie.

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
| `DATABASE_URL`       | backend            | **Required** (no default in source). Full async SQLAlchemy URL, e.g. `postgresql+asyncpg://user:pass@postgres:5432/db` |
| `ADMIN_PASSWORD`     | backend, frontend  | **Required** (no default in source). Guards all `/admin/*` endpoints (sent as `X-Admin-Password` header) |
| `VIEWER_PASSWORD`    | backend, frontend  | If non-empty, gates `/search` and photo/download endpoints behind a login cookie. Leave empty (the default) to make the site public |

`DATABASE_URL` and `ADMIN_PASSWORD` are deliberately required — the backend fails fast at
startup if they're missing rather than falling back to a credential baked into the code.

Other tunables live only in `app/config.py` (edit and rebuild, or override via env vars of
the same name — every `Settings` field is env-overridable):

| Setting                | Default       | Meaning                                             |
|--------------------------|---------------|--------------------------------------------------------|
| `MATCH_THRESHOLD`         | `0.45`        | Minimum cosine similarity to count as a match           |
| `MAX_UPLOAD_SIZE`         | 500 MB        | Max ZIP size for `/admin/upload-gallery`                |
| `SEARCH_RATE_LIMIT`       | `10/minute`   | Rate limit on `/search`, per client IP                  |
| `INSIGHTFACE_MODEL`       | `buffalo_l`   | InsightFace model pack                                  |
| `THUMBNAIL_SIZE`          | `(400, 400)`  | Thumbnail max dimensions                                |
| `MAX_VIDEO_UPLOAD_SIZE`   | 200 MB        | Max size of the landing-page background video           |

---

## Using the app

1. Open the frontend, go to **Admin** (`/admin`), sign in with `ADMIN_PASSWORD`.
2. Drag a ZIP of event photos onto the uploader. The backend extracts it, generates
   thumbnails/previews, detects faces, embeds them, and indexes them — all in a background
   task, so the upload request returns immediately with a queued count.
3. Watch the gallery grid fill in as ingestion proceeds (refresh or re-open Admin).
4. On the homepage, a guest uploads a selfie (drag-and-drop) and clicks **Find My Photos**.
   If multiple faces are in the selfie, the largest one is used. Results are ordered by
   when each photo was taken (EXIF `DateTimeOriginal`, falling back to `DateTime`);
   photos with no usable date come last, ordered by filename. Each result still shows its
   match confidence. There's an empty state if nothing matches.
5. From the results page (or Admin gallery), select photos and download them individually
   or as a ZIP; a progress bar shows percentage and estimated size while it streams.
   The ZIP download offers two qualities: **Web size** (the ~2000px WebP previews, ~50×
   smaller — the right choice on phone/Wi-Fi connections) or **Original quality**
   (full-resolution files).

### Favorites, sessions, and pick-up-where-you-left-off

All three are stored per browser in `localStorage` (the app has no user accounts):

- **Favorites** — every photo card and lightbox has a small heart (results page and Admin
  gallery). A **Liked** toggle on both pages filters to hearted photos; it composes with
  selection, so *filter to liked → select all → download ZIP / export CSV* works. Admin
  additionally gets a **Clear liked** button. Hearts sync live across open tabs.
- **Saved search session** — results are cached after each search, so refreshing the
  results page keeps them, and the homepage shows *"Continue where you left off"* so a
  returning guest doesn't need to retake a selfie. Sessions expire after 30 days.
- **Last-viewed checkpoint** — the last photo previewed in the modal is remembered; on
  return, the gallery reveals up to it, scrolls to it, and marks it with a *Last viewed*
  chip.

### Event sections

In Admin, **Event Sections** lets you name the parts of the day by start time (e.g.
*Ceremony* at 18:00, *Reception* at 20:30). A photo belongs to the latest section that
started at or before its capture time. On the results page, guests get a filter button for
each section they appear in. Times are wall-clock with no timezone, compared directly with
the cameras' EXIF timestamps, so enter them in the cameras' local time. Photos without a
capture time aren't assigned to any section. Stored in `/storage/events_config.json`.

### Landing page branding

In Admin, **Landing Page** sets an optional landing-page title and a background video (`.mp4`,
`.webm`, `.mov`, or `.ogg`, up to `MAX_VIDEO_UPLOAD_SIZE`). Uploading a new video replaces
the old one only after the upload completes, so a failed upload keeps the current one.
Both are public (served without the viewer password) since they're shown on the landing
page. Stored under `/storage/branding/`.

### Language

The UI is available in English and Hebrew (right-to-left layout), switchable from the
language toggle; the choice is remembered per browser.

### Admin CSV export

In the Admin gallery's select mode, **Export CSV** downloads `photos.csv` for the selected
photos with columns `id`, `filename` (the original name from the uploaded ZIP), and
`created_at`.

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

### Backfilling capture times for older galleries

Photos ingested before the `taken_at` column existed have no capture time, so they sort by
filename and don't fall into event sections. Fill them in from the stored originals' EXIF
data (no re-ingest, no face processing):

```bash
docker compose exec backend python scripts/backfill_taken_at.py        # only rows still NULL
docker compose exec backend python scripts/backfill_taken_at.py --all  # re-read every photo
```

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

### GPU acceleration (optional)

Face detection and embedding during ingestion can run on an NVIDIA GPU. The default image
stays CPU-only; `backend/Dockerfile.gpu` builds a CUDA 11.8 + `onnxruntime-gpu` variant.
It needs an NVIDIA driver (>= 520) and the NVIDIA Container Toolkit on the host:

```bash
docker build -f backend/Dockerfile.gpu -t face-finder-backend-gpu backend
# then run it with --gpus all (or add a GPU device reservation to the compose service)
```

At startup the backend logs `InsightFace providers=...`. It uses CUDA when available and
falls back to CPU otherwise, so the same code runs on both images.

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

- **`photos`**: `id` (UUID), `filename`, `original_path`, `thumbnail_path`, `created_at`,
  `taken_at` (EXIF capture time, nullable).
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
| `POST /search`                         | viewer          | Upload a selfie, get back matching photos ordered by capture time (rate-limited) |
| `GET /events`                          | none            | Admin-defined event sections (`label`, `starts_at`) |
| `GET /landing-config`                  | none            | Landing title and whether a background video is set |
| `GET /background-video`                | none            | Streams the landing background video (range requests supported) |
| `GET /photos/{id}`                     | viewer          | Original photo file |
| `GET /photos/{id}/preview`             | viewer          | ~2000px WebP preview (generated on first request) |
| `GET /thumbnails/{id}`                 | none            | 400×400 thumbnail |
| `POST /photos/download-zip-token`      | viewer          | Resolve a photo-ID selection (plus `quality`: `"original"` \| `"web"`) to a short-lived download token + estimated ZIP size |
| `GET /photos/download-zip/{token}`     | token           | Streams the ZIP for a token from `download-zip-token` (single-use, 5-minute TTL) |
| `POST /admin/upload-gallery`           | admin           | Upload a ZIP of event photos (background-processed) |
| `POST /admin/reload-index`             | admin           | Hot-swap the in-memory FAISS index from disk |
| `GET /admin/index-status`              | admin           | In-memory vs on-disk FAISS vector counts |
| `POST /admin/regen-thumbnails`         | admin           | Regenerate all thumbnails as WebP (background) |
| `POST /admin/regen-previews`           | admin           | Generate missing previews (background) |
| `GET /admin/photos`                    | admin           | Paginated photo list for the admin gallery (stable `created_at, id` ordering) |
| `POST /admin/photos/export.csv`        | admin           | CSV (`id`, `filename`, `created_at`) for the given photo IDs |
| `PUT /admin/events`                    | admin           | Replace the event sections (JSON list of `{label, starts_at}`) |
| `PUT /admin/landing-config`            | admin           | Set the landing title (`{"title": ...}`; empty clears it) |
| `POST /admin/background-video`         | admin           | Upload/replace the background video (multipart, size-capped) |
| `DELETE /admin/background-video`       | admin           | Remove the background video |

"admin" auth = `X-Admin-Password` header. "viewer" auth = `viewer_token` cookie (set via
`/auth/login`) or `X-Viewer-Password` header; both are no-ops if `VIEWER_PASSWORD` is unset.

Search response shape:

```json
{
  "matches": [
    {
      "photo_id": "d290f1ee-6c54-4b01-90e6-d701748f0851",
      "confidence": 0.93,
      "taken_at": "2025-06-01T18:30:00"
    }
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
  previews/      # <photo_id>.webp, ~2000px — generated at ingestion (or on demand),
                 # served by the preview endpoint and reused for web-size ZIP downloads
  faiss.index    # binary FAISS index file
  events_config.json  # admin-defined event sections
  branding/      # landing.json (title) + background.<ext> (video)
```

Previews are written atomically (temp file + rename), so concurrent readers never see a
half-written image and a crash can't leave a truncated file behind.

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
    services/      # business logic (search_service, download_service, export_service)
    face/          # InsightFace wrapper (face_service) + FAISS index (faiss_index)
    database/      # SQLAlchemy session/engine setup
    models/        # SQLAlchemy ORM models (Photo, DetectedFace)
    schemas/       # Pydantic request/response models
    workers/       # background gallery ingestion (gallery_worker)
    storage/       # file storage helpers (zip extraction, thumbnails, previews)
  alembic/         # migrations
  scripts/         # ingest_gallery.py (large-ZIP ingestion), backfill_taken_at.py
  tests/

frontend/
  src/
    pages/         # HomePage, ResultsPage, AdminPage
    components/     # PhotoGallery, PhotoModal, DownloadQualityMenu, FavoriteButton, ...
    services/       # api.ts — all backend calls
    hooks/          # usePhotoFeed (admin feed), useInfiniteScroll, useFavorites
    utils/          # userPrefs (favorites/session/checkpoint), formatBytes, preloadRadius
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
- **Browser shows the old UI after a deploy** — nginx serves `index.html` with
  `Cache-Control: no-cache` (hash-named assets are cached for a year), so a plain reload
  picks up new builds. A tab that was already open keeps running the old bundle until it's
  reloaded.
