export const themeOptions = [
  {
    value: 'system',
    label: 'System',
    description: 'Follow the operating system appearance.',
  },
  {
    value: 'dark',
    label: 'Dark',
    description: 'Neutral dark colors for low-light use.',
  },
  {
    value: 'light',
    label: 'Light',
    description: 'Bright neutral colors with strong contrast.',
  },
  {
    value: 'vampire',
    label: 'Vampire',
    description: 'Deep burgundy surfaces with crimson accents.',
  },
  {
    value: 'cyber',
    label: 'Cyber',
    description: 'Midnight blue surfaces with neon cyan accents.',
  },
  {
    value: 'punk',
    label: 'Punk',
    description: 'High-contrast ink surfaces with hot pink accents.',
  },
  {
    value: 'celestial',
    label: 'Celestial',
    description: 'Deep starlit surfaces with warm gold accents.',
  },
] as const

export type ThemePreference = (typeof themeOptions)[number]['value']

type ThemeStorage = Pick<Storage, 'getItem' | 'setItem'>
type ThemeRoot = Pick<HTMLElement, 'dataset'>

const themeStorageKey = 'miku-warp.theme'
const supportedThemes = new Set<ThemePreference>(
  themeOptions.map((option) => option.value),
)

export function loadThemePreference(
  storage: ThemeStorage | undefined = getBrowserStorage(),
): ThemePreference {
  if (!storage) {
    return 'system'
  }

  try {
    const storedTheme = storage.getItem(themeStorageKey)

    return isThemePreference(storedTheme) ? storedTheme : 'system'
  } catch {
    return 'system'
  }
}

export function saveThemePreference(
  theme: ThemePreference,
  storage: ThemeStorage | undefined = getBrowserStorage(),
) {
  if (!storage) {
    return
  }

  try {
    storage.setItem(themeStorageKey, theme)
  } catch {
    // The selected theme still applies for the current session.
  }
}

export function applyThemePreference(
  theme: ThemePreference,
  root: ThemeRoot | undefined = getDocumentRoot(),
) {
  if (root) {
    root.dataset.theme = theme
  }
}

export function isThemePreference(
  value: string | null,
): value is ThemePreference {
  return value !== null && supportedThemes.has(value as ThemePreference)
}

function getBrowserStorage() {
  if (typeof window === 'undefined') {
    return undefined
  }

  try {
    return window.localStorage
  } catch {
    return undefined
  }
}

function getDocumentRoot() {
  return typeof document === 'undefined' ? undefined : document.documentElement
}
