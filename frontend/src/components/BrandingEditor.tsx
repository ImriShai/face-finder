import { useEffect, useRef, useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import LinearProgress from '@mui/material/LinearProgress'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import DeleteIcon from '@mui/icons-material/Delete'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import {
  deleteBackgroundVideo,
  getLandingConfig,
  setLandingTitle,
  uploadBackgroundVideo,
} from '../services/api'

/** Admin editor for the landing title and optional background video. */
export default function BrandingEditor() {
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
      setMsg({ ok: true, text: 'Title saved.' })
    } catch {
      setMsg({ ok: false, text: 'Save failed. Check the admin password.' })
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
      setMsg({ ok: true, text: 'Background video uploaded.' })
    } catch {
      setMsg({ ok: false, text: 'Upload failed.' })
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
      setMsg({ ok: true, text: 'Background video removed.' })
    } catch {
      setMsg({ ok: false, text: 'Remove failed.' })
    }
  }

  return (
    <Box sx={{ maxWidth: 640 }}>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Optional landing-page branding. A title shows above the search; a background
        video plays behind it (muted, with a tap-to-unmute control). Leave the video
        empty for the plain layout. Tip: compress large videos first — guests download it.
      </Typography>

      <Box sx={{ display: 'flex', gap: 1, mb: 2, alignItems: 'center', flexWrap: 'wrap' }}>
        <TextField
          label="Landing title"
          size="small"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          sx={{ flex: 1, minWidth: 200 }}
        />
        <Button variant="contained" onClick={saveTitle}>
          Save title
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
          {hasVideo ? 'Replace video' : 'Upload background video'}
        </Button>
        {hasVideo && (
          <Button color="error" startIcon={<DeleteIcon />} onClick={removeVideo} disabled={uploading}>
            Remove video
          </Button>
        )}
        {hasVideo && !uploading && (
          <Typography variant="body2" color="success.main">
            A background video is set.
          </Typography>
        )}
      </Box>

      {uploading && (
        <Box sx={{ mt: 2 }}>
          <LinearProgress variant="determinate" value={pct} />
          <Typography variant="caption" color="text.secondary">
            Uploading… {pct}%
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
