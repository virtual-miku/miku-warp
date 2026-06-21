import { useState } from 'react'
import {
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  FileJson,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react'
import type { TrashedBackupSnapshotSummary } from '../../persistence/data/backup-export'
import { AccountAvatar } from '../../accounts/components/AccountAvatar'
import { getCatalogAssetUrl } from '../../warp-history/data/catalog-assets'
import { getBannerLabel } from '../../warp-history/domain/banner'
import { AppButton } from '../../../shared/ui/AppButton'
import type { TrashedAccount, TrashedWarpPull } from '../data/trash-history'

export type TrashTab = 'history' | 'accounts' | 'backups'

type TrashPanelProps = {
  activeTab: TrashTab
  accounts: TrashedAccount[]
  backupSnapshots: TrashedBackupSnapshotSummary[]
  deletingAccountId?: string
  deletingBackupFileName?: string
  deletingPullId?: string
  error?: string
  isAccountLoading: boolean
  isBackupLoading: boolean
  isBackupSelecting: boolean
  isHistoryLoading: boolean
  isSelecting: boolean
  page: number
  pageSize: number
  pulls: TrashedWarpPull[]
  restoringAccountId?: string
  restoringBackupFileName?: string
  restoringPullId?: string
  selectedBackupFileNames: Set<string>
  selectedPullIds: Set<string>
  totalPulls: number
  onAccountPermanentlyDelete: (account: TrashedAccount) => void
  onAccountRestore: (account: TrashedAccount) => void
  onBackupDeleteAll: () => void
  onBackupDeleteSelected: () => void
  onBackupPermanentlyDelete: (snapshot: TrashedBackupSnapshotSummary) => void
  onBackupRestore: (snapshot: TrashedBackupSnapshotSummary) => void
  onBackupRestoreSelected: () => void
  onBackupSelectionModeChange: (isSelecting: boolean) => void
  onDeleteAll: () => void
  onDeleteSelected: () => void
  onPageChange: (page: number) => void
  onPermanentlyDelete: (pull: TrashedWarpPull) => void
  onRestore: (pull: TrashedWarpPull) => void
  onRestoreSelected: () => void
  onSelectionModeChange: (isSelecting: boolean) => void
  onTabChange: (tab: TrashTab) => void
  onToggleBackupSelection: (fileName: string) => void
  onTogglePullSelection: (pullId: string) => void
}

export function TrashPanel({
  activeTab,
  accounts,
  backupSnapshots,
  deletingAccountId,
  deletingBackupFileName,
  deletingPullId,
  error,
  isAccountLoading,
  isBackupLoading,
  isBackupSelecting,
  isHistoryLoading,
  isSelecting,
  page,
  pageSize,
  pulls,
  restoringAccountId,
  restoringBackupFileName,
  restoringPullId,
  selectedBackupFileNames,
  selectedPullIds,
  totalPulls,
  onAccountPermanentlyDelete,
  onAccountRestore,
  onBackupDeleteAll,
  onBackupDeleteSelected,
  onBackupPermanentlyDelete,
  onBackupRestore,
  onBackupRestoreSelected,
  onBackupSelectionModeChange,
  onDeleteAll,
  onDeleteSelected,
  onPageChange,
  onPermanentlyDelete,
  onRestore,
  onRestoreSelected,
  onSelectionModeChange,
  onTabChange,
  onToggleBackupSelection,
  onTogglePullSelection,
}: TrashPanelProps) {
  const pageCount = Math.max(1, Math.ceil(totalPulls / pageSize))
  const isHistoryMutating =
    deletingPullId !== undefined || restoringPullId !== undefined
  const isAccountMutating =
    deletingAccountId !== undefined || restoringAccountId !== undefined
  const isBackupMutating =
    deletingBackupFileName !== undefined || restoringBackupFileName !== undefined
  const isMutating = isHistoryMutating || isAccountMutating || isBackupMutating
  const titleByTab: Record<TrashTab, string> = {
    history: 'Deleted history',
    accounts: 'Deleted accounts',
    backups: 'Deleted backups',
  }

  return (
    <section className="history-panel trash-panel" aria-label="Trash history">
      <header className="panel-header">
        <div>
          <h2>{titleByTab[activeTab]}</h2>
          <span>Items are removed permanently after 6 months.</span>
        </div>
        {activeTab === 'history' ? (
          <TrashHistoryActions
            isDeleting={deletingPullId !== undefined}
            isLoading={isHistoryLoading}
            isRestoring={restoringPullId !== undefined}
            isSelecting={isSelecting}
            selectedCount={selectedPullIds.size}
            totalPulls={totalPulls}
            onDeleteAll={onDeleteAll}
            onDeleteSelected={onDeleteSelected}
            onRestoreSelected={onRestoreSelected}
            onSelectionModeChange={onSelectionModeChange}
          />
        ) : activeTab === 'backups' ? (
          <TrashBackupActions
            isDeleting={deletingBackupFileName !== undefined}
            isLoading={isBackupLoading}
            isRestoring={restoringBackupFileName !== undefined}
            isSelecting={isBackupSelecting}
            selectedCount={selectedBackupFileNames.size}
            totalBackups={backupSnapshots.length}
            onDeleteAll={onBackupDeleteAll}
            onDeleteSelected={onBackupDeleteSelected}
            onRestoreSelected={onBackupRestoreSelected}
            onSelectionModeChange={onBackupSelectionModeChange}
          />
        ) : null}
      </header>
      <div className="banner-tabs trash-tabs" role="tablist" aria-label="Trash categories">
        <button
          aria-selected={activeTab === 'history'}
          className={activeTab === 'history' ? 'banner-tab banner-tab-active' : 'banner-tab'}
          onClick={() => onTabChange('history')}
          role="tab"
          type="button"
        >
          History {totalPulls}
        </button>
        <button
          aria-selected={activeTab === 'accounts'}
          className={activeTab === 'accounts' ? 'banner-tab banner-tab-active' : 'banner-tab'}
          onClick={() => onTabChange('accounts')}
          role="tab"
          type="button"
        >
          Accounts {accounts.length}
        </button>
        <button
          aria-selected={activeTab === 'backups'}
          className={activeTab === 'backups' ? 'banner-tab banner-tab-active' : 'banner-tab'}
          onClick={() => onTabChange('backups')}
          role="tab"
          type="button"
        >
          Backups {backupSnapshots.length}
        </button>
      </div>

      {error ? (
        <div className="trash-error" role="alert">
          {error}
        </div>
      ) : null}

      <div className="trash-list">
        {activeTab === 'history' ? (
          pulls.length > 0 ? (
            pulls.map((pull) => (
              <TrashRow
                isDeleting={deletingPullId === pull.id}
                isDisabled={isMutating}
                isRestoring={restoringPullId === pull.id}
                isSelecting={isSelecting}
                key={pull.id}
                onPermanentlyDelete={onPermanentlyDelete}
                onRestore={onRestore}
                onToggleSelection={onTogglePullSelection}
                pull={pull}
                selected={selectedPullIds.has(pull.id)}
              />
            ))
          ) : (
            <div className="warp-empty">
              <strong>{isHistoryLoading ? 'Loading Trash' : 'Trash is empty'}</strong>
              <span>Deleted warp records will stay here for 6 months.</span>
            </div>
          )
        ) : activeTab === 'accounts' ? (
          accounts.length > 0 ? (
            accounts.map((account) => (
              <TrashAccountRow
                account={account}
                isDeleting={deletingAccountId === account.id}
                isDisabled={isMutating}
                isRestoring={restoringAccountId === account.id}
                key={account.id}
                onPermanentlyDelete={onAccountPermanentlyDelete}
                onRestore={onAccountRestore}
              />
            ))
          ) : (
            <div className="warp-empty">
              <strong>
                {isAccountLoading ? 'Loading account Trash' : 'No deleted accounts'}
              </strong>
              <span>Deleted accounts will stay here for 6 months.</span>
            </div>
          )
        ) : backupSnapshots.length > 0 ? (
          backupSnapshots.map((snapshot) => (
            <TrashBackupRow
              isDeleting={deletingBackupFileName === snapshot.fileName}
              isDisabled={isMutating}
              isRestoring={restoringBackupFileName === snapshot.fileName}
              isSelecting={isBackupSelecting}
              key={snapshot.fileName}
              onPermanentlyDelete={onBackupPermanentlyDelete}
              onRestore={onBackupRestore}
              onToggleSelection={onToggleBackupSelection}
              selected={selectedBackupFileNames.has(snapshot.fileName)}
              snapshot={snapshot}
            />
          ))
        ) : (
          <div className="warp-empty">
            <strong>
              {isBackupLoading ? 'Loading backup Trash' : 'No deleted backups'}
            </strong>
            <span>Deleted local backups will stay here for 6 months.</span>
          </div>
        )}
      </div>

      {activeTab === 'history' ? (
        <footer className="history-pagination" aria-label="Trash pagination">
          <span>Page {page}/{pageCount}</span>
          <div className="manual-pagination-controls">
            <button
              aria-label="Previous Trash page"
              className="icon-button"
              disabled={page <= 1 || isHistoryLoading || isMutating}
              onClick={() => onPageChange(page - 1)}
              type="button"
            >
              <ChevronLeft size={16} aria-hidden="true" />
            </button>
            <button
              aria-label="Next Trash page"
              className="icon-button"
              disabled={page >= pageCount || isHistoryLoading || isMutating}
              onClick={() => onPageChange(page + 1)}
              type="button"
            >
              <ChevronRight size={16} aria-hidden="true" />
            </button>
          </div>
        </footer>
      ) : null}
    </section>
  )
}

function TrashHistoryActions({
  isDeleting,
  isLoading,
  isRestoring,
  isSelecting,
  selectedCount,
  totalPulls,
  onDeleteAll,
  onDeleteSelected,
  onRestoreSelected,
  onSelectionModeChange,
}: {
  isDeleting: boolean
  isLoading: boolean
  isRestoring: boolean
  isSelecting: boolean
  selectedCount: number
  totalPulls: number
  onDeleteAll: () => void
  onDeleteSelected: () => void
  onRestoreSelected: () => void
  onSelectionModeChange: (isSelecting: boolean) => void
}) {
  const isMutating = isDeleting || isRestoring

  if (isSelecting) {
    return (
      <div className="history-header-actions">
        <button
          className="history-select-button"
          disabled={selectedCount === 0 || isLoading || isMutating}
          onClick={onRestoreSelected}
          type="button"
        >
          <RotateCcw size={14} aria-hidden="true" />
          Restore selected ({selectedCount})
        </button>
        <button
          className="history-delete-all-button"
          disabled={selectedCount === 0 || isLoading || isMutating}
          onClick={onDeleteSelected}
          type="button"
        >
          <Trash2 size={14} aria-hidden="true" />
          Delete selected ({selectedCount})
        </button>
        <button
          className="history-delete-all-button"
          disabled={totalPulls === 0 || isLoading || isMutating}
          onClick={onDeleteAll}
          type="button"
        >
          <Trash2 size={14} aria-hidden="true" />
          Delete all
        </button>
        <button
          className="history-select-button"
          disabled={isMutating}
          onClick={() => onSelectionModeChange(false)}
          type="button"
        >
          <X size={14} aria-hidden="true" />
          Cancel
        </button>
      </div>
    )
  }

  return (
    <button
      className="history-select-button"
      disabled={totalPulls === 0 || isLoading || isMutating}
      onClick={() => onSelectionModeChange(true)}
      type="button"
    >
      <CheckSquare size={14} aria-hidden="true" />
      Select
    </button>
  )
}

function TrashBackupActions({
  isDeleting,
  isLoading,
  isRestoring,
  isSelecting,
  selectedCount,
  totalBackups,
  onDeleteAll,
  onDeleteSelected,
  onRestoreSelected,
  onSelectionModeChange,
}: {
  isDeleting: boolean
  isLoading: boolean
  isRestoring: boolean
  isSelecting: boolean
  selectedCount: number
  totalBackups: number
  onDeleteAll: () => void
  onDeleteSelected: () => void
  onRestoreSelected: () => void
  onSelectionModeChange: (isSelecting: boolean) => void
}) {
  const isMutating = isDeleting || isRestoring

  if (isSelecting) {
    return (
      <div className="history-header-actions">
        <button
          className="history-select-button"
          disabled={selectedCount === 0 || isLoading || isMutating}
          onClick={onRestoreSelected}
          type="button"
        >
          <RotateCcw size={14} aria-hidden="true" />
          Restore selected ({selectedCount})
        </button>
        <button
          className="history-delete-all-button"
          disabled={selectedCount === 0 || isLoading || isMutating}
          onClick={onDeleteSelected}
          type="button"
        >
          <Trash2 size={14} aria-hidden="true" />
          Delete selected ({selectedCount})
        </button>
        <button
          className="history-delete-all-button"
          disabled={totalBackups === 0 || isLoading || isMutating}
          onClick={onDeleteAll}
          type="button"
        >
          <Trash2 size={14} aria-hidden="true" />
          Delete all
        </button>
        <button
          className="history-select-button"
          disabled={isMutating}
          onClick={() => onSelectionModeChange(false)}
          type="button"
        >
          <X size={14} aria-hidden="true" />
          Cancel
        </button>
      </div>
    )
  }

  return (
    <button
      className="history-select-button"
      disabled={totalBackups === 0 || isLoading || isMutating}
      onClick={() => onSelectionModeChange(true)}
      type="button"
    >
      <CheckSquare size={14} aria-hidden="true" />
      Select
    </button>
  )
}

function TrashRow({
  isDeleting,
  isDisabled,
  isSelecting,
  isRestoring,
  onPermanentlyDelete,
  onRestore,
  onToggleSelection,
  pull,
  selected,
}: {
  isDeleting: boolean
  isDisabled: boolean
  isSelecting: boolean
  isRestoring: boolean
  onPermanentlyDelete: (pull: TrashedWarpPull) => void
  onRestore: (pull: TrashedWarpPull) => void
  onToggleSelection: (pullId: string) => void
  pull: TrashedWarpPull
  selected: boolean
}) {
  return (
    <article className={isSelecting ? 'trash-row trash-row-selecting' : 'trash-row'}>
      {isSelecting ? (
        <input
          aria-label={`Select ${pull.itemName}`}
          checked={selected}
          className="history-select-checkbox"
          disabled={isDisabled}
          onChange={() => onToggleSelection(pull.id)}
          type="checkbox"
        />
      ) : null}
      <TrashItemIcon iconPath={pull.iconPath} rarity={pull.rarity} />
      <div className="trash-item-copy">
        <strong className={`warp-item-name warp-item-name-${pull.rarity}`}>
          {pull.itemName}
        </strong>
        <span>{getBannerLabel(pull.bannerType)}</span>
      </div>
      <div className="trash-date">
        <span>Warped {formatDateTime(pull.pulledAt)}</span>
        <span>Deleted {formatDateTime(pull.deletedAt, true)}</span>
      </div>
      <div className="trash-actions">
        <AppButton
          disabled={isDisabled}
          icon={RotateCcw}
          onClick={() => onRestore(pull)}
          variant="ghost"
        >
          {isRestoring ? 'Restoring' : 'Restore'}
        </AppButton>
        <button
          aria-label={
            isDeleting
              ? `Deleting ${pull.itemName}`
              : `Permanently delete ${pull.itemName}`
          }
          className="icon-button trash-permanent-button"
          disabled={isDisabled}
          onClick={() => onPermanentlyDelete(pull)}
          title="Delete permanently"
          type="button"
        >
          <Trash2 size={16} aria-hidden="true" />
        </button>
      </div>
    </article>
  )
}

function TrashBackupRow({
  isDeleting,
  isDisabled,
  isSelecting,
  isRestoring,
  onPermanentlyDelete,
  onRestore,
  onToggleSelection,
  selected,
  snapshot,
}: {
  isDeleting: boolean
  isDisabled: boolean
  isSelecting: boolean
  isRestoring: boolean
  onPermanentlyDelete: (snapshot: TrashedBackupSnapshotSummary) => void
  onRestore: (snapshot: TrashedBackupSnapshotSummary) => void
  onToggleSelection: (fileName: string) => void
  selected: boolean
  snapshot: TrashedBackupSnapshotSummary
}) {
  return (
    <article
      className={
        isSelecting
          ? 'trash-row trash-backup-row trash-row-selecting'
          : 'trash-row trash-backup-row'
      }
    >
      {isSelecting ? (
        <input
          aria-label={`Select ${snapshot.fileName}`}
          checked={selected}
          className="history-select-checkbox"
          disabled={isDisabled}
          onChange={() => onToggleSelection(snapshot.fileName)}
          type="checkbox"
        />
      ) : null}
      <div className="trash-backup-icon" aria-hidden="true">
        <FileJson size={19} />
      </div>
      <div className="trash-item-copy">
        <strong>Backup {formatDateTime(snapshot.exportedAt)}</strong>
        <span title={snapshot.fileName}>{snapshot.fileName}</span>
      </div>
      <div className="trash-date">
        <span>{formatBackupSizeKilobytes(snapshot.sizeBytes)}</span>
        <span>Deleted {formatDateTime(snapshot.deletedAtUnixMs)}</span>
      </div>
      <div className="trash-actions">
        <AppButton
          disabled={isDisabled}
          icon={RotateCcw}
          onClick={() => onRestore(snapshot)}
          variant="ghost"
        >
          {isRestoring ? 'Restoring' : 'Restore'}
        </AppButton>
        <button
          aria-label={
            isDeleting
              ? `Deleting ${snapshot.fileName}`
              : `Permanently delete ${snapshot.fileName}`
          }
          className="icon-button trash-permanent-button"
          disabled={isDisabled}
          onClick={() => onPermanentlyDelete(snapshot)}
          title="Delete permanently"
          type="button"
        >
          <Trash2 size={16} aria-hidden="true" />
        </button>
      </div>
    </article>
  )
}

function TrashAccountRow({
  account,
  isDeleting,
  isDisabled,
  isRestoring,
  onPermanentlyDelete,
  onRestore,
}: {
  account: TrashedAccount
  isDeleting: boolean
  isDisabled: boolean
  isRestoring: boolean
  onPermanentlyDelete: (account: TrashedAccount) => void
  onRestore: (account: TrashedAccount) => void
}) {
  return (
    <article className="trash-row trash-account-row">
      <div className="trash-account-avatar" aria-hidden="true">
        <AccountAvatar avatarPath={account.avatarPath} fallbackSize={18} />
      </div>
      <div className="trash-item-copy">
        <strong>UID {account.uid}</strong>
        <span>{formatAccountMeta(account)}</span>
      </div>
      <div className="trash-date">
        <span>{formatLastPull(account.lastPullAt)}</span>
        <span>Deleted {formatDateTime(account.deletedAt, true)}</span>
      </div>
      <div className="trash-actions">
        <AppButton
          disabled={isDisabled}
          icon={RotateCcw}
          onClick={() => onRestore(account)}
          variant="ghost"
        >
          {isRestoring ? 'Restoring' : 'Restore'}
        </AppButton>
        <button
          aria-label={
            isDeleting
              ? `Deleting UID ${account.uid}`
              : `Permanently delete UID ${account.uid}`
          }
          className="icon-button trash-permanent-button"
          disabled={isDisabled}
          onClick={() => onPermanentlyDelete(account)}
          title="Delete permanently"
          type="button"
        >
          <Trash2 size={16} aria-hidden="true" />
        </button>
      </div>
    </article>
  )
}

function TrashItemIcon({
  iconPath,
  rarity,
}: {
  iconPath?: string
  rarity: TrashedWarpPull['rarity']
}) {
  const [hasImageError, setHasImageError] = useState(false)
  const iconUrl = getCatalogAssetUrl(iconPath)

  return (
    <div className={`warp-item-icon warp-item-icon-${rarity}`}>
      {iconUrl && !hasImageError ? (
        <img
          alt=""
          loading="lazy"
          onError={() => setHasImageError(true)}
          src={iconUrl}
        />
      ) : (
        <span>{rarity}</span>
      )}
    </div>
  )
}

function formatAccountMeta(account: TrashedAccount) {
  const pulls =
    account.totalPulls === 1 ? '1 pull' : `${account.totalPulls} pulls`
  const region = account.region ?? 'asia'

  return `${pulls} - ${region.toUpperCase()}`
}

function formatLastPull(value: string | undefined) {
  return value ? `Last pull ${formatDateTime(value)}` : 'No saved pulls'
}

function formatDateTime(value: string | number, isUtc = false) {
  const normalizedValue =
    typeof value === 'string' && isUtc && !value.endsWith('Z')
      ? `${value}Z`
      : value
  const date = new Date(normalizedValue)
  const dateLabel = new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date)
  const timeLabel = [date.getHours(), date.getMinutes(), date.getSeconds()]
    .map((part) => part.toString().padStart(2, '0'))
    .join(':')

  return `${dateLabel}, ${timeLabel}`
}

function formatBackupSizeKilobytes(size: number) {
  if (!Number.isFinite(size) || size < 0) {
    return 'Size unavailable'
  }

  const kilobytes = Math.max(1, Math.round(size / 1024))

  return `${new Intl.NumberFormat('id-ID').format(kilobytes)} KB`
}
