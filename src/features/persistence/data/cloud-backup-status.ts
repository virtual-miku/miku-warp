import type { CloudBackupStatus } from '../../backup/domain/cloud-backup'
import { invokeTauri } from './tauri-invoke'

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

export function getCloudBackupStatus() {
  return invokeTauri<CloudBackupStatus>('get_cloud_backup_status')
}

export function connectGoogleDriveBackup() {
  return invokeTauri<CloudBackupStatus>('connect_google_drive_backup')
}

export function disconnectGoogleDriveBackup() {
  return invokeTauri<CloudBackupStatus>('disconnect_google_drive_backup')
}

export function uploadLatestGoogleDriveBackup() {
  return invokeTauri<UploadCloudBackupSnapshotResult>(
    'upload_latest_google_drive_backup',
  )
}

export function listGoogleDriveBackupSnapshots() {
  return invokeTauri<CloudBackupSnapshotSummary[]>(
    'list_google_drive_backup_snapshots',
  )
}
