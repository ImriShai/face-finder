import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useDropzone } from 'react-dropzone'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import LinearProgress from '@mui/material/LinearProgress'
import Typography from '@mui/material/Typography'
import FolderZipIcon from '@mui/icons-material/FolderZip'
import UploadIcon from '@mui/icons-material/Upload'
import { uploadGallery } from '../services/api'
import { formatBytes } from '../utils/format'

interface Props {
  onUploaded: () => void
}

type Status = { kind: 'idle' } | { kind: 'ready'; file: File } | { kind: 'uploading'; pct: number } | { kind: 'done'; queued: number } | { kind: 'error'; message: string }

export default function ZipUploader({ onUploaded }: Props) {
  const { t } = useTranslation()
  const [status, setStatus] = useState<Status>({ kind: 'idle' })

  const onDrop = useCallback((accepted: File[]) => {
    const file = accepted[0]
    if (file) setStatus({ kind: 'ready', file })
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/zip': ['.zip'], 'application/x-zip-compressed': ['.zip'] },
    maxFiles: 1,
    noClick: status.kind === 'uploading',
    noDrag: status.kind === 'uploading',
  })

  async function handleUpload() {
    if (status.kind !== 'ready') return
    const file = status.file
    setStatus({ kind: 'uploading', pct: 0 })
    try {
      const res = await uploadGallery(file, (pct) => setStatus({ kind: 'uploading', pct }))
      setStatus({ kind: 'done', queued: res.photos_queued })
      onUploaded()
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        t('zipuploader.uploadFailed')
      setStatus({ kind: 'error', message: msg })
    }
  }

  const uploading = status.kind === 'uploading'

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* Drop zone */}
      <Box
        {...getRootProps()}
        sx={{
          border: '2px dashed',
          borderColor: isDragActive ? 'primary.main' : 'divider',
          borderRadius: 2,
          p: 3,
          textAlign: 'center',
          cursor: uploading ? 'not-allowed' : 'pointer',
          bgcolor: isDragActive ? 'action.hover' : 'background.paper',
          transition: 'border-color 0.2s, background-color 0.2s',
        }}
      >
        <input {...getInputProps()} />
        <FolderZipIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 1 }} />

        {status.kind === 'ready' ? (
          <Box>
            <Typography variant="body1" sx={{ fontWeight: 600 }}>
              {status.file.name}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {t('zipuploader.dropToReplace', { size: formatBytes(status.file.size) })}
            </Typography>
          </Box>
        ) : (
          <Box>
            <Typography variant="body1" sx={{ fontWeight: 600 }}>
              {isDragActive ? t('zipuploader.dropZipHere') : t('zipuploader.dragAndDrop')}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {t('zipuploader.clickToBrowse', { max: Math.round(500) })}
            </Typography>
          </Box>
        )}
      </Box>

      {/* Upload progress */}
      {uploading && (
        <Box>
          <LinearProgress variant="determinate" value={status.pct} sx={{ borderRadius: 1, mb: 0.5 }} />
          <Typography variant="caption" color="text.secondary">
            {t('zipuploader.uploadingPct', { pct: status.pct })}
          </Typography>
        </Box>
      )}

      {/* Status alerts */}
      {status.kind === 'done' && (
        <Alert severity="success">
          {t('zipuploader.acceptedPrefix')} <strong>{status.queued.toLocaleString()}</strong> {t('zipuploader.acceptedSuffix')}
        </Alert>
      )}
      {status.kind === 'error' && (
        <Alert severity="error">{status.message}</Alert>
      )}

      {/* Upload button */}
      <Button
        variant="contained"
        size="large"
        startIcon={uploading ? <CircularProgress size={18} color="inherit" /> : <UploadIcon />}
        disabled={status.kind !== 'ready' || uploading}
        onClick={handleUpload}
      >
        {uploading ? t('zipuploader.uploadingButton') : t('zipuploader.uploadGalleryButton')}
      </Button>

      <Typography variant="caption" color="text.secondary">
        {t('zipuploader.cliHint')}
        <br />
        <code>docker exec face-finder-backend-1 python scripts/ingest_gallery.py /imports/gallery.zip</code>
      </Typography>
    </Box>
  )
}
