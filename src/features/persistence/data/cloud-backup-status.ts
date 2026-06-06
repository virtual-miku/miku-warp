import type { CloudBackupStatus } from '../../backup/domain/cloud-backup'
import { invokeTauri } from './tauri-invoke'

export function getCloudBackupStatus() {
  return invokeTauri<CloudBackupStatus>('get_cloud_backup_status')
}
