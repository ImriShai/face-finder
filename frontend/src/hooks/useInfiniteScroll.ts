import { useEffect, useRef, useState } from 'react'

export function useInfiniteScroll<T>(items: T[], pageSize = 20) {
  const [page, setPage] = useState(1)
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  const visible = items.slice(0, page * pageSize)
  const hasMore = visible.length < items.length

  useEffect(() => {
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
