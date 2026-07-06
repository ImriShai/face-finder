import { useState } from 'react'
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
import UploadDropzone from '../components/UploadDropzone'
import { searchByFace } from '../services/api'
import type { SearchMode } from '../types'

const MODE_LABELS: Record<SearchMode, string> = {
  union: 'Find photos containing at least one person from the image',
  intersection: 'Find photos containing all people from the image',
}

export default function HomePage() {
  const [file, setFile] = useState<File | null>(null)
  const [mode, setMode] = useState<SearchMode>('union')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  const handleSearch = async () => {
    if (!file) return
    setLoading(true)
    setError(null)
    try {
      const result = await searchByFace(file, mode)
      navigate('/results', { state: { ...result, mode } })
    } catch {
      setError('Search failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

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
            Face Finder
          </Typography>
          <Typography variant="subtitle1" color="text.secondary">
            Upload a photo and find all your event photos instantly.
          </Typography>
        </Box>

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
              Any face
            </ToggleButton>
            <ToggleButton value="intersection" sx={{ flex: 1, textTransform: 'none' }}>
              All faces
            </ToggleButton>
          </ToggleButtonGroup>
          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.75, display: 'block', textAlign: 'center' }}>
            {MODE_LABELS[mode]}
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
          {loading ? 'Searching…' : 'Find My Photos'}
        </Button>

        <Box sx={{ mt: 4, textAlign: 'center' }}>
          <Button
            size="small"
            color="inherit"
            startIcon={<AdminPanelSettingsIcon />}
            onClick={() => navigate('/admin')}
            sx={{ color: 'text.disabled', '&:hover': { color: 'text.secondary' } }}
          >
            Admin panel
          </Button>
        </Box>
      </Container>
    </Box>
  )
}
