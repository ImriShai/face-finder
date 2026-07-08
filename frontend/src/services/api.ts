import axios from 'axios'
import type { PhotoListResponse, SearchResponse } from '../types'

const client = axios.create({ baseURL: '/api' })

// ── Admin auth ────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'adminPassword'

export function getAdminPassword(): string {
  return sessionStorage.getItem(STORAGE_KEY) ?? ''
}

export function saveAdminPassword(password: string): void {
  sessionStorage.setItem(STORAGE_KEY, password)
}

export function clearAdminPassword(): void {
  sessionStorage.removeItem(STORAGE_KEY)
}

function adminClient() {
  return axios.create({
    baseURL: '/api',
    headers: { 'X-Admin-Password': getAdminPassword() },
  })
}

// ── Viewer auth ───────────────────────────────────────────────────────────────

export async function authConfig(): Promise<{ requires_viewer_password: boolean }> {
  const { data } = await client.get('/auth/config')
  return data
}

export async function viewerLogin(password: string): Promise<void> {
  await client.post('/auth/login', { password }, { withCredentials: true })
}

export async function viewerLogout(): Promise<void> {
  await client.post('/auth/logout', {}, { withCredentials: true }).catch(() => {})
}

/** Returns true if the viewer session cookie is still valid. */
export async function verifyViewerSession(): Promise<boolean> {
  try {
    await client.get('/auth/verify', { withCredentials: true })
    return true
  } catch {
    return false
  }
}

// ── Public endpoints ──────────────────────────────────────────────────────────

const viewerClient = axios.create({ baseURL: '/api', withCredentials: true })

export async function searchByFace(selfie: File, mode: 'union' | 'intersection' = 'union'): Promise<SearchResponse> {
  const form = new FormData()
  form.append('file', selfie)
  form.append('mode', mode)
  const { data } = await viewerClient.post<SearchResponse>('/search', form)
  return data
}

export function thumbnailUrl(photoId: string): string {
  return `/api/thumbnails/${photoId}`
}

export function photoUrl(photoId: string): string {
  return `/api/photos/${photoId}`
}

export function previewUrl(photoId: string): string {
  return `/api/photos/${photoId}/preview`
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export async function downloadPhoto(photoId: string): Promise<void> {
  const res = await viewerClient.get(`/photos/${photoId}`, { responseType: 'blob' })
  const cd: string = res.headers['content-disposition'] ?? ''
  const match = cd.match(/filename="?([^";]+)"?/)
  const filename = match?.[1] ?? `photo-${photoId}.jpg`
  triggerBlobDownload(res.data as Blob, filename)
}

export interface DownloadProgress {
  loaded: number
  /** Estimated total ZIP size in bytes; server computes this from source file sizes, not byte-exact. */
  total: number
}

/**
 * 'web' zips the 2000px previews (~50x smaller than originals) — the right
 * default for phone/Wi-Fi connections. 'original' zips the full-resolution files.
 */
export type DownloadQuality = 'original' | 'web'

const PROGRESS_INTERVAL_MS = 150

export async function downloadZip(
  photoIds: string[],
  quality: DownloadQuality,
  zipName = 'photos.zip',
  onProgress?: (progress: DownloadProgress) => void,
): Promise<void> {
  // Step 1: resolve photo paths server-side and get a short-lived token plus an estimated size (~instant).
  const { data } = await viewerClient.post<{ token: string; estimated_size: number }>(
    '/photos/download-zip-token',
    { photo_ids: photoIds, quality },
  )

  // Step 2: stream the response ourselves (instead of a plain <a> navigation) so we can
  // report percentage / estimated-size progress — the browser's own download indicator
  // only ever shows raw bytes received.
  const res = await fetch(`/api/photos/download-zip/${data.token}`, { credentials: 'include' })
  if (!res.ok || !res.body) throw new Error('Download failed')

  const total = data.estimated_size
  const reader = res.body.getReader()
  const chunks: BlobPart[] = []
  let loaded = 0
  let lastEmit = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    loaded += value.byteLength
    // Throttle: a state update per network chunk re-renders the page hundreds
    // of times per second for no visible benefit.
    const now = Date.now()
    if (now - lastEmit >= PROGRESS_INTERVAL_MS) {
      lastEmit = now
      onProgress?.({ loaded, total })
    }
  }
  onProgress?.({ loaded, total })

  triggerBlobDownload(new Blob(chunks, { type: 'application/zip' }), zipName)
}

// ── Admin endpoints ───────────────────────────────────────────────────────────

export async function uploadGallery(
  file: File,
  onProgress?: (pct: number) => void,
): Promise<{ status: string; photos_queued: number }> {
  const form = new FormData()
  form.append('file', file)
  const { data } = await adminClient().post('/admin/upload-gallery', form, {
    onUploadProgress: (e) => {
      if (onProgress && e.total) onProgress(Math.round((e.loaded / e.total) * 100))
    },
  })
  return data
}

/** Download a CSV of the given photos' ids and original filenames (admin only). */
export async function exportPhotosCsv(photoIds: string[]): Promise<void> {
  const res = await adminClient().post(
    '/admin/photos/export.csv',
    { photo_ids: photoIds },
    { responseType: 'blob' },
  )
  triggerBlobDownload(res.data as Blob, 'photos.csv')
}

export async function listPhotos(page = 1, pageSize = 48): Promise<PhotoListResponse> {
  const { data } = await adminClient().get<PhotoListResponse>('/admin/photos', {
    params: { page, page_size: pageSize },
  })
  return data
}
