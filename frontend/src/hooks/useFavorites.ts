import { useCallback, useState } from 'react'
import { loadFavorites, saveFavorites } from '../utils/userPrefs'

/** Favorite photo ids, persisted per-browser in localStorage. */
export function useFavorites() {
  const [favorites, setFavorites] = useState<Set<string>>(loadFavorites)

  const toggleFavorite = useCallback((photoId: string) => {
    setFavorites((prev) => {
      const next = new Set(prev)
      next.has(photoId) ? next.delete(photoId) : next.add(photoId)
      saveFavorites(next)
      return next
    })
  }, [])

  return { favorites, toggleFavorite }
}
