import { describe, it, expect } from 'vitest'
import { thumbnailUrl, photoUrl } from './api'

describe('api URL helpers', () => {
  it('thumbnailUrl builds the correct path', () => {
    expect(thumbnailUrl(42)).toBe('/api/thumbnails/42')
    expect(thumbnailUrl(1)).toBe('/api/thumbnails/1')
  })

  it('photoUrl builds the correct path', () => {
    expect(photoUrl(7)).toBe('/api/photos/7')
    expect(photoUrl(100)).toBe('/api/photos/100')
  })
})
