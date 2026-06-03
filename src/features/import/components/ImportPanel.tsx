import { FileInput, History, RotateCcw } from 'lucide-react'
import { AppButton } from '../../../shared/ui/AppButton'
import type { ManualImportPreview } from '../domain/manual-note-parser'
import {
  getManualImportStatus,
  getManualImportStatusLabel,
} from '../domain/manual-import-preview'

type ImportPanelProps = {
  manualImportPreview: ManualImportPreview
  onOpenManualImport: () => void
}

export function ImportPanel({
  manualImportPreview,
  onOpenManualImport,
}: ImportPanelProps) {
  const status = getManualImportStatus(manualImportPreview)

  return (
    <section className="tool-panel" id="import" aria-label="Import sources">
      <header className="panel-header">
        <h2>Import</h2>
        <span className="status-pill">{manualImportPreview.totalPulls} detected</span>
      </header>
      <div className="tool-panel-body">
        <div className="tool-row">
          <div>
            <strong>Manual note</strong>
            <span>{manualImportPreview.groups.length} sessions parsed</span>
          </div>
          <AppButton icon={FileInput} onClick={onOpenManualImport}>
            Open
          </AppButton>
        </div>
        <div className="tool-row">
          <div>
            <strong>Catalog match</strong>
            <span>{manualImportPreview.recognizedPulls} items recognized</span>
          </div>
          <span className="status-pill">{getManualImportStatusLabel(status)}</span>
        </div>
        <div className="tool-row">
          <div>
            <strong>Game history</strong>
            <span>Local cache</span>
          </div>
          <AppButton icon={History} variant="ghost">
            Scan
          </AppButton>
        </div>
        <div className="tool-row">
          <div>
            <strong>Restore</strong>
            <span>Backup file</span>
          </div>
          <AppButton icon={RotateCcw} variant="ghost">
            Load
          </AppButton>
        </div>
      </div>
    </section>
  )
}
