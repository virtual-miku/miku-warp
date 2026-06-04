import { Cloud, KeyRound, RefreshCcw } from 'lucide-react'
import { AppButton } from '../../../shared/ui/AppButton'

export type BackupNotice = {
  tone: 'success' | 'error'
  title: string
  detail: string
}

type BackupPanelProps = {
  isExporting: boolean
  isRestoring: boolean
  notice?: BackupNotice
  onExportBackup: () => void
  onRestoreBackup: () => void
}

export function BackupPanel({
  isExporting,
  isRestoring,
  notice,
  onExportBackup,
  onRestoreBackup,
}: BackupPanelProps) {
  const isBusy = isExporting || isRestoring

  return (
    <section
      className="tool-panel"
      id="backup"
      aria-label="Google Drive backup"
    >
      <header className="panel-header">
        <h2>Backup</h2>
        <span className="status-pill">Local snapshot</span>
      </header>
      <div className="tool-panel-body">
        <div className="tool-row">
          <div>
            <strong>Google Drive</strong>
            <span>Next step after local export</span>
          </div>
          <AppButton disabled icon={KeyRound}>
            Connect
          </AppButton>
        </div>
        <div className="tool-row">
          <div>
            <strong>Local backup</strong>
            <span>Snapshot JSON from this device</span>
          </div>
          <div className="backup-action-group">
            <AppButton
              disabled={isBusy}
              icon={Cloud}
              onClick={onExportBackup}
              variant="ghost"
            >
              {isExporting ? 'Exporting' : 'Export'}
            </AppButton>
            <AppButton
              disabled={isBusy}
              icon={RefreshCcw}
              onClick={onRestoreBackup}
              variant="ghost"
            >
              {isRestoring ? 'Restoring' : 'Restore latest'}
            </AppButton>
          </div>
        </div>
        {notice ? (
          <div
            className={`backup-message backup-message-${notice.tone}`}
            role={notice.tone === 'error' ? 'alert' : 'status'}
          >
            <strong>{notice.title}</strong>
            <p>{notice.detail}</p>
          </div>
        ) : null}
      </div>
    </section>
  )
}
