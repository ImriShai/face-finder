import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate } from 'react-router-dom'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Container from '@mui/material/Container'
import Snackbar from '@mui/material/Snackbar'
import Typography from '@mui/material/Typography'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import ChecklistIcon from '@mui/icons-material/Checklist'
import CloseIcon from '@mui/icons-material/Close'
import DownloadIcon from '@mui/icons-material/Download'
import FavoriteIcon from '@mui/icons-material/Favorite'
import SearchOffIcon from '@mui/icons-material/SearchOff'
import ToggleButton from '@mui/material/ToggleButton'
import DownloadQualityMenu from '../components/DownloadQualityMenu'
import PhotoGallery from '../components/PhotoGallery'
import { useFavorites } from '../hooks/useFavorites'
import { downloadZip, getEvents, type DownloadProgress, type DownloadQuality } from '../services/api'
import { formatDownloadLabel } from '../utils/format'
import { loadLastViewed, loadSearchSession } from '../utils/userPrefs'
import { eventIndexForPhoto } from '../utils/events'
import type { EventDef, SearchMode, SearchResponse } from '../types'

export default function ResultsPage() {
  const { t } = useTranslation()
  const location = useLocation()
  const navigate = useNavigate()
  // Fall back to the saved session so a returning user (or a page refresh)
  // sees their photos without a new selfie.
  const [result] = useState(
    () => (location.state as (SearchResponse & { mode?: SearchMode }) | null) ?? loadSearchSession(),
  )
  const allMatches = useMemo(() => result?.matches ?? [], [result])
  const facesDetected = result?.faces_detected ?? 1
  const mode = result?.mode ?? 'union'

  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [downloading, setDownloading] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null)
  const [downloadError, setDownloadError] = useState<string | null>(null)
  const [downloadMenuAnchor, setDownloadMenuAnchor] = useState<HTMLElement | null>(null)

  const { favorites, toggleFavorite } = useFavorites()
  const [likedOnly, setLikedOnly] = useState(false)

  // Admin-defined event sections; results can be filtered to one of them.
  const [events, setEvents] = useState<EventDef[]>([])
  const [activeEvent, setActiveEvent] = useState<number | null>(null)
  useEffect(() => {
    getEvents()
      .then(setEvents)
      .catch(() => setEvents([]))
  }, [])

  // Count this guest's photos per event — only events they have photos in get a button.
  const eventCounts = useMemo(() => {
    const counts: Record<number, number> = {}
    for (const m of allMatches) {
      const i = eventIndexForPhoto(m.taken_at, events)
      if (i !== null) counts[i] = (counts[i] ?? 0) + 1
    }
    return counts
  }, [allMatches, events])
  const availableEvents = useMemo(
    () => events.map((ev, i) => ({ ...ev, i })).filter((ev) => (eventCounts[ev.i] ?? 0) > 0),
    [events, eventCounts],
  )

  // Memoized: a fresh array identity every render would reset the gallery's
  // infinite-scroll paging on unrelated re-renders (download progress, selection).
  const matches = useMemo(() => {
    let list = likedOnly ? allMatches.filter((m) => favorites.has(m.photo_id)) : allMatches
    if (activeEvent !== null) {
      list = list.filter((m) => eventIndexForPhoto(m.taken_at, events) === activeEvent)
    }
    return list
  }, [likedOnly, allMatches, favorites, activeEvent, events])

  // Checkpoint: the photo the user last previewed, captured once on mount so
  // the marker doesn't chase the modal while browsing.
  const [checkpointId] = useState(loadLastViewed)

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

  async function handleDownloadZip(quality: DownloadQuality) {
    setDownloadMenuAnchor(null)
    if (selected.size === 0) return
    setDownloading(true)
    setDownloadProgress(null)
    setDownloadError(null)
    try {
      await downloadZip(Array.from(selected), quality, 'my-photos.zip', setDownloadProgress)
    } catch {
      setDownloadError(t('resultspage.downloadFailed'))
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
                {t('resultspage.cancel')}
              </Button>
              <Typography variant="h5" sx={{ fontWeight: 700, flex: 1 }}>
                {selected.size > 0
                  ? t('resultspage.selectedCount', { selected: selected.size, total: matches.length })
                  : t('resultspage.photoCount', { count: matches.length })}
              </Typography>
              <Button onClick={selectAll} disabled={selected.size === matches.length}>
                {t('resultspage.selectAll')}
              </Button>
              <Button
                variant="contained"
                startIcon={downloading ? <CircularProgress size={16} color="inherit" /> : <DownloadIcon />}
                disabled={selected.size === 0 || downloading}
                onClick={(e) => setDownloadMenuAnchor(e.currentTarget)}
              >
                {downloadLabel}
              </Button>
              <DownloadQualityMenu
                anchorEl={downloadMenuAnchor}
                onClose={() => setDownloadMenuAnchor(null)}
                onSelect={handleDownloadZip}
              />
            </>
          ) : (
            <>
              <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/')} variant="outlined">
                {t('resultspage.newSearch')}
              </Button>
              <Box sx={{ flex: 1 }}>
                <Typography variant="h5" sx={{ fontWeight: 700 }}>
                  {matches.length > 0
                    ? t('resultspage.photosFound', { count: matches.length })
                    : t('resultspage.results')}
                </Typography>
                {facesDetected > 1 && (
                  <Typography variant="caption" color="text.secondary">
                    {t('resultspage.facesDetected', { count: facesDetected })} &middot;{' '}
                    {mode === 'union' ? t('resultspage.anyFace') : t('resultspage.allFaces')}
                  </Typography>
                )}
              </Box>
              <ToggleButton
                value="liked"
                size="small"
                selected={likedOnly}
                onChange={() => setLikedOnly((v) => !v)}
                sx={{ textTransform: 'none', gap: 0.75, px: 1.5 }}
              >
                <FavoriteIcon fontSize="small" sx={{ color: likedOnly ? '#ff4569' : 'inherit' }} />
                {t('resultspage.liked')}
              </ToggleButton>
              {matches.length > 0 && (
                <Button startIcon={<ChecklistIcon />} onClick={enterSelectMode}>
                  {t('resultspage.select')}
                </Button>
              )}
            </>
          )}
        </Box>

        {!selectMode && availableEvents.length >= 2 && (
          <Box sx={{ display: 'flex', gap: 1, mb: 3, flexWrap: 'wrap' }}>
            <Chip
              label={t('resultspage.all')}
              color={activeEvent === null ? 'primary' : 'default'}
              variant={activeEvent === null ? 'filled' : 'outlined'}
              onClick={() => setActiveEvent(null)}
            />
            {availableEvents.map((ev) => (
              <Chip
                key={ev.i}
                label={`${ev.label} (${eventCounts[ev.i]})`}
                color={activeEvent === ev.i ? 'primary' : 'default'}
                variant={activeEvent === ev.i ? 'filled' : 'outlined'}
                onClick={() => setActiveEvent(ev.i)}
              />
            ))}
          </Box>
        )}

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
            {likedOnly ? (
              <>
                <FavoriteIcon sx={{ fontSize: 80, color: 'text.disabled' }} />
                <Typography variant="h6" color="text.secondary">
                  {t('resultspage.noLikedPhotos')}
                </Typography>
              </>
            ) : (
              <>
                <SearchOffIcon sx={{ fontSize: 80, color: 'text.disabled' }} />
                <Typography variant="h6" color="text.secondary">
                  {t('resultspage.noMatchingPhotos')}
                </Typography>
                <Button variant="contained" onClick={() => navigate('/')}>
                  {t('resultspage.tryAnotherSelfie')}
                </Button>
              </>
            )}
          </Box>
        ) : (
          <PhotoGallery
            matches={matches}
            selectMode={selectMode}
            selected={selected}
            onToggleSelect={toggleSelect}
            favorites={favorites}
            onToggleFavorite={toggleFavorite}
            checkpointId={checkpointId}
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
