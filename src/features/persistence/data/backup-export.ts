import { invokeTauri } from './tauri-invoke'

export type ExportBackupSnapshotResult = {
  backupPath: string
  exportedAt: string
  accounts: number
  banners: number
  warpItems: number
  importBatches: number
  warpPulls: number
}

export function exportBackupSnapshot() {
  return invokeTauri<ExportBackupSnapshotResult>('export_backup_snapshot')
}
