import { describe, expect, it } from 'vitest'
import { chooseVideoFit } from './videoFit'

describe('chooseVideoFit', () => {
  it('contains a portrait video in a landscape window', () => {
    expect(chooseVideoFit(2160, 3840, 1920, 1080)).toBe('contain')
  })

  it('contains a landscape video on a portrait phone', () => {
    expect(chooseVideoFit(1920, 1080, 390, 844)).toBe('contain')
  })

  it('covers when the shapes match', () => {
    expect(chooseVideoFit(1920, 1080, 1920, 1080)).toBe('cover')
    expect(chooseVideoFit(2160, 3840, 390, 844)).toBe('cover')
  })

  it('covers when the crop is modest', () => {
    // 16:9 video in a 16:10 window crops ~10%.
    expect(chooseVideoFit(1920, 1080, 1440, 900)).toBe('cover')
  })

  it('defaults to cover before metadata is known', () => {
    expect(chooseVideoFit(0, 0, 1920, 1080)).toBe('cover')
  })
})
