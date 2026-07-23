import { useEffect, useRef, useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import LinearProgress from '@mui/material/LinearProgress'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import DeleteIcon from '@mui/icons-material/Delete'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import { useTranslation } from 'react-i18next'
import {
  deleteBackgroundVideo,
  getLandingConfig,
  setLandingTitle,
  uploadBackgroundVideo,
} from '../services/api'

/** Admin editor for the landing title and optional background video. */
export default function BrandingEditor() {
  const { t } = useTranslation()
  const [title, setTitle] = useState('')
  const [hasVideo, setHasVideo] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [pct, setPct] = useState(0)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    getLandingConfig()
      .then((c) => {
        setTitle(c.title ?? '')
        setHasVideo(c.has_video)
      })
      .catch(() => {})
  }, [])

  async function saveTitle() {
    setMsg(null)
    try {
      await setLandingTitle(title.trim() || null)
      setMsg({ ok: true, text: t('brandingeditor.titleSaved') })
    } catch {
      setMsg({ ok: false, text: t('brandingeditor.saveFailed') })
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setUploading(true)
    setPct(0)
    setMsg(null)
    try {
      await uploadBackgroundVideo(f, setPct)
      setHasVideo(true)
      setMsg({ ok: true, text: t('brandingeditor.videoUploaded') })
    } catch {
      setMsg({ ok: false, text: t('brandingeditor.uploadFailed') })
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function removeVideo() {
    setMsg(null)
    try {
      await deleteBackgroundVideo()
      setHasVideo(false)
      setMsg({ ok: true, text: t('brandingeditor.videoRemoved') })
    } catch {
      setMsg({ ok: false, text: t('brandingeditor.removeFailed') })
    }
  }

  return (
    <Box sx={{ maxWidth: 640 }}>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {t('brandingeditor.description')}
      </Typography>

      <Box sx={{ display: 'flex', gap: 1, mb: 2, alignItems: 'center', flexWrap: 'wrap' }}>
        <TextField
          label={t('brandingeditor.landingTitleLabel')}
          size="small"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          sx={{ flex: 1, minWidth: 200 }}
        />
        <Button variant="contained" onClick={saveTitle}>
          {t('brandingeditor.saveTitle')}
        </Button>
      </Box>

      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          ref={fileRef}
          type="file"
          accept="video/mp4,video/webm,video/quicktime,video/ogg"
          hidden
          onChange={onFile}
        />
        <Button
          variant="outlined"
          startIcon={<UploadFileIcon />}
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
        >
          {hasVideo ? t('brandingeditor.replaceVideo') : t('brandingeditor.uploadVideo')}
        </Button>
        {hasVideo && (
          <Button color="error" startIcon={<DeleteIcon />} onClick={removeVideo} disabled={uploading}>
            {t('brandingeditor.removeVideo')}
          </Button>
        )}
        {hasVideo && !uploading && (
          <Typography variant="body2" color="success.main">
            {t('brandingeditor.videoSet')}
          </Typography>
        )}
      </Box>

      {uploading && (
        <Box sx={{ mt: 2 }}>
          <LinearProgress variant="determinate" value={pct} />
          <Typography variant="caption" color="text.secondary">
            {t('brandingeditor.uploading', { pct })}
          </Typography>
        </Box>
      )}

      {msg && (
        <Alert severity={msg.ok ? 'success' : 'error'} sx={{ mt: 2 }}>
          {msg.text}
        </Alert>
      )}
    </Box>
  )
}
