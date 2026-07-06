import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { ThemeProvider } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'
import theme from './theme'
import ViewerGate from './components/ViewerGate'
import AdminPage from './pages/AdminPage'
import HomePage from './pages/HomePage'
import ResultsPage from './pages/ResultsPage'

export default function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <BrowserRouter>
        <ViewerGate>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/results" element={<ResultsPage />} />
            <Route path="/admin" element={<AdminPage />} />
          </Routes>
        </ViewerGate>
      </BrowserRouter>
    </ThemeProvider>
  )
}
