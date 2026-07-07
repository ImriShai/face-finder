import { useEffect, useRef, useState } from 'react'

export function useInfiniteScroll<T>(items: T[], pageSize = 20, initialIndex = 0) {
  // Reveal enough pages up front to include initialIndex (e.g. the user's
  // last-viewed photo) so it can be scrolled to immediately.
  const [page, setPage] = useState(() => Math.max(1, Math.ceil((initialIndex + 1) / pageSize)))
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  const visible = items.slice(0, page * pageSize)
  const hasMore = visible.length < items.length

  const firstRun = useRef(true)
  useEffect(() => {
    // Reset paging when the items themselves change, but not on mount —
    // that would discard the initialIndex reveal.
    if (firstRun.current) {
      firstRun.current = false
      return
    }
    setPage(1)
  }, [items])

  useEffect(() => {
    if (!hasMore) return
    const el = sentinelRef.current
    if (!el) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) setPage((p) => p + 1)
      },
      { threshold: 0.1 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [hasMore])

  return { visible, hasMore, sentinelRef }
}
