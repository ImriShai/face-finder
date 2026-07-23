import { createTheme } from '@mui/material/styles'

export function buildTheme(direction: 'ltr' | 'rtl') {
  return createTheme({
    direction,
    palette: {
      mode: 'light',
      primary: { main: '#1565C0' },
      secondary: { main: '#FF6F00' },
      background: { default: '#F5F7FA' },
    },
    shape: { borderRadius: 12 },
    typography: {
      fontFamily: '"Inter", "Roboto", sans-serif',
    },
  })
}

const theme = buildTheme('ltr')

export default theme
