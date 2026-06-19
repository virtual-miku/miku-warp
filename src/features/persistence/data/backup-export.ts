import { open } from '@tauri-apps/plugin-dialog'
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

export type BackupSnapshotSummary = ExportBackupSnapshotResult & {
  fileName: string
  isAutoSave: boolean
  sizeBytes: number
  uids: string[]
}

export type DeleteBackupSnapshotResult = {
  backupPath: string
  fileName: string
  remainingSnapshots: number
}

export type RestoreBackupSnapshotResult = ExportBackupSnapshotResult & {
  warpPullsInserted: number
  duplicateWarpPulls: number
  recomputedBanners: number
}

export function exportBackupSnapshot() {
  return invokeTauri<ExportBackupSnapshotResult>('export_backup_snapshot')
}

export function listBackupSnapshots() {
  return invokeTauri<BackupSnapshotSummary[]>('list_backup_snapshots')
}

export function deleteBackupSnapshot(fileName: string) {
  return invokeTauri<DeleteBackupSnapshotResult>('delete_backup_snapshot', {
    input: { fileName },
  })
}

export function restoreLatestBackupSnapshot() {
  return invokeTauri<RestoreBackupSnapshotResult>(
    'restore_latest_backup_snapshot',
  )
}

export function restoreBackupSnapshot(fileName: string) {
  return invokeTauri<RestoreBackupSnapshotResult>('restore_backup_snapshot', {
    input: { fileName },
  })
}

export async function selectBackupJsonFile() {
  const selectedPath = await open({
    filters: [{ name: 'Miku Warp backup JSON', extensions: ['json'] }],
    multiple: false,
    title: 'Select Miku Warp backup JSON',
  })

  return typeof selectedPath === 'string' ? selectedPath : undefined
}

export function replaceDatabaseFromBackupFile(filePath: string) {
  return invokeTauri<RestoreBackupSnapshotResult>(
    'replace_database_from_backup_file',
    { input: { filePath } },
  )
}
