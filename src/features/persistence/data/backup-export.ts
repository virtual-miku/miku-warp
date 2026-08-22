import { open, save } from '@tauri-apps/plugin-dialog'
import {
  loadLanguagePreference,
  translate,
} from '../../settings/domain/localization'
import {
  createDesktopRuntimeUnavailableError,
  hasTauriInvoke,
  invokeTauri,
} from './tauri-invoke'

export type ExportBackupSnapshotResult = {
  backupPath: string
  exportedAt: string
  accounts: number
  banners: number
  warpItems: number
  importBatches: number
  warpPulls: number
  characterRosters: number
}

export type BackupSnapshotSummary = ExportBackupSnapshotResult & {
  fileName: string
  isAutoSave: boolean
  sizeBytes: number
  uids: string[]
}

export type TrashedBackupSnapshotSummary = BackupSnapshotSummary & {
  deletedAtUnixMs: number
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

export function exportBackupSnapshot(outputDirectory?: string) {
  return invokeTauri<ExportBackupSnapshotResult>('export_backup_snapshot', {
    input: outputDirectory ? { outputDirectory } : undefined,
  })
}

export async function exportBackupSnapshotToUserFile() {
  const language = loadLanguagePreference()
  if (!hasTauriInvoke()) {
    throw createDesktopRuntimeUnavailableError(
      translate(language, 'desktop.folderBrowsing'),
    )
  }

  const selectedPath = await save({
    defaultPath: 'miku-warp-backup.json',
    filters: [{ name: translate(language, 'desktop.backupFilter'), extensions: ['json'] }],
    title: translate(language, 'desktop.backupSaveTitle'),
  })

  if (typeof selectedPath !== 'string') {
    return undefined
  }

  return invokeTauri<ExportBackupSnapshotResult>('export_backup_snapshot', {
    input: { outputPath: selectedPath },
  })
}

export async function exportBackupSnapshotToUserDirectory() {
  const language = loadLanguagePreference()
  if (!hasTauriInvoke()) {
    throw createDesktopRuntimeUnavailableError(
      translate(language, 'desktop.folderBrowsing'),
    )
  }

  const selectedPath = await open({
    directory: true,
    multiple: false,
    title: translate(language, 'desktop.backupFolderTitle'),
  })

  if (typeof selectedPath !== 'string') {
    return undefined
  }

  return exportBackupSnapshot(selectedPath)
}

export function listBackupSnapshots() {
  return invokeTauri<BackupSnapshotSummary[]>('list_backup_snapshots')
}

export function listTrashedBackupSnapshots() {
  return invokeTauri<TrashedBackupSnapshotSummary[]>(
    'list_trashed_backup_snapshots',
  )
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

export function restoreTrashedBackupSnapshot(fileName: string) {
  return invokeTauri<DeleteBackupSnapshotResult>(
    'restore_trashed_backup_snapshot',
    {
      input: { fileName },
    },
  )
}

export function permanentlyDeleteTrashedBackupSnapshot(fileName: string) {
  return invokeTauri<DeleteBackupSnapshotResult>(
    'permanently_delete_trashed_backup_snapshot',
    { input: { fileName } },
  )
}

export function restoreBackupSnapshot(fileName: string) {
  return invokeTauri<RestoreBackupSnapshotResult>('restore_backup_snapshot', {
    input: { fileName },
  })
}

export async function selectBackupJsonFile() {
  const language = loadLanguagePreference()
  if (!hasTauriInvoke()) {
    throw createDesktopRuntimeUnavailableError(
      translate(language, 'desktop.backupBrowsing'),
    )
  }

  const selectedPath = await open({
    filters: [{ name: translate(language, 'desktop.backupFilter'), extensions: ['json'] }],
    multiple: false,
    title: translate(language, 'desktop.backupTitle'),
  })

  return typeof selectedPath === 'string' ? selectedPath : undefined
}

export function replaceDatabaseFromBackupFile(filePath: string) {
  return invokeTauri<RestoreBackupSnapshotResult>(
    'replace_database_from_backup_file',
    { input: { filePath } },
  )
}
