import { Cloud, KeyRound, RefreshCcw, Trash2 } from 'lucide-react'
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
  isDeleting: boolean
  latestBackup?: BackupSnapshotInfo
  notice?: BackupNotice
  deletingFileName?: string
  restoringFileName?: string
  snapshots: BackupSnapshotInfo[]
  onDeleteSnapshot: (fileName: string) => void
  onExportBackup: () => void
  onRestoreBackup: () => void
  onRestoreSnapshot: (fileName: string) => void
}

export function BackupPanel({
  backupCount,
  isExporting,
  isDeleting,
  isRestoring,
  latestBackup,
  notice,
  deletingFileName,
  restoringFileName,
  snapshots,
  onDeleteSnapshot,
  onExportBackup,
  onRestoreBackup,
  onRestoreSnapshot,
}: BackupPanelProps) {
  const isBusy = isExporting || isRestoring || isDeleting
  const visibleSnapshots = snapshots.slice(0, 3)

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
        {visibleSnapshots.length > 0 ? (
          <div className="backup-snapshot-list" aria-label="Recent backups">
            {visibleSnapshots.map((snapshot) => (
              <div className="backup-snapshot-row" key={snapshot.fileName}>
                <div>
                  <strong>{formatSnapshotTime(snapshot.exportedAt)}</strong>
                  <span title={snapshot.fileName}>
                    {snapshot.warpPulls} pulls
                  </span>
                </div>
                <div className="backup-snapshot-actions">
                  <AppButton
                    disabled={isBusy}
                    icon={RefreshCcw}
                    onClick={() => onRestoreSnapshot(snapshot.fileName)}
                    variant="ghost"
                  >
                    {restoringFileName === snapshot.fileName
                      ? 'Restoring'
                      : 'Restore'}
                  </AppButton>
                  <AppButton
                    disabled={isBusy}
                    icon={Trash2}
                    onClick={() => onDeleteSnapshot(snapshot.fileName)}
                    variant="ghost"
                  >
                    {deletingFileName === snapshot.fileName
                      ? 'Deleting'
                      : 'Delete'}
                  </AppButton>
                </div>
              </div>
            ))}
          </div>
        ) : null}
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
