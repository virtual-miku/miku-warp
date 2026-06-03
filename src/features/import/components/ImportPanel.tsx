import { FileInput, History, RotateCcw } from 'lucide-react'
import { AppButton } from '../../../shared/ui/AppButton'

export function ImportPanel() {
  return (
    <section className="tool-panel" id="import" aria-label="Import sources">
      <header className="panel-header">
        <h2>Import</h2>
        <span className="status-pill">Manual ready</span>
      </header>
      <div className="tool-panel-body">
        <div className="tool-row">
          <div>
            <strong>Manual note</strong>
            <span>Text parser</span>
          </div>
          <AppButton icon={FileInput}>Open</AppButton>
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

