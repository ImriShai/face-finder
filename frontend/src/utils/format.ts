import type { DownloadProgress } from '../services/api'
import i18n from '../i18n'

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return i18n.t('format.kb', { value: (bytes / 1024).toFixed(1) })
  if (bytes < 1024 ** 3) return i18n.t('format.mb', { value: (bytes / 1024 ** 2).toFixed(1) })
  return i18n.t('format.gb', { value: (bytes / 1024 ** 3).toFixed(1) })
}

export function formatDownloadLabel(
  downloading: boolean,
  progress: DownloadProgress | null,
  itemCount: number,
): string {
  if (!downloading) return i18n.t('format.downloadZip', { count: itemCount })
  if (!progress) return i18n.t('format.preparing')
  const pct = Math.min(99, Math.round((progress.loaded / progress.total) * 100))
  return i18n.t('format.downloading', {
    pct,
    loaded: formatBytes(progress.loaded),
    total: formatBytes(progress.total),
  })
}
