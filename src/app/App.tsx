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
  createInitialGoogleDriveBackupPolicy,
  createInitialGoogleDriveBackupStatus,
  type CloudBackupPolicy,
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
  replaceDatabaseFromBackupFile,
  restoreBackupSnapshot,
  restoreLatestBackupSnapshot,
  selectBackupJsonFile,
  type RestoreBackupSnapshotResult,
} from '../features/persistence/data/backup-export'
import {
  connectGoogleDriveBackup,
  disconnectGoogleDriveBackup,
  getCloudBackupPolicy,
  getCloudBackupStatus,
  listGoogleDriveBackupSnapshots,
  restoreGoogleDriveBackupSnapshot,
  updateCloudBackupPolicy,
  uploadLatestGoogleDriveBackup,
  type UploadCloudBackupSnapshotResult,
} from '../features/persistence/data/cloud-backup-status'
import {
  importGameHistory,
  scanGameHistorySource,
  type ImportGameHistoryResult,
  type GameHistorySourceScanResult,
} from '../features/persistence/data/game-history-source'
import {
  loadGameInstallPath,
  saveGameInstallPath,
  selectGameInstallPath,
} from '../features/persistence/data/game-install-path'
import { syncWarpItemCatalog } from '../features/persistence/data/warp-item-catalog-sync'
import {
  deleteAccountWarpHistory,
  deleteWarpPull,
  listAccounts,
  listWarpBannerSummaries,
  listWarpPulls,
  type WarpAccount,
  type WarpBannerSummary,
} from '../features/persistence/data/warp-pull-history'
import {
  loadActiveAccount,
  saveActiveAccount,
} from '../features/persistence/data/active-account'
import { BannerStatsPanel } from '../features/warp-history/components/BannerStatsPanel'
import { BannerSummaryGrid } from '../features/warp-history/components/BannerSummaryGrid'
import { BannerTabs } from '../features/warp-history/components/BannerTabs'
import { PityOverview } from '../features/warp-history/components/PityOverview'
import {
  WarpTimeline,
  type TimelineRarityFilter,
} from '../features/warp-history/components/WarpTimeline'
import { itemCatalog } from '../features/warp-history/data/item-catalog'
import {
  getBannerFilterLabel,
  type BannerFilterType,
  type BannerType,
} from '../features/warp-history/domain/banner'
import {
  annotatePityAtPull,
  calculatePitySummary,
} from '../features/warp-history/domain/pity'
import type { WarpPull } from '../features/warp-history/domain/warp-pull'
import { AppButton } from '../shared/ui/AppButton'
import './App.css'

const defaultBannerType = 'character_event' satisfies BannerFilterType
const defaultManualFallbackBannerType = 'character_event' satisfies BannerType
const historyPageSize = 5
const defaultAccount: ManualImportAccountInput = {
  id: 'account-800000000',
  uid: '800000000',
  region: 'asia',
  nickname: 'Trailblazer',
}

export function App() {
  const [activeBannerType, setActiveBannerType] =
    useState<BannerFilterType>(defaultBannerType)
  const [manualImportOpen, setManualImportOpen] = useState(false)
  const [manualImportSaving, setManualImportSaving] = useState(false)
  const [manualImportSaveNotice, setManualImportSaveNotice] =
    useState<ManualImportSaveNotice>()
  const [backupExporting, setBackupExporting] = useState(false)
  const [backupImporting, setBackupImporting] = useState(false)
  const [deletingBackupFileName, setDeletingBackupFileName] = useState<string>()
  const [restoringBackupFileName, setRestoringBackupFileName] =
    useState<string>()
  const [restoringCloudBackupFileId, setRestoringCloudBackupFileId] =
    useState<string>()
  const [backupNotice, setBackupNotice] = useState<BackupNotice>()
  const [cloudBackupConnecting, setCloudBackupConnecting] = useState(false)
  const [cloudBackupDisconnecting, setCloudBackupDisconnecting] =
    useState(false)
  const [cloudBackupListing, setCloudBackupListing] = useState(false)
  const [cloudBackupPolicyUpdating, setCloudBackupPolicyUpdating] =
    useState(false)
  const [cloudBackupUploading, setCloudBackupUploading] = useState(false)
  const [backupSnapshots, setBackupSnapshots] = useState<
    BackupSnapshotSummary[]
  >([])
  const [cloudBackupSnapshots, setCloudBackupSnapshots] = useState<
    CloudBackupSnapshotInfo[]
  >([])
  const [gameHistoryScan, setGameHistoryScan] =
    useState<GameHistorySourceScanResult>()
  const [gameHistoryImporting, setGameHistoryImporting] = useState(false)
  const [gameHistoryImportResult, setGameHistoryImportResult] =
    useState<ImportGameHistoryResult>()
  const [gameHistoryImportError, setGameHistoryImportError] = useState<string>()
  const [gameHistoryPathError, setGameHistoryPathError] = useState<string>()
  const [gameHistoryScanning, setGameHistoryScanning] = useState(false)
  const [gamePathSelecting, setGamePathSelecting] = useState(false)
  const [gameInstallPath, setGameInstallPath] = useState(loadGameInstallPath)
  const [activeAccount, setActiveAccount] =
    useState<ManualImportAccountInput>(() => loadActiveAccount(defaultAccount))
  const [accounts, setAccounts] = useState<WarpAccount[]>([])
  const [cloudBackupStatus, setCloudBackupStatus] =
    useState<CloudBackupStatus>(() => createInitialGoogleDriveBackupStatus())
  const [cloudBackupPolicy, setCloudBackupPolicy] =
    useState<CloudBackupPolicy>(() => createInitialGoogleDriveBackupPolicy())
  const [manualNoteDraft, setManualNoteDraft] = useState(manualNoteSample)
  const [persistedPulls, setPersistedPulls] = useState<WarpPull[]>([])
  const [historyTotalPulls, setHistoryTotalPulls] = useState(0)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [deletingHistoryPullId, setDeletingHistoryPullId] = useState<string>()
  const [deletingAllHistory, setDeletingAllHistory] = useState(false)
  const [historyPage, setHistoryPage] = useState(1)
  const [historySearchQuery, setHistorySearchQuery] = useState('')
  const [historyRarityFilter, setHistoryRarityFilter] =
    useState<TimelineRarityFilter>('all')
  const [bannerSummaries, setBannerSummaries] = useState<WarpBannerSummary[]>(
    [],
  )
  const manualImportPreview = useMemo(
    () => parseManualWarpNote(manualNoteDraft, itemCatalog),
    [manualNoteDraft],
  )
  const timelinePulls = useMemo(
    () => annotatePityAtPull(persistedPulls),
    [persistedPulls],
  )
  const activeBannerSummary = useMemo(
    () =>
      activeBannerType === 'all'
        ? undefined
        : bannerSummaries.find(
            (summary) => summary.bannerType === activeBannerType,
          ),
    [activeBannerType, bannerSummaries],
  )
  const activeAccountSummary = useMemo(
    () => accounts.find((account) => account.id === activeAccount.id),
    [accounts, activeAccount.id],
  )
  const activeAccountPullCount = activeAccountSummary?.totalPulls ?? historyTotalPulls
  const pitySummary = useMemo(
    () =>
      activeBannerSummary
        ? {
            totalPulls: activeBannerSummary.totalPulls,
            currentFourStarPity: activeBannerSummary.currentFourStarPity,
            currentFiveStarPity: activeBannerSummary.currentFiveStarPity,
            fourStarCount: activeBannerSummary.fourStarCount,
            fiveStarCount: activeBannerSummary.fiveStarCount,
            lastFourStarName: activeBannerSummary.lastFourStarName,
            lastFiveStarName: activeBannerSummary.lastFiveStarName,
          }
        : calculatePitySummary(timelinePulls),
    [activeBannerSummary, timelinePulls],
  )
  const backupDeleting = deletingBackupFileName !== undefined
  const backupRestoring = restoringBackupFileName !== undefined
  const cloudBackupRestoring = restoringCloudBackupFileId !== undefined
  const cloudBackupBusy =
    cloudBackupConnecting ||
    cloudBackupDisconnecting ||
    cloudBackupListing ||
    cloudBackupPolicyUpdating ||
    cloudBackupRestoring ||
    cloudBackupUploading
  const manualFallbackBannerType =
    activeBannerType === 'all' ? defaultManualFallbackBannerType : activeBannerType

  const fetchPersistedPulls = useCallback(() => {
    return listWarpPulls({
      accountId: activeAccount.id,
      bannerType: activeBannerType === 'all' ? undefined : activeBannerType,
      limit: historyPageSize,
      offset: (historyPage - 1) * historyPageSize,
      rarity: historyRarityFilter === 'all' ? undefined : historyRarityFilter,
      search: historySearchQuery,
    })
  }, [activeAccount.id, activeBannerType, historyPage, historyRarityFilter, historySearchQuery])

  const fetchHistoryForAccount = useCallback(
    (accountId: string, page = historyPage) => {
      return Promise.all([
        listWarpPulls({
          accountId,
          bannerType: activeBannerType === 'all' ? undefined : activeBannerType,
          limit: historyPageSize,
          offset: (page - 1) * historyPageSize,
          rarity:
            historyRarityFilter === 'all' ? undefined : historyRarityFilter,
          search: historySearchQuery,
        }),
        listWarpBannerSummaries({ accountId }),
      ])
    },
    [activeBannerType, historyPage, historyRarityFilter, historySearchQuery],
  )

  const refreshPersistedPulls = useCallback(async () => {
    try {
      const pulls = await fetchPersistedPulls()
      setPersistedPulls(pulls.pulls)
      setHistoryTotalPulls(pulls.total)
    } catch {
      setPersistedPulls([])
      setHistoryTotalPulls(0)
    }
  }, [fetchPersistedPulls])

  const refreshBannerSummaries = useCallback(async () => {
    try {
      const summaries = await listWarpBannerSummaries({
        accountId: activeAccount.id,
      })
      setBannerSummaries(summaries)
      return summaries
    } catch {
      setBannerSummaries([])
      return []
    }
  }, [activeAccount.id])

  const refreshWarpHistory = useCallback(async () => {
    await Promise.all([refreshPersistedPulls(), refreshBannerSummaries()])
  }, [refreshBannerSummaries, refreshPersistedPulls])

  const refreshAccounts = useCallback(async () => {
    try {
      const nextAccounts = await listAccounts()
      setAccounts(nextAccounts)
      return nextAccounts
    } catch {
      setAccounts([])
      return []
    }
  }, [])

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
      .then((result) => {
        if (isActive) {
          setPersistedPulls(result.pulls)
          setHistoryTotalPulls(result.total)

          const pageCount = Math.max(1, Math.ceil(result.total / historyPageSize))
          if (historyPage > pageCount) {
            setHistoryPage(pageCount)
          }
        }
      })
      .catch(() => {
        if (isActive) {
          setPersistedPulls([])
          setHistoryTotalPulls(0)
        }
      })
      .finally(() => {
        if (isActive) {
          setHistoryLoading(false)
        }
      })

    return () => {
      isActive = false
    }
  }, [fetchPersistedPulls, historyPage])

  useEffect(() => {
    let isActive = true

    listWarpBannerSummaries({ accountId: activeAccount.id })
      .then((summaries) => {
        if (isActive) {
          setBannerSummaries(summaries)
        }
      })
      .catch(() => {
        if (isActive) {
          setBannerSummaries([])
        }
      })

    return () => {
      isActive = false
    }
  }, [activeAccount.id])

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

    listAccounts()
      .then((nextAccounts) => {
        if (isActive) {
          setAccounts(nextAccounts)
        }
      })
      .catch(() => {
        if (isActive) {
          setAccounts([])
        }
      })

    return () => {
      isActive = false
    }
  }, [])

  useEffect(() => {
    let isActive = true

    getCloudBackupPolicy()
      .then((policy) => {
        if (isActive) {
          setCloudBackupPolicy(policy)
        }
      })
      .catch(() => {
        if (isActive) {
          setCloudBackupPolicy(createInitialGoogleDriveBackupPolicy())
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

  const handleScanGameHistorySource = useCallback(async () => {
    if (gameHistoryScanning) {
      return
    }

    setGameHistoryScanning(true)
    setGameHistoryPathError(undefined)

    try {
      const result = await scanGameHistorySource({ gamePath: gameInstallPath })
      setGameHistoryScan(result)
    } catch (error) {
      setGameHistoryScan({
        status: 'not_found',
        cacheFilesChecked: 0,
        candidateRoots: [],
        detail: getErrorMessage(error),
      })
    } finally {
      setGameHistoryScanning(false)
    }
  }, [gameHistoryScanning, gameInstallPath])

  const handleSelectGamePath = useCallback(async () => {
    if (gamePathSelecting || gameHistoryScanning || gameHistoryImporting) {
      return
    }

    setGamePathSelecting(true)
    setGameHistoryPathError(undefined)

    try {
      const selectedPath = await selectGameInstallPath(gameInstallPath)

      if (selectedPath) {
        setGameInstallPath(selectedPath)
        saveGameInstallPath(selectedPath)
        setGameHistoryScan(undefined)
        setGameHistoryImportResult(undefined)
        setGameHistoryImportError(undefined)
      }
    } catch (error) {
      setGameHistoryPathError(getErrorMessage(error))
    } finally {
      setGamePathSelecting(false)
    }
  }, [
    gameHistoryImporting,
    gameHistoryScanning,
    gameInstallPath,
    gamePathSelecting,
  ])

  const handleImportGameHistory = useCallback(async () => {
    if (gameHistoryImporting) {
      return
    }

    setGameHistoryImporting(true)
    setHistoryLoading(true)
    setGameHistoryImportError(undefined)
    setGameHistoryImportResult(undefined)

    try {
      await syncWarpItemCatalog(itemCatalog)
      const result = await importGameHistory({
        account: activeAccount,
        gamePath: gameInstallPath,
        maxPagesPerBanner: 200,
      })
      setGameHistoryImportResult(result)
      const nextAccount = {
        ...activeAccount,
        id: result.accountId,
        uid: result.uid,
      }
      setActiveAccount(nextAccount)
      saveActiveAccount(nextAccount)
      const [pulls, summaries] = await Promise.all([
        listWarpPulls({
          accountId: result.accountId,
          bannerType: activeBannerType === 'all' ? undefined : activeBannerType,
          limit: historyPageSize,
          offset: (historyPage - 1) * historyPageSize,
          rarity: historyRarityFilter === 'all' ? undefined : historyRarityFilter,
          search: historySearchQuery,
        }),
        listWarpBannerSummaries({ accountId: result.accountId }),
      ])
      setPersistedPulls(pulls.pulls)
      setHistoryTotalPulls(pulls.total)
      setBannerSummaries(summaries)
      await refreshAccounts()
    } catch (error) {
      setGameHistoryImportError(getErrorMessage(error))
    } finally {
      setGameHistoryImporting(false)
      setHistoryLoading(false)
    }
  }, [
    activeAccount,
    activeBannerType,
    gameHistoryImporting,
    gameInstallPath,
    historyPage,
    historyRarityFilter,
    historySearchQuery,
    refreshAccounts,
  ])

  const handleBannerTypeChange = (bannerType: BannerFilterType) => {
    if (bannerType === activeBannerType) {
      return
    }

    setActiveBannerType(bannerType)
    setHistoryLoading(true)
    setHistoryPage(1)
    setPersistedPulls([])
    setManualImportSaveNotice(undefined)
  }

  const handleAccountChange = (accountId: string) => {
    const account = accounts.find((candidate) => candidate.id === accountId)

    if (!account || account.id === activeAccount.id) {
      return
    }

    const nextAccount = {
      id: account.id,
      uid: account.uid,
      region: account.region ?? 'asia',
      nickname: account.nickname ?? 'Trailblazer',
    }

    setActiveAccount(nextAccount)
    saveActiveAccount(nextAccount)
    setHistoryLoading(true)
    setHistoryPage(1)
    setPersistedPulls([])
    setHistoryTotalPulls(0)
    setManualImportSaveNotice(undefined)
  }

  const handleDeleteHistoryPull = useCallback(
    async (pull: WarpPull) => {
      if (deletingHistoryPullId || deletingAllHistory) {
        return
      }

      const confirmed = window.confirm(
        `Delete ${pull.itemName} from UID ${activeAccount.uid} history? This cannot be undone.`,
      )

      if (!confirmed) {
        return
      }

      setDeletingHistoryPullId(pull.id)

      try {
        await deleteWarpPull(activeAccount.id, pull.id)
        await refreshWarpHistory()
        await refreshAccounts()
      } finally {
        setDeletingHistoryPullId(undefined)
      }
    },
    [
      activeAccount.id,
      activeAccount.uid,
      deletingAllHistory,
      deletingHistoryPullId,
      refreshAccounts,
      refreshWarpHistory,
    ],
  )

  const handleDeleteAllHistory = useCallback(async () => {
    if (deletingAllHistory || deletingHistoryPullId || activeAccountPullCount === 0) {
      return
    }

    const confirmed = window.confirm(
      `Delete all ${activeAccountPullCount} local history records for UID ${activeAccount.uid}? This cannot be undone.`,
    )

    if (!confirmed) {
      return
    }

    setDeletingAllHistory(true)
    setHistoryLoading(true)

    try {
      await deleteAccountWarpHistory(activeAccount.id)
      setHistoryPage(1)
      await refreshWarpHistory()
      await refreshAccounts()
    } finally {
      setDeletingAllHistory(false)
      setHistoryLoading(false)
    }
  }, [
    activeAccount.id,
    activeAccount.uid,
    activeAccountPullCount,
    deletingAllHistory,
    deletingHistoryPullId,
    refreshAccounts,
    refreshWarpHistory,
  ])

  async function runAutoBackupAfterManualImport(insertedPulls: number) {
    if (!cloudBackupPolicy.autoBackupEnabled) {
      return undefined
    }

    if (insertedPulls < 1) {
      return 'Auto backup skipped: no new pulls.'
    }

    if (!cloudBackupStatus.canUpload) {
      const detail = 'Auto backup skipped: Google Drive is not ready.'

      setBackupNotice({
        tone: 'error',
        title: 'Auto backup skipped',
        detail,
      })

      return detail
    }

    setBackupNotice(undefined)
    setBackupExporting(true)
    setCloudBackupUploading(true)

    try {
      const exportResult = await exportBackupSnapshot()
      await refreshBackupSnapshots()

      const uploadResult = await uploadLatestGoogleDriveBackup()
      await refreshCloudBackupStatus()
      await refreshCloudBackupSnapshots().catch(() => undefined)

      setBackupNotice({
        tone: 'success',
        title: 'Auto backup complete',
        detail: [
          formatCloudBackupUploadDetail(uploadResult),
          `Local snapshot: ${exportResult.backupPath}`,
        ].join('\n'),
      })

      return `Auto backup uploaded ${uploadResult.remoteFileName}.`
    } catch (error) {
      const fallbackStatus = await refreshCloudBackupStatus()
      const detail = `${getErrorMessage(error)}\n${fallbackStatus.detail}`

      setBackupNotice({
        tone: 'error',
        title: 'Auto backup failed',
        detail,
      })

      return `Auto backup failed: ${getErrorMessage(error)}`
    } finally {
      setBackupExporting(false)
      setCloudBackupUploading(false)
    }
  }

  const handleSaveManualImport = async () => {
    if (manualImportSaving) {
      return
    }

    const draft = buildManualImportDraft(manualImportPreview, {
      accountId: activeAccount.id,
      fallbackBannerType: manualFallbackBannerType,
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
      await refreshWarpHistory()
      await refreshAccounts()
      const autoBackupDetail = await runAutoBackupAfterManualImport(
        result.recordsInserted,
      )

      setManualImportSaveNotice({
        tone: 'success',
        title: 'Saved',
        detail: [
          `${result.recordsInserted} inserted, ${result.recordsSkipped} skipped, ${result.duplicateRecords} duplicates. Catalog ${catalogResult.totalInDatabase} items.`,
          autoBackupDetail,
        ]
          .filter(Boolean)
          .join('\n'),
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
    if (backupDeleting || backupExporting || backupImporting || backupRestoring || cloudBackupBusy) {
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
    backupImporting,
    backupRestoring,
    cloudBackupBusy,
    refreshBackupSnapshots,
  ])

  const handleImportBackupJson = useCallback(async () => {
    if (backupDeleting || backupExporting || backupImporting || backupRestoring || cloudBackupBusy) {
      return
    }

    const filePath = await selectBackupJsonFile()

    if (!filePath) {
      return
    }

    const confirmed = window.confirm(
      'Import this JSON backup and replace all current local warp history with the file contents?',
    )

    if (!confirmed) {
      return
    }

    setBackupImporting(true)
    setBackupNotice(undefined)
    setHistoryLoading(true)

    try {
      const result = await replaceDatabaseFromBackupFile(filePath)
      const nextAccounts = await refreshAccounts()
      const nextAccount = nextAccounts[0]

      if (nextAccount) {
        const account = {
          id: nextAccount.id,
          uid: nextAccount.uid,
          region: nextAccount.region ?? 'asia',
          nickname: nextAccount.nickname ?? 'Trailblazer',
        }
        setActiveAccount(account)
        saveActiveAccount(account)
      }

      setHistoryPage(1)
      if (nextAccount) {
        const [pulls, summaries] = await fetchHistoryForAccount(nextAccount.id, 1)
        setPersistedPulls(pulls.pulls)
        setHistoryTotalPulls(pulls.total)
        setBannerSummaries(summaries)
      } else {
        setPersistedPulls([])
        setHistoryTotalPulls(0)
        setBannerSummaries([])
      }
      await refreshBackupSnapshots()

      setBackupNotice({
        tone: 'success',
        title: 'JSON imported',
        detail: formatBackupReplaceDetail(result),
      })
    } catch (error) {
      setBackupNotice({
        tone: 'error',
        title: 'JSON import failed',
        detail: getErrorMessage(error),
      })
    } finally {
      setBackupImporting(false)
      setHistoryLoading(false)
    }
  }, [
    backupDeleting,
    backupExporting,
    backupImporting,
    backupRestoring,
    cloudBackupBusy,
    fetchHistoryForAccount,
    refreshAccounts,
    refreshBackupSnapshots,
  ])

  const handleConnectGoogleDrive = useCallback(async () => {
    if (
      backupDeleting ||
      backupExporting ||
      backupImporting ||
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
    backupImporting,
    backupRestoring,
    cloudBackupBusy,
    cloudBackupStatus.canConnect,
    refreshCloudBackupSnapshots,
    refreshCloudBackupStatus,
  ])

  const handleAutoBackupPolicyChange = useCallback(
    async (enabled: boolean) => {
      if (cloudBackupPolicyUpdating) {
        return
      }

      if (enabled && !cloudBackupStatus.canUpload) {
        setBackupNotice({
          tone: 'error',
          title: 'Auto backup unavailable',
          detail: 'Connect Google Drive before enabling automatic backup.',
        })
        return
      }

      setCloudBackupPolicyUpdating(true)
      setBackupNotice(undefined)

      try {
        const policy = await updateCloudBackupPolicy({
          provider: 'google_drive',
          autoBackupEnabled: enabled,
        })
        setCloudBackupPolicy(policy)
        setBackupNotice({
          tone: 'success',
          title: 'Auto backup updated',
          detail: enabled
            ? 'Automatic backup will run after manual imports with new pulls.'
            : 'Automatic backup is off.',
        })
      } catch (error) {
        setBackupNotice({
          tone: 'error',
          title: 'Auto backup update failed',
          detail: getErrorMessage(error),
        })
      } finally {
        setCloudBackupPolicyUpdating(false)
      }
    },
    [
      cloudBackupPolicyUpdating,
      cloudBackupStatus.canUpload,
      setCloudBackupPolicy,
    ],
  )

  const handleDisconnectGoogleDrive = useCallback(async () => {
    if (
      backupDeleting ||
      backupExporting ||
      backupImporting ||
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
    backupImporting,
    backupRestoring,
    cloudBackupBusy,
    cloudBackupStatus.canDisconnect,
    refreshCloudBackupStatus,
  ])

  const handleUploadGoogleDriveBackup = useCallback(async () => {
    if (
      backupDeleting ||
      backupExporting ||
      backupImporting ||
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
    backupImporting,
    backupRestoring,
    cloudBackupBusy,
    cloudBackupStatus.canUpload,
    refreshCloudBackupStatus,
    refreshCloudBackupSnapshots,
  ])

  const handleRestoreGoogleDriveBackup = useCallback(
    async (snapshot: CloudBackupSnapshotInfo) => {
      if (
        backupDeleting ||
        backupExporting ||
        backupImporting ||
        backupRestoring ||
        cloudBackupBusy ||
        cloudBackupStatus.connectionStatus !== 'connected'
      ) {
        return
      }

      const { remoteFileId } = snapshot
      const confirmed = window.confirm(
        'Restore this cloud backup snapshot? Existing matching pulls will be skipped as duplicates.',
      )

      if (!confirmed) {
        return
      }

      setRestoringCloudBackupFileId(remoteFileId)
      setBackupNotice(undefined)

      try {
        const result = await restoreGoogleDriveBackupSnapshot(snapshot)
        await refreshWarpHistory()
        await refreshAccounts()

        setBackupNotice({
          tone: 'success',
          title: 'Cloud backup restored',
          detail: formatBackupRestoreDetail(result),
        })
      } catch (error) {
        const fallbackStatus = await refreshCloudBackupStatus()
        setBackupNotice({
          tone: 'error',
          title: 'Cloud restore failed',
          detail: `${getErrorMessage(error)}\n${fallbackStatus.detail}`,
        })
      } finally {
        setRestoringCloudBackupFileId(undefined)
      }
    },
    [
      backupDeleting,
      backupExporting,
      backupImporting,
      backupRestoring,
      cloudBackupBusy,
      cloudBackupStatus.connectionStatus,
      refreshCloudBackupStatus,
      refreshAccounts,
      refreshWarpHistory,
    ],
  )

  const handleRefreshGoogleDriveBackups = useCallback(async () => {
    if (
      backupDeleting ||
      backupExporting ||
      backupImporting ||
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
    backupImporting,
    backupRestoring,
    cloudBackupBusy,
    cloudBackupStatus.connectionStatus,
    refreshCloudBackupSnapshots,
    refreshCloudBackupStatus,
  ])

  const handleRestoreBackup = useCallback(async () => {
    if (backupDeleting || backupExporting || backupImporting || backupRestoring || cloudBackupBusy) {
      return
    }

    setRestoringBackupFileName(backupSnapshots[0]?.fileName ?? 'latest')
    setBackupNotice(undefined)

    try {
      const result = await restoreLatestBackupSnapshot()
      await refreshWarpHistory()
      await refreshAccounts()
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
    backupImporting,
    backupDeleting,
    backupRestoring,
    backupSnapshots,
    cloudBackupBusy,
    refreshAccounts,
    refreshBackupSnapshots,
    refreshWarpHistory,
  ])

  const handleRestoreBackupSnapshot = useCallback(
    async (fileName: string) => {
      if (backupDeleting || backupExporting || backupImporting || backupRestoring || cloudBackupBusy) {
        return
      }

      setRestoringBackupFileName(fileName)
      setBackupNotice(undefined)

      try {
        const result = await restoreBackupSnapshot(fileName)
        await refreshWarpHistory()
        await refreshAccounts()
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
      backupImporting,
      backupDeleting,
      backupRestoring,
      cloudBackupBusy,
      refreshAccounts,
      refreshBackupSnapshots,
      refreshWarpHistory,
    ],
  )

  const handleDeleteBackupSnapshot = useCallback(
    async (fileName: string) => {
      if (backupDeleting || backupExporting || backupImporting || backupRestoring || cloudBackupBusy) {
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
      backupImporting,
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
            <span>{formatAccountMeta(activeAccountSummary)}</span>
            {accounts.length > 0 ? (
              <select
                aria-label="Switch active UID"
                className="account-select"
                onChange={(event) => handleAccountChange(event.target.value)}
                value={activeAccount.id}
              >
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.uid} - {account.totalPulls} pulls
                  </option>
                ))}
              </select>
            ) : null}
          </section>
        </aside>

        <section className="workspace">
          <header className="workspace-header">
            <div>
              <span className="eyebrow">Selected banner</span>
              <h1>{getBannerFilterLabel(activeBannerType)}</h1>
            </div>
            <div className="header-actions" aria-label="Quick actions">
              <AppButton icon={RefreshCw}>Sync</AppButton>
              <AppButton
                disabled={
                  backupDeleting ||
                  backupExporting ||
                  backupImporting ||
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
            summaries={bannerSummaries}
            onBannerTypeChange={handleBannerTypeChange}
          />

          <section className="content-grid">
            <div className="primary-column" id="history">
              <BannerSummaryGrid
                activeBannerType={activeBannerType}
                summaries={bannerSummaries}
                onBannerTypeChange={handleBannerTypeChange}
              />
              {activeBannerType === 'all' ? null : (
                <>
                  <PityOverview summary={pitySummary} />
                  <BannerStatsPanel
                    bannerType={activeBannerType}
                    summary={activeBannerSummary}
                  />
                </>
              )}
              <WarpTimeline
                pulls={timelinePulls}
                page={historyPage}
                pageSize={historyPageSize}
                rarityFilter={historyRarityFilter}
                searchQuery={historySearchQuery}
                totalPulls={historyTotalPulls}
                isLoading={historyLoading}
                canDeleteAll={activeAccountPullCount > 0}
                deletingPullId={deletingHistoryPullId}
                isDeletingAll={deletingAllHistory}
                showBannerLabel={activeBannerType === 'all'}
                onDeleteAll={handleDeleteAllHistory}
                onDeletePull={handleDeleteHistoryPull}
                onPageChange={(page) => {
                  setHistoryLoading(true)
                  setHistoryPage(page)
                }}
                onRarityFilterChange={(rarityFilter) => {
                  setHistoryLoading(true)
                  setHistoryRarityFilter(rarityFilter)
                  setHistoryPage(1)
                }}
                onSearchQueryChange={(searchQuery) => {
                  setHistoryLoading(true)
                  setHistorySearchQuery(searchQuery)
                  setHistoryPage(1)
                }}
              />
            </div>

            <aside className="side-column" aria-label="Import and backup">
              <ImportPanel
                gameHistoryImportError={gameHistoryImportError}
                gameHistoryImportResult={gameHistoryImportResult}
                gameHistoryPathError={gameHistoryPathError}
                gameHistoryScan={gameHistoryScan}
                gameInstallPath={gameInstallPath}
                isGameHistoryImporting={gameHistoryImporting}
                isGameHistoryScanning={gameHistoryScanning}
                isGamePathSelecting={gamePathSelecting}
                manualImportPreview={manualImportPreview}
                onImportGameHistory={handleImportGameHistory}
                onSelectGamePath={handleSelectGamePath}
                onScanGameHistory={handleScanGameHistorySource}
                onOpenManualImport={() => setManualImportOpen(true)}
              />
              <BackupPanel
                backupCount={backupSnapshots.length}
                cloudBackupPolicy={cloudBackupPolicy}
                cloudSnapshots={cloudBackupSnapshots}
                cloudBackupStatus={cloudBackupStatus}
                deletingFileName={deletingBackupFileName}
                isCloudConnecting={cloudBackupConnecting}
                isCloudDisconnecting={cloudBackupDisconnecting}
                isCloudListing={cloudBackupListing}
                isCloudPolicyUpdating={cloudBackupPolicyUpdating}
                isCloudRestoring={cloudBackupRestoring}
                isCloudUploading={cloudBackupUploading}
                isExporting={backupExporting}
                isImporting={backupImporting}
                isDeleting={backupDeleting}
                isRestoring={backupRestoring}
                latestBackup={backupSnapshots[0]}
                notice={backupNotice}
                restoringCloudFileId={restoringCloudBackupFileId}
                restoringFileName={restoringBackupFileName}
                snapshots={backupSnapshots}
                onAutoBackupPolicyChange={handleAutoBackupPolicyChange}
                onConnectGoogleDrive={handleConnectGoogleDrive}
                onDeleteSnapshot={handleDeleteBackupSnapshot}
                onDisconnectGoogleDrive={handleDisconnectGoogleDrive}
                onExportBackup={handleExportBackup}
                onImportBackupJson={handleImportBackupJson}
                onRefreshGoogleDriveBackups={handleRefreshGoogleDriveBackups}
                onRestoreGoogleDriveBackup={handleRestoreGoogleDriveBackup}
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
        fallbackBannerType={manualFallbackBannerType}
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

function formatBackupReplaceDetail(result: RestoreBackupSnapshotResult) {
  return [
    `${result.warpPullsInserted} pulls imported from JSON.`,
    `${result.accounts} accounts and ${result.importBatches} import batches restored.`,
    `Current local history was replaced from ${result.backupPath}.`,
  ].join('\n')
}

function formatAccountMeta(account: WarpAccount | undefined) {
  if (!account) {
    return 'Asia server'
  }

  const region = account.region ?? 'asia'
  const pulls = account.totalPulls === 1 ? '1 pull' : `${account.totalPulls} pulls`

  return `${region.toUpperCase()} - ${pulls}`
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
