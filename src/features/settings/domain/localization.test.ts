import { describe, expect, it, vi } from 'vitest'
import {
  applyLanguagePreference,
  formatRetentionLabel,
  loadLanguagePreference,
  loadTimeZonePreference,
  saveLanguagePreference,
  saveTimeZonePreference,
  translate,
} from './localization'

describe('localization preferences', () => {
  it('defaults to English and the system timezone', () => {
    const storage = {
      getItem: () => null,
      setItem: vi.fn(),
    }

    expect(loadLanguagePreference(storage)).toBe('en')
    expect(loadTimeZonePreference(storage)).toBe('system')
  })

  it('loads and saves supported values', () => {
    const values = new Map([
      ['miku-warp.language', 'id'],
      ['miku-warp.time-zone', 'Asia/Jakarta'],
    ])
    const setItem = vi.fn()
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem,
    }

    expect(loadLanguagePreference(storage)).toBe('id')
    expect(loadTimeZonePreference(storage)).toBe('Asia/Jakarta')

    saveLanguagePreference('en', storage)
    saveTimeZonePreference('UTC', storage)

    expect(setItem).toHaveBeenCalledWith('miku-warp.language', 'en')
    expect(setItem).toHaveBeenCalledWith('miku-warp.time-zone', 'UTC')
  })

  it('translates messages and retention labels', () => {
    expect(translate('id', 'nav.settings')).toBe('Pengaturan')
    expect(formatRetentionLabel('id', 183)).toBe('6 bulan')
    expect(formatRetentionLabel('id', 0)).toBe('Never')
    expect(
      translate('id', 'trash.summary', { retention: '6 bulan' }),
    ).toBe('Item dihapus permanen setelah 6 bulan.')
  })

  it('applies the language to the document root', () => {
    const root = { lang: '' }

    applyLanguagePreference('id', root)

    expect(root.lang).toBe('id')
  })
})
