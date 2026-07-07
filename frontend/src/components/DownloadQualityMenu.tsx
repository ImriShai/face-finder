import ListItemText from '@mui/material/ListItemText'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import type { DownloadQuality } from '../services/api'

interface Props {
  anchorEl: HTMLElement | null
  onClose: () => void
  onSelect: (quality: DownloadQuality) => void
}

/** Quality picker shown when starting a ZIP download. */
export default function DownloadQualityMenu({ anchorEl, onClose, onSelect }: Props) {
  return (
    <Menu anchorEl={anchorEl} open={anchorEl !== null} onClose={onClose}>
      <MenuItem onClick={() => onSelect('web')}>
        <ListItemText
          primary="Web size (recommended)"
          secondary="Great for phones and sharing — downloads fast"
        />
      </MenuItem>
      <MenuItem onClick={() => onSelect('original')}>
        <ListItemText
          primary="Original quality"
          secondary="Full-resolution files — may take a while"
        />
      </MenuItem>
    </Menu>
  )
}
