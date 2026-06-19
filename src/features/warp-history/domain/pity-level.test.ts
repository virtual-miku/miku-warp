import { describe, expect, it } from 'vitest'
import { getPityLevel } from './pity-level'

describe('getPityLevel', () => {
  it('uses the same proportional thresholds for different hard pity limits', () => {
    expect(getPityLevel(45, 90)).toBe('low')
    expect(getPityLevel(46, 90)).toBe('medium')
    expect(getPityLevel(68, 90)).toBe('high')

    expect(getPityLevel(40, 80)).toBe('low')
    expect(getPityLevel(41, 80)).toBe('medium')
    expect(getPityLevel(61, 80)).toBe('high')
  })

  it('supports the ten-pull four-star pity cycle', () => {
    expect(getPityLevel(5, 10)).toBe('low')
    expect(getPityLevel(6, 10)).toBe('medium')
    expect(getPityLevel(8, 10)).toBe('high')
  })
})
