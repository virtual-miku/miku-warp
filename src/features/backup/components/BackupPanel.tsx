import {
  Cloud,
  FileJson,
  KeyRound,
  LogOut,
  RefreshCcw,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { AppButton } from '../../../shared/ui/AppButton'
import {
  getCloudBackupPolicyDetail,
  type CloudBackupPolicy,
  type CloudBackupStatus,
  type GoogleOAuthClientInput,
} from '../domain/cloud-backup'

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
  onConnectGoogleDrive: (input?: GoogleOAuthClientInput) => void
  onDisconnectGoogleDrive: () => void
  onAutoBackupPolicyChange: (enabled: boolean) => void
  onRestoreGoogleDriveBackup: (snapshot: CloudBackupSnapshotInfo) => void
  onUploadGoogleDriveBackup: () => void
  onExportBackup: () => void
  onImportBackupJson: () => void
  onRestoreSnapshot: (fileName: string) => void
}

export function BackupPanel({
  cloudBackupPolicy,
  cloudSnapshots,
  cloudBackupStatus,
  isCloudCancelling,
  isCloudConnecting,
  isCloudDisconnecting,
  isCloudPolicyUpdating,
  isCloudRestoring,
  isCloudUploading,
  isExporting,
  isImporting,
  isDeleting,
  isRestoring,
  notice,
  deletingFileName,
  restoringCloudFileId,
  restoringFileName,
  snapshots,
  onDeleteSnapshot,
  onAutoBackupPolicyChange,
  onCancelGoogleDrive,
  onConnectGoogleDrive,
  onDisconnectGoogleDrive,
  onRestoreGoogleDriveBackup,
  onUploadGoogleDriveBackup,
  onExportBackup,
  onImportBackupJson,
  onRestoreSnapshot,
}: BackupPanelProps) {
  const isGoogleDriveConfigured = cloudBackupStatus.oauthClientConfigured
  const isGoogleDriveConnecting =
    cloudBackupStatus.connectionStatus === 'connecting'
  const isGoogleDriveConnected =
    cloudBackupStatus.connectionStatus === 'connected'
  const isCloudBusy =
    isCloudConnecting ||
    isCloudCancelling ||
    isCloudDisconnecting ||
    isCloudPolicyUpdating ||
    isCloudRestoring ||
    isCloudUploading
  const isBusy =
    isExporting || isImporting || isRestoring || isDeleting || isCloudBusy
  const visibleSnapshots = snapshots
    .filter((snapshot) => !snapshot.isAutoSave)
    .slice(0, 3)
  const visibleCloudSnapshots = cloudSnapshots.slice(0, 1)
  const visibleNotice = notice
  const autoBackupToggleDisabled =
    isBusy ||
    isCloudPolicyUpdating ||
    (!cloudBackupPolicy.autoBackupEnabled && !cloudBackupStatus.canUpload)
  const oauthFormDisabled = isBusy || !cloudBackupStatus.canConnect

  return (
    <section
      className="tool-panel"
      id="backup"
      aria-label="Backup"
    >
      <div className="tool-panel-body">
        <div className="backup-section">
          {!isGoogleDriveConfigured ? (
            <GoogleOAuthSetupForm
              disabled={oauthFormDisabled}
              isConnecting={isCloudConnecting}
              onConnect={onConnectGoogleDrive}
              statusDetail={cloudBackupStatus.detail}
            />
          ) : (
            <>
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
                  {!isGoogleDriveConnected && !isGoogleDriveConnecting ? (
                    <AppButton
                      disabled={isBusy || !cloudBackupStatus.canDisconnect}
                      icon={LogOut}
                      onClick={onDisconnectGoogleDrive}
                      variant="ghost"
                    >
                      {isCloudDisconnecting
                        ? 'Removing credentials'
                        : 'Change credentials'}
                    </AppButton>
                  ) : null}
                  <AppButton
                    disabled={
                      isGoogleDriveConnecting
                        ? isCloudCancelling
                        : isBusy ||
                          (isGoogleDriveConnected
                            ? !cloudBackupStatus.canDisconnect
                            : !cloudBackupStatus.canConnect)
                    }
                    icon={
                      isGoogleDriveConnecting
                        ? X
                        : isGoogleDriveConnected
                          ? LogOut
                          : KeyRound
                    }
                    onClick={
                      isGoogleDriveConnecting
                        ? onCancelGoogleDrive
                        : isGoogleDriveConnected
                          ? onDisconnectGoogleDrive
                          : () => onConnectGoogleDrive()
                    }
                  >
                    {getGoogleDriveActionLabel(
                      cloudBackupStatus,
                      isGoogleDriveConnecting,
                      isCloudCancelling,
                      isCloudDisconnecting,
                    )}
                  </AppButton>
                </div>
              </div>
              {!isGoogleDriveConnected && cloudBackupStatus.detail ? (
                <p className="backup-status-detail">
                  {cloudBackupStatus.detail}
                </p>
              ) : null}
              <div className="backup-policy-row">
                <div>
                  <strong>Auto backup</strong>
                  <span>
                    {getCloudBackupPolicyDetail(
                      cloudBackupPolicy,
                      cloudBackupStatus.canUpload,
                    )}
                  </span>
                </div>
                <button
                  aria-checked={cloudBackupPolicy.autoBackupEnabled}
                  aria-label="Auto backup to Google Drive"
                  className={`switch-control${
                    cloudBackupPolicy.autoBackupEnabled
                      ? ' switch-control-on'
                      : ''
                  }`}
                  disabled={autoBackupToggleDisabled}
                  onClick={() =>
                    onAutoBackupPolicyChange(
                      !cloudBackupPolicy.autoBackupEnabled,
                    )
                  }
                  role="switch"
                  type="button"
                >
                  <span aria-hidden="true" />
                </button>
              </div>
              {isGoogleDriveConnected ? (
                <div className="backup-snapshot-list" aria-label="Cloud backups">
                  {visibleCloudSnapshots.length > 0 ? (
                    visibleCloudSnapshots.map((snapshot) => (
                      <div
                        className="backup-snapshot-row"
                        key={snapshot.remoteFileId}
                      >
                        <div>
                          <strong>
                            {snapshot.remoteModifiedTime
                              ? `Backup ${formatSnapshotTime(snapshot.remoteModifiedTime)}`
                              : 'Time unavailable'}
                          </strong>
                          <span title={snapshot.fileName}>
                            {formatBackupSizeKilobytes(snapshot.size)}
                          </span>
                        </div>
                        <div className="backup-snapshot-actions">
                          <AppButton
                            disabled={isBusy}
                            icon={RefreshCcw}
                            onClick={() => onRestoreGoogleDriveBackup(snapshot)}
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
                        <strong>No cloud autosave yet</strong>
                        <span>It will upload after the next saved change</span>
                      </div>
                    </div>
                  )}
                </div>
              ) : null}
            </>
          )}
        </div>

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

type GoogleOAuthSetupFormProps = {
  disabled: boolean
  isConnecting: boolean
  onConnect: (input: GoogleOAuthClientInput) => void
  statusDetail: string
}

function GoogleOAuthSetupForm({
  disabled,
  isConnecting,
  onConnect,
  statusDetail,
}: GoogleOAuthSetupFormProps) {
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const canSubmit = !disabled && clientId.trim().length > 0

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!canSubmit) {
      return
    }

    onConnect({
      clientId: clientId.trim(),
      clientSecret: clientSecret.trim() || undefined,
    })
  }

  return (
    <>
      <div className="tool-row">
        <div>
          <strong>Google Drive</strong>
          <span>Secure OAuth setup</span>
        </div>
      </div>
      <form className="backup-oauth-form" onSubmit={handleSubmit}>
        <label className="backup-oauth-field">
          <span>Desktop Client ID</span>
          <input
            autoComplete="off"
            disabled={disabled}
            maxLength={512}
            onChange={(event) => setClientId(event.target.value)}
            placeholder="your-client-id.apps.googleusercontent.com"
            required
            spellCheck={false}
            type="text"
            value={clientId}
          />
        </label>
        <label className="backup-oauth-field">
          <span>Desktop Client Secret (optional)</span>
          <input
            autoComplete="new-password"
            disabled={disabled}
            maxLength={1024}
            onChange={(event) => setClientSecret(event.target.value)}
            placeholder="Enter the client secret when Google provides one"
            spellCheck={false}
            type="password"
            value={clientSecret}
          />
        </label>
        <div className="backup-oauth-actions">
          <AppButton disabled={!canSubmit} icon={KeyRound} type="submit">
            {isConnecting ? 'Connecting' : 'Save & connect'}
          </AppButton>
        </div>
      </form>
      {statusDetail ? (
        <p className="backup-status-detail">{statusDetail}</p>
      ) : null}
    </>
  )
}

function getGoogleDriveActionLabel(
  status: CloudBackupStatus,
  isConnecting: boolean,
  isCancelling: boolean,
  isDisconnecting: boolean,
) {
  if (isCancelling) {
    return 'Cancelling'
  }

  if (status.connectionStatus === 'connecting') {
    return 'Cancel'
  }

  if (isDisconnecting) {
    return 'Disconnecting'
  }

  if (status.connectionStatus === 'connected') {
    return 'Disconnect'
  }

  if (status.connectionStatus === 'connection_failed') {
    return 'Retry'
  }

  if (status.connectionStatus === 'needs_reauth') {
    return 'Re-login'
  }

  if (isConnecting) {
    return 'Connecting'
  }

  return 'Connect'
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
