import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Bell,
  Cloud,
  Database,
  Download,
  RefreshCw,
  Settings,
  Upload,
} from 'lucide-react'
import {
  BackupPanel,
  type CloudBackupSnapshotInfo,
  type BackupNotice,
} from '../features/backup/components/BackupPanel'
import {
  createInitialGoogleDriveBackupStatus,
  type CloudBackupStatus,
} from '../features/backup/domain/cloud-backup'
import { ImportPanel } from '../features/import/components/ImportPanel'
import {
  ManualImportDialog,
  type ManualImportSaveNotice,
} from '../features/import/components/ManualImportDialog'
import { manualNoteSample } from '../features/import/data/manual-note-sample'
import { buildManualImportDraft } from '../features/import/domain/manual-import-draft'
import { parseManualWarpNote } from '../features/import/domain/manual-note-parser'
import {
  saveManualImportDraft,
  toSaveManualImportDraftPayload,
  type ManualImportAccountInput,
} from '../features/persistence/data/manual-import-save'
import {
  deleteBackupSnapshot,
  listBackupSnapshots,
  type BackupSnapshotSummary,
  exportBackupSnapshot,
  type ExportBackupSnapshotResult,
  restoreBackupSnapshot,
  restoreLatestBackupSnapshot,
  type RestoreBackupSnapshotResult,
} from '../features/persistence/data/backup-export'
import {
  connectGoogleDriveBackup,
  disconnectGoogleDriveBackup,
  getCloudBackupStatus,
  listGoogleDriveBackupSnapshots,
  uploadLatestGoogleDriveBackup,
  type UploadCloudBackupSnapshotResult,
} from '../features/persistence/data/cloud-backup-status'
import { syncWarpItemCatalog } from '../features/persistence/data/warp-item-catalog-sync'
import { listWarpPulls } from '../features/persistence/data/warp-pull-history'
import { BannerTabs } from '../features/warp-history/components/BannerTabs'
import { PityOverview } from '../features/warp-history/components/PityOverview'
import { WarpTimeline } from '../features/warp-history/components/WarpTimeline'
import { itemCatalog } from '../features/warp-history/data/item-catalog'
import {
  getBannerLabel,
  type BannerType,
} from '../features/warp-history/domain/banner'
import {
  annotatePityAtPull,
  calculatePitySummary,
} from '../features/warp-history/domain/pity'
import type { WarpPull } from '../features/warp-history/domain/warp-pull'
import { demoPulls } from '../features/warp-history/data/demo-pulls'
import { AppButton } from '../shared/ui/AppButton'
import './App.css'

const defaultBannerType = 'character_event' satisfies BannerType
const activeAccount: ManualImportAccountInput = {
  id: 'account-800000000',
  uid: '800000000',
  region: 'asia',
  nickname: 'Trailblazer',
}

export function App() {
  const [activeBannerType, setActiveBannerType] =
    useState<BannerType>(defaultBannerType)
  const [manualImportOpen, setManualImportOpen] = useState(false)
  const [manualImportSaving, setManualImportSaving] = useState(false)
  const [manualImportSaveNotice, setManualImportSaveNotice] =
    useState<ManualImportSaveNotice>()
  const [backupExporting, setBackupExporting] = useState(false)
  const [deletingBackupFileName, setDeletingBackupFileName] = useState<string>()
  const [restoringBackupFileName, setRestoringBackupFileName] =
    useState<string>()
  const [backupNotice, setBackupNotice] = useState<BackupNotice>()
  const [cloudBackupConnecting, setCloudBackupConnecting] = useState(false)
  const [cloudBackupDisconnecting, setCloudBackupDisconnecting] =
    useState(false)
  const [cloudBackupListing, setCloudBackupListing] = useState(false)
  const [cloudBackupUploading, setCloudBackupUploading] = useState(false)
  const [backupSnapshots, setBackupSnapshots] = useState<
    BackupSnapshotSummary[]
  >([])
  const [cloudBackupSnapshots, setCloudBackupSnapshots] = useState<
    CloudBackupSnapshotInfo[]
  >([])
  const [cloudBackupStatus, setCloudBackupStatus] =
    useState<CloudBackupStatus>(() => createInitialGoogleDriveBackupStatus())
  const [manualNoteDraft, setManualNoteDraft] = useState(manualNoteSample)
  const [persistedPulls, setPersistedPulls] = useState<WarpPull[]>([])
  const manualImportPreview = useMemo(
    () => parseManualWarpNote(manualNoteDraft, itemCatalog),
    [manualNoteDraft],
  )
  const demoActivePulls = useMemo(
    () => demoPulls.filter((pull) => pull.bannerType === activeBannerType),
    [activeBannerType],
  )
  const timelinePulls = useMemo(
    () =>
      annotatePityAtPull(
        persistedPulls.length > 0 ? persistedPulls : demoActivePulls,
      ),
    [demoActivePulls, persistedPulls],
  )
  const pitySummary = useMemo(
    () => calculatePitySummary(timelinePulls),
    [timelinePulls],
  )
  const backupDeleting = deletingBackupFileName !== undefined
  const backupRestoring = restoringBackupFileName !== undefined
  const cloudBackupBusy =
    cloudBackupConnecting ||
    cloudBackupDisconnecting ||
    cloudBackupListing ||
    cloudBackupUploading

  const fetchPersistedPulls = useCallback(() => {
    return listWarpPulls({
      accountId: activeAccount.id,
      bannerType: activeBannerType,
      limit: 100,
    })
  }, [activeBannerType])

  const refreshPersistedPulls = useCallback(async () => {
    try {
      const pulls = await fetchPersistedPulls()
      setPersistedPulls(pulls)
    } catch {
      setPersistedPulls([])
    }
  }, [fetchPersistedPulls])

  const refreshBackupSnapshots = useCallback(async () => {
    try {
      const snapshots = await listBackupSnapshots()
      setBackupSnapshots(snapshots)
    } catch {
      setBackupSnapshots([])
    }
  }, [])

  const refreshCloudBackupStatus = useCallback(async () => {
    try {
      const status = await getCloudBackupStatus()
      setCloudBackupStatus(status)
      return status
    } catch {
      const fallbackStatus = createInitialGoogleDriveBackupStatus()
      setCloudBackupStatus(fallbackStatus)
      return fallbackStatus
    }
  }, [])

  const refreshCloudBackupSnapshots = useCallback(async () => {
    setCloudBackupListing(true)

    try {
      const snapshots = await listGoogleDriveBackupSnapshots()
      setCloudBackupSnapshots(snapshots)
      return snapshots
    } catch (error) {
      setCloudBackupSnapshots([])
      throw error
    } finally {
      setCloudBackupListing(false)
    }
  }, [])

  useEffect(() => {
    let isActive = true

    fetchPersistedPulls()
      .then((pulls) => {
        if (isActive) {
          setPersistedPulls(pulls)
        }
      })
      .catch(() => {
        if (isActive) {
          setPersistedPulls([])
        }
      })

    return () => {
      isActive = false
    }
  }, [fetchPersistedPulls])

  useEffect(() => {
    let isActive = true

    listBackupSnapshots()
      .then((snapshots) => {
        if (isActive) {
          setBackupSnapshots(snapshots)
        }
      })
      .catch(() => {
        if (isActive) {
          setBackupSnapshots([])
        }
      })

    return () => {
      isActive = false
    }
  }, [])

  useEffect(() => {
    let isActive = true

    getCloudBackupStatus()
      .then((status) => {
        if (!isActive) {
          return
        }

        setCloudBackupStatus(status)
        if (status.connectionStatus === 'connected') {
          listGoogleDriveBackupSnapshots()
            .then((snapshots) => {
              if (isActive) {
                setCloudBackupSnapshots(snapshots)
              }
            })
            .catch(() => {
              if (isActive) {
                setCloudBackupSnapshots([])
              }
            })
        }
      })
      .catch(() => {
        if (isActive) {
          setCloudBackupStatus(createInitialGoogleDriveBackupStatus())
        }
      })

    return () => {
      isActive = false
    }
  }, [])

  const handleManualNoteChange = (value: string) => {
    setManualNoteDraft(value)
    setManualImportSaveNotice(undefined)
  }

  const handleBannerTypeChange = (bannerType: BannerType) => {
    if (bannerType === activeBannerType) {
      return
    }

    setActiveBannerType(bannerType)
    setPersistedPulls([])
    setManualImportSaveNotice(undefined)
  }

  const handleSaveManualImport = async () => {
    if (manualImportSaving) {
      return
    }

    const draft = buildManualImportDraft(manualImportPreview, {
      accountId: activeAccount.id,
      fallbackBannerType: activeBannerType,
      timezone: 'Asia/Jakarta',
    })

    if (draft.status !== 'ready') {
      setManualImportSaveNotice({
        tone: 'error',
        title: 'Needs review',
        detail: 'Resolve import issues before saving.',
      })
      return
    }

    setManualImportSaving(true)
    setManualImportSaveNotice(undefined)

    try {
      const catalogResult = await syncWarpItemCatalog(itemCatalog)
      const result = await saveManualImportDraft(
        toSaveManualImportDraftPayload(activeAccount, draft),
      )
      await refreshPersistedPulls()

      setManualImportSaveNotice({
        tone: 'success',
        title: 'Saved',
        detail: `${result.recordsInserted} inserted, ${result.recordsSkipped} skipped, ${result.duplicateRecords} duplicates. Catalog ${catalogResult.totalInDatabase} items.`,
      })
    } catch (error) {
      setManualImportSaveNotice({
        tone: 'error',
        title: 'Save failed',
        detail: getErrorMessage(error),
      })
    } finally {
      setManualImportSaving(false)
    }
  }

  const handleExportBackup = useCallback(async () => {
    if (backupDeleting || backupExporting || backupRestoring || cloudBackupBusy) {
      return
    }

    setBackupExporting(true)
    setBackupNotice(undefined)

    try {
      const result = await exportBackupSnapshot()
      await refreshBackupSnapshots()

      setBackupNotice({
        tone: 'success',
        title: 'Backup exported',
        detail: formatBackupExportDetail(result),
      })
    } catch (error) {
      setBackupNotice({
        tone: 'error',
        title: 'Export failed',
        detail: getErrorMessage(error),
      })
    } finally {
      setBackupExporting(false)
    }
  }, [
    backupDeleting,
    backupExporting,
    backupRestoring,
    cloudBackupBusy,
    refreshBackupSnapshots,
  ])

  const handleConnectGoogleDrive = useCallback(async () => {
    if (
      backupDeleting ||
      backupExporting ||
      backupRestoring ||
      cloudBackupBusy ||
      !cloudBackupStatus.canConnect
    ) {
      return
    }

    setCloudBackupConnecting(true)
    setBackupNotice(undefined)

    try {
      const status = await connectGoogleDriveBackup()
      setCloudBackupStatus(status)
      await refreshCloudBackupSnapshots().catch(() => undefined)
      setBackupNotice({
        tone: 'success',
        title: 'Google Drive connected',
        detail: status.detail,
      })
    } catch (error) {
      const fallbackStatus = await refreshCloudBackupStatus()
      setBackupNotice({
        tone: 'error',
        title: 'Google Drive connect failed',
        detail: `${getErrorMessage(error)}\n${fallbackStatus.detail}`,
      })
    } finally {
      setCloudBackupConnecting(false)
    }
  }, [
    backupDeleting,
    backupExporting,
    backupRestoring,
    cloudBackupBusy,
    cloudBackupStatus.canConnect,
    refreshCloudBackupSnapshots,
    refreshCloudBackupStatus,
  ])

  const handleDisconnectGoogleDrive = useCallback(async () => {
    if (
      backupDeleting ||
      backupExporting ||
      backupRestoring ||
      cloudBackupBusy ||
      !cloudBackupStatus.canDisconnect
    ) {
      return
    }

    setCloudBackupDisconnecting(true)
    setBackupNotice(undefined)

    try {
      const status = await disconnectGoogleDriveBackup()
      setCloudBackupStatus(status)
      setCloudBackupSnapshots([])
      setBackupNotice({
        tone: 'success',
        title: 'Google Drive disconnected',
        detail: 'Local Google Drive token was removed from secure storage.',
      })
    } catch (error) {
      const fallbackStatus = await refreshCloudBackupStatus()
      setBackupNotice({
        tone: 'error',
        title: 'Google Drive disconnect failed',
        detail: `${getErrorMessage(error)}\n${fallbackStatus.detail}`,
      })
    } finally {
      setCloudBackupDisconnecting(false)
    }
  }, [
    backupDeleting,
    backupExporting,
    backupRestoring,
    cloudBackupBusy,
    cloudBackupStatus.canDisconnect,
    refreshCloudBackupStatus,
  ])

  const handleUploadGoogleDriveBackup = useCallback(async () => {
    if (
      backupDeleting ||
      backupExporting ||
      backupRestoring ||
      cloudBackupBusy ||
      !cloudBackupStatus.canUpload
    ) {
      return
    }

    setCloudBackupUploading(true)
    setBackupNotice(undefined)

    try {
      const result = await uploadLatestGoogleDriveBackup()
      await refreshCloudBackupStatus()
      await refreshCloudBackupSnapshots().catch(() => undefined)
      setBackupNotice({
        tone: 'success',
        title: 'Google Drive upload complete',
        detail: formatCloudBackupUploadDetail(result),
      })
    } catch (error) {
      const fallbackStatus = await refreshCloudBackupStatus()
      setBackupNotice({
        tone: 'error',
        title: 'Google Drive upload failed',
        detail: `${getErrorMessage(error)}\n${fallbackStatus.detail}`,
      })
    } finally {
      setCloudBackupUploading(false)
    }
  }, [
    backupDeleting,
    backupExporting,
    backupRestoring,
    cloudBackupBusy,
    cloudBackupStatus.canUpload,
    refreshCloudBackupStatus,
    refreshCloudBackupSnapshots,
  ])

  const handleRefreshGoogleDriveBackups = useCallback(async () => {
    if (
      backupDeleting ||
      backupExporting ||
      backupRestoring ||
      cloudBackupBusy ||
      cloudBackupStatus.connectionStatus !== 'connected'
    ) {
      return
    }

    setBackupNotice(undefined)

    try {
      const snapshots = await refreshCloudBackupSnapshots()
      setBackupNotice({
        tone: 'success',
        title: 'Cloud backups refreshed',
        detail: `${snapshots.length} cloud snapshots found.`,
      })
    } catch (error) {
      const fallbackStatus = await refreshCloudBackupStatus()
      setBackupNotice({
        tone: 'error',
        title: 'Cloud refresh failed',
        detail: `${getErrorMessage(error)}\n${fallbackStatus.detail}`,
      })
    }
  }, [
    backupDeleting,
    backupExporting,
    backupRestoring,
    cloudBackupBusy,
    cloudBackupStatus.connectionStatus,
    refreshCloudBackupSnapshots,
    refreshCloudBackupStatus,
  ])

  const handleRestoreBackup = useCallback(async () => {
    if (backupDeleting || backupExporting || backupRestoring || cloudBackupBusy) {
      return
    }

    setRestoringBackupFileName(backupSnapshots[0]?.fileName ?? 'latest')
    setBackupNotice(undefined)

    try {
      const result = await restoreLatestBackupSnapshot()
      await refreshPersistedPulls()
      await refreshBackupSnapshots()

      setBackupNotice({
        tone: 'success',
        title: 'Backup restored',
        detail: formatBackupRestoreDetail(result),
      })
    } catch (error) {
      setBackupNotice({
        tone: 'error',
        title: 'Restore failed',
        detail: getErrorMessage(error),
      })
    } finally {
      setRestoringBackupFileName(undefined)
    }
  }, [
    backupExporting,
    backupDeleting,
    backupRestoring,
    backupSnapshots,
    cloudBackupBusy,
    refreshBackupSnapshots,
    refreshPersistedPulls,
  ])

  const handleRestoreBackupSnapshot = useCallback(
    async (fileName: string) => {
      if (backupDeleting || backupExporting || backupRestoring || cloudBackupBusy) {
        return
      }

      setRestoringBackupFileName(fileName)
      setBackupNotice(undefined)

      try {
        const result = await restoreBackupSnapshot(fileName)
        await refreshPersistedPulls()
        await refreshBackupSnapshots()

        setBackupNotice({
          tone: 'success',
          title: 'Backup restored',
          detail: formatBackupRestoreDetail(result),
        })
      } catch (error) {
        setBackupNotice({
          tone: 'error',
          title: 'Restore failed',
          detail: getErrorMessage(error),
        })
      } finally {
        setRestoringBackupFileName(undefined)
      }
    },
    [
      backupExporting,
      backupDeleting,
      backupRestoring,
      cloudBackupBusy,
      refreshBackupSnapshots,
      refreshPersistedPulls,
    ],
  )

  const handleDeleteBackupSnapshot = useCallback(
    async (fileName: string) => {
      if (backupDeleting || backupExporting || backupRestoring || cloudBackupBusy) {
        return
      }

      const confirmed = window.confirm(
        'Delete this local backup snapshot? This only removes the JSON backup file on this device.',
      )

      if (!confirmed) {
        return
      }

      setDeletingBackupFileName(fileName)
      setBackupNotice(undefined)

      try {
        const result = await deleteBackupSnapshot(fileName)
        await refreshBackupSnapshots()

        setBackupNotice({
          tone: 'success',
          title: 'Backup deleted',
          detail: `${result.fileName} deleted. ${result.remainingSnapshots} snapshots left.`,
        })
      } catch (error) {
        setBackupNotice({
          tone: 'error',
          title: 'Delete failed',
          detail: getErrorMessage(error),
        })
      } finally {
        setDeletingBackupFileName(undefined)
      }
    },
    [
      backupDeleting,
      backupExporting,
      backupRestoring,
      cloudBackupBusy,
      refreshBackupSnapshots,
    ],
  )

  return (
    <>
      <main className="app-shell">
        <aside className="sidebar" aria-label="Workspace">
          <div className="brand">
            <div className="brand-mark" aria-hidden="true">
              WT
            </div>
            <div>
              <strong>Warp Tracker</strong>
              <span>Honkai: Star Rail</span>
            </div>
          </div>

          <nav className="sidebar-nav" aria-label="Main navigation">
            <a className="sidebar-link sidebar-link-active" href="#history">
              <Database size={18} aria-hidden="true" />
              History
            </a>
            <a className="sidebar-link" href="#import">
              <Upload size={18} aria-hidden="true" />
              Import
            </a>
            <a className="sidebar-link" href="#backup">
              <Cloud size={18} aria-hidden="true" />
              Backup
            </a>
          </nav>

          <section className="account-panel" aria-label="Selected account">
            <span className="eyebrow">Active UID</span>
            <strong>{activeAccount.uid}</strong>
            <span>Asia server</span>
          </section>
        </aside>

        <section className="workspace">
          <header className="workspace-header">
            <div>
              <span className="eyebrow">Selected banner</span>
              <h1>{getBannerLabel(activeBannerType)}</h1>
            </div>
            <div className="header-actions" aria-label="Quick actions">
              <AppButton icon={RefreshCw}>Sync</AppButton>
              <AppButton
                disabled={
                  backupDeleting ||
                  backupExporting ||
                  backupRestoring ||
                  cloudBackupBusy
                }
                icon={Download}
                onClick={handleExportBackup}
              >
                {backupExporting ? 'Exporting' : 'Export'}
              </AppButton>
              <AppButton icon={Settings} variant="ghost">
                Settings
              </AppButton>
            </div>
          </header>

          <BannerTabs
            activeBannerType={activeBannerType}
            onBannerTypeChange={handleBannerTypeChange}
          />

          <section className="content-grid">
            <div className="primary-column" id="history">
              <PityOverview summary={pitySummary} />
              <WarpTimeline pulls={timelinePulls} />
            </div>

            <aside className="side-column" aria-label="Import and backup">
              <ImportPanel
                manualImportPreview={manualImportPreview}
                onOpenManualImport={() => setManualImportOpen(true)}
              />
              <BackupPanel
                backupCount={backupSnapshots.length}
                cloudSnapshots={cloudBackupSnapshots}
                cloudBackupStatus={cloudBackupStatus}
                deletingFileName={deletingBackupFileName}
                isCloudConnecting={cloudBackupConnecting}
                isCloudDisconnecting={cloudBackupDisconnecting}
                isCloudListing={cloudBackupListing}
                isCloudUploading={cloudBackupUploading}
                isExporting={backupExporting}
                isDeleting={backupDeleting}
                isRestoring={backupRestoring}
                latestBackup={backupSnapshots[0]}
                notice={backupNotice}
                restoringFileName={restoringBackupFileName}
                snapshots={backupSnapshots}
                onConnectGoogleDrive={handleConnectGoogleDrive}
                onDeleteSnapshot={handleDeleteBackupSnapshot}
                onDisconnectGoogleDrive={handleDisconnectGoogleDrive}
                onExportBackup={handleExportBackup}
                onRefreshGoogleDriveBackups={handleRefreshGoogleDriveBackups}
                onRestoreBackup={handleRestoreBackup}
                onRestoreSnapshot={handleRestoreBackupSnapshot}
                onUploadGoogleDriveBackup={handleUploadGoogleDriveBackup}
              />
              <section className="notice-panel" aria-label="Reminder">
                <div className="notice-icon" aria-hidden="true">
                  <Bell size={18} />
                </div>
                <div>
                  <strong>History window</strong>
                  <span>No reminder set</span>
                </div>
              </section>
            </aside>
          </section>
        </section>
      </main>

      <ManualImportDialog
        isOpen={manualImportOpen}
        isSaving={manualImportSaving}
        note={manualNoteDraft}
        onSave={handleSaveManualImport}
        onClose={() => setManualImportOpen(false)}
        onNoteChange={handleManualNoteChange}
        onSaveNoticeClose={() => setManualImportSaveNotice(undefined)}
        fallbackBannerType={activeBannerType}
        preview={manualImportPreview}
        saveNotice={manualImportSaveNotice}
      />
    </>
  )
}

export default App

function formatBackupExportDetail(result: ExportBackupSnapshotResult) {
  return [
    `${result.warpPulls} pulls, ${result.warpItems} catalog items, ${result.importBatches} import batches.`,
    `Saved to ${result.backupPath}`,
  ].join('\n')
}

function formatBackupRestoreDetail(result: RestoreBackupSnapshotResult) {
  return [
    `${result.warpPullsInserted} inserted, ${result.duplicateWarpPulls} skipped as duplicates.`,
    `${result.recomputedBanners} banner pity groups recomputed.`,
    `Restored from ${result.backupPath}`,
  ].join('\n')
}

function formatCloudBackupUploadDetail(
  result: UploadCloudBackupSnapshotResult,
) {
  return [
    `${result.fileName} uploaded to Google Drive app data.`,
    `${result.bytesUploaded} bytes uploaded. Remote file id: ${result.remoteFileId}.`,
    result.remoteModifiedTime
      ? `Modified at ${result.remoteModifiedTime}.`
      : `Local file: ${result.localBackupPath}`,
  ].join('\n')
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }

  if (typeof error === 'string') {
    return error
  }

  return 'Unexpected import error.'
}
