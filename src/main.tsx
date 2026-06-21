import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App.tsx'
import {
  applyThemePreference,
  loadThemePreference,
} from './features/settings/domain/theme.ts'
import {
  applyLanguagePreference,
  loadLanguagePreference,
} from './features/settings/domain/localization.ts'
import './index.css'

applyThemePreference(loadThemePreference())
applyLanguagePreference(loadLanguagePreference())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
