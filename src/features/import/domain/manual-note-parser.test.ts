import { describe, expect, it } from 'vitest'
import { itemCatalog } from '../../warp-history/data/item-catalog'
import { manualNoteSample } from '../data/manual-note-sample'
import {
  normalizeWarpItemName,
  parseManualWarpNote,
} from './manual-note-parser'

describe('parseManualWarpNote', () => {
  it('parses timestamp groups and matches known items', () => {
    const preview = parseManualWarpNote(manualNoteSample, itemCatalog)

    expect(preview.groups).toHaveLength(2)
    expect(preview.totalPulls).toBe(20)
    expect(preview.recognizedPulls).toBe(20)
    expect(preview.unresolvedNames).toEqual([])

    expect(preview.groups[0]).toMatchObject({
      lineNumber: 1,
      rawTimestamp: '2025-07-11 11:20:01',
      pulledAt: '2025-07-11T11:20:01',
    })

    expect(preview.groups[1]).toMatchObject({
      lineNumber: 12,
      rawTimestamp: '2025-07-11 11:20:25',
      pulledAt: '2025-07-11T11:20:25',
    })
  })

  it('normalizes curly apostrophes when matching catalog items', () => {
    const preview = parseManualWarpNote(manualNoteSample, itemCatalog)
    const dreamMontage = preview.groups[0].pulls[5]

    expect(dreamMontage).toMatchObject({
      lineNumber: 7,
      sequenceInGroup: 6,
      rawName: 'Dream’s Montage',
    })
    expect(dreamMontage.item).toMatchObject({
      name: "Dream's Montage",
      itemType: 'light_cone',
      rarity: 4,
    })
  })

  it('reports every unknown item but only lists unresolved names once', () => {
    const preview = parseManualWarpNote(
      `2025-07-11 11:20:01
Unknown Light Cone
Pela
Unknown Light Cone`,
      itemCatalog,
    )

    expect(preview.totalPulls).toBe(3)
    expect(preview.recognizedPulls).toBe(1)
    expect(preview.unresolvedNames).toEqual(['Unknown Light Cone'])
    expect(preview.issues.filter((issue) => issue.code === 'item_not_found')).toHaveLength(2)
  })

  it('keeps items before the first timestamp out of import groups', () => {
    const preview = parseManualWarpNote(
      `Pela
2025-07-11 11:20:01
Data Bank`,
      itemCatalog,
    )

    expect(preview.totalPulls).toBe(1)
    expect(preview.groups[0].pulls[0].rawName).toBe('Data Bank')
    expect(preview.issues).toEqual([
      expect.objectContaining({
        code: 'item_before_timestamp',
        lineNumber: 1,
        value: 'Pela',
      }),
    ])
  })

  it('reports empty input', () => {
    const preview = parseManualWarpNote('  \n  ', itemCatalog)

    expect(preview.totalPulls).toBe(0)
    expect(preview.issues).toEqual([
      expect.objectContaining({
        code: 'empty_input',
      }),
    ])
  })
})

describe('normalizeWarpItemName', () => {
  it('normalizes spacing, case, and quote variants', () => {
    expect(normalizeWarpItemName('  DREAM’S   MONTAGE  ')).toBe("dream's montage")
  })
})

