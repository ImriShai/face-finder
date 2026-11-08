import { useEffect, useMemo } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { ThemeProvider } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'
import { CacheProvider } from '@emotion/react'
import createCache from '@emotion/cache'
import { useTranslation } from 'react-i18next'
import { prefixer } from 'stylis'
import rtlPlugin from 'stylis-plugin-rtl'
import { buildTheme } from './theme'
import LanguageSwitcher from './components/LanguageSwitcher'
import ViewerGate from './components/ViewerGate'
import AdminPage from './pages/AdminPage'
import HomePage from './pages/HomePage'
import ResultsPage from './pages/ResultsPage'

const cacheLtr = createCache({ key: 'mui' })
const cacheRtl = createCache({
  key: 'muirtl',
  stylisPlugins: [prefixer, rtlPlugin],
})

export default function App() {
  const { i18n } = useTranslation()
  const rtl = i18n.language === 'he'

  const theme = useMemo(() => buildTheme(rtl ? 'rtl' : 'ltr'), [rtl])

  useEffect(() => {
    document.documentElement.dir = rtl ? 'rtl' : 'ltr'
    document.documentElement.lang = i18n.language
  }, [rtl, i18n.language])

  return (
    <CacheProvider value={rtl ? cacheRtl : cacheLtr}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <BrowserRouter>
          <LanguageSwitcher />
          <ViewerGate>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/results" element={<ResultsPage />} />
              <Route path="/admin" element={<AdminPage />} />
            </Routes>
          </ViewerGate>
        </BrowserRouter>
      </ThemeProvider>
    </CacheProvider>
  )
}
