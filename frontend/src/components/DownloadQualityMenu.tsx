import ListItemText from '@mui/material/ListItemText'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import { useTranslation } from 'react-i18next'
import type { DownloadQuality } from '../services/api'

interface Props {
  anchorEl: HTMLElement | null
  onClose: () => void
  onSelect: (quality: DownloadQuality) => void
}

/** Quality picker shown when starting a ZIP download. */
export default function DownloadQualityMenu({ anchorEl, onClose, onSelect }: Props) {
  const { t } = useTranslation()
  return (
    <Menu anchorEl={anchorEl} open={anchorEl !== null} onClose={onClose}>
      <MenuItem onClick={() => onSelect('web')}>
        <ListItemText
          primary={t('downloadqualitymenu.webPrimary')}
          secondary={t('downloadqualitymenu.webSecondary')}
        />
      </MenuItem>
      <MenuItem onClick={() => onSelect('original')}>
        <ListItemText
          primary={t('downloadqualitymenu.originalPrimary')}
          secondary={t('downloadqualitymenu.originalSecondary')}
        />
      </MenuItem>
    </Menu>
  )
}
