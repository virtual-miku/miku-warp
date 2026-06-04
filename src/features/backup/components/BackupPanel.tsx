import { Cloud, KeyRound, RefreshCcw } from 'lucide-react'
import { AppButton } from '../../../shared/ui/AppButton'

export type BackupNotice = {
  tone: 'success' | 'error'
  title: string
  detail: string
}

export type BackupSnapshotInfo = {
  exportedAt: string
  fileName: string
  warpPulls: number
}

type BackupPanelProps = {
  backupCount: number
  isExporting: boolean
  isRestoring: boolean
  latestBackup?: BackupSnapshotInfo
  notice?: BackupNotice
  onExportBackup: () => void
  onRestoreBackup: () => void
}

export function BackupPanel({
  backupCount,
  isExporting,
  isRestoring,
  latestBackup,
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
        <span className="status-pill">{formatSnapshotCount(backupCount)}</span>
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
            <span title={latestBackup?.fileName}>
              {latestBackup
                ? `${latestBackup.warpPulls} pulls - ${formatSnapshotTime(latestBackup.exportedAt)}`
                : 'No local snapshot yet'}
            </span>
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
              disabled={isBusy || !latestBackup}
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

function formatSnapshotCount(count: number) {
  if (count === 0) {
    return 'No snapshots'
  }

  if (count === 1) {
    return '1 snapshot'
  }

  return `${count} snapshots`
}

function formatSnapshotTime(value: string) {
  return value.replace('T', ' ').replace('Z', ' UTC')
}
