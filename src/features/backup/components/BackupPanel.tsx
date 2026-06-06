import {
  Cloud,
  KeyRound,
  LogOut,
  RefreshCcw,
  Trash2,
  Upload,
} from 'lucide-react'
import { AppButton } from '../../../shared/ui/AppButton'
import type { CloudBackupStatus } from '../domain/cloud-backup'

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

export type CloudBackupSnapshotInfo = {
  remoteFileId: string
  fileName: string
  remoteModifiedTime?: string
  size?: string
}

type BackupPanelProps = {
  backupCount: number
  cloudSnapshots: CloudBackupSnapshotInfo[]
  cloudBackupStatus: CloudBackupStatus
  isCloudConnecting: boolean
  isCloudDisconnecting: boolean
  isCloudListing: boolean
  isCloudRestoring: boolean
  isCloudUploading: boolean
  isExporting: boolean
  isRestoring: boolean
  isDeleting: boolean
  latestBackup?: BackupSnapshotInfo
  notice?: BackupNotice
  deletingFileName?: string
  restoringCloudFileId?: string
  restoringFileName?: string
  snapshots: BackupSnapshotInfo[]
  onDeleteSnapshot: (fileName: string) => void
  onConnectGoogleDrive: () => void
  onDisconnectGoogleDrive: () => void
  onRefreshGoogleDriveBackups: () => void
  onRestoreGoogleDriveBackup: (remoteFileId: string) => void
  onUploadGoogleDriveBackup: () => void
  onExportBackup: () => void
  onRestoreBackup: () => void
  onRestoreSnapshot: (fileName: string) => void
}

export function BackupPanel({
  backupCount,
  cloudSnapshots,
  cloudBackupStatus,
  isCloudConnecting,
  isCloudDisconnecting,
  isCloudListing,
  isCloudRestoring,
  isCloudUploading,
  isExporting,
  isDeleting,
  isRestoring,
  latestBackup,
  notice,
  deletingFileName,
  restoringCloudFileId,
  restoringFileName,
  snapshots,
  onDeleteSnapshot,
  onConnectGoogleDrive,
  onDisconnectGoogleDrive,
  onRefreshGoogleDriveBackups,
  onRestoreGoogleDriveBackup,
  onUploadGoogleDriveBackup,
  onExportBackup,
  onRestoreBackup,
  onRestoreSnapshot,
}: BackupPanelProps) {
  const isCloudBusy =
    isCloudConnecting ||
    isCloudDisconnecting ||
    isCloudListing ||
    isCloudRestoring ||
    isCloudUploading
  const isBusy = isExporting || isRestoring || isDeleting || isCloudBusy
  const visibleSnapshots = snapshots.slice(0, 3)
  const visibleCloudSnapshots = cloudSnapshots.slice(0, 3)
  const isGoogleDriveConnected =
    cloudBackupStatus.connectionStatus === 'connected'

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
            <span title={cloudBackupStatus.detail}>
              {cloudBackupStatus.label}
            </span>
          </div>
          <div className="backup-action-group">
            {isGoogleDriveConnected ? (
              <AppButton
                disabled={isBusy || !cloudBackupStatus.canUpload}
                icon={Upload}
                onClick={onUploadGoogleDriveBackup}
                variant="ghost"
              >
                {isCloudUploading ? 'Uploading' : 'Upload'}
              </AppButton>
            ) : null}
            <AppButton
              disabled={
                isBusy ||
                (isGoogleDriveConnected
                  ? !cloudBackupStatus.canDisconnect
                  : !cloudBackupStatus.canConnect)
              }
              icon={isGoogleDriveConnected ? LogOut : KeyRound}
              onClick={
                isGoogleDriveConnected
                  ? onDisconnectGoogleDrive
                  : onConnectGoogleDrive
              }
            >
              {getGoogleDriveActionLabel(
                cloudBackupStatus,
                isCloudConnecting,
                isCloudDisconnecting,
              )}
            </AppButton>
          </div>
        </div>
        {isGoogleDriveConnected ? (
          <div className="backup-snapshot-list" aria-label="Cloud backups">
            <div className="backup-snapshot-row backup-snapshot-row-heading">
              <div>
                <strong>Cloud backups</strong>
                <span>{formatCloudSnapshotCount(cloudSnapshots.length)}</span>
              </div>
              <AppButton
                disabled={isBusy}
                icon={RefreshCcw}
                onClick={onRefreshGoogleDriveBackups}
                variant="ghost"
              >
                {isCloudListing ? 'Refreshing' : 'Refresh'}
              </AppButton>
            </div>
            {visibleCloudSnapshots.length > 0 ? (
              visibleCloudSnapshots.map((snapshot) => (
                <div
                  className="backup-snapshot-row"
                  key={snapshot.remoteFileId}
                >
                  <div>
                    <strong title={snapshot.fileName}>
                      {snapshot.fileName}
                    </strong>
                    <span>
                      {formatCloudSnapshotMeta(
                        snapshot.remoteModifiedTime,
                        snapshot.size,
                      )}
                    </span>
                  </div>
                  <div className="backup-snapshot-actions">
                    <span className="status-pill">Cloud</span>
                    <AppButton
                      disabled={isBusy}
                      icon={RefreshCcw}
                      onClick={() =>
                        onRestoreGoogleDriveBackup(snapshot.remoteFileId)
                      }
                      variant="ghost"
                    >
                      {restoringCloudFileId === snapshot.remoteFileId
                        ? 'Restoring'
                        : 'Restore'}
                    </AppButton>
                  </div>
                </div>
              ))
            ) : (
              <div className="backup-snapshot-row">
                <div>
                  <strong>No cloud snapshots</strong>
                  <span>Upload a local snapshot first</span>
                </div>
              </div>
            )}
          </div>
        ) : null}
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

function getGoogleDriveActionLabel(
  status: CloudBackupStatus,
  isConnecting: boolean,
  isDisconnecting: boolean,
) {
  if (isConnecting) {
    return 'Connecting'
  }

  if (isDisconnecting) {
    return 'Disconnecting'
  }

  if (status.connectionStatus === 'connected') {
    return 'Disconnect'
  }

  if (status.connectionStatus === 'needs_reauth') {
    return 'Re-login'
  }

  return 'Connect'
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

function formatCloudSnapshotCount(count: number) {
  if (count === 0) {
    return 'No snapshots'
  }

  if (count === 1) {
    return '1 snapshot'
  }

  return `${count} snapshots`
}

function formatCloudSnapshotMeta(
  modifiedTime: string | undefined,
  size: string | undefined,
) {
  const parts = []

  if (modifiedTime) {
    parts.push(modifiedTime.replace('T', ' ').replace('.000Z', ' UTC'))
  }

  if (size) {
    parts.push(`${size} bytes`)
  }

  return parts.length > 0 ? parts.join(' - ') : 'Metadata unavailable'
}
