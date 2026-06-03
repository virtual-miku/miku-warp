import { FileInput, History, RotateCcw } from 'lucide-react'
import { AppButton } from '../../../shared/ui/AppButton'
import { itemCatalog } from '../../warp-history/data/item-catalog'
import { manualNoteSample } from '../data/manual-note-sample'
import { parseManualWarpNote } from '../domain/manual-note-parser'

const samplePreview = parseManualWarpNote(manualNoteSample, itemCatalog)

export function ImportPanel() {
  return (
    <section className="tool-panel" id="import" aria-label="Import sources">
      <header className="panel-header">
        <h2>Import</h2>
        <span className="status-pill">{samplePreview.totalPulls} detected</span>
      </header>
      <div className="tool-panel-body">
        <div className="tool-row">
          <div>
            <strong>Manual note</strong>
            <span>{samplePreview.groups.length} sessions parsed</span>
          </div>
          <AppButton icon={FileInput}>Open</AppButton>
        </div>
        <div className="tool-row">
          <div>
            <strong>Catalog match</strong>
            <span>{samplePreview.recognizedPulls} items recognized</span>
          </div>
          <span className="status-pill">
            {samplePreview.unresolvedNames.length === 0 ? 'Clean' : 'Needs review'}
          </span>
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
