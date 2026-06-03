import { describe, expect, it } from 'vitest'
import { itemCatalog } from '../../warp-history/data/item-catalog'
import { parseManualWarpNote } from './manual-note-parser'
import {
  buildManualImportDraft,
  createManualPullIdentityKey,
} from './manual-import-draft'

describe('buildManualImportDraft', () => {
  it('builds persistable pulls from section-aware manual notes', () => {
    const preview = parseManualWarpNote(
      `Warp Kolaborasi Karakter
2025-07-11 11:20:01
1. Pela
2. Darting Arrow`,
      itemCatalog,
    )

    const draft = buildManualImportDraft(preview, {
      accountId: 'account-1',
      timezone: 'Asia/Jakarta',
    })

    expect(draft).toMatchObject({
      accountId: 'account-1',
      source: 'manual',
      timezone: 'Asia/Jakarta',
      status: 'ready',
      recordsFound: 2,
      recordsReady: 2,
      recordsSkipped: 0,
      bannerTypes: ['collaboration_character'],
      issues: [],
    })
    expect(draft.pulls).toEqual([
      expect.objectContaining({
        accountId: 'account-1',
        bannerType: 'collaboration_character',
        itemName: 'Pela',
        pulledAt: '2025-07-11T11:20:01',
        pulledAtTimezone: 'Asia/Jakarta',
        source: 'manual',
        sourceLineNumber: 3,
        sequenceInTimestampGroup: 1,
        rawItemName: 'Pela',
      }),
      expect.objectContaining({
        bannerType: 'collaboration_character',
        itemName: 'Darting Arrow',
        sourceLineNumber: 4,
        sequenceInTimestampGroup: 2,
        rawItemName: 'Darting Arrow',
      }),
    ])
  })

  it('uses fallback banner type when the note has no section heading', () => {
    const preview = parseManualWarpNote(
      `2025-07-11 11:20:01
Pela`,
      itemCatalog,
    )

    const draft = buildManualImportDraft(preview, {
      accountId: 'account-1',
      fallbackBannerType: 'standard',
    })

    expect(draft.status).toBe('ready')
    expect(draft.bannerTypes).toEqual(['standard'])
    expect(draft.pulls[0]).toEqual(
      expect.objectContaining({
        bannerType: 'standard',
        itemName: 'Pela',
      }),
    )
  })

  it('requires a banner type before producing persistable pulls', () => {
    const preview = parseManualWarpNote(
      `2025-07-11 11:20:01
Pela`,
      itemCatalog,
    )

    const draft = buildManualImportDraft(preview, {
      accountId: 'account-1',
    })

    expect(draft).toMatchObject({
      status: 'needs_review',
      recordsFound: 1,
      recordsReady: 0,
      recordsSkipped: 1,
      pulls: [],
    })
    expect(draft.issues).toEqual([
      expect.objectContaining({
        code: 'missing_banner_type',
        lineNumber: 1,
        value: '2025-07-11 11:20:01',
      }),
    ])
  })

  it('keeps timestamp-group sequence stable even when note numbering is global', () => {
    const preview = parseManualWarpNote(
      `Warp Kolaborasi Karakter
2025-07-11 11:20:01
1. Pela
2025-07-11 11:20:25
11. Mediation
12. A Secret Vow`,
      itemCatalog,
    )

    const draft = buildManualImportDraft(preview, {
      accountId: 'account-1',
    })

    expect(draft.pulls.map((pull) => pull.sequenceInTimestampGroup)).toEqual([1, 1, 2])
    expect(draft.pulls[1].manualIdentityKey).toBe(
      createManualPullIdentityKey({
        accountId: 'account-1',
        bannerType: 'collaboration_character',
        pulledAt: '2025-07-11T11:20:25',
        warpItemId: draft.pulls[1].warpItemId,
        sequenceInTimestampGroup: 1,
      }),
    )
  })

  it('marks draft as needs review when parser reported unresolved items', () => {
    const preview = parseManualWarpNote(
      `Warp Bintang-Bintang
2025-07-11 11:20:01
Pela
Unknown Item`,
      itemCatalog,
    )

    const draft = buildManualImportDraft(preview, {
      accountId: 'account-1',
    })

    expect(draft.status).toBe('needs_review')
    expect(draft.recordsFound).toBe(2)
    expect(draft.recordsReady).toBe(1)
    expect(draft.recordsSkipped).toBe(1)
    expect(draft.issues).toEqual([
      expect.objectContaining({
        code: 'parse_issue',
        value: 'Unknown Item',
      }),
    ])
  })
})
