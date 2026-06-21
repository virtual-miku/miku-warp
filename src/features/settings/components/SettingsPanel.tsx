import { Check, Palette } from 'lucide-react'
import {
  themeOptions,
  type ThemePreference,
} from '../domain/theme'

type SettingsPanelProps = {
  onThemeChange: (theme: ThemePreference) => void
  theme: ThemePreference
}

export function SettingsPanel({
  onThemeChange,
  theme,
}: SettingsPanelProps) {
  return (
    <section className="settings-panel" aria-label="Settings">
      <article className="settings-card">
        <header className="settings-card-header">
          <div className="settings-card-icon" aria-hidden="true">
            <Palette size={20} />
          </div>
          <div>
            <h2>Theme</h2>
            <p>Choose how Miku Warp looks on this device.</p>
          </div>
        </header>

        <div
          aria-label="Application theme"
          className="theme-option-grid"
          role="radiogroup"
        >
          {themeOptions.map((option) => {
            const isActive = theme === option.value

            return (
              <button
                aria-checked={isActive}
                className={
                  isActive
                    ? 'theme-option theme-option-active'
                    : 'theme-option'
                }
                key={option.value}
                onClick={() => onThemeChange(option.value)}
                role="radio"
                type="button"
              >
                <span
                  aria-hidden="true"
                  className={`theme-option-preview theme-option-preview-${option.value}`}
                >
                  <i />
                  <i />
                  <i />
                </span>
                <span className="theme-option-copy">
                  <strong>{option.label}</strong>
                  <small>{option.description}</small>
                </span>
                <span
                  aria-hidden="true"
                  className="theme-option-check"
                >
                  {isActive ? <Check size={15} /> : null}
                </span>
              </button>
            )
          })}
        </div>
      </article>
    </section>
  )
}
