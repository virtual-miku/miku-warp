import { Cloud, RefreshCcw, FileJson, Trash2 } from 'lucide-react'
import { AppButton } from '../../../shared/ui/AppButton'
import type { CloudBackupPolicy, CloudBackupStatus } from '../domain/cloud-backup'

export type BackupNotice = {
  tone: 'success' | 'error'
  title: string
  detail: string
}

export type BackupSnapshotInfo = {
  exportedAt: string
  fileName: string
  isAutoSave: boolean
  sizeBytes: number
  uids: string[]
  warpPulls: number
}

export type CloudBackupSnapshotInfo = {
  remoteFileId: string
  fileName: string
  remoteMd5Checksum?: string
  remoteModifiedTime?: string
  size?: string
}

type BackupPanelProps = {
  cloudBackupPolicy: CloudBackupPolicy
  cloudSnapshots: CloudBackupSnapshotInfo[]
  cloudBackupStatus: CloudBackupStatus
  isCloudCancelling: boolean
  isCloudConnecting: boolean
  isCloudDisconnecting: boolean
  isCloudPolicyUpdating: boolean
  isCloudRestoring: boolean
  isCloudUploading: boolean
  isExporting: boolean
  isImporting: boolean
  isRestoring: boolean
  isDeleting: boolean
  notice?: BackupNotice
  deletingFileName?: string
  restoringCloudFileId?: string
  restoringFileName?: string
  snapshots: BackupSnapshotInfo[]
  onDeleteSnapshot: (fileName: string) => void
  onCancelGoogleDrive: () => void
  onConnectGoogleDrive: () => void
  onDisconnectGoogleDrive: () => void
  onAutoBackupPolicyChange: (enabled: boolean) => void
  onRestoreGoogleDriveBackup: (snapshot: CloudBackupSnapshotInfo) => void
  onUploadGoogleDriveBackup: () => void
  onExportBackup: () => void
  onImportBackupJson: () => void
  onRestoreSnapshot: (fileName: string) => void
}

export function BackupPanel({
  isExporting,
  isImporting,
  isDeleting,
  isRestoring,
  notice,
  deletingFileName,
  restoringFileName,
  snapshots,
  onDeleteSnapshot,
  onExportBackup,
  onImportBackupJson,
  onRestoreSnapshot,
}: BackupPanelProps) {
  const isBusy = isExporting || isImporting || isRestoring || isDeleting
  const visibleSnapshots = snapshots
    .filter((snapshot) => !snapshot.isAutoSave)
    .slice(0, 3)
  const visibleNotice = notice && !isGoogleDriveNotice(notice) ? notice : undefined

  return (
    <section
      className="tool-panel"
      id="backup"
      aria-label="Backup"
    >
      <div className="tool-panel-body">
        <div className="backup-section">
          <div className="tool-row">
            <div>
              <strong>Local backup</strong>
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
                icon={FileJson}
                onClick={onImportBackupJson}
                variant="ghost"
              >
                {isImporting ? 'Importing' : 'Import JSON'}
              </AppButton>
            </div>
          </div>
          {visibleSnapshots.length > 0 ? (
            <div className="backup-snapshot-list" aria-label="Recent backups">
              {visibleSnapshots.map((snapshot) => (
                <div className="backup-snapshot-row" key={snapshot.fileName}>
                  <div>
                    <strong>
                      Backup {formatSnapshotTime(snapshot.exportedAt)}
                    </strong>
                    <span title={snapshot.fileName}>
                      {formatBackupSizeKilobytes(snapshot.sizeBytes)}
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
                    {!snapshot.isAutoSave ? (
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
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
        {visibleNotice ? (
          <div
            className={`backup-message backup-message-${visibleNotice.tone}`}
            role={visibleNotice.tone === 'error' ? 'alert' : 'status'}
          >
            <strong>{visibleNotice.title}</strong>
            <p>{visibleNotice.detail}</p>
          </div>
        ) : null}
      </div>
    </section>
  )
}

function isGoogleDriveNotice(notice: BackupNotice) {
  const searchableText = `${notice.title} ${notice.detail}`.toLowerCase()

  return (
    searchableText.includes('google drive') ||
    searchableText.includes('drive autosave') ||
    searchableText.includes('cloud backup') ||
    searchableText.includes('cloud autosave')
  )
}

function formatSnapshotTime(value: string) {
  const date = new Date(value)
  const dateLabel = new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date)
  const timeLabel = [date.getHours(), date.getMinutes(), date.getSeconds()]
    .map((part) => part.toString().padStart(2, '0'))
    .join(':')

  return `${dateLabel}, ${timeLabel}`
}

function formatBackupSizeKilobytes(size: number | string | undefined) {
  const parsedSize =
    typeof size === 'number' ? size : Number.parseInt(size ?? '', 10)

  if (!Number.isFinite(parsedSize) || parsedSize < 0) {
    return 'Size unavailable'
  }

  const kilobytes = Math.max(1, Math.round(parsedSize / 1024))

  return `${new Intl.NumberFormat('id-ID').format(kilobytes)} KB`
}
