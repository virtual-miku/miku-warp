import { describe, expect, it } from 'vitest'
import {
  formatDateTime,
  formatDateTimeLocalInput,
} from './date-time'

describe('date-time formatting', () => {
  it('formats an instant in the selected timezone with colon separators', () => {
    expect(
      formatDateTime('2025-01-01T00:00:00Z', {
        language: 'en',
        timeZone: 'Asia/Jakarta',
      }),
    ).toContain('07:00:00')
  })

  it('creates datetime-local values in the selected timezone', () => {
    expect(
      formatDateTimeLocalInput(
        new Date('2025-01-01T00:00:00Z'),
        'Asia/Jakarta',
      ),
    ).toBe('2025-01-01T07:00:00')
  })

  it('normalizes UTC database timestamps when requested', () => {
    expect(
      formatDateTime(
        '2025-01-01 00:00:00',
        {
          language: 'en',
          timeZone: 'UTC',
        },
        { assumeUtc: true },
      ),
    ).toContain('00:00:00')
  })
})
