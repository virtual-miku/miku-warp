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
  type BackupNotice,
} from '../features/backup/components/BackupPanel'
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
  listBackupSnapshots,
  type BackupSnapshotSummary,
  exportBackupSnapshot,
  type ExportBackupSnapshotResult,
  restoreBackupSnapshot,
  restoreLatestBackupSnapshot,
  type RestoreBackupSnapshotResult,
} from '../features/persistence/data/backup-export'
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
  const [restoringBackupFileName, setRestoringBackupFileName] =
    useState<string>()
  const [backupNotice, setBackupNotice] = useState<BackupNotice>()
  const [backupSnapshots, setBackupSnapshots] = useState<
    BackupSnapshotSummary[]
  >([])
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
  const backupRestoring = restoringBackupFileName !== undefined

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
    if (backupExporting || backupRestoring) {
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
  }, [backupExporting, backupRestoring, refreshBackupSnapshots])

  const handleRestoreBackup = useCallback(async () => {
    if (backupExporting || backupRestoring) {
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
    backupRestoring,
    backupSnapshots,
    refreshBackupSnapshots,
    refreshPersistedPulls,
  ])

  const handleRestoreBackupSnapshot = useCallback(
    async (fileName: string) => {
      if (backupExporting || backupRestoring) {
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
      backupRestoring,
      refreshBackupSnapshots,
      refreshPersistedPulls,
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
                disabled={backupExporting || backupRestoring}
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
                isExporting={backupExporting}
                isRestoring={backupRestoring}
                latestBackup={backupSnapshots[0]}
                notice={backupNotice}
                restoringFileName={restoringBackupFileName}
                snapshots={backupSnapshots}
                onExportBackup={handleExportBackup}
                onRestoreBackup={handleRestoreBackup}
                onRestoreSnapshot={handleRestoreBackupSnapshot}
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

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }

  if (typeof error === 'string') {
    return error
  }

  return 'Unexpected import error.'
}
