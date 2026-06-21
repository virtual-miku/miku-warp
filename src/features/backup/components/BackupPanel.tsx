import {
  DatabaseBackup,
  FileJson,
  KeyRound,
  LogOut,
  RefreshCcw,
  Trash2,
  X,
} from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { AppButton } from '../../../shared/ui/AppButton'
import type {
  AppLanguage,
  TimeZonePreference,
} from '../../settings/domain/localization'
import { formatDateTime, formatNumber } from '../../../shared/lib/date-time'
import {
  type CloudBackupPolicy,
  type CloudBackupStatus,
  type GoogleOAuthClientInput,
} from '../domain/cloud-backup'
import { useLocalization } from '../../settings/components/localization-context'
import type { Translator } from '../../settings/domain/localization'

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
  language: AppLanguage
  notice?: BackupNotice
  deletingFileName?: string
  restoringCloudFileId?: string
  restoringFileName?: string
  snapshots: BackupSnapshotInfo[]
  timeZone: TimeZonePreference
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
  language,
  isRestoring,
  notice,
  deletingFileName,
  restoringCloudFileId,
  restoringFileName,
  snapshots,
  timeZone,
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
  const { t } = useLocalization()
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
      aria-label={t('backup.ariaLabel')}
    >
      <div className="tool-panel-body">
        <div className="backup-section">
          {!isGoogleDriveConfigured ? (
            <GoogleOAuthSetupForm
              disabled={oauthFormDisabled}
              isConnecting={isCloudConnecting}
              onConnect={onConnectGoogleDrive}
              statusDetail={getCloudBackupStatusDetail(cloudBackupStatus, t)}
            />
          ) : (
            <>
              <div className="tool-row">
                <div>
                  <strong>Google Drive</strong>
                  <span title={getCloudBackupStatusDetail(cloudBackupStatus, t)}>
                    {getCloudBackupStatusLabel(cloudBackupStatus, t)}
                  </span>
                </div>
                <div className="backup-action-group">
                  {isGoogleDriveConnected ? (
                    <AppButton
                      disabled={isBusy || !cloudBackupStatus.canUpload}
                      icon={DatabaseBackup}
                      onClick={onUploadGoogleDriveBackup}
                      variant="ghost"
                    >
                      {isCloudUploading ? t('backup.backingUp') : t('backup.backUpNow')}
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
                        ? t('backup.removingCredentials')
                        : t('backup.changeCredentials')}
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
                      t,
                    )}
                  </AppButton>
                </div>
              </div>
              {!isGoogleDriveConnected && getCloudBackupStatusDetail(cloudBackupStatus, t) ? (
                <p className="backup-status-detail">
                  {getCloudBackupStatusDetail(cloudBackupStatus, t)}
                </p>
              ) : null}
              <div className="backup-policy-row">
                <div>
                  <strong>{t('backup.auto')}</strong>
                  <span>
                    {getLocalizedCloudBackupPolicyDetail(
                      cloudBackupPolicy,
                      cloudBackupStatus.canUpload,
                      t,
                    )}
                  </span>
                </div>
                <button
                  aria-checked={cloudBackupPolicy.autoBackupEnabled}
                  aria-label={t('backup.autoAria')}
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
                <div className="backup-snapshot-list" aria-label={t('backup.cloudAria')}>
                  {visibleCloudSnapshots.length > 0 ? (
                    visibleCloudSnapshots.map((snapshot) => (
                      <div
                        className="backup-snapshot-row"
                        key={snapshot.remoteFileId}
                      >
                        <div>
                          <strong>
                            {snapshot.remoteModifiedTime
                              ? t('backup.snapshotAt', {
                                  date: formatSnapshotTime(snapshot.remoteModifiedTime, language, timeZone),
                                })
                              : t('backup.timeUnavailable')}
                          </strong>
                          <span title={snapshot.fileName}>
                            {formatBackupSizeKilobytes(snapshot.size, language, t)}
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
                              ? t('common.restoring')
                              : t('common.restore')}
                          </AppButton>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="backup-snapshot-row">
                      <div>
                        <strong>{t('backup.cloudEmpty')}</strong>
                        <span>{t('backup.cloudEmptyDetail')}</span>
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
              <strong>{t('backup.local')}</strong>
            </div>
            <div className="backup-action-group">
              <AppButton
                disabled={isBusy}
                icon={DatabaseBackup}
                onClick={onExportBackup}
                variant="ghost"
              >
                {isExporting ? t('backup.backingUp') : t('backup.backUpNow')}
              </AppButton>
              <AppButton
                disabled={isBusy}
                icon={FileJson}
                onClick={onImportBackupJson}
                variant="ghost"
              >
                {isImporting ? t('common.importing') : t('common.import')}
              </AppButton>
            </div>
          </div>
          {visibleSnapshots.length > 0 ? (
            <div className="backup-snapshot-list" aria-label={t('backup.recentAria')}>
              {visibleSnapshots.map((snapshot) => (
                <div className="backup-snapshot-row" key={snapshot.fileName}>
                  <div>
                    <strong>
                      {t('backup.snapshotAt', {
                        date: formatSnapshotTime(snapshot.exportedAt, language, timeZone),
                      })}
                    </strong>
                    <span title={snapshot.fileName}>
                      {formatBackupSizeKilobytes(snapshot.sizeBytes, language, t)}
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
                        ? t('common.restoring')
                        : t('common.restore')}
                    </AppButton>
                    {!snapshot.isAutoSave ? (
                      <AppButton
                        disabled={isBusy}
                        icon={Trash2}
                        onClick={() => onDeleteSnapshot(snapshot.fileName)}
                        variant="ghost"
                      >
                        {deletingFileName === snapshot.fileName
                          ? t('common.deleting')
                          : t('common.delete')}
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
  const { t } = useLocalization()
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
          <span>{t('backup.oauthSetup')}</span>
        </div>
      </div>
      <form className="backup-oauth-form" onSubmit={handleSubmit}>
        <label className="backup-oauth-field">
          <span>{t('backup.clientId')}</span>
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
          <span>{t('backup.clientSecret')}</span>
          <input
            autoComplete="new-password"
            disabled={disabled}
            maxLength={1024}
            onChange={(event) => setClientSecret(event.target.value)}
            placeholder={t('backup.clientSecretPlaceholder')}
            spellCheck={false}
            type="password"
            value={clientSecret}
          />
        </label>
        <div className="backup-oauth-actions">
          <AppButton disabled={!canSubmit} icon={KeyRound} type="submit">
            {isConnecting ? t('backup.connecting') : t('backup.saveConnect')}
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
  t: Translator,
) {
  if (isCancelling) {
    return t('backup.cancelling')
  }

  if (status.connectionStatus === 'connecting') {
    return t('common.cancel')
  }

  if (isDisconnecting) {
    return t('backup.disconnecting')
  }

  if (status.connectionStatus === 'connected') {
    return t('backup.disconnect')
  }

  if (status.connectionStatus === 'connection_failed') {
    return t('backup.retry')
  }

  if (status.connectionStatus === 'needs_reauth') {
    return t('backup.relogin')
  }

  if (isConnecting) {
    return t('backup.connecting')
  }

  return t('backup.connect')
}

function formatSnapshotTime(
  value: string,
  language: AppLanguage,
  timeZone: TimeZonePreference,
) {
  return formatDateTime(value, { language, timeZone }) ?? value
}

function formatBackupSizeKilobytes(
  size: number | string | undefined,
  language: AppLanguage,
  t: Translator,
) {
  const parsedSize =
    typeof size === 'number' ? size : Number.parseInt(size ?? '', 10)

  if (!Number.isFinite(parsedSize) || parsedSize < 0) {
    return t('backup.sizeUnavailable')
  }

  const kilobytes = Math.max(1, Math.round(parsedSize / 1024))

  return `${formatNumber(kilobytes, language)} KB`
}

function getLocalizedCloudBackupPolicyDetail(
  policy: CloudBackupPolicy,
  canUpload: boolean,
  t: Translator,
) {
  if (policy.autoBackupEnabled && canUpload) {
    return t('backup.policyEveryChange')
  }
  if (policy.autoBackupEnabled) {
    return t('backup.policyDrivePending')
  }
  return canUpload ? t('backup.policyLocalOnly') : t('backup.policyLocalOn')
}

function getCloudBackupStatusLabel(status: CloudBackupStatus, t: Translator) {
  const keys = {
    not_configured: 'backup.status.notConfigured',
    storage_unavailable: 'backup.status.storageUnavailable',
    disconnected: 'backup.status.disconnected',
    connecting: 'backup.status.connecting',
    connection_failed: 'backup.status.failed',
    connected: 'backup.status.connected',
    needs_reauth: 'backup.status.needsReauth',
  } as const

  return t(keys[status.connectionStatus])
}

function getCloudBackupStatusDetail(status: CloudBackupStatus, t: Translator) {
  if (status.connectionStatus === 'not_configured') {
    return t('backup.detail.notConfigured')
  }
  if (status.connectionStatus === 'connecting') {
    return t('backup.detail.connecting')
  }
  if (status.connectionStatus === 'connected') {
    return t('backup.detail.connected')
  }

  return status.detail
}
