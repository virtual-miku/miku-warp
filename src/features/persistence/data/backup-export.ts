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

export type RestoreBackupSnapshotResult = ExportBackupSnapshotResult & {
  warpPullsInserted: number
  duplicateWarpPulls: number
  recomputedBanners: number
}

export function exportBackupSnapshot() {
  return invokeTauri<ExportBackupSnapshotResult>('export_backup_snapshot')
}

export function restoreLatestBackupSnapshot() {
  return invokeTauri<RestoreBackupSnapshotResult>(
    'restore_latest_backup_snapshot',
  )
}
