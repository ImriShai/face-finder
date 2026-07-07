import IconButton from '@mui/material/IconButton'
import FavoriteIcon from '@mui/icons-material/Favorite'
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder'

interface Props {
  active: boolean
  onToggle: () => void
}

/** Small heart overlay for photo cards and lightboxes. */
export default function FavoriteButton({ active, onToggle }: Props) {
  return (
    <IconButton
      size="small"
      aria-label={active ? 'Remove from favorites' : 'Add to favorites'}
      onClick={(e) => {
        e.stopPropagation()
        onToggle()
      }}
      sx={{ p: 0.5 }}
    >
      {active ? (
        <FavoriteIcon fontSize="small" sx={{ color: '#ff4569', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.6))' }} />
      ) : (
        <FavoriteBorderIcon
          fontSize="small"
          sx={{ color: 'rgba(255,255,255,0.9)', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.6))' }}
        />
      )}
    </IconButton>
  )
}
