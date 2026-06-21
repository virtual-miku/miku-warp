import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { SettingsPanel } from './SettingsPanel'

describe('SettingsPanel', () => {
  it('renders every theme and marks the current selection', () => {
    const html = renderToStaticMarkup(
      <SettingsPanel onThemeChange={vi.fn()} theme="system" />,
    )

    expect(html).toContain('System')
    expect(html).toContain('Dark')
    expect(html).toContain('Light')
    expect(html).toContain('Vampire')
    expect(html).toContain('Cyber')
    expect(html).toContain('aria-checked="true"')
    expect(html).toContain('theme-option-preview-system')
  })
})
