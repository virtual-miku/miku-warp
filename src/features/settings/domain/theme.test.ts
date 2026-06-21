import { describe, expect, it, vi } from 'vitest'
import {
  applyThemePreference,
  loadThemePreference,
  saveThemePreference,
} from './theme'

describe('theme preference', () => {
  it('uses System when no valid preference is stored', () => {
    expect(
      loadThemePreference({
        getItem: () => null,
        setItem: vi.fn(),
      }),
    ).toBe('system')
    expect(
      loadThemePreference({
        getItem: () => 'unknown',
        setItem: vi.fn(),
      }),
    ).toBe('system')
  })

  it('loads and saves supported themes', () => {
    const setItem = vi.fn()
    const storage = {
      getItem: () => 'vampire',
      setItem,
    }

    expect(loadThemePreference(storage)).toBe('vampire')

    saveThemePreference('cyber', storage)

    expect(setItem).toHaveBeenCalledWith('miku-warp.theme', 'cyber')
  })

  it('applies the theme through a document data attribute', () => {
    const root = { dataset: {} as DOMStringMap }

    applyThemePreference('dark', root)

    expect(root.dataset.theme).toBe('dark')
  })

  it('falls back safely when storage access fails', () => {
    const storage = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    }

    expect(loadThemePreference(storage)).toBe('system')
    expect(() => saveThemePreference('light', storage)).not.toThrow()
  })
})
