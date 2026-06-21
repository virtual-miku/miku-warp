import {
  getLocale,
  resolveTimeZone,
  type AppLanguage,
  type TimeZonePreference,
} from '../../features/settings/domain/localization'

export type DateTimePreferences = {
  language: AppLanguage
  timeZone: TimeZonePreference
}

export function formatDateTime(
  value: string | number | Date,
  preferences: DateTimePreferences,
  options: { assumeUtc?: boolean } = {},
) {
  const date = toDate(value, options.assumeUtc)

  if (!date) {
    return undefined
  }

  const locale = getLocale(preferences.language)
  const timeZone =
    preferences.timeZone === 'system' ? undefined : preferences.timeZone
  const dateLabel = new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone,
  }).format(date)
  const timeParts = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    hourCycle: 'h23',
    minute: '2-digit',
    second: '2-digit',
    timeZone,
  }).formatToParts(date)
  const timeValues = new Map(
    timeParts.map((part) => [part.type, part.value]),
  )
  const timeLabel = ['hour', 'minute', 'second']
    .map((part) => timeValues.get(part))
    .join(':')

  return `${dateLabel}, ${timeLabel}`
}

export function formatNumber(
  value: number,
  language: AppLanguage,
) {
  return new Intl.NumberFormat(getLocale(language)).format(value)
}

export function formatDateTimeLocalInput(
  date: Date,
  timeZone: TimeZonePreference,
) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
    minute: '2-digit',
    month: '2-digit',
    second: '2-digit',
    timeZone: resolveTimeZone(timeZone),
    year: 'numeric',
  }).formatToParts(date)
  const values = new Map(parts.map((part) => [part.type, part.value]))

  return `${values.get('year')}-${values.get('month')}-${values.get('day')}T${values.get('hour')}:${values.get('minute')}:${values.get('second')}`
}

function toDate(
  value: string | number | Date,
  assumeUtc = false,
) {
  const normalizedValue =
    typeof value === 'string' &&
    assumeUtc &&
    !value.endsWith('Z') &&
    !/[+-]\d{2}:?\d{2}$/.test(value)
      ? `${value}Z`
      : value
  const date = value instanceof Date ? value : new Date(normalizedValue)

  return Number.isNaN(date.getTime()) ? undefined : date
}
