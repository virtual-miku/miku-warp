import { describe, expect, it } from 'vitest'
import { getNextRateUpChance } from './rate-up'

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
    expect(getNextRateUpChance('character_event', 'Yanqing').chance).toBe(100)
    expect(
      getNextRateUpChance('light_cone_event', "But the Battle Isn't Over")
        .chance,
    ).toBe(100)
  })

  it('does not claim a rate-up chance for Standard', () => {
    expect(getNextRateUpChance('standard', 'Himeko').chance).toBeUndefined()
  })
})
