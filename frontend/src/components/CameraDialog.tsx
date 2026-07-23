import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Typography from '@mui/material/Typography'
import CameraAltIcon from '@mui/icons-material/CameraAlt'
import ReplayIcon from '@mui/icons-material/Replay'
import CheckIcon from '@mui/icons-material/Check'

interface Props {
  open: boolean
  onCapture: (file: File) => void
  onClose: () => void
}

export default function CameraDialog({ open, onCapture, onClose }: Props) {
  const { t } = useTranslation()
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [snapshot, setSnapshot] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      stopStream()
      setSnapshot(null)
      setError(null)
      return
    }

    if (!navigator?.mediaDevices?.getUserMedia) {
      setError(t('cameradialog.errorApiUnavailable'))
      return
    }

    let mounted = true
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'user' }, audio: false })
      .then((stream) => {
        if (!mounted) { stream.getTracks().forEach((t) => t.stop()); return }
        streamRef.current = stream
        if (videoRef.current) videoRef.current.srcObject = stream
      })
      .catch(() => {
        if (mounted) setError(t('cameradialog.errorAccessDeniedOrNoCamera'))
      })

    return () => {
      mounted = false
      stopStream()
    }
  }, [open])

  function stopStream() {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }

  function handleCapture() {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return

    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d')?.drawImage(video, 0, 0)
    setSnapshot(canvas.toDataURL('image/jpeg', 0.92))
    stopStream()
  }

  function handleRetake() {
    setSnapshot(null)
    setError(null)
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'user' }, audio: false })
      .then((stream) => {
        streamRef.current = stream
        if (videoRef.current) videoRef.current.srcObject = stream
      })
      .catch(() => setError(t('cameradialog.errorAccessDenied')))
  }

  function handleConfirm() {
    canvasRef.current?.toBlob(
      (blob) => {
        if (!blob) return
        onCapture(new File([blob], 'selfie.jpg', { type: 'image/jpeg' }))
      },
      'image/jpeg',
      0.92,
    )
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{t('cameradialog.title')}</DialogTitle>

      <DialogContent sx={{ p: 0, bgcolor: '#000', position: 'relative', lineHeight: 0 }}>
        {error ? (
          <Box sx={{ p: 4, textAlign: 'center', bgcolor: 'background.paper' }}>
            <Typography color="error" variant="body2">
              {error}
            </Typography>
          </Box>
        ) : snapshot ? (
          <Box
            component="img"
            src={snapshot}
            alt={t('cameradialog.capturedSelfieAlt')}
            sx={{ width: '100%', display: 'block' }}
          />
        ) : (
          <Box
            component="video"
            ref={videoRef}
            autoPlay
            playsInline
            muted
            sx={{ width: '100%', display: 'block', transform: 'scaleX(-1)' }}
          />
        )}
        <canvas ref={canvasRef} style={{ display: 'none' }} />
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} color="inherit">
          {t('cameradialog.cancel')}
        </Button>
        <Box sx={{ flex: 1 }} />
        {!error && !snapshot && (
          <Button variant="contained" startIcon={<CameraAltIcon />} onClick={handleCapture}>
            {t('cameradialog.capture')}
          </Button>
        )}
        {snapshot && (
          <>
            <Button startIcon={<ReplayIcon />} onClick={handleRetake}>
              {t('cameradialog.retake')}
            </Button>
            <Button variant="contained" startIcon={<CheckIcon />} onClick={handleConfirm}>
              {t('cameradialog.useThisPhoto')}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  )
}
