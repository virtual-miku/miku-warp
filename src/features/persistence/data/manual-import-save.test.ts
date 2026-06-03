import { describe, expect, it } from 'vitest'
import { itemCatalog } from '../../warp-history/data/item-catalog'
import { parseManualWarpNote } from '../../import/domain/manual-note-parser'
import { buildManualImportDraft } from '../../import/domain/manual-import-draft'
import { toSaveManualImportDraftPayload } from './manual-import-save'

describe('toSaveManualImportDraftPayload', () => {
  it('maps a ready manual import draft to the Tauri save payload', () => {
    const preview = parseManualWarpNote(
      `Warp Kolaborasi Karakter
2025-07-11 11:20:01
1. Pela`,
      itemCatalog,
    )
    const draft = buildManualImportDraft(preview, {
      accountId: 'account-1',
      timezone: 'Asia/Jakarta',
    })

    expect(
      toSaveManualImportDraftPayload(
        {
          id: 'account-1',
          uid: '800000001',
          region: 'asia',
          nickname: 'Saki',
        },
        draft,
      ),
    ).toEqual({
      account: {
        id: 'account-1',
        uid: '800000001',
        region: 'asia',
        nickname: 'Saki',
      },
      status: 'ready',
      recordsFound: 1,
      recordsReady: 1,
      recordsSkipped: 0,
      issuesCount: 0,
      pulls: [
        {
          bannerType: 'collaboration_character',
          warpItemId: 'character-1106',
          pulledAt: '2025-07-11T11:20:01',
          pulledAtTimezone: 'Asia/Jakarta',
          sourceLineNumber: 3,
          sequenceInTimestampGroup: 1,
          rawItemName: 'Pela',
        },
      ],
    })
  })
})
