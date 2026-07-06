import type { DownloadProgress } from '../services/api'

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`
}

export function formatDownloadLabel(
  downloading: boolean,
  progress: DownloadProgress | null,
  itemCount: number,
): string {
  if (!downloading) return `Download ZIP (${itemCount})`
  if (!progress) return 'Preparing…'
  const pct = Math.min(99, Math.round((progress.loaded / progress.total) * 100))
  return `Downloading… ${pct}% (${formatBytes(progress.loaded)} of ~${formatBytes(progress.total)})`
}
