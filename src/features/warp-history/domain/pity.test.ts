import { describe, expect, it } from 'vitest'
import { annotatePityAtPull } from './pity'
import type { WarpPull } from './warp-pull'

describe('annotatePityAtPull', () => {
  it('fills pity values for four-star and five-star pulls', () => {
    const pulls: WarpPull[] = [
      pull('pull-1', 'Data Bank', 3),
      pull('pull-2', 'Pela', 4),
      pull('pull-3', 'Meshing Cogs', 3),
      pull('pull-4', 'Sparkle', 5),
    ]

    const annotatedPulls = annotatePityAtPull(pulls)

    expect(annotatedPulls[0].pityFourAtPull).toBeUndefined()
    expect(annotatedPulls[0].pityFiveAtPull).toBeUndefined()
    expect(annotatedPulls[1].pityFourAtPull).toBe(2)
    expect(annotatedPulls[1].pityFiveAtPull).toBeUndefined()
    expect(annotatedPulls[2].pityFourAtPull).toBeUndefined()
    expect(annotatedPulls[2].pityFiveAtPull).toBeUndefined()
    expect(annotatedPulls[3].pityFourAtPull).toBe(2)
    expect(annotatedPulls[3].pityFiveAtPull).toBe(4)
  })

  it('keeps persisted pity values when they already exist', () => {
    const pulls: WarpPull[] = [
      pull('pull-1', 'Data Bank', 3),
      { ...pull('pull-2', 'Pela', 4), pityFourAtPull: 7 },
    ]

    const annotatedPulls = annotatePityAtPull(pulls)

    expect(annotatedPulls[1].pityFourAtPull).toBe(7)
  })
})

function pull(id: string, itemName: string, rarity: WarpPull['rarity']): WarpPull {
  return {
    id,
    bannerType: 'character_event',
    itemName,
    itemType: rarity === 3 ? 'light_cone' : 'character',
    rarity,
    pulledAt: '2025-07-11T11:20:01+07:00',
    source: 'manual',
  }
}
