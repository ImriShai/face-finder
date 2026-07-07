import { useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import Modal from '@mui/material/Modal'
import Tooltip from '@mui/material/Tooltip'
import CloseIcon from '@mui/icons-material/Close'
import DownloadIcon from '@mui/icons-material/Download'
import NavigateBeforeIcon from '@mui/icons-material/NavigateBefore'
import NavigateNextIcon from '@mui/icons-material/NavigateNext'
import { downloadPhoto, previewUrl, thumbnailUrl } from '../services/api'
import { preloadRadius } from '../utils/preload'
import ConfidenceChip from './ConfidenceChip'
import FavoriteButton from './FavoriteButton'
import type { SearchMatch } from '../types'

interface Props {
  matches: SearchMatch[]
  index: number | null
  onClose: () => void
  onNavigate: (index: number) => void
  favorites?: Set<string>
  onToggleFavorite?: (photoId: string) => void
}

const PRELOAD_RADIUS = 3

export default function PhotoModal({ matches, index, onClose, onNavigate, favorites, onToggleFavorite }: Props) {
  const open = index !== null
  const match = index !== null ? matches[index] : null
  const [fullLoaded, setFullLoaded] = useState(false)

  // Reset blur-up state whenever the photo changes.
  useEffect(() => { setFullLoaded(false) }, [index])

  // Keyboard navigation.
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' && index !== null && index < matches.length - 1) onNavigate(index + 1)
      if (e.key === 'ArrowLeft'  && index !== null && index > 0)                  onNavigate(index - 1)
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, index, matches.length, onNavigate, onClose])

  // Prefetch previews within a few positions of the current photo so nearby next/prev feel instant.
  useEffect(() => {
    if (index === null) return
    preloadRadius(index, matches.length, PRELOAD_RADIUS, (i) => previewUrl(matches[i].photo_id))
  }, [index, matches])

  return (
    <Modal open={open} onClose={onClose}>
      <Box
        sx={{
          position: 'fixed',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: 'rgba(0,0,0,0.9)',
        }}
        onClick={onClose}
      >
        {/* Nav buttons fixed to viewport edges — always visible, never clipped. */}
        {index !== null && index > 0 && (
          <IconButton
            onClick={(e) => { e.stopPropagation(); onNavigate(index - 1) }}
            sx={{ position: 'fixed', left: 8, top: '50%', transform: 'translateY(-50%)', color: '#fff', zIndex: 1 }}
          >
            <NavigateBeforeIcon fontSize="large" />
          </IconButton>
        )}
        {index !== null && index < matches.length - 1 && (
          <IconButton
            onClick={(e) => { e.stopPropagation(); onNavigate(index + 1) }}
            sx={{ position: 'fixed', right: 8, top: '50%', transform: 'translateY(-50%)', color: '#fff', zIndex: 1 }}
          >
            <NavigateNextIcon fontSize="large" />
          </IconButton>
        )}

        {match && (
          <Box onClick={(e) => e.stopPropagation()} sx={{ position: 'relative' }}>
            {/* CSS grid stacking: both images occupy the same cell.
                Thumbnail (already in cache) drives the layout and shows blurred
                until the 2000px preview finishes loading, then fades out. */}
            <Box sx={{ display: 'grid', maxWidth: '90vw', maxHeight: '85vh' }}>
              <img
                src={thumbnailUrl(match.photo_id)}
                alt=""
                aria-hidden
                style={{
                  gridArea: '1/1',
                  maxWidth: '90vw',
                  maxHeight: '85vh',
                  objectFit: 'contain',
                  filter: 'blur(10px)',
                  transform: 'scale(1.05)',
                  opacity: fullLoaded ? 0 : 1,
                  transition: 'opacity 0.3s ease',
                  pointerEvents: 'none',
                }}
              />
              <img
                src={previewUrl(match.photo_id)}
                alt="Photo"
                onLoad={() => setFullLoaded(true)}
                style={{
                  gridArea: '1/1',
                  maxWidth: '90vw',
                  maxHeight: '85vh',
                  objectFit: 'contain',
                  opacity: fullLoaded ? 1 : 0,
                  transition: 'opacity 0.3s ease',
                }}
              />
            </Box>

            <Box sx={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 1, alignItems: 'center' }}>
              <ConfidenceChip confidence={match.confidence} />
              {favorites && onToggleFavorite && (
                <Box sx={{ bgcolor: 'rgba(0,0,0,0.5)', borderRadius: '50%' }}>
                  <FavoriteButton
                    active={favorites.has(match.photo_id)}
                    onToggle={() => onToggleFavorite(match.photo_id)}
                  />
                </Box>
              )}
              <Tooltip title="Download original">
                <IconButton
                  size="small"
                  sx={{ bgcolor: 'rgba(0,0,0,0.5)', color: '#fff' }}
                  onClick={() => downloadPhoto(match.photo_id)}
                >
                  <DownloadIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <IconButton onClick={onClose} size="small" sx={{ bgcolor: 'rgba(0,0,0,0.5)', color: '#fff' }}>
                <CloseIcon fontSize="small" />
              </IconButton>
            </Box>
          </Box>
        )}
      </Box>
    </Modal>
  )
}
