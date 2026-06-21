import { describe, expect, it } from 'vitest'
import type { WarpItem } from '../../warp-history/domain/warp-item'
import {
  buildManualItemSelectorPreview,
  formatLocalDateTimeInput,
  type ManualItemSelection,
} from './manual-item-selector'

const sparkle: WarpItem = {
  id: 'character-1306',
  itemType: 'character',
  name: 'Sparkle',
  rarity: 5,
}

describe('buildManualItemSelectorPreview', () => {
  it('creates ready manual groups while preserving pity overrides', () => {
    const selections: ManualItemSelection[] = [
      {
        bannerType: 'character_event',
        id: 'selection-1',
        item: sparkle,
        pity: 77,
        pulledAt: '2025-07-11T11:23:51',
      },
    ]

    const preview = buildManualItemSelectorPreview(selections)

    expect(preview.totalPulls).toBe(1)
    expect(preview.issues).toEqual([])
    expect(preview.groups[0]).toMatchObject({
      bannerType: 'character_event',
      pulledAt: '2025-07-11T11:23:51',
      rawTimestamp: '2025-07-11 11:23:51',
    })
    expect(preview.groups[0].pulls[0]).toMatchObject({
      item: sparkle,
      pityOverride: 77,
      sequenceInGroup: 1,
    })
  })

  it('keeps duplicate items at the same timestamp distinguishable', () => {
    const selection = {
      bannerType: 'character_event',
      item: sparkle,
      pity: 1,
      pulledAt: '2025-07-11T11:23:51',
    } satisfies Omit<ManualItemSelection, 'id'>

    const preview = buildManualItemSelectorPreview([
      { ...selection, id: 'selection-1' },
      { ...selection, id: 'selection-2' },
    ])

    expect(preview.groups).toHaveLength(1)
    expect(
      preview.groups[0].pulls.map((pull) => pull.sequenceInGroup),
    ).toEqual([1, 2])
  })
})

describe('formatLocalDateTimeInput', () => {
  it('uses a datetime-local value with seconds', () => {
    expect(formatLocalDateTimeInput(new Date(2025, 6, 11, 9, 5, 3))).toBe(
      '2025-07-11T09:05:03',
    )
  })
})
