import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import {
  Cloud,
  FileInput,
  LayoutDashboard,
  RefreshCcw,
  Trash2,
  UsersRound,
  X,
} from 'lucide-react'
import { AccountManagementPanel } from '../features/accounts/components/AccountManagementPanel'
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
import {
  ImportDialog,
  ImportPanel,
} from '../features/import/components/ImportPanel'
import {
  ManualImportDialog,
  type ManualImportTargetAccount,
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
  listTrashedBackupSnapshots,
  listBackupSnapshots,
  type BackupSnapshotSummary,
  exportBackupSnapshot,
  type ExportBackupSnapshotResult,
  permanentlyDeleteTrashedBackupSnapshot,
  replaceDatabaseFromBackupFile,
  restoreBackupSnapshot,
  restoreTrashedBackupSnapshot,
  selectBackupJsonFile,
  type TrashedBackupSnapshotSummary,
  type RestoreBackupSnapshotResult,
} from '../features/persistence/data/backup-export'
import {
  cancelGoogleDriveBackupConnection,
  connectGoogleDriveBackup,
  disconnectGoogleDriveBackup,
  getAutoBackupSyncStatus,
  getCloudBackupPolicy,
  getCloudBackupStatus,
  listGoogleDriveBackupSnapshots,
  restoreGoogleDriveBackupSnapshot,
  runAutoBackup,
  updateCloudBackupPolicy,
  uploadLatestGoogleDriveBackup,
  type AutoBackupSyncStatus,
  type UploadCloudBackupSnapshotResult,
} from '../features/persistence/data/cloud-backup-status'
import {
  importGameHistory,
  scanGameHistorySource,
  type ImportGameHistoryResult,
  type GameHistorySourceScanResult,
} from '../features/persistence/data/game-history-source'
import {
  findGameInstallPaths,
  loadGameInstallPath,
  saveGameInstallPath,
  selectGameInstallPath,
  validateGameInstallPath,
  type GameInstallPathCandidate,
} from '../features/persistence/data/game-install-path'
import { syncWarpItemCatalog } from '../features/persistence/data/warp-item-catalog-sync'
import {
  deleteAccountWarpHistory,
  deleteWarpPulls,
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
import {
  PityOverview,
  StellarJadeOverview,
} from '../features/warp-history/components/PityOverview'
import {
  WarpTimeline,
  type TimelineRarityFilter,
} from '../features/warp-history/components/WarpTimeline'
import { WarpResultGallery } from '../features/warp-history/components/WarpResultGallery'
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
import { TrashPanel, type TrashTab } from '../features/trash/components/TrashPanel'
import {
  listTrashedWarpPulls,
  permanentlyDeleteTrashedWarpPull,
  restoreTrashedWarpPull,
  type TrashedWarpPull,
} from '../features/trash/data/trash-history'
import { ConfirmDialog } from '../shared/ui/ConfirmDialog'
import './App.css'

const defaultBannerType = 'character_event' satisfies BannerFilterType
const defaultManualFallbackBannerType = 'character_event' satisfies BannerType
const historyPageSize = 5
const trashPageSize = 5
const defaultAccount: ManualImportAccountInput = {
  id: 'account-800000000',
  uid: '800000000',
  region: 'asia',
  nickname: 'Trailblazer',
}

type HistoryDeleteConfirmation =
  | {
      accountId: string
      kind: 'selected'
      pullIds: string[]
      totalPulls: number
      uid: string
    }
  | {
      accountId: string
      kind: 'all'
      totalPulls: number
      uid: string
    }

type AppView = 'dashboard' | 'accounts' | 'import' | 'backup' | 'trash'

type TrashPullMutationConfirmation =
  | {
      accountId: string
      kind: 'single'
      pull: TrashedWarpPull
      uid: string
    }
  | {
      accountId: string
      kind: 'selected'
      pullIds: string[]
      totalPulls: number
      uid: string
    }
  | {
      accountId: string
      kind: 'all'
      totalPulls: number
      uid: string
    }

type BackupTrashConfirmation =
  | {
      kind: 'restore' | 'delete'
      snapshot: TrashedBackupSnapshotSummary
    }
  | {
      fileNames: string[]
      kind: 'restore_selected' | 'delete_selected' | 'delete_all'
      totalBackups: number
    }

type BackupConfirmation =
  | {
      kind: 'restore_snapshot'
      snapshot: BackupSnapshotSummary
    }
  | {
      kind: 'restore_cloud_snapshot'
      snapshot: CloudBackupSnapshotInfo
    }
  | {
      kind: 'delete_snapshot'
      snapshot: BackupSnapshotSummary
    }

type ManualImportConfirmation = {
  accountId: string
  totalPulls: number
  uid: string
}

export function App() {
  const [activeView, setActiveView] = useState<AppView>('dashboard')
  const [activeBannerType, setActiveBannerType] =
    useState<BannerFilterType>(defaultBannerType)
  const [manualImportOpen, setManualImportOpen] = useState(false)
  const [importDialogOpen, setImportDialogOpen] = useState(false)
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
  const [backupConfirmation, setBackupConfirmation] =
    useState<BackupConfirmation>()
  const [cloudBackupConnecting, setCloudBackupConnecting] = useState(false)
  const [cloudBackupCancelling, setCloudBackupCancelling] = useState(false)
  const [cloudBackupDisconnecting, setCloudBackupDisconnecting] =
    useState(false)
  const cloudBackupAuthAttemptRef = useRef(0)
  const [cloudBackupListing, setCloudBackupListing] = useState(false)
  const [cloudBackupPolicyUpdating, setCloudBackupPolicyUpdating] =
    useState(false)
  const [cloudBackupUploading, setCloudBackupUploading] = useState(false)
  const [autoBackupRunning, setAutoBackupRunning] = useState(false)
  const [autoBackupQueued, setAutoBackupQueued] = useState(false)
  const [autoBackupRequestId, setAutoBackupRequestId] = useState(0)
  const [autoBackupSyncStatus, setAutoBackupSyncStatus] =
    useState<AutoBackupSyncStatus>()
  const autoBackupRunningRef = useRef(false)
  const autoBackupRunAgainRef = useRef(false)
  const allowWindowCloseRef = useRef(false)
  const hasPendingAutoBackupRef = useRef(false)
  const [closeConfirmationOpen, setCloseConfirmationOpen] = useState(false)
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
  const [gamePathScanning, setGamePathScanning] = useState(false)
  const [gamePathSelecting, setGamePathSelecting] = useState(false)
  const [gameInstallPathReady, setGameInstallPathReady] = useState(false)
  const [gamePathCandidates, setGamePathCandidates] = useState<
    GameInstallPathCandidate[]
  >([])
  const [gameInstallPath, setGameInstallPath] = useState(loadGameInstallPath)
  const [activeAccount, setActiveAccount] =
    useState<ManualImportAccountInput>(() => loadActiveAccount(defaultAccount))
  const [manualImportTargetAccountId, setManualImportTargetAccountId] =
    useState(activeAccount.id)
  const [manualImportConfirmation, setManualImportConfirmation] =
    useState<ManualImportConfirmation>()
  const [accounts, setAccounts] = useState<WarpAccount[]>([])
  const [cloudBackupStatus, setCloudBackupStatus] =
    useState<CloudBackupStatus>(() => createInitialGoogleDriveBackupStatus())
  const [cloudBackupPolicy, setCloudBackupPolicy] =
    useState<CloudBackupPolicy>(() => createInitialGoogleDriveBackupPolicy())
  const [manualNoteDraft, setManualNoteDraft] = useState(manualNoteSample)
  const [persistedPulls, setPersistedPulls] = useState<WarpPull[]>([])
  const [historyTotalPulls, setHistoryTotalPulls] = useState(0)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [deletingSelectedHistory, setDeletingSelectedHistory] = useState(false)
  const [deletingAllHistory, setDeletingAllHistory] = useState(false)
  const [historyDeleteConfirmation, setHistoryDeleteConfirmation] =
    useState<HistoryDeleteConfirmation>()
  const [historyPage, setHistoryPage] = useState(1)
  const [historySelecting, setHistorySelecting] = useState(false)
  const [selectedHistoryPullIds, setSelectedHistoryPullIds] = useState<Set<string>>(
    () => new Set(),
  )
  const [historySearchQuery, setHistorySearchQuery] = useState('')
  const [historyRarityFilter, setHistoryRarityFilter] =
    useState<TimelineRarityFilter>('all')
  const [bannerSummaries, setBannerSummaries] = useState<WarpBannerSummary[]>(
    [],
  )
  const [trashedPulls, setTrashedPulls] = useState<TrashedWarpPull[]>([])
  const [trashedBackupSnapshots, setTrashedBackupSnapshots] = useState<
    TrashedBackupSnapshotSummary[]
  >([])
  const [trashTab, setTrashTab] = useState<TrashTab>('history')
  const [trashTotalPulls, setTrashTotalPulls] = useState(0)
  const [trashPage, setTrashPage] = useState(1)
  const [trashLoading, setTrashLoading] = useState(false)
  const [trashBackupLoading, setTrashBackupLoading] = useState(false)
  const [trashSelecting, setTrashSelecting] = useState(false)
  const [selectedTrashPullIds, setSelectedTrashPullIds] = useState<Set<string>>(
    () => new Set(),
  )
  const [backupTrashSelecting, setBackupTrashSelecting] = useState(false)
  const [selectedBackupTrashFileNames, setSelectedBackupTrashFileNames] =
    useState<Set<string>>(() => new Set())
  const [trashError, setTrashError] = useState<string>()
  const [restoringTrashPullId, setRestoringTrashPullId] = useState<string>()
  const [permanentlyDeletingPullId, setPermanentlyDeletingPullId] =
    useState<string>()
  const [restoringTrashedBackupFileName, setRestoringTrashedBackupFileName] =
    useState<string>()
  const [
    permanentlyDeletingTrashedBackupFileName,
    setPermanentlyDeletingTrashedBackupFileName,
  ] = useState<string>()
  const [trashDeleteConfirmation, setTrashDeleteConfirmation] =
    useState<TrashPullMutationConfirmation>()
  const [trashRestoreConfirmation, setTrashRestoreConfirmation] =
    useState<TrashPullMutationConfirmation>()
  const [backupTrashConfirmation, setBackupTrashConfirmation] =
    useState<BackupTrashConfirmation>()
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
  const manualImportAccountOptions = useMemo<ManualImportTargetAccount[]>(() => {
    const options = accounts.map<ManualImportTargetAccount>((account) => ({
      id: account.id,
      uid: account.uid,
      region: account.region,
      nickname: account.nickname,
      totalPulls: account.totalPulls,
    }))

    if (!options.some((account) => account.id === activeAccount.id)) {
      options.unshift({
        id: activeAccount.id,
        uid: activeAccount.uid,
        region: activeAccount.region,
        nickname: activeAccount.nickname,
        totalPulls: activeAccountPullCount,
      })
    }

    return options
  }, [accounts, activeAccount, activeAccountPullCount])
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
  const warpResultRefreshKey = useMemo(
    () =>
      bannerSummaries
        .map(
          (summary) =>
            `${summary.bannerType}:${summary.totalPulls}:${summary.lastPullAt ?? ''}:${summary.lastItemName ?? ''}`,
        )
        .join('|'),
    [bannerSummaries],
  )
  const backupDeleting = deletingBackupFileName !== undefined
  const backupRestoring = restoringBackupFileName !== undefined
  const cloudBackupRestoring = restoringCloudBackupFileId !== undefined
  const cloudBackupBusy =
    cloudBackupConnecting ||
    cloudBackupCancelling ||
    cloudBackupDisconnecting ||
    cloudBackupListing ||
    cloudBackupPolicyUpdating ||
    cloudBackupRestoring ||
    cloudBackupUploading ||
    autoBackupRunning
  const manualFallbackBannerType =
    activeBannerType === 'all' ? defaultManualFallbackBannerType : activeBannerType
  const hasPendingAutoBackup =
    autoBackupQueued ||
    autoBackupRunning ||
    (autoBackupSyncStatus?.hasPendingBackup ?? false)

  useEffect(() => {
    hasPendingAutoBackupRef.current = hasPendingAutoBackup
  }, [hasPendingAutoBackup])

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

  const refreshTrashedPulls = useCallback(async () => {
    const result = await listTrashedWarpPulls(
      activeAccount.id,
      trashPageSize,
      (trashPage - 1) * trashPageSize,
    )
    setTrashedPulls(result.pulls)
    setTrashTotalPulls(result.total)

    const pageCount = Math.max(1, Math.ceil(result.total / trashPageSize))
    if (trashPage > pageCount) {
      setTrashPage(pageCount)
    }

    return result
  }, [activeAccount.id, trashPage])

  const refreshTrashedBackupSnapshots = useCallback(async () => {
    try {
      const snapshots = await listTrashedBackupSnapshots()
      setTrashedBackupSnapshots(snapshots)
      return snapshots
    } catch {
      setTrashedBackupSnapshots([])
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

  const refreshAutoBackupSyncStatus = useCallback(async () => {
    try {
      const status = await getAutoBackupSyncStatus()
      setAutoBackupSyncStatus(status)
      setAutoBackupQueued(status.hasPendingBackup)
      return status
    } catch {
      return undefined
    }
  }, [])

  const runQueuedAutoBackup = useCallback(async () => {
    if (autoBackupRunningRef.current) {
      autoBackupRunAgainRef.current = true
      return
    }

    autoBackupRunningRef.current = true
    setAutoBackupRunning(true)

    try {
      const result = await runAutoBackup()
      setAutoBackupSyncStatus(result.syncStatus)
      setAutoBackupQueued(result.syncStatus.hasPendingBackup)
      await refreshBackupSnapshots()

      if (result.cloudRequired) {
        await refreshCloudBackupStatus()
        await refreshCloudBackupSnapshots().catch(() => undefined)
      }

      if (result.cloudError) {
        setBackupNotice({
          tone: 'error',
          title: 'Drive autosave pending',
          detail: result.cloudError,
        })
      }
    } catch (error) {
      setAutoBackupQueued(true)
      setBackupNotice({
        tone: 'error',
        title: 'Autosave failed',
        detail: getErrorMessage(error),
      })
    } finally {
      autoBackupRunningRef.current = false
      setAutoBackupRunning(false)

      if (autoBackupRunAgainRef.current) {
        autoBackupRunAgainRef.current = false
        setAutoBackupRequestId((requestId) => requestId + 1)
      }
    }
  }, [
    refreshBackupSnapshots,
    refreshCloudBackupSnapshots,
    refreshCloudBackupStatus,
  ])

  const scheduleAutoBackup = useCallback((label: string) => {
    setAutoBackupQueued(true)
    setAutoBackupRequestId((requestId) => requestId + 1)

    return `${label} saved. Backup will run automatically.`
  }, [])

  useEffect(() => {
    if (autoBackupRequestId === 0) {
      return undefined
    }

    const timeoutId = window.setTimeout(() => {
      void runQueuedAutoBackup()
    }, 900)

    return () => window.clearTimeout(timeoutId)
  }, [autoBackupRequestId, runQueuedAutoBackup])

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
    if (activeView !== 'trash') {
      return undefined
    }

    let isActive = true
    Promise.all([
      listTrashedWarpPulls(
        activeAccount.id,
        trashPageSize,
        (trashPage - 1) * trashPageSize,
      ),
      listTrashedBackupSnapshots(),
    ])
      .then(([trashResult, backupTrashResult]) => {
        if (!isActive) {
          return
        }

        setTrashedPulls(trashResult.pulls)
        setTrashTotalPulls(trashResult.total)
        setTrashedBackupSnapshots(backupTrashResult)
        const pageCount = Math.max(1, Math.ceil(trashResult.total / trashPageSize))
        if (trashPage > pageCount) {
          setTrashPage(pageCount)
        }
      })
      .catch((error) => {
        if (isActive) {
          setTrashedPulls([])
          setTrashTotalPulls(0)
          setTrashedBackupSnapshots([])
          setTrashError(getErrorMessage(error))
        }
      })
      .finally(() => {
        if (isActive) {
          setTrashLoading(false)
          setTrashBackupLoading(false)
        }
      })

    return () => {
      isActive = false
    }
  }, [activeAccount.id, activeView, trashPage])

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

  useEffect(() => {
    let isActive = true

    getAutoBackupSyncStatus()
      .then((status) => {
        if (isActive) {
          setAutoBackupSyncStatus(status)
          setAutoBackupQueued(status.hasPendingBackup)
        }
      })
      .catch(() => undefined)

    return () => {
      isActive = false
    }
  }, [])

  useEffect(() => {
    let isActive = true
    let removeCloseListener: (() => void) | undefined
    const currentWindow = getTauriWindow()

    if (!currentWindow) {
      return undefined
    }

    void currentWindow
      .onCloseRequested((event) => {
        if (
          allowWindowCloseRef.current ||
          !hasPendingAutoBackupRef.current
        ) {
          return
        }

        event.preventDefault()
        setCloseConfirmationOpen(true)
      })
      .then((unlisten) => {
        if (!isActive) {
          unlisten()
          return
        }

        removeCloseListener = unlisten
      })
      .catch(() => undefined)

    return () => {
      isActive = false
      removeCloseListener?.()
    }
  }, [])

  const handleManualNoteChange = (value: string) => {
    setManualNoteDraft(value)
    setManualImportSaveNotice(undefined)
  }

  const handleOpenManualImport = useCallback(() => {
    setManualImportSaveNotice(undefined)
    setManualImportTargetAccountId(activeAccount.id)
    setManualImportOpen(true)
  }, [activeAccount.id])

  const applyGameInstallPath = useCallback((path: string) => {
    setGameInstallPath(path)
    saveGameInstallPath(path)
    setGameInstallPathReady(true)
    setGamePathCandidates([])
    setGameHistoryScan(undefined)
    setGameHistoryImportResult(undefined)
    setGameHistoryImportError(undefined)
    setGameHistoryPathError(undefined)
  }, [])

  useEffect(() => {
    let isActive = true

    validateGameInstallPath(gameInstallPath)
      .then((result) => {
        if (!isActive) {
          return
        }

        if (result.isValid) {
          if (result.path !== gameInstallPath) {
            applyGameInstallPath(result.path)
          } else {
            setGameInstallPathReady(true)
          }
        } else {
          setGameInstallPathReady(false)
          setGameHistoryScan(undefined)
        }
      })
      .catch(() => {
        if (isActive) {
          setGameInstallPathReady(false)
          setGameHistoryScan(undefined)
        }
      })

    return () => {
      isActive = false
    }
  }, [applyGameInstallPath, gameInstallPath])

  const handleConfirmCloseApp = useCallback(async () => {
    allowWindowCloseRef.current = true
    setCloseConfirmationOpen(false)

    try {
      const currentWindow = getTauriWindow()

      if (currentWindow) {
        await currentWindow.close()
        return
      }

      window.close()
    } catch {
      window.close()
    }
  }, [])

  const handleScanGameHistorySource = useCallback(async () => {
    if (gameHistoryScanning || !gameInstallPathReady) {
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
  }, [gameHistoryScanning, gameInstallPath, gameInstallPathReady])

  const handleSelectGamePath = useCallback(async () => {
    if (
      gamePathSelecting ||
      gamePathScanning ||
      gameHistoryScanning ||
      gameHistoryImporting
    ) {
      return
    }

    setGamePathSelecting(true)
    setGameHistoryPathError(undefined)

    try {
      const selectedPath = await selectGameInstallPath(gameInstallPath)

      if (selectedPath) {
        const result = await validateGameInstallPath(selectedPath)

        if (result.isValid) {
          applyGameInstallPath(result.path)
        } else {
          setGameHistoryPathError(result.detail)
        }
      }
    } catch (error) {
      setGameHistoryPathError(getErrorMessage(error))
    } finally {
      setGamePathSelecting(false)
    }
  }, [
    applyGameInstallPath,
    gameHistoryImporting,
    gameHistoryScanning,
    gameInstallPath,
    gamePathScanning,
    gamePathSelecting,
  ])

  const handleFindGamePath = useCallback(async () => {
    if (
      gamePathScanning ||
      gamePathSelecting ||
      gameHistoryScanning ||
      gameHistoryImporting
    ) {
      return
    }

    setGamePathScanning(true)
    setGameHistoryPathError(undefined)

    try {
      const result = await findGameInstallPaths(gameInstallPath)
      setGamePathCandidates(result.candidates)

      if (result.selectedPath) {
        applyGameInstallPath(result.selectedPath)
      } else if (result.candidates.length === 0) {
        setGameHistoryPathError(result.detail)
      }
    } catch (error) {
      setGameHistoryPathError(getErrorMessage(error))
      setGamePathCandidates([])
    } finally {
      setGamePathScanning(false)
    }
  }, [
    applyGameInstallPath,
    gameHistoryImporting,
    gameHistoryScanning,
    gameInstallPath,
    gamePathScanning,
    gamePathSelecting,
  ])

  const handleUseGamePathCandidate = useCallback(
    (candidate: GameInstallPathCandidate) => {
      applyGameInstallPath(candidate.path)
    },
    [applyGameInstallPath],
  )

  const handleImportGameHistory = useCallback(async () => {
    if (gameHistoryImporting || !gameInstallPathReady) {
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
      setHistoryPage(1)
      setHistorySelecting(false)
      setSelectedHistoryPullIds(new Set())
      const [pulls, summaries] = await Promise.all([
        listWarpPulls({
          accountId: result.accountId,
          bannerType: activeBannerType === 'all' ? undefined : activeBannerType,
          limit: historyPageSize,
          offset: 0,
          rarity: historyRarityFilter === 'all' ? undefined : historyRarityFilter,
          search: historySearchQuery,
        }),
        listWarpBannerSummaries({ accountId: result.accountId }),
      ])
      setPersistedPulls(pulls.pulls)
      setHistoryTotalPulls(pulls.total)
      setBannerSummaries(summaries)
      await refreshAccounts()
      scheduleAutoBackup('Game import')
      setImportDialogOpen(false)
      setActiveView('dashboard')
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
    gameInstallPathReady,
    historyRarityFilter,
    historySearchQuery,
    refreshAccounts,
    scheduleAutoBackup,
  ])

  const handleBannerTypeChange = (bannerType: BannerFilterType) => {
    if (bannerType === activeBannerType) {
      return
    }

    setActiveBannerType(bannerType)
    setHistoryLoading(true)
    setHistoryPage(1)
    setHistorySelecting(false)
    setSelectedHistoryPullIds(new Set())
    setPersistedPulls([])
    setManualImportSaveNotice(undefined)
  }

  const handleViewChange = (view: AppView) => {
    setActiveView(view)
    setTrashError(undefined)
    if (view === 'trash') {
      setTrashLoading(true)
      setTrashBackupLoading(true)
    } else {
      setTrashSelecting(false)
      setSelectedTrashPullIds(new Set())
    }
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
    setHistorySelecting(false)
    setSelectedHistoryPullIds(new Set())
    setTrashPage(1)
    setTrashSelecting(false)
    setSelectedTrashPullIds(new Set())
    setBackupTrashSelecting(false)
    setSelectedBackupTrashFileNames(new Set())
    if (activeView === 'trash') {
      setTrashLoading(true)
      setTrashBackupLoading(true)
    }
    setPersistedPulls([])
    setHistoryTotalPulls(0)
    setManualImportSaveNotice(undefined)
  }

  const handleOpenAccount = (accountId: string) => {
    handleAccountChange(accountId)
    setActiveView('dashboard')
  }

  const handleHistorySelectionModeChange = (isSelecting: boolean) => {
    setHistorySelecting(isSelecting)
    setSelectedHistoryPullIds(new Set())
  }

  const handleTrashSelectionModeChange = (isSelecting: boolean) => {
    setTrashSelecting(isSelecting)
    setSelectedTrashPullIds(new Set())
  }

  const handleBackupTrashSelectionModeChange = (isSelecting: boolean) => {
    setBackupTrashSelecting(isSelecting)
    setSelectedBackupTrashFileNames(new Set())
  }

  const handleToggleTrashPullSelection = (pullId: string) => {
    setSelectedTrashPullIds((current) => {
      const next = new Set(current)

      if (next.has(pullId)) {
        next.delete(pullId)
      } else {
        next.add(pullId)
      }

      return next
    })
  }

  const handleToggleBackupTrashSelection = (fileName: string) => {
    setSelectedBackupTrashFileNames((current) => {
      const next = new Set(current)

      if (next.has(fileName)) {
        next.delete(fileName)
      } else {
        next.add(fileName)
      }

      return next
    })
  }

  const handleToggleHistoryPullSelection = (pullId: string) => {
    setSelectedHistoryPullIds((current) => {
      const next = new Set(current)

      if (next.has(pullId)) {
        next.delete(pullId)
      } else {
        next.add(pullId)
      }

      return next
    })
  }

  const handleDeleteSelectedHistory = useCallback(() => {
    if (
      deletingSelectedHistory ||
      deletingAllHistory ||
      selectedHistoryPullIds.size === 0
    ) {
      return
    }

    setHistoryDeleteConfirmation({
      accountId: activeAccount.id,
      kind: 'selected',
      pullIds: [...selectedHistoryPullIds],
      totalPulls: selectedHistoryPullIds.size,
      uid: activeAccount.uid,
    })
  }, [
    activeAccount.id,
    activeAccount.uid,
    deletingAllHistory,
    deletingSelectedHistory,
    selectedHistoryPullIds,
  ])

  const handleDeleteAllHistory = useCallback(() => {
    if (deletingAllHistory || deletingSelectedHistory || activeAccountPullCount === 0) {
      return
    }

    setHistoryDeleteConfirmation({
      accountId: activeAccount.id,
      kind: 'all',
      totalPulls: activeAccountPullCount,
      uid: activeAccount.uid,
    })
  }, [
    activeAccount.id,
    activeAccount.uid,
    activeAccountPullCount,
    deletingAllHistory,
    deletingSelectedHistory,
  ])

  const handleConfirmHistoryDelete = useCallback(async () => {
    if (!historyDeleteConfirmation) {
      return
    }

    if (historyDeleteConfirmation.kind === 'selected') {
      setDeletingSelectedHistory(true)

      try {
        await deleteWarpPulls(
          historyDeleteConfirmation.accountId,
          historyDeleteConfirmation.pullIds,
        )
        await refreshWarpHistory()
        await refreshAccounts()
        setHistoryDeleteConfirmation(undefined)
        setHistorySelecting(false)
        setSelectedHistoryPullIds(new Set())
        scheduleAutoBackup('History')
      } finally {
        setDeletingSelectedHistory(false)
      }

      return
    }

    setDeletingAllHistory(true)
    setHistoryLoading(true)

    try {
      await deleteAccountWarpHistory(historyDeleteConfirmation.accountId)
      setHistoryPage(1)
      await refreshWarpHistory()
      await refreshAccounts()
      setHistoryDeleteConfirmation(undefined)
      setHistorySelecting(false)
      setSelectedHistoryPullIds(new Set())
      scheduleAutoBackup('History')
    } finally {
      setDeletingAllHistory(false)
      setHistoryLoading(false)
    }
  }, [
    historyDeleteConfirmation,
    refreshAccounts,
    refreshWarpHistory,
    scheduleAutoBackup,
  ])

  const performRestoreTrashPull = useCallback(
    async (pull: TrashedWarpPull) => {
      if (restoringTrashPullId || permanentlyDeletingPullId) {
        return
      }

      setRestoringTrashPullId(pull.id)
      setTrashError(undefined)

      try {
        await restoreTrashedWarpPull(activeAccount.id, pull.id)
        await Promise.all([
          refreshTrashedPulls(),
          refreshWarpHistory(),
          refreshAccounts(),
        ])
        setSelectedTrashPullIds(new Set())
        scheduleAutoBackup('Trash restore')
      } catch (error) {
        setTrashError(getErrorMessage(error))
      } finally {
        setRestoringTrashPullId(undefined)
      }
    },
    [
      activeAccount.id,
      permanentlyDeletingPullId,
      refreshAccounts,
      refreshTrashedPulls,
      refreshWarpHistory,
      scheduleAutoBackup,
      restoringTrashPullId,
    ],
  )

  const performRestoreTrashPulls = useCallback(
    async (pullIds: string[]) => {
      if (restoringTrashPullId || permanentlyDeletingPullId || pullIds.length === 0) {
        return
      }

      setRestoringTrashPullId('selected')
      setTrashError(undefined)

      try {
        for (const pullId of pullIds) {
          await restoreTrashedWarpPull(activeAccount.id, pullId)
        }
        await Promise.all([
          refreshTrashedPulls(),
          refreshWarpHistory(),
          refreshAccounts(),
        ])
        setSelectedTrashPullIds(new Set())
        scheduleAutoBackup('Trash restore')
      } catch (error) {
        setTrashError(getErrorMessage(error))
      } finally {
        setRestoringTrashPullId(undefined)
      }
    },
    [
      activeAccount.id,
      permanentlyDeletingPullId,
      refreshAccounts,
      refreshTrashedPulls,
      refreshWarpHistory,
      restoringTrashPullId,
      scheduleAutoBackup,
    ],
  )

  const handleRequestRestoreTrashPull = useCallback(
    (pull: TrashedWarpPull) => {
      if (restoringTrashPullId || permanentlyDeletingPullId) {
        return
      }

      setTrashRestoreConfirmation({
        accountId: activeAccount.id,
        kind: 'single',
        pull,
        uid: activeAccount.uid,
      })
    },
    [
      activeAccount.id,
      activeAccount.uid,
      permanentlyDeletingPullId,
      restoringTrashPullId,
    ],
  )

  const handleRequestRestoreSelectedTrashPulls = useCallback(() => {
    if (
      restoringTrashPullId ||
      permanentlyDeletingPullId ||
      selectedTrashPullIds.size === 0
    ) {
      return
    }

    setTrashRestoreConfirmation({
      accountId: activeAccount.id,
      kind: 'selected',
      pullIds: [...selectedTrashPullIds],
      totalPulls: selectedTrashPullIds.size,
      uid: activeAccount.uid,
    })
  }, [
    activeAccount.id,
    activeAccount.uid,
    permanentlyDeletingPullId,
    restoringTrashPullId,
    selectedTrashPullIds,
  ])

  const handleConfirmTrashRestore = useCallback(async () => {
    if (!trashRestoreConfirmation) {
      return
    }

    if (trashRestoreConfirmation.kind === 'single') {
      await performRestoreTrashPull(trashRestoreConfirmation.pull)
    }

    if (trashRestoreConfirmation.kind === 'selected') {
      await performRestoreTrashPulls(trashRestoreConfirmation.pullIds)
    }
    setTrashRestoreConfirmation(undefined)
  }, [performRestoreTrashPull, performRestoreTrashPulls, trashRestoreConfirmation])

  const handleRequestPermanentTrashDelete = useCallback(
    (pull: TrashedWarpPull) => {
      if (restoringTrashPullId || permanentlyDeletingPullId) {
        return
      }

      setTrashDeleteConfirmation({
        accountId: activeAccount.id,
        kind: 'single',
        pull,
        uid: activeAccount.uid,
      })
    },
    [
      activeAccount.id,
      activeAccount.uid,
      permanentlyDeletingPullId,
      restoringTrashPullId,
    ],
  )

  const handleRequestDeleteSelectedTrashPulls = useCallback(() => {
    if (
      restoringTrashPullId ||
      permanentlyDeletingPullId ||
      selectedTrashPullIds.size === 0
    ) {
      return
    }

    setTrashDeleteConfirmation({
      accountId: activeAccount.id,
      kind: 'selected',
      pullIds: [...selectedTrashPullIds],
      totalPulls: selectedTrashPullIds.size,
      uid: activeAccount.uid,
    })
  }, [
    activeAccount.id,
    activeAccount.uid,
    permanentlyDeletingPullId,
    restoringTrashPullId,
    selectedTrashPullIds,
  ])

  const handleRequestDeleteAllTrashPulls = useCallback(() => {
    if (
      restoringTrashPullId ||
      permanentlyDeletingPullId ||
      trashTotalPulls === 0
    ) {
      return
    }

    setTrashDeleteConfirmation({
      accountId: activeAccount.id,
      kind: 'all',
      totalPulls: trashTotalPulls,
      uid: activeAccount.uid,
    })
  }, [
    activeAccount.id,
    activeAccount.uid,
    permanentlyDeletingPullId,
    restoringTrashPullId,
    trashTotalPulls,
  ])

  const handleConfirmPermanentTrashDelete = useCallback(async () => {
    if (!trashDeleteConfirmation || permanentlyDeletingPullId) {
      return
    }

    setPermanentlyDeletingPullId(
      trashDeleteConfirmation.kind === 'single'
        ? trashDeleteConfirmation.pull.id
        : trashDeleteConfirmation.kind,
    )
    setTrashError(undefined)

    try {
      if (trashDeleteConfirmation.kind === 'single') {
        await permanentlyDeleteTrashedWarpPull(
          trashDeleteConfirmation.accountId,
          trashDeleteConfirmation.pull.id,
        )
      } else if (trashDeleteConfirmation.kind === 'selected') {
        for (const pullId of trashDeleteConfirmation.pullIds) {
          await permanentlyDeleteTrashedWarpPull(
            trashDeleteConfirmation.accountId,
            pullId,
          )
        }
      } else {
        let deletedPulls = 0

        while (true) {
          const result = await listTrashedWarpPulls(
            trashDeleteConfirmation.accountId,
            500,
            0,
          )

          if (result.pulls.length === 0) {
            break
          }

          for (const pull of result.pulls) {
            await permanentlyDeleteTrashedWarpPull(
              trashDeleteConfirmation.accountId,
              pull.id,
            )
          }

          deletedPulls += result.pulls.length

          if (deletedPulls >= result.total) {
            break
          }
        }
        setTrashPage(1)
      }
      setTrashDeleteConfirmation(undefined)
      await refreshTrashedPulls()
      setSelectedTrashPullIds(new Set())
      scheduleAutoBackup('Trash')
    } catch (error) {
      setTrashError(getErrorMessage(error))
    } finally {
      setPermanentlyDeletingPullId(undefined)
    }
  }, [
    permanentlyDeletingPullId,
    refreshTrashedPulls,
    scheduleAutoBackup,
    trashDeleteConfirmation,
  ])

  const handleRequestRestoreTrashedBackup = useCallback(
    (snapshot: TrashedBackupSnapshotSummary) => {
      if (restoringTrashedBackupFileName || permanentlyDeletingTrashedBackupFileName) {
        return
      }

      setBackupTrashConfirmation({ kind: 'restore', snapshot })
    },
    [permanentlyDeletingTrashedBackupFileName, restoringTrashedBackupFileName],
  )

  const handleRequestDeleteTrashedBackup = useCallback(
    (snapshot: TrashedBackupSnapshotSummary) => {
      if (restoringTrashedBackupFileName || permanentlyDeletingTrashedBackupFileName) {
        return
      }

      setBackupTrashConfirmation({ kind: 'delete', snapshot })
    },
    [permanentlyDeletingTrashedBackupFileName, restoringTrashedBackupFileName],
  )

  const handleRequestRestoreSelectedTrashedBackups = useCallback(() => {
    if (
      restoringTrashedBackupFileName ||
      permanentlyDeletingTrashedBackupFileName ||
      selectedBackupTrashFileNames.size === 0
    ) {
      return
    }

    setBackupTrashConfirmation({
      fileNames: [...selectedBackupTrashFileNames],
      kind: 'restore_selected',
      totalBackups: selectedBackupTrashFileNames.size,
    })
  }, [
    permanentlyDeletingTrashedBackupFileName,
    restoringTrashedBackupFileName,
    selectedBackupTrashFileNames,
  ])

  const handleRequestDeleteSelectedTrashedBackups = useCallback(() => {
    if (
      restoringTrashedBackupFileName ||
      permanentlyDeletingTrashedBackupFileName ||
      selectedBackupTrashFileNames.size === 0
    ) {
      return
    }

    setBackupTrashConfirmation({
      fileNames: [...selectedBackupTrashFileNames],
      kind: 'delete_selected',
      totalBackups: selectedBackupTrashFileNames.size,
    })
  }, [
    permanentlyDeletingTrashedBackupFileName,
    restoringTrashedBackupFileName,
    selectedBackupTrashFileNames,
  ])

  const handleRequestDeleteAllTrashedBackups = useCallback(() => {
    if (
      restoringTrashedBackupFileName ||
      permanentlyDeletingTrashedBackupFileName ||
      trashedBackupSnapshots.length === 0
    ) {
      return
    }

    setBackupTrashConfirmation({
      fileNames: trashedBackupSnapshots.map((snapshot) => snapshot.fileName),
      kind: 'delete_all',
      totalBackups: trashedBackupSnapshots.length,
    })
  }, [
    permanentlyDeletingTrashedBackupFileName,
    restoringTrashedBackupFileName,
    trashedBackupSnapshots,
  ])

  const handleConfirmBackupTrashAction = useCallback(async () => {
    if (!backupTrashConfirmation) {
      return
    }

    const fileNames = getBackupTrashFileNames(backupTrashConfirmation)

    if (isBackupTrashRestoreConfirmation(backupTrashConfirmation)) {
      setRestoringTrashedBackupFileName(
        backupTrashConfirmation.kind === 'restore'
          ? backupTrashConfirmation.snapshot.fileName
          : 'selected',
      )
      setTrashError(undefined)

      try {
        const restoredResults = []

        for (const fileName of fileNames) {
          restoredResults.push(await restoreTrashedBackupSnapshot(fileName))
        }

        await Promise.all([
          refreshBackupSnapshots(),
          refreshTrashedBackupSnapshots(),
        ])
        setBackupTrashConfirmation(undefined)
        setSelectedBackupTrashFileNames(new Set())
        setBackupNotice({
          tone: 'success',
          title: 'Backup restored',
          detail:
            restoredResults.length === 1
              ? `${restoredResults[0].fileName} returned to Local backup.`
              : `${restoredResults.length} backups returned to Local backup.`,
        })
      } catch (error) {
        setTrashError(getErrorMessage(error))
      } finally {
        setRestoringTrashedBackupFileName(undefined)
      }

      return
    }

    setPermanentlyDeletingTrashedBackupFileName(
      backupTrashConfirmation.kind === 'delete'
        ? backupTrashConfirmation.snapshot.fileName
        : backupTrashConfirmation.kind,
    )
    setTrashError(undefined)

    try {
      for (const fileName of fileNames) {
        await permanentlyDeleteTrashedBackupSnapshot(fileName)
      }
      await refreshTrashedBackupSnapshots()
      setBackupTrashConfirmation(undefined)
      setSelectedBackupTrashFileNames(new Set())
    } catch (error) {
      setTrashError(getErrorMessage(error))
    } finally {
      setPermanentlyDeletingTrashedBackupFileName(undefined)
    }
  }, [
    backupTrashConfirmation,
    refreshBackupSnapshots,
    refreshTrashedBackupSnapshots,
  ])

  const handleRequestManualImportSave = (accountId: string) => {
    if (manualImportSaving) {
      return
    }

    const targetAccount = manualImportAccountOptions.find(
      (account) => account.id === accountId,
    )

    if (!targetAccount) {
      setManualImportSaveNotice({
        tone: 'error',
        title: 'Choose UID',
        detail: 'Select the UID that should receive this manual import.',
      })
      return
    }

    setManualImportTargetAccountId(targetAccount.id)
    setManualImportConfirmation({
      accountId: targetAccount.id,
      totalPulls: manualImportPreview.totalPulls,
      uid: targetAccount.uid,
    })
  }

  const handleSaveManualImport = async (targetAccountId: string) => {
    if (manualImportSaving) {
      return
    }

    const targetAccount =
      manualImportAccountOptions.find(
        (account) => account.id === targetAccountId,
      ) ?? manualImportAccountOptions[0]
    const saveAccount = targetAccount
      ? toManualImportAccountInput(targetAccount)
      : activeAccount

    const draft = buildManualImportDraft(manualImportPreview, {
      accountId: saveAccount.id,
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
        toSaveManualImportDraftPayload(saveAccount, draft),
      )
      setActiveAccount(saveAccount)
      saveActiveAccount(saveAccount)
      setActiveView('dashboard')
      setHistoryPage(1)
      setHistorySelecting(false)
      setSelectedHistoryPullIds(new Set())
      const [historyResult] = await Promise.all([
        fetchHistoryForAccount(saveAccount.id, 1),
        refreshAccounts(),
      ])
      const [pulls, summaries] = historyResult
      setPersistedPulls(pulls.pulls)
      setHistoryTotalPulls(pulls.total)
      setBannerSummaries(summaries)
      const autoBackupDetail =
        result.recordsInserted > 0
          ? scheduleAutoBackup('Manual import')
          : undefined

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
      setManualImportOpen(false)
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

  const handleConfirmManualImport = async () => {
    if (!manualImportConfirmation) {
      return
    }

    const { accountId } = manualImportConfirmation
    setManualImportConfirmation(undefined)
    await handleSaveManualImport(accountId)
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
      scheduleAutoBackup('JSON import')

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
    scheduleAutoBackup,
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

    const authAttempt = cloudBackupAuthAttemptRef.current + 1
    cloudBackupAuthAttemptRef.current = authAttempt
    setCloudBackupConnecting(true)
    setBackupNotice(undefined)

    try {
      const startStatus = await connectGoogleDriveBackup()
      setCloudBackupStatus(startStatus)

      const status = await waitForGoogleDriveAuthCompletion(
        refreshCloudBackupStatus,
        setCloudBackupStatus,
        () => cloudBackupAuthAttemptRef.current === authAttempt,
      )

      if (!status || cloudBackupAuthAttemptRef.current !== authAttempt) {
        return
      }

      setCloudBackupStatus(status)

      if (status.connectionStatus === 'connected') {
        await refreshCloudBackupSnapshots().catch(() => undefined)
        if (cloudBackupPolicy.autoBackupEnabled) {
          scheduleAutoBackup('Google Drive')
        }
        setBackupNotice({
          tone: 'success',
          title: 'Google Drive connected',
          detail: status.detail,
        })
      } else {
        setBackupNotice({
          tone: 'error',
          title:
            status.connectionStatus === 'connection_failed'
              ? 'Google Drive connection failed'
              : 'Google Drive connection incomplete',
          detail:
            status.detail ||
            'Google login did not finish yet. Try Connect again when the browser login is complete.',
        })
      }
    } catch (error) {
      if (cloudBackupAuthAttemptRef.current !== authAttempt) {
        return
      }

      const fallbackStatus = await refreshCloudBackupStatus()
      setBackupNotice({
        tone: 'error',
        title: 'Google Drive connect failed',
        detail: `${getErrorMessage(error)}\n${fallbackStatus.detail}`,
      })
    } finally {
      if (cloudBackupAuthAttemptRef.current === authAttempt) {
        setCloudBackupConnecting(false)
      }
    }
  }, [
    backupDeleting,
    backupExporting,
    backupImporting,
    backupRestoring,
    cloudBackupBusy,
    cloudBackupStatus.canConnect,
    cloudBackupPolicy.autoBackupEnabled,
    refreshCloudBackupSnapshots,
    refreshCloudBackupStatus,
    scheduleAutoBackup,
  ])

  const handleCancelGoogleDriveConnection = useCallback(async () => {
    if (
      cloudBackupCancelling ||
      (!cloudBackupConnecting &&
        cloudBackupStatus.connectionStatus !== 'connecting')
    ) {
      return
    }

    cloudBackupAuthAttemptRef.current += 1
    setCloudBackupCancelling(true)
    setBackupNotice(undefined)

    try {
      const status = await cancelGoogleDriveBackupConnection()
      setCloudBackupStatus(status)
      setBackupNotice({
        tone: 'success',
        title: 'Google Drive connection cancelled',
        detail: 'You can start a new Google Drive connection now.',
      })
    } catch (error) {
      const fallbackStatus = await refreshCloudBackupStatus()
      setCloudBackupStatus(fallbackStatus)
      setBackupNotice({
        tone: 'error',
        title: 'Could not cancel Google Drive connection',
        detail: getErrorMessage(error),
      })
    } finally {
      setCloudBackupConnecting(false)
      setCloudBackupCancelling(false)
    }
  }, [
    cloudBackupCancelling,
    cloudBackupConnecting,
    cloudBackupStatus.connectionStatus,
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
        if (enabled) {
          scheduleAutoBackup('Auto backup')
        } else {
          await refreshAutoBackupSyncStatus()
        }
        setBackupNotice({
          tone: 'success',
          title: 'Auto backup updated',
          detail: enabled
            ? 'Google Drive autosave will run after saved changes.'
            : 'Google Drive autosave is off. Local autosave stays on.',
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
      refreshAutoBackupSyncStatus,
      scheduleAutoBackup,
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
      await refreshAutoBackupSyncStatus()
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
    refreshAutoBackupSyncStatus,
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
      await refreshAutoBackupSyncStatus()
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
    refreshAutoBackupSyncStatus,
    refreshCloudBackupStatus,
    refreshCloudBackupSnapshots,
  ])

  const performRestoreGoogleDriveBackup = useCallback(
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
      setRestoringCloudBackupFileId(remoteFileId)
      setBackupNotice(undefined)

      try {
        const result = await restoreGoogleDriveBackupSnapshot(snapshot)
        await refreshWarpHistory()
        await refreshAccounts()
        scheduleAutoBackup('Cloud restore')

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
      scheduleAutoBackup,
    ],
  )

  const handleRestoreGoogleDriveBackup = useCallback(
    (snapshot: CloudBackupSnapshotInfo) => {
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

      setBackupConfirmation({ kind: 'restore_cloud_snapshot', snapshot })
    },
    [
      backupDeleting,
      backupExporting,
      backupImporting,
      backupRestoring,
      cloudBackupBusy,
      cloudBackupStatus.connectionStatus,
    ],
  )

  const performRestoreBackupSnapshot = useCallback(
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
        scheduleAutoBackup('Backup restore')

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
      scheduleAutoBackup,
    ],
  )

  const performDeleteBackupSnapshot = useCallback(
    async (fileName: string) => {
      if (backupDeleting || backupExporting || backupImporting || backupRestoring || cloudBackupBusy) {
        return
      }

      setDeletingBackupFileName(fileName)
      setBackupNotice(undefined)

      try {
        const result = await deleteBackupSnapshot(fileName)
        await Promise.all([
          refreshBackupSnapshots(),
          refreshTrashedBackupSnapshots(),
        ])

        setBackupNotice({
          tone: 'success',
          title: 'Backup moved to Trash',
          detail: `${result.fileName} moved to Trash. ${result.remainingSnapshots} local backups left.`,
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
      refreshTrashedBackupSnapshots,
    ],
  )

  const handleRestoreBackupSnapshot = useCallback(
    (fileName: string) => {
      const snapshot = backupSnapshots.find(
        (candidate) => candidate.fileName === fileName,
      )
      if (!snapshot || backupDeleting || backupRestoring || backupImporting) {
        return
      }

      setBackupConfirmation({ kind: 'restore_snapshot', snapshot })
    },
    [backupDeleting, backupImporting, backupRestoring, backupSnapshots],
  )

  const handleDeleteBackupSnapshot = useCallback(
    (fileName: string) => {
      const snapshot = backupSnapshots.find(
        (candidate) => candidate.fileName === fileName,
      )
      if (!snapshot || backupDeleting || backupRestoring || backupImporting) {
        return
      }

      setBackupConfirmation({ kind: 'delete_snapshot', snapshot })
    },
    [backupDeleting, backupImporting, backupRestoring, backupSnapshots],
  )

  const handleConfirmBackupAction = useCallback(async () => {
    if (!backupConfirmation) {
      return
    }

    if (backupConfirmation.kind === 'restore_snapshot') {
      await performRestoreBackupSnapshot(backupConfirmation.snapshot.fileName)
    } else if (backupConfirmation.kind === 'restore_cloud_snapshot') {
      await performRestoreGoogleDriveBackup(backupConfirmation.snapshot)
    } else {
      await performDeleteBackupSnapshot(backupConfirmation.snapshot.fileName)
    }

    setBackupConfirmation(undefined)
  }, [
    backupConfirmation,
    performDeleteBackupSnapshot,
    performRestoreGoogleDriveBackup,
    performRestoreBackupSnapshot,
  ])

  return (
    <>
      <main className="app-shell">
        <aside className="sidebar" aria-label="Workspace">
          <div className="brand">
            <div className="brand-mark" aria-hidden="true">
              <img src="/miku-warp.png" alt="" />
            </div>
            <div>
              <strong>Miku Warp</strong>
              <span>Honkai: Star Rail</span>
            </div>
          </div>

          <nav className="sidebar-nav" aria-label="Main navigation">
            <button
              aria-current={activeView === 'dashboard' ? 'page' : undefined}
              className={
                activeView === 'dashboard'
                  ? 'sidebar-link sidebar-link-active'
                  : 'sidebar-link'
              }
              onClick={() => handleViewChange('dashboard')}
              type="button"
            >
              <LayoutDashboard size={18} aria-hidden="true" />
              Dashboard
            </button>
            <button
              aria-current={activeView === 'accounts' ? 'page' : undefined}
              className={
                activeView === 'accounts'
                  ? 'sidebar-link sidebar-link-active'
                  : 'sidebar-link'
              }
              onClick={() => handleViewChange('accounts')}
              type="button"
            >
              <UsersRound size={18} aria-hidden="true" />
              Accounts
            </button>
            <button
              aria-current={activeView === 'import' ? 'page' : undefined}
              className={
                activeView === 'import'
                  ? 'sidebar-link sidebar-link-active'
                  : 'sidebar-link'
              }
              onClick={() => handleViewChange('import')}
              type="button"
            >
              <FileInput size={18} aria-hidden="true" />
              Import
            </button>
            <button
              aria-current={activeView === 'backup' ? 'page' : undefined}
              className={
                activeView === 'backup'
                  ? 'sidebar-link sidebar-link-active'
                  : 'sidebar-link'
              }
              onClick={() => handleViewChange('backup')}
              type="button"
            >
              <Cloud size={18} aria-hidden="true" />
              Backup
            </button>
            <button
              aria-current={activeView === 'trash' ? 'page' : undefined}
              className={
                activeView === 'trash'
                  ? 'sidebar-link sidebar-link-active'
                  : 'sidebar-link'
              }
              onClick={() => handleViewChange('trash')}
              type="button"
            >
              <Trash2 size={18} aria-hidden="true" />
              Trash
            </button>
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
          {activeView === 'dashboard' ? (
            <>
              <header className="workspace-header">
                <div>
                  <h1>{getBannerFilterLabel(activeBannerType)}</h1>
                </div>
              </header>

              <BannerTabs
                activeBannerType={activeBannerType}
                summaries={bannerSummaries}
                onBannerTypeChange={handleBannerTypeChange}
              />

              <section className="content-grid">
                <div className="primary-column" id="dashboard">
                  <BannerSummaryGrid
                    activeBannerType={activeBannerType}
                    summaries={bannerSummaries}
                    onBannerTypeChange={handleBannerTypeChange}
                  />
                  {activeBannerType === 'all' ? (
                    <StellarJadeOverview totalPulls={activeAccountPullCount} />
                  ) : (
                    <>
                      <PityOverview
                        bannerType={activeBannerType}
                        summary={pitySummary}
                      />
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
                    isDeletingAll={deletingAllHistory}
                    isDeletingSelected={deletingSelectedHistory}
                    isSelecting={historySelecting}
                    selectedPullIds={selectedHistoryPullIds}
                    showBannerLabel={activeBannerType === 'all'}
                    onDeleteAll={handleDeleteAllHistory}
                    onDeleteSelected={handleDeleteSelectedHistory}
                    onOpenImport={() => setImportDialogOpen(true)}
                    onPageChange={(page) => {
                      setHistoryLoading(true)
                      setHistoryPage(page)
                      setSelectedHistoryPullIds(new Set())
                    }}
                    onRarityFilterChange={(rarityFilter) => {
                      setHistoryLoading(true)
                      setHistoryRarityFilter(rarityFilter)
                      setHistoryPage(1)
                      setSelectedHistoryPullIds(new Set())
                    }}
                    onSelectionModeChange={handleHistorySelectionModeChange}
                    onSearchQueryChange={(searchQuery) => {
                      setHistoryLoading(true)
                      setHistorySearchQuery(searchQuery)
                      setHistoryPage(1)
                      setSelectedHistoryPullIds(new Set())
                    }}
                    onTogglePullSelection={handleToggleHistoryPullSelection}
                  />
                  <WarpResultGallery
                    accountId={activeAccount.id}
                    bannerType={activeBannerType}
                    refreshKey={warpResultRefreshKey}
                  />
                </div>
              </section>
            </>
          ) : null}

          {activeView === 'accounts' ? (
            <>
              <header className="workspace-header">
                <div>
                  <h1>Accounts</h1>
                </div>
              </header>
              <AccountManagementPanel
                accounts={accounts}
                activeAccountId={activeAccount.id}
                onOpenAccount={handleOpenAccount}
              />
            </>
          ) : null}

          {activeView === 'import' ? (
            <>
              <header className="workspace-header">
                <div>
                  <h1>Import</h1>
                </div>
              </header>
              <section className="workspace-panel-page">
                <ImportPanel
                  gameHistoryImportError={gameHistoryImportError}
                  gameHistoryImportResult={gameHistoryImportResult}
                  gameHistoryPathError={gameHistoryPathError}
                  gameHistoryScan={gameHistoryScan}
                  gameInstallPath={gameInstallPath}
                  gameInstallPathReady={gameInstallPathReady}
                  gamePathCandidates={gamePathCandidates}
                  isGameHistoryImporting={gameHistoryImporting}
                  isGameHistoryScanning={gameHistoryScanning}
                  isGamePathScanning={gamePathScanning}
                  isGamePathSelecting={gamePathSelecting}
                  manualImportPreview={manualImportPreview}
                  onFindGamePath={handleFindGamePath}
                  onImportGameHistory={handleImportGameHistory}
                  onSelectGamePath={handleSelectGamePath}
                  onScanGameHistory={handleScanGameHistorySource}
                  onUseGamePathCandidate={handleUseGamePathCandidate}
                  onOpenManualImport={handleOpenManualImport}
                />
              </section>
            </>
          ) : null}

          {activeView === 'backup' ? (
            <>
              <header className="workspace-header">
                <div>
                  <h1>Backup</h1>
                </div>
              </header>
              <section className="workspace-panel-page">
                <BackupPanel
                  cloudBackupPolicy={cloudBackupPolicy}
                  cloudSnapshots={cloudBackupSnapshots}
                  cloudBackupStatus={cloudBackupStatus}
                  deletingFileName={deletingBackupFileName}
                  isCloudCancelling={cloudBackupCancelling}
                  isCloudConnecting={cloudBackupConnecting}
                  isCloudDisconnecting={cloudBackupDisconnecting}
                  isCloudPolicyUpdating={cloudBackupPolicyUpdating}
                  isCloudRestoring={cloudBackupRestoring}
                  isCloudUploading={cloudBackupUploading || autoBackupRunning}
                  isExporting={backupExporting}
                  isImporting={backupImporting}
                  isDeleting={backupDeleting}
                  isRestoring={backupRestoring}
                  notice={backupNotice}
                  restoringCloudFileId={restoringCloudBackupFileId}
                  restoringFileName={restoringBackupFileName}
                  snapshots={backupSnapshots}
                  onAutoBackupPolicyChange={handleAutoBackupPolicyChange}
                  onCancelGoogleDrive={handleCancelGoogleDriveConnection}
                  onConnectGoogleDrive={handleConnectGoogleDrive}
                  onDeleteSnapshot={handleDeleteBackupSnapshot}
                  onDisconnectGoogleDrive={handleDisconnectGoogleDrive}
                  onExportBackup={handleExportBackup}
                  onImportBackupJson={handleImportBackupJson}
                  onRestoreGoogleDriveBackup={handleRestoreGoogleDriveBackup}
                  onRestoreSnapshot={handleRestoreBackupSnapshot}
                  onUploadGoogleDriveBackup={handleUploadGoogleDriveBackup}
                />
              </section>
            </>
          ) : null}

          {activeView === 'trash' ? (
            <>
              <header className="workspace-header">
                <div>
                  <h1>Trash</h1>
                </div>
              </header>
              <TrashPanel
                activeTab={trashTab}
                backupSnapshots={trashedBackupSnapshots}
                deletingBackupFileName={permanentlyDeletingTrashedBackupFileName}
                deletingPullId={permanentlyDeletingPullId}
                error={trashError}
                isBackupLoading={trashBackupLoading}
                isBackupSelecting={backupTrashSelecting}
                isHistoryLoading={trashLoading}
                isSelecting={trashSelecting}
                onBackupDeleteAll={handleRequestDeleteAllTrashedBackups}
                onBackupDeleteSelected={handleRequestDeleteSelectedTrashedBackups}
                onBackupPermanentlyDelete={handleRequestDeleteTrashedBackup}
                onBackupRestore={handleRequestRestoreTrashedBackup}
                onBackupRestoreSelected={handleRequestRestoreSelectedTrashedBackups}
                onBackupSelectionModeChange={handleBackupTrashSelectionModeChange}
                onDeleteAll={handleRequestDeleteAllTrashPulls}
                onDeleteSelected={handleRequestDeleteSelectedTrashPulls}
                onPageChange={(page) => {
                  setTrashLoading(true)
                  setTrashPage(page)
                  setSelectedTrashPullIds(new Set())
                }}
                onPermanentlyDelete={handleRequestPermanentTrashDelete}
                onRestore={handleRequestRestoreTrashPull}
                onRestoreSelected={handleRequestRestoreSelectedTrashPulls}
                onSelectionModeChange={handleTrashSelectionModeChange}
                onTabChange={(tab) => {
                  setTrashTab(tab)
                  setTrashSelecting(false)
                  setSelectedTrashPullIds(new Set())
                  setBackupTrashSelecting(false)
                  setSelectedBackupTrashFileNames(new Set())
                }}
                onToggleBackupSelection={handleToggleBackupTrashSelection}
                onTogglePullSelection={handleToggleTrashPullSelection}
                page={trashPage}
                pageSize={trashPageSize}
                pulls={trashedPulls}
                restoringBackupFileName={restoringTrashedBackupFileName}
                restoringPullId={restoringTrashPullId}
                selectedBackupFileNames={selectedBackupTrashFileNames}
                selectedPullIds={selectedTrashPullIds}
                totalPulls={trashTotalPulls}
              />
            </>
          ) : null}
        </section>
      </main>

      <ManualImportDialog
        accounts={manualImportAccountOptions}
        fallbackBannerType={manualFallbackBannerType}
        isOpen={manualImportOpen}
        isSaving={manualImportSaving}
        note={manualNoteDraft}
        onSave={handleRequestManualImportSave}
        onClose={() => setManualImportOpen(false)}
        onNoteChange={handleManualNoteChange}
        onSaveNoticeClose={() => setManualImportSaveNotice(undefined)}
        onTargetAccountChange={setManualImportTargetAccountId}
        preview={manualImportPreview}
        saveNotice={manualImportSaveNotice}
        targetAccountId={manualImportTargetAccountId}
      />
      <ConfirmDialog
        confirmLabel="Import"
        confirmIcon={FileInput}
        danger={false}
        description={formatManualImportConfirmationDescription(
          manualImportConfirmation,
        )}
        isOpen={manualImportConfirmation !== undefined}
        isPending={manualImportSaving}
        onCancel={() => setManualImportConfirmation(undefined)}
        onConfirm={handleConfirmManualImport}
        pendingLabel="Importing"
        title="Import manual note?"
      />
      <ConfirmDialog
        confirmLabel={
          historyDeleteConfirmation?.kind === 'all'
            ? 'Move all to Trash'
            : 'Move to Trash'
        }
        description={formatHistoryDeleteDescription(historyDeleteConfirmation)}
        isOpen={historyDeleteConfirmation !== undefined}
        isPending={deletingSelectedHistory || deletingAllHistory}
        onCancel={() => setHistoryDeleteConfirmation(undefined)}
        onConfirm={handleConfirmHistoryDelete}
        title={
          historyDeleteConfirmation?.kind === 'all'
            ? 'Move all history to Trash?'
            : 'Move selected history to Trash?'
        }
      />
      <ConfirmDialog
        confirmLabel={
          backupConfirmation?.kind === 'delete_snapshot'
            ? 'Move to Trash'
            : 'Restore backup'
        }
        confirmIcon={
          backupConfirmation?.kind === 'delete_snapshot' ? Trash2 : RefreshCcw
        }
        danger={backupConfirmation?.kind === 'delete_snapshot'}
        description={formatBackupConfirmationDescription(backupConfirmation)}
        isOpen={backupConfirmation !== undefined}
        isPending={backupDeleting || backupRestoring || cloudBackupRestoring}
        onCancel={() => setBackupConfirmation(undefined)}
        onConfirm={handleConfirmBackupAction}
        title={formatBackupConfirmationTitle(backupConfirmation)}
      />
      <ImportDialog
        gameHistoryImportError={gameHistoryImportError}
        gameHistoryImportResult={gameHistoryImportResult}
        gameHistoryPathError={gameHistoryPathError}
        gameHistoryScan={gameHistoryScan}
        gameInstallPath={gameInstallPath}
        gameInstallPathReady={gameInstallPathReady}
        gamePathCandidates={gamePathCandidates}
        isGameHistoryImporting={gameHistoryImporting}
        isGameHistoryScanning={gameHistoryScanning}
        isGamePathScanning={gamePathScanning}
        isGamePathSelecting={gamePathSelecting}
        isOpen={importDialogOpen}
        manualImportPreview={manualImportPreview}
        onClose={() => setImportDialogOpen(false)}
        onFindGamePath={handleFindGamePath}
        onImportGameHistory={handleImportGameHistory}
        onSelectGamePath={handleSelectGamePath}
        onScanGameHistory={handleScanGameHistorySource}
        onUseGamePathCandidate={handleUseGamePathCandidate}
        onOpenManualImport={() => {
          setImportDialogOpen(false)
          handleOpenManualImport()
        }}
      />
      <ConfirmDialog
        confirmLabel="Restore"
        confirmIcon={RefreshCcw}
        danger={false}
        description={formatTrashRestoreDescription(trashRestoreConfirmation)}
        isOpen={trashRestoreConfirmation !== undefined}
        isPending={restoringTrashPullId !== undefined}
        onCancel={() => setTrashRestoreConfirmation(undefined)}
        onConfirm={handleConfirmTrashRestore}
        title={formatTrashRestoreTitle(trashRestoreConfirmation)}
      />
      <ConfirmDialog
        confirmLabel="Delete permanently"
        description={formatTrashDeleteDescription(trashDeleteConfirmation)}
        isOpen={trashDeleteConfirmation !== undefined}
        isPending={permanentlyDeletingPullId !== undefined}
        onCancel={() => setTrashDeleteConfirmation(undefined)}
        onConfirm={handleConfirmPermanentTrashDelete}
        title={formatTrashDeleteTitle(trashDeleteConfirmation)}
      />
      <ConfirmDialog
        confirmLabel={
          backupTrashConfirmation &&
          isBackupTrashRestoreConfirmation(backupTrashConfirmation)
            ? 'Restore'
            : 'Delete permanently'
        }
        confirmIcon={
          backupTrashConfirmation &&
          isBackupTrashRestoreConfirmation(backupTrashConfirmation)
            ? RefreshCcw
            : Trash2
        }
        danger={
          backupTrashConfirmation
            ? !isBackupTrashRestoreConfirmation(backupTrashConfirmation)
            : false
        }
        description={formatBackupTrashDescription(backupTrashConfirmation)}
        isOpen={backupTrashConfirmation !== undefined}
        isPending={
          restoringTrashedBackupFileName !== undefined ||
          permanentlyDeletingTrashedBackupFileName !== undefined
        }
        onCancel={() => setBackupTrashConfirmation(undefined)}
        onConfirm={handleConfirmBackupTrashAction}
        title={formatBackupTrashTitle(backupTrashConfirmation)}
      />
      <ConfirmDialog
        confirmLabel="Close app"
        confirmIcon={X}
        danger={false}
        description={formatCloseBackupWarningDescription(
          autoBackupRunning,
          autoBackupSyncStatus,
        )}
        isOpen={closeConfirmationOpen}
        isPending={false}
        onCancel={() => setCloseConfirmationOpen(false)}
        onConfirm={handleConfirmCloseApp}
        pendingLabel="Closing"
        title="Backup is not finished"
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

function formatCloseBackupWarningDescription(
  autoBackupRunning: boolean,
  status: AutoBackupSyncStatus | undefined,
) {
  if (autoBackupRunning) {
    return 'Miku Warp is still saving the latest backup. Closing now may leave the newest changes waiting for the next app launch.'
  }

  if (status?.cloudRequired && !status.cloudUpToDate) {
    return 'The latest local autosave is ready, but Google Drive backup is still pending. Closing now will keep local data safe and retry cloud backup next time.'
  }

  return 'The latest changes have not finished autosaving yet. Closing now may leave them waiting for the next app launch.'
}

function formatAccountMeta(account: WarpAccount | undefined) {
  if (!account) {
    return 'Asia server'
  }

  const region = account.region ?? 'asia'
  const pulls = account.totalPulls === 1 ? '1 pull' : `${account.totalPulls} pulls`

  return `${region.toUpperCase()} - ${pulls}`
}

function formatHistoryDeleteDescription(
  confirmation: HistoryDeleteConfirmation | undefined,
) {
  if (!confirmation) {
    return ''
  }

  if (confirmation.kind === 'selected') {
    return `${confirmation.totalPulls} selected history items will be moved to Trash for UID ${confirmation.uid}. Their banner pity will be recalculated, and they can be restored for 6 months.`
  }

  return `All ${confirmation.totalPulls} history records for UID ${confirmation.uid} will be moved to Trash. Other UIDs will not be affected, and these items can be restored for 6 months.`
}

function formatManualImportConfirmationDescription(
  confirmation: ManualImportConfirmation | undefined,
) {
  if (!confirmation) {
    return ''
  }

  return `${confirmation.totalPulls} detected pulls will be imported into UID ${confirmation.uid}. Existing matching pulls will be skipped as duplicates.`
}

function toManualImportAccountInput(
  account: ManualImportTargetAccount,
): ManualImportAccountInput {
  return {
    id: account.id,
    uid: account.uid,
    region: account.region ?? 'asia',
    nickname: account.nickname ?? 'Trailblazer',
  }
}

function formatBackupConfirmationDescription(
  confirmation: BackupConfirmation | undefined,
) {
  if (!confirmation) {
    return ''
  }

  if (confirmation.kind === 'restore_cloud_snapshot') {
    return 'This Google Drive autosave will be restored into the local database. Existing matching pulls will be skipped as duplicates.'
  }

  const uidLabel = formatBackupUidLabel(confirmation.snapshot.uids)

  if (confirmation.kind === 'delete_snapshot') {
    return `${confirmation.snapshot.fileName} (${uidLabel}) will be moved to Trash. Current history will not be changed, and the backup can still be restored from Trash.`
  }

  return `${confirmation.snapshot.fileName} contains ${uidLabel}. Its history will be merged into the local database, while matching records are skipped.`
}

function formatBackupConfirmationTitle(
  confirmation: BackupConfirmation | undefined,
) {
  if (confirmation?.kind === 'delete_snapshot') {
    return 'Move this backup to Trash?'
  }

  if (confirmation?.kind === 'restore_cloud_snapshot') {
    return 'Restore cloud backup?'
  }

  return 'Restore this backup?'
}

function formatBackupUidLabel(uids: string[]) {
  if (uids.length === 0) {
    return 'no identified UID'
  }

  if (uids.length === 1) {
    return `UID ${uids[0]}`
  }

  return `UIDs ${uids.join(', ')}`
}

function formatTrashRestoreDescription(
  confirmation: TrashPullMutationConfirmation | undefined,
) {
  if (!confirmation) {
    return ''
  }

  if (confirmation.kind === 'selected') {
    return `${confirmation.totalPulls} selected history items will return to UID ${confirmation.uid}, and their banner pity will be recalculated.`
  }

  if (confirmation.kind === 'single') {
    return `${confirmation.pull.itemName} will return to UID ${confirmation.uid} history, and its banner pity will be recalculated.`
  }

  return ''
}

function formatTrashRestoreTitle(
  confirmation: TrashPullMutationConfirmation | undefined,
) {
  if (confirmation?.kind === 'selected') {
    return 'Restore selected history?'
  }

  if (confirmation?.kind === 'single') {
    return 'Restore this history item?'
  }

  return ''
}

function formatTrashDeleteDescription(
  confirmation: TrashPullMutationConfirmation | undefined,
) {
  if (!confirmation) {
    return ''
  }

  if (confirmation.kind === 'selected') {
    return `${confirmation.totalPulls} selected history items will be permanently deleted from UID ${confirmation.uid}. This action cannot be undone.`
  }

  if (confirmation.kind === 'all') {
    return `All ${confirmation.totalPulls} history items in Trash for UID ${confirmation.uid} will be permanently deleted. This action cannot be undone.`
  }

  return `${confirmation.pull.itemName} will be permanently deleted from UID ${confirmation.uid}. This action cannot be undone.`
}

function formatTrashDeleteTitle(
  confirmation: TrashPullMutationConfirmation | undefined,
) {
  if (confirmation?.kind === 'selected') {
    return 'Delete selected permanently?'
  }

  if (confirmation?.kind === 'all') {
    return 'Delete all permanently?'
  }

  return 'Delete permanently?'
}

function formatBackupTrashDescription(
  confirmation: BackupTrashConfirmation | undefined,
) {
  if (!confirmation) {
    return ''
  }

  if ('snapshot' in confirmation) {
    return confirmation.kind === 'restore'
      ? `${confirmation.snapshot.fileName} will return to Local backup. It can be restored from the Backup page afterward.`
      : `${confirmation.snapshot.fileName} will be permanently deleted from Trash. This action cannot be undone.`
  }

  if (confirmation.kind === 'restore_selected') {
    return `${confirmation.totalBackups} selected backups will return to Local backup. They can be restored from the Backup page afterward.`
  }

  if (confirmation.kind === 'delete_selected') {
    return `${confirmation.totalBackups} selected backups will be permanently deleted from Trash. This action cannot be undone.`
  }

  if (confirmation.kind === 'delete_all') {
    return `All ${confirmation.totalBackups} backups in Trash will be permanently deleted. This action cannot be undone.`
  }
  return ''
}

function formatBackupTrashTitle(
  confirmation: BackupTrashConfirmation | undefined,
) {
  if (!confirmation) {
    return ''
  }

  if (isBackupTrashRestoreConfirmation(confirmation)) {
    return confirmation.kind === 'restore_selected'
      ? 'Restore selected backups?'
      : 'Restore this backup?'
  }

  if (confirmation.kind === 'delete_selected') {
    return 'Delete selected backups permanently?'
  }

  if (confirmation.kind === 'delete_all') {
    return 'Delete all backups permanently?'
  }

  return 'Delete backup permanently?'
}

function isBackupTrashRestoreConfirmation(
  confirmation: BackupTrashConfirmation,
) {
  return (
    confirmation.kind === 'restore' ||
    confirmation.kind === 'restore_selected'
  )
}

function getBackupTrashFileNames(confirmation: BackupTrashConfirmation) {
  if ('snapshot' in confirmation) {
    return [confirmation.snapshot.fileName]
  }

  return confirmation.fileNames
}

type BrowserWindowWithTauri = Window & {
  __TAURI__?: unknown
  __TAURI_INTERNALS__?: unknown
}

function isTauriRuntime() {
  if (typeof window === 'undefined') {
    return false
  }

  const maybeTauriWindow = window as BrowserWindowWithTauri

  return Boolean(
    maybeTauriWindow.__TAURI__ || maybeTauriWindow.__TAURI_INTERNALS__,
  )
}

function getTauriWindow() {
  if (!isTauriRuntime()) {
    return undefined
  }

  try {
    return getCurrentWindow()
  } catch {
    return undefined
  }
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

async function waitForGoogleDriveAuthCompletion(
  refreshStatus: () => Promise<CloudBackupStatus>,
  onStatus: (status: CloudBackupStatus) => void,
  isActive: () => boolean,
) {
  if (!isActive()) {
    return undefined
  }

  let status = await refreshStatus()

  if (!isActive()) {
    return undefined
  }

  onStatus(status)

  for (let attempt = 0; attempt < 190; attempt += 1) {
    if (status.connectionStatus === 'connected') {
      return status
    }

    if (status.connectionStatus === 'connection_failed') {
      return status
    }

    await delay(1000)

    if (!isActive()) {
      return undefined
    }

    status = await refreshStatus()

    if (!isActive()) {
      return undefined
    }

    onStatus(status)
  }

  return status
}

function delay(milliseconds: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds)
  })
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
