import { describe, expect, it } from 'vitest'
import { itemCatalog } from '../../warp-history/data/item-catalog'
import { parseManualWarpNote } from './manual-note-parser'
import {
  getManualImportPreviewRows,
  getManualImportRarityCounts,
  getManualImportStatus,
  getManualImportStatusLabel,
} from './manual-import-preview'

describe('manual import preview helpers', () => {
  it('returns ready status when all rows match catalog items', () => {
    const preview = parseManualWarpNote(
      `2025-07-11 11:20:01
Pela
Data Bank`,
      itemCatalog,
    )

    expect(getManualImportStatus(preview)).toBe('ready')
    expect(getManualImportStatusLabel('ready')).toBe('Ready')
  })

  it('returns needs_review when preview has issues', () => {
    const preview = parseManualWarpNote(
      `2025-07-11 11:20:01
Unknown Item`,
      itemCatalog,
    )

    expect(getManualImportStatus(preview)).toBe('needs_review')
    expect(getManualImportStatusLabel('needs_review')).toBe('Needs review')
  })

  it('counts recognized pulls by rarity', () => {
    const preview = parseManualWarpNote(
      `2025-07-11 11:20:01
Pela
Data Bank
Sparkle`,
      itemCatalog,
    )

    expect(getManualImportRarityCounts(preview)).toEqual({
      rarity3: 1,
      rarity4: 1,
      rarity5: 1,
    })
  })

  it('flattens rows with timestamp context and limit', () => {
    const preview = parseManualWarpNote(
      `2025-07-11 11:20:01
Pela
Data Bank
Sparkle`,
      itemCatalog,
    )

    expect(getManualImportPreviewRows(preview, 2)).toEqual([
      expect.objectContaining({
        rawName: 'Pela',
        groupTimestamp: '2025-07-11 11:20:01',
      }),
      expect.objectContaining({
        rawName: 'Data Bank',
        groupTimestamp: '2025-07-11 11:20:01',
      }),
    ])
  })
})

