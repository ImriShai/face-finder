import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Container from '@mui/material/Container'
import Snackbar from '@mui/material/Snackbar'
import Typography from '@mui/material/Typography'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import ChecklistIcon from '@mui/icons-material/Checklist'
import CloseIcon from '@mui/icons-material/Close'
import DownloadIcon from '@mui/icons-material/Download'
import SearchOffIcon from '@mui/icons-material/SearchOff'
import PhotoGallery from '../components/PhotoGallery'
import { downloadZip, type DownloadProgress } from '../services/api'
import { formatDownloadLabel } from '../utils/format'
import type { SearchMode, SearchResponse } from '../types'

export default function ResultsPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const result = location.state as (SearchResponse & { mode?: SearchMode }) | null
  const matches = result?.matches ?? []
  const facesDetected = result?.faces_detected ?? 1
  const mode = result?.mode ?? 'union'

  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [downloading, setDownloading] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null)
  const [downloadError, setDownloadError] = useState<string | null>(null)

  function toggleSelect(photoId: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(photoId) ? next.delete(photoId) : next.add(photoId)
      return next
    })
  }

  function enterSelectMode() {
    setSelectMode(true)
    setSelected(new Set())
  }

  function cancelSelectMode() {
    setSelectMode(false)
    setSelected(new Set())
  }

  function selectAll() {
    setSelected(new Set(matches.map((m) => m.photo_id)))
  }

  async function handleDownloadZip() {
    if (selected.size === 0) return
    setDownloading(true)
    setDownloadProgress(null)
    setDownloadError(null)
    try {
      await downloadZip(Array.from(selected), 'my-photos.zip', setDownloadProgress)
    } catch {
      setDownloadError('Download failed. Please try again.')
    } finally {
      setDownloading(false)
      setDownloadProgress(null)
    }
  }

  const downloadLabel = formatDownloadLabel(downloading, downloadProgress, selected.size)

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', py: 4 }}>
      <Container maxWidth="xl">
        {/* Header toolbar */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3, flexWrap: 'wrap' }}>
          {selectMode ? (
            <>
              <Button startIcon={<CloseIcon />} onClick={cancelSelectMode} variant="outlined">
                Cancel
              </Button>
              <Typography variant="h5" sx={{ fontWeight: 700, flex: 1 }}>
                {selected.size > 0
                  ? `${selected.size} of ${matches.length} selected`
                  : `${matches.length} photo${matches.length !== 1 ? 's' : ''}`}
              </Typography>
              <Button onClick={selectAll} disabled={selected.size === matches.length}>
                Select all
              </Button>
              <Button
                variant="contained"
                startIcon={downloading ? <CircularProgress size={16} color="inherit" /> : <DownloadIcon />}
                disabled={selected.size === 0 || downloading}
                onClick={handleDownloadZip}
              >
                {downloadLabel}
              </Button>
            </>
          ) : (
            <>
              <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/')} variant="outlined">
                New Search
              </Button>
              <Box sx={{ flex: 1 }}>
                <Typography variant="h5" sx={{ fontWeight: 700 }}>
                  {matches.length > 0
                    ? `${matches.length} photo${matches.length !== 1 ? 's' : ''} found`
                    : 'Results'}
                </Typography>
                {facesDetected > 1 && (
                  <Typography variant="caption" color="text.secondary">
                    {facesDetected} faces detected &middot;{' '}
                    {mode === 'union' ? 'any face' : 'all faces'}
                  </Typography>
                )}
              </Box>
              {matches.length > 0 && (
                <Button startIcon={<ChecklistIcon />} onClick={enterSelectMode}>
                  Select
                </Button>
              )}
            </>
          )}
        </Box>

        {matches.length === 0 ? (
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              py: 12,
              gap: 2,
            }}
          >
            <SearchOffIcon sx={{ fontSize: 80, color: 'text.disabled' }} />
            <Typography variant="h6" color="text.secondary">
              No matching photos were found.
            </Typography>
            <Button variant="contained" onClick={() => navigate('/')}>
              Try Another Selfie
            </Button>
          </Box>
        ) : (
          <PhotoGallery
            matches={matches}
            selectMode={selectMode}
            selected={selected}
            onToggleSelect={toggleSelect}
          />
        )}
      </Container>

      <Snackbar
        open={downloadError !== null}
        autoHideDuration={5000}
        onClose={() => setDownloadError(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="error" onClose={() => setDownloadError(null)}>
          {downloadError}
        </Alert>
      </Snackbar>
    </Box>
  )
}
