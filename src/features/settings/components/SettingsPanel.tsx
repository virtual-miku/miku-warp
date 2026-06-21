import { Check, Clock3, Languages, Palette, Trash2 } from 'lucide-react'
import type { ReactNode } from 'react'
import {
  formatRetentionLabel,
  languageOptions,
  timeZoneOptions,
  translate,
  type AppLanguage,
  type TimeZonePreference,
} from '../domain/localization'
import {
  trashRetentionOptions,
  type TrashRetentionDays,
} from '../data/trash-retention'
import {
  themeOptions,
  type ThemePreference,
} from '../domain/theme'

type SettingsPanelProps = {
  language: AppLanguage
  onLanguageChange: (language: AppLanguage) => void
  onTimeZoneChange: (timeZone: TimeZonePreference) => void
  onTrashRetentionChange: (retentionDays: TrashRetentionDays) => void
  onThemeChange: (theme: ThemePreference) => void
  timeZone: TimeZonePreference
  trashRetentionDays: TrashRetentionDays
  trashRetentionUpdating?: boolean
  theme: ThemePreference
}

export function SettingsPanel({
  language,
  onLanguageChange,
  onTimeZoneChange,
  onTrashRetentionChange,
  onThemeChange,
  timeZone,
  trashRetentionDays,
  trashRetentionUpdating = false,
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
            <h2>{translate(language, 'settings.theme.title')}</h2>
            <p>{translate(language, 'settings.theme.description')}</p>
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

      <div className="settings-preference-grid">
        <PreferenceCard
          description={translate(language, 'settings.language.description')}
          icon={<Languages size={20} />}
          title={translate(language, 'settings.language.title')}
        >
          <select
            aria-label={translate(language, 'settings.language.title')}
            className="settings-select"
            onChange={(event) =>
              onLanguageChange(event.target.value as AppLanguage)
            }
            value={language}
          >
            {languageOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </PreferenceCard>

        <PreferenceCard
          description={translate(language, 'settings.timezone.description')}
          icon={<Clock3 size={20} />}
          title={translate(language, 'settings.timezone.title')}
        >
          <select
            aria-label={translate(language, 'settings.timezone.title')}
            className="settings-select"
            onChange={(event) => onTimeZoneChange(event.target.value)}
            value={timeZone}
          >
            <option value="system">
              {translate(language, 'settings.timezone.system')}
            </option>
            {timeZoneOptions.map((option) => (
              <option key={option} value={option}>
                {option.replaceAll('_', ' ')}
              </option>
            ))}
          </select>
        </PreferenceCard>

        <PreferenceCard
          description={translate(language, 'settings.trash.description')}
          icon={<Trash2 size={20} />}
          title={translate(language, 'settings.trash.title')}
        >
          <select
            aria-label={translate(language, 'settings.trash.title')}
            className="settings-select"
            disabled={trashRetentionUpdating}
            onChange={(event) =>
              onTrashRetentionChange(
                Number(event.target.value) as TrashRetentionDays,
              )
            }
            value={trashRetentionDays}
          >
            {trashRetentionOptions.map((days) => (
              <option key={days} value={days}>
                {formatRetentionLabel(language, days)}
              </option>
            ))}
          </select>
          <small className="settings-field-note">
            {trashRetentionUpdating
              ? translate(language, 'settings.trash.updating')
              : translate(language, 'settings.trash.warning')}
          </small>
        </PreferenceCard>
      </div>
    </section>
  )
}

function PreferenceCard({
  children,
  description,
  icon,
  title,
}: {
  children: ReactNode
  description: string
  icon: ReactNode
  title: string
}) {
  return (
    <article className="settings-card settings-preference-card">
      <header className="settings-card-header">
        <div className="settings-card-icon" aria-hidden="true">
          {icon}
        </div>
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </header>
      <div className="settings-field">{children}</div>
    </article>
  )
}
