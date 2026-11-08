import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './en.json'
import he from './he.json'

export const SUPPORTED_LANGS = ['en', 'he'] as const

// localStorage can be unavailable (private mode, blocked site data) and throw on
// access — never let a missing language preference stop the app from loading.
function readStoredLang(): string | null {
  try {
    return localStorage.getItem('lang')
  } catch {
    return null
  }
}

const stored = readStoredLang()
const lng = stored && (SUPPORTED_LANGS as readonly string[]).includes(stored) ? stored : 'en'

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    he: { translation: he },
  },
  lng,
  fallbackLng: 'en',
  keySeparator: false,
  interpolation: {
    escapeValue: false,
  },
})

i18n.on('languageChanged', (next) => {
  try {
    localStorage.setItem('lang', next)
  } catch {
    // Preference just won't persist across reloads.
  }
})

export default i18n
