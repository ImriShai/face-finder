import type { EventDef } from '../types'

// Returns the index of the event a photo belongs to — the latest event that
// started at or before the photo's capture time — or null if the photo has no
// capture time or no event covers it. Timestamps are compared as wall-clock
// (both the photo's taken_at and the event starts_at are stored without a zone).
export function eventIndexForPhoto(
  takenAt: string | null | undefined,
  events: EventDef[],
): number | null {
  if (!takenAt || events.length === 0) return null
  const t = Date.parse(takenAt)
  if (Number.isNaN(t)) return null

  let matchIndex: number | null = null
  let latestStart = -Infinity
  events.forEach((ev, i) => {
    const start = Date.parse(ev.starts_at)
    if (!Number.isNaN(start) && start <= t && start >= latestStart) {
      latestStart = start
      matchIndex = i
    }
  })
  return matchIndex
}
