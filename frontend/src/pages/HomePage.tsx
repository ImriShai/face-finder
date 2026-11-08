import { useEffect, useRef, useState } from 'react'
import { keyframes } from '@emotion/react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Container from '@mui/material/Container'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import Alert from '@mui/material/Alert'
import CircularProgress from '@mui/material/CircularProgress'
import FaceIcon from '@mui/icons-material/Face'
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings'
import HistoryIcon from '@mui/icons-material/History'
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown'
import UploadDropzone from '../components/UploadDropzone'
import BackgroundVideo from '../components/BackgroundVideo'
import { backgroundVideoUrl, getLandingConfig, searchByFace } from '../services/api'
import { loadSearchSession, saveSearchSession } from '../utils/userPrefs'
import type { LandingConfig, SearchMode } from '../types'

const MODE_LABEL_KEYS: Record<SearchMode, string> = {
  union: 'homepage.modeUnion',
  intersection: 'homepage.modeIntersection',
}

const bounce = keyframes`
  0%, 100% { transform: translateY(0); opacity: 0.95; }
  50% { transform: translateY(8px); opacity: 0.55; }
`

export default function HomePage() {
  const { t } = useTranslation()
  const [file, setFile] = useState<File | null>(null)
  const [mode, setMode] = useState<SearchMode>('union')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  // Results of this browser's previous search — lets a returning user skip
  // the selfie entirely.
  const [savedSession] = useState(loadSearchSession)

  const [landing, setLanding] = useState<LandingConfig | null>(null)
  const searchRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    getLandingConfig()
      .then(setLanding)
      .catch(() => setLanding({ title: null, has_video: false }))
  }, [])

  const title = landing?.title || t('homepage.title')

  const handleSearch = async () => {
    if (!file) return
    setLoading(true)
    setError(null)
    try {
      const result = await searchByFace(file, mode)
      saveSearchSession({ ...result, mode })
      navigate('/results', { state: { ...result, mode } })
    } catch {
      setError(t('homepage.searchFailed'))
    } finally {
      setLoading(false)
    }
  }

  const controls = (
    <>
      <UploadDropzone onFileSelected={setFile} disabled={loading} />

      {/* Search mode toggle */}
      <Box sx={{ mt: 2.5 }}>
        <ToggleButtonGroup
          value={mode}
          exclusive
          onChange={(_, v: SearchMode | null) => v && setMode(v)}
          size="small"
          fullWidth
        >
          <ToggleButton value="union" sx={{ flex: 1, textTransform: 'none' }}>
            {t('homepage.anyFace')}
          </ToggleButton>
          <ToggleButton value="intersection" sx={{ flex: 1, textTransform: 'none' }}>
            {t('homepage.allFaces')}
          </ToggleButton>
        </ToggleButtonGroup>
        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.75, display: 'block', textAlign: 'center' }}>
          {t(MODE_LABEL_KEYS[mode])}
        </Typography>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {error}
        </Alert>
      )}

      <Button
        variant="contained"
        size="large"
        fullWidth
        sx={{ mt: 3, py: 1.5, fontWeight: 700, fontSize: '1rem' }}
        disabled={!file || loading}
        onClick={handleSearch}
        startIcon={loading ? <CircularProgress size={20} color="inherit" /> : undefined}
      >
        {loading ? t('homepage.searching') : t('homepage.findMyPhotos')}
      </Button>

      {savedSession && savedSession.matches.length > 0 && (
        <Button
          variant="outlined"
          size="large"
          fullWidth
          sx={{ mt: 1.5, py: 1.25, textTransform: 'none' }}
          startIcon={<HistoryIcon />}
          disabled={loading}
          onClick={() => navigate('/results')}
        >
          {t('homepage.continueSession', { count: savedSession.matches.length })}
        </Button>
      )}

      <Box sx={{ mt: 4, textAlign: 'center' }}>
        <Button
          size="small"
          color="inherit"
          startIcon={<AdminPanelSettingsIcon />}
          onClick={() => navigate('/admin')}
          sx={{ color: 'text.disabled', '&:hover': { color: 'text.secondary' } }}
        >
          {t('homepage.adminPanel')}
        </Button>
      </Box>
    </>
  )

  // Plain landing (no background video configured).
  if (!landing?.has_video) {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          bgcolor: 'background.default',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          py: 6,
        }}
      >
        <Container maxWidth="sm">
          <Box sx={{ textAlign: 'center', mb: 5 }}>
            <FaceIcon sx={{ fontSize: 56, color: 'primary.main', mb: 1 }} />
            <Typography variant="h3" sx={{ fontWeight: 700 }} gutterBottom>
              {title}
            </Typography>
            <Typography variant="subtitle1" color="text.secondary">
              {t('homepage.subtitle')}
            </Typography>
          </Box>
          {controls}
        </Container>
      </Box>
    )
  }

  // Video hero: the video is the star, scroll down to the search.
  const scrollToSearch = () => searchRef.current?.scrollIntoView({ behavior: 'smooth' })
  return (
    <>
      <BackgroundVideo src={backgroundVideoUrl()} overlayOpacity={0.3} />

      <Box
        sx={{
          position: 'relative',
          zIndex: 1,
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'flex-start',
          textAlign: 'center',
          px: 3,
          pt: { xs: '16vh', sm: '20vh' },
          color: '#fff',
        }}
      >
        <Typography
          variant="h2"
          sx={{ fontWeight: 800, letterSpacing: 1, textShadow: '0 2px 24px rgba(0,0,0,0.55)' }}
        >
          {title}
        </Typography>
        <Typography
          variant="h6"
          sx={{ mt: 1.5, fontWeight: 400, maxWidth: 460, textShadow: '0 1px 12px rgba(0,0,0,0.6)' }}
        >
          {t('homepage.subtitle')}
        </Typography>

        <Box
          role="button"
          tabIndex={0}
          aria-label={t('homepage.scrollAriaLabel')}
          onClick={scrollToSearch}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') scrollToSearch()
          }}
          sx={{
            position: 'absolute',
            bottom: 32,
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 0.5,
            animation: `${bounce} 1.8s ease-in-out infinite`,
            '&:focus-visible': { outline: '2px solid #fff', outlineOffset: 4, borderRadius: 1 },
          }}
        >
          <Typography variant="caption" sx={{ textShadow: '0 1px 10px rgba(0,0,0,0.7)' }}>
            {t('homepage.scrollDown')}
          </Typography>
          <KeyboardArrowDownIcon />
        </Box>
      </Box>

      <Box
        ref={searchRef}
        sx={{
          position: 'relative',
          zIndex: 1,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          py: 8,
          px: 2,
        }}
      >
        <Container maxWidth="sm">
          <Box
            sx={{
              p: { xs: 3, sm: 4 },
              borderRadius: 4,
              bgcolor: 'rgba(255, 255, 255, 0.86)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              border: '1px solid rgba(255, 255, 255, 0.6)',
              boxShadow: '0 12px 48px rgba(0, 0, 0, 0.35)',
            }}
          >
            <Typography variant="h5" sx={{ fontWeight: 700, textAlign: 'center', mb: 3 }}>
              {t('homepage.findYourPhotos')}
            </Typography>
            {controls}
          </Box>
        </Container>
      </Box>
    </>
  )
}
