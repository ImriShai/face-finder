import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './en.json'
import he from './he.json'

const stored = localStorage.getItem('lang')
const lng = stored ?? 'en'

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
  localStorage.setItem('lang', next)
})

export default i18n
