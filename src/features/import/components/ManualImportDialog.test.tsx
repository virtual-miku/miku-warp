import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { ManualImportPreview } from '../domain/manual-note-parser'
import { ManualImportDialog } from './ManualImportDialog'

const emptyPreview: ManualImportPreview = {
  groups: [],
  issues: [],
  recognizedPulls: 0,
  sections: [],
  totalLines: 0,
  totalPulls: 0,
  unresolvedNames: [],
}

describe('ManualImportDialog', () => {
  it('offers text and item-selector import methods', () => {
    const noop = vi.fn()
    const html = renderToStaticMarkup(
      <ManualImportDialog
        accounts={[
          {
            id: 'account-1',
            totalPulls: 0,
            uid: '800000000',
          },
        ]}
        fallbackBannerType="character_event"
        isOpen
        isSaving={false}
        note=""
        onClose={noop}
        onNoteChange={noop}
        onSave={noop}
        onSaveNoticeClose={noop}
        onTargetAccountChange={noop}
        preview={emptyPreview}
        targetAccountId="account-1"
      />,
    )

    expect(html).toContain('Manual import method')
    expect(html).toContain('>Text<')
    expect(html).toContain('>Item selector<')
  })
})
