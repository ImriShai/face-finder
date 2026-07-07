import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearSearchSession,
  loadFavorites,
  loadLastViewed,
  loadSearchSession,
  saveFavorites,
  saveLastViewed,
  saveSearchSession,
} from './userPrefs'

beforeEach(() => localStorage.clear())

describe('favorites', () => {
  it('round-trips a set of photo ids', () => {
    saveFavorites(new Set(['a', 'b']))
    expect(loadFavorites()).toEqual(new Set(['a', 'b']))
  })

  it('returns an empty set when nothing is stored or data is corrupt', () => {
    expect(loadFavorites()).toEqual(new Set())
    localStorage.setItem('ff_favorite_photo_ids', 'not json')
    expect(loadFavorites()).toEqual(new Set())
    localStorage.setItem('ff_favorite_photo_ids', '{"weird": true}')
    expect(loadFavorites()).toEqual(new Set())
  })
})

describe('search session', () => {
  it('round-trips a search result with mode and timestamp', () => {
    saveSearchSession({ matches: [{ photo_id: 'p1', confidence: 0.9 }], faces_detected: 1, mode: 'union' })
    const loaded = loadSearchSession()
    expect(loaded?.matches).toEqual([{ photo_id: 'p1', confidence: 0.9 }])
    expect(loaded?.mode).toBe('union')
    expect(loaded?.savedAt).toBeGreaterThan(0)
  })

  it('returns null when empty, corrupt, or cleared', () => {
    expect(loadSearchSession()).toBeNull()
    localStorage.setItem('ff_last_search', '{"matches": "nope"}')
    expect(loadSearchSession()).toBeNull()
    saveSearchSession({ matches: [], mode: 'union' })
    clearSearchSession()
    expect(loadSearchSession()).toBeNull()
  })
})

describe('last-viewed checkpoint', () => {
  it('round-trips a photo id', () => {
    expect(loadLastViewed()).toBeNull()
    saveLastViewed('photo-42')
    expect(loadLastViewed()).toBe('photo-42')
  })
})
