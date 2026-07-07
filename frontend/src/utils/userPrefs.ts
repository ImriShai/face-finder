import type { SearchMode, SearchResponse } from '../types'

// Per-browser user preferences. The app intentionally has no user accounts,
// so favorites, the cached search session, and the last-viewed checkpoint are
// scoped to this browser via localStorage.

export const FAVORITES_KEY = 'ff_favorite_photo_ids'
const SEARCH_SESSION_KEY = 'ff_last_search'
const LAST_VIEWED_KEY = 'ff_last_viewed_photo'

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Private mode / quota exceeded — preferences just don't persist.
  }
}

// ── Favorites ─────────────────────────────────────────────────────────────────

export function loadFavorites(): Set<string> {
  const ids = read<string[]>(FAVORITES_KEY)
  return new Set(Array.isArray(ids) ? ids : [])
}

export function saveFavorites(ids: Set<string>): void {
  write(FAVORITES_KEY, Array.from(ids))
}

// ── Search session ────────────────────────────────────────────────────────────

export interface SavedSearch extends SearchResponse {
  mode: SearchMode
  savedAt: number
}

export function saveSearchSession(result: SearchResponse & { mode: SearchMode }): void {
  write(SEARCH_SESSION_KEY, { ...result, savedAt: Date.now() } satisfies SavedSearch)
}

/** Sessions older than this are dropped — the gallery may have changed under them. */
const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

export function loadSearchSession(): SavedSearch | null {
  const saved = read<SavedSearch>(SEARCH_SESSION_KEY)
  if (!saved || !Array.isArray(saved.matches)) return null
  if (typeof saved.savedAt !== 'number' || Date.now() - saved.savedAt > SESSION_MAX_AGE_MS) {
    clearSearchSession()
    return null
  }
  return saved
}

export function clearSearchSession(): void {
  try {
    localStorage.removeItem(SEARCH_SESSION_KEY)
  } catch {
    // ignore
  }
}

// ── Last-viewed checkpoint ────────────────────────────────────────────────────

export function saveLastViewed(photoId: string): void {
  write(LAST_VIEWED_KEY, photoId)
}

export function loadLastViewed(): string | null {
  const id = read<string>(LAST_VIEWED_KEY)
  return typeof id === 'string' ? id : null
}
