import { describe, expect, it } from 'vitest'
import { itemCatalog } from '../../warp-history/data/item-catalog'
import { parseManualWarpNote } from './manual-note-parser'
import {
  getManualImportPreviewCategories,
  getManualImportPreviewGroupCount,
  getManualImportPreviewRows,
  getManualImportPreviewTotalPulls,
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

  it('summarizes and filters rows by preview category', () => {
    const preview = parseManualWarpNote(
      `Warp Kolaborasi Karakter
2025-07-11 11:20:01
Pela
Data Bank
Event Warp Light Cone
2025-07-12 11:20:01
Dream's Montage
Warp Bintang-Bintang
2025-07-13 11:20:01
Arrows`,
      itemCatalog,
    )

    expect(getManualImportPreviewCategories(preview)).toEqual([
      expect.objectContaining({
        key: 'standard',
        bannerType: 'standard',
        groupCount: 1,
        totalPulls: 1,
      }),
      expect.objectContaining({
        key: 'light_cone_event',
        bannerType: 'light_cone_event',
        groupCount: 1,
        totalPulls: 1,
      }),
      expect.objectContaining({
        key: 'collaboration_character',
        bannerType: 'collaboration_character',
        groupCount: 1,
        totalPulls: 2,
      }),
    ])
    expect(
      getManualImportPreviewRows(preview, 10, {
        categoryKey: 'collaboration_character',
      }).map((row) => row.rawName),
    ).toEqual(['Pela', 'Data Bank'])
    expect(
      getManualImportRarityCounts(preview, {
        categoryKey: 'collaboration_character',
      }),
    ).toEqual({
      rarity3: 1,
      rarity4: 1,
      rarity5: 0,
    })
    expect(
      getManualImportPreviewTotalPulls(preview, {
        categoryKey: 'light_cone_event',
      }),
    ).toBe(1)
    expect(
      getManualImportPreviewGroupCount(preview, {
        categoryKey: 'standard',
      }),
    ).toBe(1)
  })

  it('uses fallback banner type for groups without a heading', () => {
    const preview = parseManualWarpNote(
      `2025-07-11 11:20:01
Pela`,
      itemCatalog,
    )

    expect(getManualImportPreviewCategories(preview, 'character_event')).toEqual([
      expect.objectContaining({
        key: 'character_event',
        bannerType: 'character_event',
        totalPulls: 1,
      }),
    ])
    expect(
      getManualImportPreviewRows(preview, 10, {
        categoryKey: 'character_event',
        fallbackBannerType: 'character_event',
      })[0],
    ).toEqual(
      expect.objectContaining({
        rawName: 'Pela',
        effectiveBannerType: 'character_event',
      }),
    )
  })

  it('annotates preview rows with pity values per category', () => {
    const preview = parseManualWarpNote(
      `Warp Kolaborasi Karakter
2025-07-11 11:20:01
Data Bank
Pela
Sparkle`,
      itemCatalog,
    )

    const rows = getManualImportPreviewRows(preview, 10)

    expect(rows[0]).toEqual(
      expect.objectContaining({
        rawName: 'Data Bank',
        pityFourAtPull: 1,
        pityFiveAtPull: 1,
      }),
    )
    expect(rows[1]).toEqual(
      expect.objectContaining({
        rawName: 'Pela',
        pityFourAtPull: 2,
        pityFiveAtPull: 2,
      }),
    )
    expect(rows[2]).toEqual(
      expect.objectContaining({
        rawName: 'Sparkle',
        pityFourAtPull: 1,
        pityFiveAtPull: 3,
      }),
    )
  })
})
