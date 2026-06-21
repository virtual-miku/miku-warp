export const languageOptions = [
  { value: 'en', label: 'English' },
  { value: 'id', label: 'Bahasa Indonesia' },
] as const

export type AppLanguage = (typeof languageOptions)[number]['value']
export type TimeZonePreference = 'system' | string

type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem'>
type LanguageRoot = Pick<HTMLElement, 'lang'>

const languageStorageKey = 'miku-warp.language'
const timeZoneStorageKey = 'miku-warp.time-zone'
const supportedLanguages = new Set<AppLanguage>(
  languageOptions.map((option) => option.value),
)

const fallbackTimeZones = [
  'UTC',
  'Asia/Jakarta',
  'Asia/Makassar',
  'Asia/Jayapura',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Asia/Seoul',
  'Europe/London',
  'Europe/Berlin',
  'America/New_York',
  'America/Los_Angeles',
]

export const timeZoneOptions = getSupportedTimeZones()

export const messages = {
  en: {
    'nav.dashboard': 'Dashboard',
    'nav.accounts': 'Accounts',
    'nav.import': 'Import',
    'nav.backup': 'Backup',
    'nav.settings': 'Settings',
    'nav.trash': 'Trash',
    'settings.title': 'Settings',
    'settings.theme.title': 'Theme',
    'settings.theme.description': 'Choose how Miku Warp looks on this device.',
    'settings.language.title': 'Language',
    'settings.language.description': 'Choose the interface language.',
    'settings.timezone.title': 'Timezone',
    'settings.timezone.description':
      'Used for displayed dates and new manual imports.',
    'settings.timezone.system': 'System default',
    'settings.trash.title': 'Trash retention',
    'settings.trash.description':
      'Choose when trashed data is permanently deleted.',
    'settings.trash.warning':
      'Items older than the selected period may be deleted permanently.',
    'settings.trash.updating': 'Updating retention',
    'retention.never': 'Never',
    'retention.30': '30 days',
    'retention.90': '90 days',
    'retention.183': '6 months',
    'retention.365': '1 year',
    'trash.summary': 'Items are removed permanently after {retention}.',
    'trash.summary.never': 'Items stay in Trash until you delete them permanently.',
    'trash.history.empty': 'Deleted warp records will stay here for {retention}.',
    'trash.accounts.empty': 'Deleted accounts will stay here for {retention}.',
    'trash.backups.empty': 'Deleted local backups will stay here for {retention}.',
  },
  id: {
    'nav.dashboard': 'Dasbor',
    'nav.accounts': 'Akun',
    'nav.import': 'Impor',
    'nav.backup': 'Cadangan',
    'nav.settings': 'Pengaturan',
    'nav.trash': 'Sampah',
    'settings.title': 'Pengaturan',
    'settings.theme.title': 'Tema',
    'settings.theme.description': 'Pilih tampilan Miku Warp di perangkat ini.',
    'settings.language.title': 'Bahasa',
    'settings.language.description': 'Pilih bahasa antarmuka aplikasi.',
    'settings.timezone.title': 'Zona waktu',
    'settings.timezone.description':
      'Digunakan untuk tanggal yang ditampilkan dan impor manual baru.',
    'settings.timezone.system': 'Bawaan sistem',
    'settings.trash.title': 'Masa simpan Sampah',
    'settings.trash.description':
      'Pilih kapan data di Sampah dihapus permanen.',
    'settings.trash.warning':
      'Item yang lebih lama dari periode pilihan dapat dihapus permanen.',
    'settings.trash.updating': 'Memperbarui masa simpan',
    'retention.never': 'Never',
    'retention.30': '30 hari',
    'retention.90': '90 hari',
    'retention.183': '6 bulan',
    'retention.365': '1 tahun',
    'trash.summary': 'Item dihapus permanen setelah {retention}.',
    'trash.summary.never': 'Item tetap di Sampah sampai Anda menghapusnya permanen.',
    'trash.history.empty': 'Riwayat warp yang dihapus disimpan selama {retention}.',
    'trash.accounts.empty': 'Akun yang dihapus disimpan selama {retention}.',
    'trash.backups.empty': 'Cadangan lokal yang dihapus disimpan selama {retention}.',
  },
} as const

export type MessageKey = keyof (typeof messages)['en']

export function translate(
  language: AppLanguage,
  key: MessageKey,
  values: Record<string, string | number> = {},
) {
  const template = messages[language][key] ?? messages.en[key]

  return Object.entries(values).reduce(
    (message, [name, value]) =>
      message.replaceAll(`{${name}}`, String(value)),
    template,
  )
}

export function loadLanguagePreference(
  storage: PreferenceStorage | undefined = getBrowserStorage(),
): AppLanguage {
  const value = readPreference(languageStorageKey, storage)

  return value && supportedLanguages.has(value as AppLanguage)
    ? (value as AppLanguage)
    : 'en'
}

export function saveLanguagePreference(
  language: AppLanguage,
  storage: PreferenceStorage | undefined = getBrowserStorage(),
) {
  writePreference(languageStorageKey, language, storage)
}

export function applyLanguagePreference(
  language: AppLanguage,
  root: LanguageRoot | undefined = getDocumentRoot(),
) {
  if (root) {
    root.lang = language
  }
}

export function loadTimeZonePreference(
  storage: PreferenceStorage | undefined = getBrowserStorage(),
): TimeZonePreference {
  const value = readPreference(timeZoneStorageKey, storage)

  return value === 'system' || (value && isValidTimeZone(value))
    ? value
    : 'system'
}

export function saveTimeZonePreference(
  timeZone: TimeZonePreference,
  storage: PreferenceStorage | undefined = getBrowserStorage(),
) {
  if (timeZone === 'system' || isValidTimeZone(timeZone)) {
    writePreference(timeZoneStorageKey, timeZone, storage)
  }
}

export function resolveTimeZone(timeZone: TimeZonePreference) {
  if (timeZone !== 'system') {
    return timeZone
  }

  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
}

export function getLocale(language: AppLanguage) {
  return language === 'id' ? 'id-ID' : 'en-US'
}

export function formatRetentionLabel(
  language: AppLanguage,
  retentionDays: number,
) {
  const keyByDays: Record<number, MessageKey> = {
    0: 'retention.never',
    30: 'retention.30',
    90: 'retention.90',
    183: 'retention.183',
    365: 'retention.365',
  }
  const key = keyByDays[retentionDays]

  return key ? translate(language, key) : `${retentionDays} days`
}

function getSupportedTimeZones() {
  const intl = Intl as typeof Intl & {
    supportedValuesOf?: (key: 'timeZone') => string[]
  }

  try {
    return intl.supportedValuesOf?.('timeZone') ?? fallbackTimeZones
  } catch {
    return fallbackTimeZones
  }
}

function isValidTimeZone(value: string) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format()
    return true
  } catch {
    return false
  }
}

function readPreference(
  key: string,
  storage: PreferenceStorage | undefined,
) {
  if (!storage) {
    return undefined
  }

  try {
    return storage.getItem(key) ?? undefined
  } catch {
    return undefined
  }
}

function writePreference(
  key: string,
  value: string,
  storage: PreferenceStorage | undefined,
) {
  if (!storage) {
    return
  }

  try {
    storage.setItem(key, value)
  } catch {
    // The preference remains active for the current session.
  }
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
