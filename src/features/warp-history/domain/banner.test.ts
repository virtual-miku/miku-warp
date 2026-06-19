import { describe, expect, it } from 'vitest'
import { getFiveStarHardPity } from './banner'

describe('getFiveStarHardPity', () => {
  it('uses 80 for Light Cone banners', () => {
    expect(getFiveStarHardPity('light_cone_event')).toBe(80)
    expect(getFiveStarHardPity('collaboration_light_cone')).toBe(80)
  })

  it('uses 90 for Standard and Character banners', () => {
    expect(getFiveStarHardPity('standard')).toBe(90)
    expect(getFiveStarHardPity('character_event')).toBe(90)
    expect(getFiveStarHardPity('collaboration_character')).toBe(90)
  })
})
