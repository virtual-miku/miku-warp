import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App.tsx'
import {
  applyThemePreference,
  loadThemePreference,
} from './features/settings/domain/theme.ts'
import './index.css'

applyThemePreference(loadThemePreference())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
