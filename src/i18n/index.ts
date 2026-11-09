import { journeyCopy } from './journey'
import { en } from '../en'
import { themeNames, performance, origins, destinations } from '../tripData'
import ko from './ko'
import ja from './ja'
import es from './es'
import simplified from './zh-CN'
import traditional from './zh-TW'

export const languages = { en: 'English', 'zh-CN': '简体中文', 'zh-TW': '繁體中文', ko: '한국어', ja: '日本語', es: 'Español' }
export type Language = keyof typeof languages
const english = {
  ...en, ...themeNames, language: 'Language', map: 'Gyeongju map',
  mapError: 'The map could not load. Choose a place from the list.',
  zoomIn: 'Zoom in', zoomOut: 'Zoom out', attribution: 'Map credits',
  missing: 'Location unverified', invalid: 'Enter a starting point and both travel times.',
  selected: 'Selected', select: 'Select', eventName: performance.name, venue: performance.location,
}

export type Messages = Record<keyof typeof english, string> & Record<string, string>
const base: Messages = { ...Object.fromEntries([...origins, ...destinations].map(p => [p.id, p.name])), ...english }
const translations = { en: {}, ko, ja, es, 'zh-CN': simplified, 'zh-TW': traditional }
export function messages(language: Language): Messages {
  return { ...base, ...translations[language], ...journeyCopy[language] }
}

export function savedLanguage(): Language {
  try {
    const value = localStorage.getItem('silla-via.language')
    if (value && Object.hasOwn(languages, value)) return value as Language
  } catch { /* Storage may be disabled. */ }
  return 'en'
}

