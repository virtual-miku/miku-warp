import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { SettingsPanel } from './SettingsPanel'

describe('SettingsPanel', () => {
  it('renders every theme and marks the current selection', () => {
    const html = renderToStaticMarkup(
      <SettingsPanel
        language="en"
        onLanguageChange={vi.fn()}
        onThemeChange={vi.fn()}
        onTimeZoneChange={vi.fn()}
        onTrashRetentionChange={vi.fn()}
        theme="system"
        timeZone="system"
        trashRetentionDays={183}
      />,
    )

    expect(html).toContain('System')
    expect(html).toContain('Dark')
    expect(html).toContain('Light')
    expect(html).toContain('Vampire')
    expect(html).toContain('Cyber')
    expect(html).toContain('Punk')
    expect(html).toContain('Celestial')
    expect(html).toContain('aria-checked="true"')
    expect(html).toContain('theme-option-preview-system')
    expect(html).toContain('theme-option-preview-punk')
    expect(html).toContain('theme-option-preview-celestial')
    expect(html).toContain('Language')
    expect(html).toContain('Timezone')
    expect(html).toContain('Trash retention')
    expect(html).toContain('6 months')
  })
})
