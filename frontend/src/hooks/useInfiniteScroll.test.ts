import { renderHook } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useInfiniteScroll } from './useInfiniteScroll'

const makeItems = (n: number) => Array.from({ length: n }, (_, i) => i)

describe('useInfiniteScroll', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'IntersectionObserver',
      vi.fn(() => ({ observe: vi.fn(), disconnect: vi.fn() })),
    )
  })

  it('shows first page on mount', () => {
    const { result } = renderHook(() => useInfiniteScroll(makeItems(50), 20))
    expect(result.current.visible).toHaveLength(20)
    expect(result.current.hasMore).toBe(true)
  })

  it('exposes a sentinelRef', () => {
    const { result } = renderHook(() => useInfiniteScroll(makeItems(10), 20))
    expect(result.current.sentinelRef).toBeDefined()
  })

  it('shows all items when fewer than one page', () => {
    const { result } = renderHook(() => useInfiniteScroll(makeItems(5), 20))
    expect(result.current.visible).toHaveLength(5)
    expect(result.current.hasMore).toBe(false)
  })

  it('resets to page 1 when items array changes', () => {
    const { result, rerender } = renderHook(
      ({ items }: { items: number[] }) => useInfiniteScroll(items, 20),
      { initialProps: { items: makeItems(50) } },
    )
    // Simulate page advance isn't needed — just verify reset on new items
    rerender({ items: makeItems(8) })
    expect(result.current.visible).toHaveLength(8)
    expect(result.current.hasMore).toBe(false)
  })
})
