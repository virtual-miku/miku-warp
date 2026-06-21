import type {
  CloudBackupPolicy,
  CloudBackupStatus,
  GoogleOAuthClientInput,
} from '../../backup/domain/cloud-backup'
import { invokeTauri } from './tauri-invoke'
import type { RestoreBackupSnapshotResult } from './backup-export'

export type UploadCloudBackupSnapshotResult = {
  localBackupPath: string
  fileName: string
  remoteFileId: string
  remoteFileName: string
  remoteMd5Checksum?: string
  remoteModifiedTime?: string
  bytesUploaded: number
}

export type CloudBackupSnapshotSummary = {
  remoteFileId: string
  fileName: string
  remoteMd5Checksum?: string
  remoteModifiedTime?: string
  size?: string
}

export type RestoreCloudBackupSnapshotInput = {
  remoteFileId: string
  fileName?: string
  remoteMd5Checksum?: string
  remoteModifiedTime?: string
  size?: string
}

export type AutoBackupSyncStatus = {
  contentHash: string
  localUpToDate: boolean
  cloudRequired: boolean
  cloudUpToDate: boolean
  hasPendingBackup: boolean
  lastLocalBackupAt?: string
  lastCloudBackupAt?: string
}

export type AutoBackupRunResult = {
  contentHash: string
  localChanged: boolean
  localBackupPath: string
  localExportedAt: string
  warpPulls: number
  cloudRequired: boolean
  cloudUploaded: boolean
  cloudError?: string
  syncStatus: AutoBackupSyncStatus
}

export type UpdateCloudBackupPolicyInput = {
  provider: 'google_drive'
  autoBackupEnabled: boolean
}

export function getCloudBackupStatus() {
  return invokeTauri<CloudBackupStatus>('get_cloud_backup_status')
}

export function getCloudBackupPolicy() {
  return invokeTauri<CloudBackupPolicy>('get_cloud_backup_policy')
}

export function updateCloudBackupPolicy(input: UpdateCloudBackupPolicyInput) {
  return invokeTauri<CloudBackupPolicy>('update_cloud_backup_policy', {
    input,
  })
}

export function connectGoogleDriveBackup(input?: GoogleOAuthClientInput) {
  return invokeTauri<CloudBackupStatus>('connect_google_drive_backup', {
    input: input ?? null,
  })
}

export function cancelGoogleDriveBackupConnection() {
  return invokeTauri<CloudBackupStatus>(
    'cancel_google_drive_backup_connection',
  )
}

export function disconnectGoogleDriveBackup() {
  return invokeTauri<CloudBackupStatus>('disconnect_google_drive_backup')
}

export function uploadLatestGoogleDriveBackup() {
  return invokeTauri<UploadCloudBackupSnapshotResult>(
    'upload_latest_google_drive_backup',
  )
}

export function runAutoBackup() {
  return invokeTauri<AutoBackupRunResult>('run_auto_backup')
}

export function getAutoBackupSyncStatus() {
  return invokeTauri<AutoBackupSyncStatus>('get_auto_backup_sync_status')
}

export function listGoogleDriveBackupSnapshots() {
  return invokeTauri<CloudBackupSnapshotSummary[]>(
    'list_google_drive_backup_snapshots',
  )
}

export function restoreGoogleDriveBackupSnapshot(
  input: RestoreCloudBackupSnapshotInput,
) {
  return invokeTauri<RestoreBackupSnapshotResult>(
    'restore_google_drive_backup_snapshot',
    {
      input,
    },
  )
}
