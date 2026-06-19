import { describe, expect, it } from 'vitest'
import { getNextRateUpChance, getRateUpWinRateTone } from './rate-up'

describe('getNextRateUpChance', () => {
  it('returns the character event base chance after a limited 5-star', () => {
    expect(getNextRateUpChance('character_event', 'Acheron').chance).toBe(50)
  })

  it('returns the Light Cone event base chance after a limited 5-star', () => {
    expect(
      getNextRateUpChance('light_cone_event', 'Along the Passing Shore').chance,
    ).toBe(75)
  })

  it('returns guaranteed after a known standard-pool loss', () => {
    expect(getNextRateUpChance('character_event', 'Yanqing', true)).toMatchObject({
      chance: 100,
      itemName: 'Yanqing',
    })
    expect(
      getNextRateUpChance('light_cone_event', "But the Battle Isn't Over", true),
    ).toMatchObject({
      chance: 100,
      itemName: "But the Battle Isn't Over",
    })
  })

  it('does not claim a rate-up chance for Standard', () => {
    expect(getNextRateUpChance('standard', 'Himeko')).toEqual({ detail: '' })
  })

  it('does not guess after an ambiguous Celestial Invitation result', () => {
    expect(getNextRateUpChance('character_event', 'Blade', null)).toEqual({
      detail: 'Uncertain after',
      itemName: 'Blade',
    })
  })

  it('maps win-rate thirds to clear performance tones', () => {
    expect(getRateUpWinRateTone(33)).toBe('poor')
    expect(getRateUpWinRateTone(34)).toBe('average')
    expect(getRateUpWinRateTone(66)).toBe('average')
    expect(getRateUpWinRateTone(67)).toBe('good')
  })
})
