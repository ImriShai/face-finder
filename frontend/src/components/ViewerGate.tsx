import { useEffect, useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera'
import { useTranslation } from 'react-i18next'
import {
  authConfig,
  verifyViewerSession,
  viewerLogin,
} from '../services/api'

export default function ViewerGate({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation()
  // null = still checking, false = gate needed, true = access granted
  const [status, setStatus] = useState<'checking' | 'gate' | 'open'>('checking')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    authConfig().then(({ requires_viewer_password }) => {
      if (!requires_viewer_password) {
        setStatus('open')
        return
      }
      // Check whether the session cookie is still valid.
      verifyViewerSession().then((valid) => setStatus(valid ? 'open' : 'gate'))
    }).catch(() => {
      setStatus('gate')
    })
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      await viewerLogin(password)
      setStatus('open')
    } catch {
      setError(t('viewergate.incorrectPassword'))
    } finally {
      setLoading(false)
    }
  }

  if (status === 'checking') {
    return (
      <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <CircularProgress />
      </Box>
    )
  }

  if (status === 'gate') {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          bgcolor: 'background.default',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Box
          component="form"
          onSubmit={handleSubmit}
          sx={{
            bgcolor: 'background.paper',
            borderRadius: 3,
            p: 5,
            width: '100%',
            maxWidth: 380,
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            boxShadow: 3,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <PhotoCameraIcon color="primary" />
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              {t('viewergate.eventPhotos')}
            </Typography>
          </Box>
          <Typography variant="body2" color="text.secondary">
            {t('viewergate.enterPasswordPrompt')}
          </Typography>
          <TextField
            label={t('viewergate.passwordLabel')}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            fullWidth
          />
          {error && <Alert severity="error">{error}</Alert>}
          <Button
            type="submit"
            variant="contained"
            size="large"
            disabled={!password || loading}
            startIcon={loading ? <CircularProgress size={18} color="inherit" /> : undefined}
          >
            {loading ? t('viewergate.checking') : t('viewergate.enter')}
          </Button>
        </Box>
      </Box>
    )
  }

  return <>{children}</>
}
