import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Container from '@mui/material/Container'
import Divider from '@mui/material/Divider'
import IconButton from '@mui/material/IconButton'
import InputAdornment from '@mui/material/InputAdornment'
import Modal from '@mui/material/Modal'
import Snackbar from '@mui/material/Snackbar'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import ChecklistIcon from '@mui/icons-material/Checklist'
import CloseIcon from '@mui/icons-material/Close'
import DownloadIcon from '@mui/icons-material/Download'
import FavoriteIcon from '@mui/icons-material/Favorite'
import LogoutIcon from '@mui/icons-material/Logout'
import NavigateBeforeIcon from '@mui/icons-material/NavigateBefore'
import NavigateNextIcon from '@mui/icons-material/NavigateNext'
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked'
import RefreshIcon from '@mui/icons-material/Refresh'
import TableViewIcon from '@mui/icons-material/TableView'
import VisibilityIcon from '@mui/icons-material/Visibility'
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff'
import ZipUploader from '../components/ZipUploader'
import EventsEditor from '../components/EventsEditor'
import BrandingEditor from '../components/BrandingEditor'
import { usePhotoFeed } from '../hooks/usePhotoFeed'
import {
  clearAdminPassword,
  downloadPhoto,
  downloadZip,
  exportPhotosCsv,
  getAdminPassword,
  listPhotos,
  previewUrl,
  saveAdminPassword,
  thumbnailUrl,
  type DownloadProgress,
  type DownloadQuality,
} from '../services/api'
import DownloadQualityMenu from '../components/DownloadQualityMenu'
import FavoriteButton from '../components/FavoriteButton'
import { useFavorites } from '../hooks/useFavorites'
import { formatDownloadLabel } from '../utils/format'
import { preloadRadius } from '../utils/preload'
import type { Photo } from '../types'

const PRELOAD_RADIUS = 3

// ── Login screen ─────────────────────────────────────────────────────────────

function LoginScreen({ onSuccess }: { onSuccess: () => void }) {
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    saveAdminPassword(password)
    try {
      await listPhotos(1, 1)
      onSuccess()
    } catch {
      clearAdminPassword()
      setError('Incorrect password.')
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
          <AdminPanelSettingsIcon color="primary" />
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            Admin Panel
          </Typography>
        </Box>

        <TextField
          label="Password"
          type={showPw ? 'text' : 'password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
          fullWidth
          slotProps={{
            input: {
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton onClick={() => setShowPw((v) => !v)} edge="end" size="small">
                    {showPw ? <VisibilityOffIcon /> : <VisibilityIcon />}
                  </IconButton>
                </InputAdornment>
              ),
            },
          }}
        />

        {error && <Alert severity="error">{error}</Alert>}

        <Button
          type="submit"
          variant="contained"
          size="large"
          disabled={!password || loading}
          startIcon={loading ? <CircularProgress size={18} color="inherit" /> : undefined}
        >
          {loading ? 'Checking…' : 'Sign in'}
        </Button>
      </Box>
    </Box>
  )
}

// ── Admin panel ───────────────────────────────────────────────────────────────

function AdminPanel({ onLogout }: { onLogout: () => void }) {
  const navigate = useNavigate()

  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  // Selection
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [downloading, setDownloading] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null)
  const [downloadError, setDownloadError] = useState<string | null>(null)
  const [downloadMenuAnchor, setDownloadMenuAnchor] = useState<HTMLElement | null>(null)

  // Favorites (per-browser) and liked-only filtering.
  const { favorites, toggleFavorite, clearFavorites } = useFavorites()
  const [likedOnly, setLikedOnly] = useState(false)
  const { photos, total, loading, error, hasMore, sentinelRef, refresh, loadMore } = usePhotoFeed(!likedOnly)
  const shownPhotos = useMemo<Photo[]>(() => {
    if (!likedOnly) return photos
    // The liked view is driven by the favorites set itself, not the paged
    // feed — it shows every liked photo (thumbnails load by id) without
    // needing the rest of the gallery, so the feed must not keep paging
    // in the background just because the filtered grid is short.
    const loadedById = new Map(photos.map((p) => [p.id, p]))
    return Array.from(favorites, (id) => loadedById.get(id) ?? { id, filename: '', created_at: '' })
  }, [likedOnly, photos, favorites])

  const currentPhoto: Photo | null = lightboxIndex !== null ? shownPhotos[lightboxIndex] : null

  useEffect(() => {
    if (lightboxIndex === null) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' && lightboxIndex < shownPhotos.length - 1)
        setLightboxIndex(lightboxIndex + 1)
      if (e.key === 'ArrowLeft' && lightboxIndex > 0)
        setLightboxIndex(lightboxIndex - 1)
      if (e.key === 'Escape') setLightboxIndex(null)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [lightboxIndex, shownPhotos.length])

  // Prefetch previews within a few positions of the current photo so nearby next/prev feel instant.
  useEffect(() => {
    if (lightboxIndex === null) return
    preloadRadius(lightboxIndex, shownPhotos.length, PRELOAD_RADIUS, (i) => previewUrl(shownPhotos[i].id))
  }, [lightboxIndex, shownPhotos])

  // Fetch the next page before the lightbox runs out of loaded photos, so browsing
  // forward never requires closing the lightbox to scroll and trigger a load.
  // (Not in liked mode — that list is already complete.)
  useEffect(() => {
    if (lightboxIndex === null || !hasMore || likedOnly) return
    if (shownPhotos.length - 1 - lightboxIndex <= PRELOAD_RADIUS) loadMore()
  }, [lightboxIndex, shownPhotos.length, hasMore, loadMore, likedOnly])

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
    setSelected(new Set(shownPhotos.map((p) => p.id)))
  }

  async function handleDownloadZip(quality: DownloadQuality) {
    setDownloadMenuAnchor(null)
    if (selected.size === 0) return
    setDownloading(true)
    setDownloadProgress(null)
    setDownloadError(null)
    try {
      await downloadZip(Array.from(selected), quality, 'gallery-selection.zip', setDownloadProgress)
    } catch {
      setDownloadError('Download failed. Please try again.')
    } finally {
      setDownloading(false)
      setDownloadProgress(null)
    }
  }

  async function handleExportCsv() {
    if (selected.size === 0) return
    try {
      await exportPhotosCsv(Array.from(selected))
    } catch {
      setDownloadError('Export failed. Please try again.')
    }
  }

  const downloadLabel = formatDownloadLabel(downloading, downloadProgress, selected.size)

  function handleCardClick(photoId: string, index: number) {
    if (selectMode) {
      toggleSelect(photoId)
    } else {
      setLightboxIndex(index)
    }
  }

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', pb: 6 }}>
      {/* Header */}
      <Box
        sx={{
          bgcolor: 'background.paper',
          borderBottom: 1,
          borderColor: 'divider',
          px: 3,
          py: 2,
          display: 'flex',
          alignItems: 'center',
          gap: 2,
        }}
      >
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/')}>
          Back to app
        </Button>
        <AdminPanelSettingsIcon color="primary" />
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          Admin Panel
        </Typography>
        <Box sx={{ flex: 1 }} />
        <Button startIcon={<LogoutIcon />} color="inherit" onClick={() => { clearAdminPassword(); onLogout() }}>
          Sign out
        </Button>
      </Box>

      <Container maxWidth="lg" sx={{ mt: 4 }}>
        {/* Upload */}
        <Typography variant="h5" sx={{ fontWeight: 700, mb: 2 }}>
          Upload Gallery
        </Typography>
        <Box sx={{ maxWidth: 560 }}>
          <ZipUploader onUploaded={refresh} />
        </Box>

        <Divider sx={{ my: 5 }} />

        {/* Event sections */}
        <Typography variant="h5" sx={{ fontWeight: 700, mb: 2 }}>
          Event Sections
        </Typography>
        <EventsEditor />

        <Divider sx={{ my: 5 }} />

        {/* Landing branding */}
        <Typography variant="h5" sx={{ fontWeight: 700, mb: 2 }}>
          Landing Page
        </Typography>
        <BrandingEditor />

        <Divider sx={{ my: 5 }} />

        {/* Gallery header */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3, flexWrap: 'wrap' }}>
          {selectMode ? (
            <>
              <Typography variant="h5" sx={{ fontWeight: 700, flex: 1 }}>
                {selected.size > 0
                  ? `${selected.size} of ${shownPhotos.length} selected`
                  : `${total.toLocaleString()} photo${total !== 1 ? 's' : ''}`}
              </Typography>
              <Button onClick={selectAll} disabled={selected.size === shownPhotos.length}>
                Select all loaded
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
              <Button
                startIcon={<TableViewIcon />}
                disabled={selected.size === 0}
                onClick={handleExportCsv}
              >
                Export CSV
              </Button>
              <Button onClick={cancelSelectMode} color="inherit">
                Cancel
              </Button>
            </>
          ) : (
            <>
              <Typography variant="h5" sx={{ fontWeight: 700 }}>
                Gallery
              </Typography>
              {total > 0 && (
                <Typography variant="body2" color="text.secondary">
                  {total.toLocaleString()} photo{total !== 1 ? 's' : ''}
                </Typography>
              )}
              <Box sx={{ flex: 1 }} />
              <ToggleButton
                value="liked"
                size="small"
                selected={likedOnly}
                onChange={() => setLikedOnly((v) => !v)}
                sx={{ textTransform: 'none', gap: 0.75, px: 1.5 }}
              >
                <FavoriteIcon fontSize="small" sx={{ color: likedOnly ? '#ff4569' : 'inherit' }} />
                Liked
              </ToggleButton>
              {likedOnly && favorites.size > 0 && (
                <Button
                  size="small"
                  color="inherit"
                  onClick={() => {
                    if (window.confirm(`Remove all ${favorites.size} liked photos?`)) clearFavorites()
                  }}
                >
                  Clear liked
                </Button>
              )}
              {shownPhotos.length > 0 && (
                <Button startIcon={<ChecklistIcon />} onClick={enterSelectMode}>
                  Select
                </Button>
              )}
              <Tooltip title="Refresh">
                <IconButton onClick={refresh} disabled={loading}>
                  <RefreshIcon />
                </IconButton>
              </Tooltip>
            </>
          )}
        </Box>

        {error && (
          <Typography color="error" sx={{ mb: 2 }}>
            {error}
          </Typography>
        )}

        {/* Thumbnail grid */}
        {shownPhotos.length > 0 && (
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
              gap: 1.5,
            }}
          >
            {shownPhotos.map((photo, i) => {
              const isSelected = selected.has(photo.id)
              return (
                <Box
                  key={photo.id}
                  onClick={() => handleCardClick(photo.id, i)}
                  sx={{
                    cursor: 'pointer',
                    borderRadius: 1.5,
                    overflow: 'hidden',
                    aspectRatio: '1',
                    bgcolor: 'action.hover',
                    position: 'relative',
                    outline: isSelected ? '3px solid' : 'none',
                    outlineColor: 'primary.main',
                    '&:hover img': { transform: selectMode ? 'none' : 'scale(1.05)' },
                  }}
                >
                  <img
                    src={thumbnailUrl(photo.id)}
                    alt={photo.filename}
                    loading="lazy"
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      display: 'block',
                      transition: 'transform 0.2s ease',
                      filter: isSelected ? 'brightness(0.75)' : 'none',
                    }}
                  />
                  <Box sx={{ position: 'absolute', top: 4, right: 4 }}>
                    <FavoriteButton
                      active={favorites.has(photo.id)}
                      onToggle={() => toggleFavorite(photo.id)}
                    />
                  </Box>
                  {selectMode && (
                    <Box sx={{ position: 'absolute', top: 6, left: 6 }}>
                      {isSelected
                        ? <CheckCircleIcon sx={{ color: 'primary.main', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.6))' }} />
                        : <RadioButtonUncheckedIcon sx={{ color: 'rgba(255,255,255,0.85)', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.6))' }} />
                      }
                    </Box>
                  )}
                </Box>
              )
            })}
          </Box>
        )}

        {/* Infinite scroll sentinel — disabled in liked mode, where the list is
            complete and a short grid would otherwise keep the sentinel in view
            and page in the entire gallery. */}
        {!likedOnly && (
          <Box ref={sentinelRef} sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            {loading && <CircularProgress size={28} />}
            {!loading && photos.length === 0 && !error && (
              <Typography color="text.secondary">
                No photos yet. Upload a gallery above.
              </Typography>
            )}
          </Box>
        )}
        {likedOnly && shownPhotos.length === 0 && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <Typography color="text.secondary">
              No liked photos yet — tap the heart on a photo to save it here.
            </Typography>
          </Box>
        )}
      </Container>

      {/* Lightbox */}
      {!selectMode && (
        <Modal open={lightboxIndex !== null} onClose={() => setLightboxIndex(null)}>
          <Box
            onClick={() => setLightboxIndex(null)}
            sx={{
              position: 'fixed',
              inset: 0,
              bgcolor: 'rgba(0,0,0,0.92)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {currentPhoto && (
              <Box
                onClick={(e) => e.stopPropagation()}
                sx={{ position: 'relative', maxWidth: '90vw', maxHeight: '90vh' }}
              >
                <img
                  src={previewUrl(currentPhoto.id)}
                  alt={currentPhoto.filename}
                  style={{
                    maxWidth: '90vw',
                    maxHeight: '85vh',
                    objectFit: 'contain',
                    borderRadius: 8,
                    display: 'block',
                  }}
                />
                <Typography
                  variant="caption"
                  sx={{
                    position: 'absolute',
                    bottom: -24,
                    left: 0,
                    right: 0,
                    textAlign: 'center',
                    color: 'rgba(255,255,255,0.6)',
                  }}
                >
                  {currentPhoto.filename}
                </Typography>

                {/* top-right actions */}
                <Box sx={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 1 }}>
                  <Box sx={{ bgcolor: 'rgba(0,0,0,0.5)', borderRadius: '50%' }}>
                    <FavoriteButton
                      active={favorites.has(currentPhoto.id)}
                      onToggle={() => toggleFavorite(currentPhoto.id)}
                    />
                  </Box>
                  <Tooltip title="Download photo">
                    <IconButton
                      size="small"
                      sx={{ bgcolor: 'rgba(0,0,0,0.5)', color: '#fff' }}
                      onClick={() => downloadPhoto(currentPhoto.id)}
                    >
                      <DownloadIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <IconButton
                    onClick={() => setLightboxIndex(null)}
                    size="small"
                    sx={{ bgcolor: 'rgba(0,0,0,0.5)', color: '#fff' }}
                  >
                    <CloseIcon fontSize="small" />
                  </IconButton>
                </Box>

                {lightboxIndex !== null && lightboxIndex > 0 && (
                  <IconButton
                    onClick={() => setLightboxIndex(lightboxIndex - 1)}
                    sx={{ position: 'absolute', left: -56, top: '50%', transform: 'translateY(-50%)', color: '#fff' }}
                  >
                    <NavigateBeforeIcon fontSize="large" />
                  </IconButton>
                )}
                {lightboxIndex !== null && (lightboxIndex < photos.length - 1 || hasMore) && (
                  <IconButton
                    onClick={() => lightboxIndex < photos.length - 1 && setLightboxIndex(lightboxIndex + 1)}
                    disabled={lightboxIndex >= photos.length - 1}
                    sx={{ position: 'absolute', right: -56, top: '50%', transform: 'translateY(-50%)', color: '#fff' }}
                  >
                    {lightboxIndex >= photos.length - 1
                      ? <CircularProgress size={28} color="inherit" />
                      : <NavigateNextIcon fontSize="large" />}
                  </IconButton>
                )}
              </Box>
            )}
          </Box>
        </Modal>
      )}

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

// ── Root ──────────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const [authed, setAuthed] = useState(() => Boolean(getAdminPassword()))

  if (!authed) {
    return <LoginScreen onSuccess={() => setAuthed(true)} />
  }
  return <AdminPanel onLogout={() => setAuthed(false)} />
}
