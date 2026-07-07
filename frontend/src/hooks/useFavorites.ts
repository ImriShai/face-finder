import { useCallback, useEffect, useState } from 'react'
import { FAVORITES_KEY, loadFavorites, saveFavorites } from '../utils/userPrefs'

/** Favorite photo ids, persisted per-browser in localStorage. */
export function useFavorites() {
  const [favorites, setFavorites] = useState<Set<string>>(loadFavorites)

  // Stay in sync with hearts toggled in other tabs (e.g. viewer results page
  // open alongside the admin panel).
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key === FAVORITES_KEY) setFavorites(loadFavorites())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const toggleFavorite = useCallback((photoId: string) => {
    // Read-modify-write against storage rather than in-memory state, so a tab
    // holding a stale copy can't clobber hearts saved elsewhere.
    const next = loadFavorites()
    next.has(photoId) ? next.delete(photoId) : next.add(photoId)
    saveFavorites(next)
    setFavorites(next)
  }, [])

  const clearFavorites = useCallback(() => {
    const empty = new Set<string>()
    saveFavorites(empty)
    setFavorites(empty)
  }, [])

  return { favorites, toggleFavorite, clearFavorites }
}
