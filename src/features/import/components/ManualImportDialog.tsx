import { Clipboard, Eraser, X } from 'lucide-react'
import { itemCatalogMetadata } from '../../warp-history/data/item-catalog'
import type { ManualImportPreview } from '../domain/manual-note-parser'
import {
  getManualImportPreviewRows,
  getManualImportRarityCounts,
  getManualImportStatus,
  getManualImportStatusLabel,
} from '../domain/manual-import-preview'
import { manualNoteSample } from '../data/manual-note-sample'
import { AppButton } from '../../../shared/ui/AppButton'

type ManualImportDialogProps = {
  isOpen: boolean
  note: string
  onClose: () => void
  onNoteChange: (value: string) => void
  preview: ManualImportPreview
}

export function ManualImportDialog({
  isOpen,
  note,
  onClose,
  onNoteChange,
  preview,
}: ManualImportDialogProps) {
  if (!isOpen) {
    return null
  }

  const status = getManualImportStatus(preview)
  const statusLabel = getManualImportStatusLabel(status)
  const rarityCounts = getManualImportRarityCounts(preview)
  const previewRows = getManualImportPreviewRows(preview, 14)
  const hasMoreRows = preview.totalPulls > previewRows.length

  return (
    <div className="modal-backdrop">
      <section
        className="modal-panel manual-import-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="manual-import-title"
      >
        <header className="modal-header">
          <div>
            <span className="eyebrow">Manual import</span>
            <h2 id="manual-import-title">Warp note</h2>
          </div>
          <button className="icon-button" type="button" aria-label="Close" onClick={onClose}>
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <div className="manual-import-grid">
          <section className="manual-import-editor" aria-label="Manual note input">
            <label className="field-label" htmlFor="manual-note-input">
              Note
            </label>
            <textarea
              className="manual-note-input"
              id="manual-note-input"
              spellCheck={false}
              value={note}
              onChange={(event) => onNoteChange(event.target.value)}
            />
            <div className="manual-import-actions">
              <AppButton icon={Clipboard} onClick={() => onNoteChange(manualNoteSample)}>
                Sample
              </AppButton>
              <AppButton icon={Eraser} variant="ghost" onClick={() => onNoteChange('')}>
                Clear
              </AppButton>
            </div>
          </section>

          <section className="manual-import-preview" aria-label="Manual import preview">
            <div className="manual-summary-grid">
              <article className="manual-summary-card">
                <span>Status</span>
                <strong>{statusLabel}</strong>
              </article>
              <article className="manual-summary-card">
                <span>Pulls</span>
                <strong>{preview.totalPulls}</strong>
              </article>
              <article className="manual-summary-card">
                <span>Groups</span>
                <strong>{preview.groups.length}</strong>
              </article>
              <article className="manual-summary-card">
                <span>Matched</span>
                <strong>{preview.recognizedPulls}</strong>
              </article>
            </div>

            <div className="manual-rarity-strip" aria-label="Rarity counts">
              <span className="rarity-chip rarity-chip-5">5-star {rarityCounts.rarity5}</span>
              <span className="rarity-chip rarity-chip-4">4-star {rarityCounts.rarity4}</span>
              <span className="rarity-chip rarity-chip-3">3-star {rarityCounts.rarity3}</span>
            </div>

            {preview.issues.length > 0 ? (
              <div className="manual-issue-list" aria-label="Manual import issues">
                {preview.issues.slice(0, 4).map((issue) => (
                  <div className="manual-issue-row" key={`${issue.lineNumber}-${issue.value}`}>
                    <span>Line {issue.lineNumber}</span>
                    <strong>{issue.value || issue.message}</strong>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="manual-preview-table" aria-label="Recognized pull rows">
              {previewRows.length > 0 ? (
                previewRows.map((pull) => (
                  <div className="manual-preview-row" key={`${pull.lineNumber}-${pull.rawName}`}>
                    <span className={`warp-rarity warp-rarity-${pull.item?.rarity ?? 3}`}>
                      {pull.item?.rarity ?? '?'}
                    </span>
                    <div>
                      <strong>{pull.item?.name ?? pull.rawName}</strong>
                      <span>{pull.groupTimestamp}</span>
                    </div>
                    <span>{formatItemType(pull.item?.itemType)}</span>
                  </div>
                ))
              ) : (
                <div className="manual-preview-empty">No rows</div>
              )}
            </div>

            <footer className="manual-import-footer">
              <span>{itemCatalogMetadata.source.version ?? 'Catalog'} catalog</span>
              {hasMoreRows ? <span>{preview.totalPulls - previewRows.length} more</span> : null}
            </footer>
          </section>
        </div>
      </section>
    </div>
  )
}

function formatItemType(itemType?: 'character' | 'light_cone') {
  if (itemType === 'light_cone') {
    return 'Light Cone'
  }

  if (itemType === 'character') {
    return 'Character'
  }

  return 'Unknown'
}
