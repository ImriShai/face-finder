import { useTranslation } from 'react-i18next'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'

export default function LanguageSwitcher() {
  const { i18n } = useTranslation()

  const handleChange = (
    _event: React.MouseEvent<HTMLElement>,
    value: string | null,
  ) => {
    if (value) {
      void i18n.changeLanguage(value)
    }
  }

  return (
    <ToggleButtonGroup
      value={i18n.language}
      exclusive
      size="small"
      color="primary"
      onChange={handleChange}
      sx={{
        position: 'fixed',
        top: 16,
        insetInlineEnd: 16,
        zIndex: 1300,
        bgcolor: 'background.paper',
        boxShadow: 1,
        borderRadius: 2,
      }}
    >
      <ToggleButton value="en">EN</ToggleButton>
      <ToggleButton value="he">עברית</ToggleButton>
    </ToggleButtonGroup>
  )
}
