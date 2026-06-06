import type { CloudBackupStatus } from '../../backup/domain/cloud-backup'
import { invokeTauri } from './tauri-invoke'

export function getCloudBackupStatus() {
  return invokeTauri<CloudBackupStatus>('get_cloud_backup_status')
}

export function connectGoogleDriveBackup() {
  return invokeTauri<CloudBackupStatus>('connect_google_drive_backup')
}

export function disconnectGoogleDriveBackup() {
  return invokeTauri<CloudBackupStatus>('disconnect_google_drive_backup')
}
