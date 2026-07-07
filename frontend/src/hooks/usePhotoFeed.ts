import { useCallback, useEffect, useRef, useState } from 'react'
import { listPhotos } from '../services/api'
import type { Photo } from '../types'

const PAGE_SIZE = 48

/**
 * Paged photo feed with an infinite-scroll sentinel.
 * Pass autoLoad=false to pause sentinel-driven loading (e.g. while a
 * client-side filter empties the grid and would leave the sentinel in view);
 * the observer re-attaches to the (possibly remounted) sentinel when
 * autoLoad turns true again.
 */
export function usePhotoFeed(autoLoad = true) {
  const [resetKey, setResetKey] = useState(0)
  const [photos, setPhotos] = useState<Photo[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pageRef = useRef(1)
  const exhaustedRef = useRef(false)
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  // Ref so fetchNext always reads the latest value without becoming stale itself
  const fetchKeyRef = useRef(0)

  const fetchNext = useCallback(async () => {
    if (loading || exhaustedRef.current) return
    setLoading(true)
    const key = fetchKeyRef.current
    try {
      const res = await listPhotos(pageRef.current, PAGE_SIZE)
      if (fetchKeyRef.current !== key) return  // reset while request was in-flight
      setTotal(res.total)
      setPhotos((prev) => [...prev, ...res.photos])
      if (res.photos.length < PAGE_SIZE) exhaustedRef.current = true
      else pageRef.current += 1
    } catch {
      if (fetchKeyRef.current === key) setError('Failed to load photos.')
    } finally {
      if (fetchKeyRef.current === key) setLoading(false)
    }
  }, [loading, resetKey]) // resetKey in deps ensures fetchNext is fresh after a reset

  const refresh = useCallback(() => {
    fetchKeyRef.current += 1
    pageRef.current = 1
    exhaustedRef.current = false
    setPhotos([])
    setTotal(0)
    setError(null)
    setLoading(false)
    setResetKey((k) => k + 1)
  }, [])

  // Fetch first page after every reset (resetKey change triggers this), and on mount
  useEffect(() => {
    if (!exhaustedRef.current) fetchNext()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey])

  // Infinite scroll sentinel
  const hasMore = photos.length < total
  useEffect(() => {
    if (!hasMore || !autoLoad) return
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) fetchNext() },
      { threshold: 0.1 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [hasMore, fetchNext, autoLoad])

  return { photos, total, loading, error, hasMore, sentinelRef, refresh, loadMore: fetchNext }
}
