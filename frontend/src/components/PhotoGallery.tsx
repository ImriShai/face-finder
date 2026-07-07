import { useEffect, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import ImageListItem from '@mui/material/ImageListItem'
import BookmarkIcon from '@mui/icons-material/Bookmark'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked'
import { previewUrl, thumbnailUrl } from '../services/api'
import { useInfiniteScroll } from '../hooks/useInfiniteScroll'
import { saveLastViewed } from '../utils/userPrefs'
import FavoriteButton from './FavoriteButton'
import PhotoModal from './PhotoModal'
import ConfidenceChip from './ConfidenceChip'
import type { SearchMatch } from '../types'

interface Props {
  matches: SearchMatch[]
  selectMode?: boolean
  selected?: Set<string>
  onToggleSelect?: (photoId: string) => void
  favorites?: Set<string>
  onToggleFavorite?: (photoId: string) => void
  /** Photo to mark as "last viewed" and scroll to on mount. */
  checkpointId?: string | null
}

export default function PhotoGallery({
  matches,
  selectMode = false,
  selected,
  onToggleSelect,
  favorites,
  onToggleFavorite,
  checkpointId = null,
}: Props) {
  const checkpointIndex = checkpointId ? matches.findIndex((m) => m.photo_id === checkpointId) : -1
  const { visible, hasMore, sentinelRef } = useInfiniteScroll(matches, 20, checkpointIndex)
  const [modalIndex, setModalIndex] = useState<number | null>(null)
  const prefetched = useRef(new Set<string>())
  const checkpointRef = useRef<HTMLLIElement | null>(null)

  // Bring the last-viewed photo into view once on mount.
  const scrolledToCheckpoint = useRef(false)
  useEffect(() => {
    if (scrolledToCheckpoint.current || !checkpointRef.current) return
    scrolledToCheckpoint.current = true
    checkpointRef.current.scrollIntoView({ block: 'center' })
  }, [visible.length])

  function openPhoto(index: number) {
    saveLastViewed(matches[index].photo_id)
    setModalIndex(index)
  }

  function handleCardClick(photoId: string, visibleIndex: number) {
    if (selectMode) {
      onToggleSelect?.(photoId)
    } else {
      openPhoto(visibleIndex)
    }
  }

  function handleMouseEnter(photoId: string) {
    if (prefetched.current.has(photoId)) return
    prefetched.current.add(photoId)
    const img = new Image()
    img.src = previewUrl(photoId)
  }

  return (
    <>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: 2,
        }}
      >
        {visible.map((match, i) => {
          const isSelected = selected?.has(match.photo_id) ?? false
          const isCheckpoint = match.photo_id === checkpointId
          return (
            <ImageListItem
              key={match.photo_id}
              ref={isCheckpoint ? checkpointRef : undefined}
              onClick={() => handleCardClick(match.photo_id, i)}
              onMouseEnter={() => handleMouseEnter(match.photo_id)}
              sx={{
                cursor: 'pointer',
                borderRadius: 2,
                overflow: 'hidden',
                position: 'relative',
                outline: isSelected ? '3px solid' : 'none',
                outlineColor: 'primary.main',
                '&:hover .chip-overlay': { opacity: selectMode ? 0 : 1 },
                '&:hover img': { transform: 'scale(1.04)' },
              }}
            >
              <img
                src={thumbnailUrl(match.photo_id)}
                alt={`Photo ${match.photo_id}`}
                loading="lazy"
                style={{
                  width: '100%',
                  aspectRatio: '1',
                  objectFit: 'cover',
                  display: 'block',
                  transition: 'transform 0.2s ease',
                  filter: isSelected ? 'brightness(0.75)' : 'none',
                }}
              />

              {/* Favorite heart */}
              {favorites && onToggleFavorite && (
                <Box sx={{ position: 'absolute', top: 4, right: 4 }}>
                  <FavoriteButton
                    active={favorites.has(match.photo_id)}
                    onToggle={() => onToggleFavorite(match.photo_id)}
                  />
                </Box>
              )}

              {/* Last-viewed checkpoint marker */}
              {isCheckpoint && !selectMode && (
                <Chip
                  icon={<BookmarkIcon />}
                  label="Last viewed"
                  size="small"
                  color="primary"
                  sx={{ position: 'absolute', top: 8, left: 8 }}
                />
              )}

              {/* Confidence chip (normal mode only) */}
              {!selectMode && (
                <Box
                  className="chip-overlay"
                  sx={{ position: 'absolute', bottom: 8, left: 8, opacity: 0, transition: 'opacity 0.2s' }}
                >
                  <ConfidenceChip confidence={match.confidence} />
                </Box>
              )}

              {/* Selection checkbox (select mode only) */}
              {selectMode && (
                <Box sx={{ position: 'absolute', top: 8, left: 8 }}>
                  {isSelected
                    ? <CheckCircleIcon sx={{ color: 'primary.main', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.6))' }} />
                    : <RadioButtonUncheckedIcon sx={{ color: 'rgba(255,255,255,0.85)', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.6))' }} />
                  }
                </Box>
              )}
            </ImageListItem>
          )
        })}
      </Box>

      <Box ref={sentinelRef} sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        {hasMore && <CircularProgress size={32} />}
      </Box>

      {!selectMode && (
        <PhotoModal
          matches={matches}
          index={modalIndex}
          onClose={() => setModalIndex(null)}
          onNavigate={openPhoto}
          favorites={favorites}
          onToggleFavorite={onToggleFavorite}
        />
      )}
    </>
  )
}
