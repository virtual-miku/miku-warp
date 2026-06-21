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
import { AppButton } from '../../../shared/ui/AppButton'
import type { TrashedAccount, TrashedWarpPull } from '../data/trash-history'
import {
  formatRetentionLabel,
  type AppLanguage,
  type Translator,
  type TimeZonePreference,
} from '../../settings/domain/localization'
import {
  formatDateTime as formatDateTimeValue,
  formatNumber,
  type DateTimePreferences,
} from '../../../shared/lib/date-time'
import { useLocalization } from '../../settings/components/localization-context'
import {
  formatLocalizedPullCount,
  getLocalizedBannerLabel,
} from '../../settings/domain/localized-labels'

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
  language: AppLanguage
  page: number
  pageSize: number
  pulls: TrashedWarpPull[]
  restoringAccountId?: string
  restoringBackupFileName?: string
  restoringPullId?: string
  selectedBackupFileNames: Set<string>
  selectedPullIds: Set<string>
  totalPulls: number
  trashRetentionDays: number
  timeZone: TimeZonePreference
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
  language,
  page,
  pageSize,
  pulls,
  restoringAccountId,
  restoringBackupFileName,
  restoringPullId,
  selectedBackupFileNames,
  selectedPullIds,
  totalPulls,
  trashRetentionDays,
  timeZone,
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
  const { t } = useLocalization()
  const dateTimePreferences = { language, timeZone }
  const retentionLabel = formatRetentionLabel(language, trashRetentionDays)
  const pageCount = Math.max(1, Math.ceil(totalPulls / pageSize))
  const isHistoryMutating =
    deletingPullId !== undefined || restoringPullId !== undefined
  const isAccountMutating =
    deletingAccountId !== undefined || restoringAccountId !== undefined
  const isBackupMutating =
    deletingBackupFileName !== undefined || restoringBackupFileName !== undefined
  const isMutating = isHistoryMutating || isAccountMutating || isBackupMutating
  const titleByTab: Record<TrashTab, string> = {
    history: t('trash.deletedHistory'),
    accounts: t('trash.deletedAccounts'),
    backups: t('trash.deletedBackups'),
  }

  return (
    <section className="history-panel trash-panel" aria-label={t('trash.ariaLabel')}>
      <header className="panel-header">
        <div>
          <h2>{titleByTab[activeTab]}</h2>
          <span>
            {trashRetentionDays === 0
              ? t('trash.summary.never')
              : t('trash.summary', {
                  retention: retentionLabel,
                })}
          </span>
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
      <div className="banner-tabs trash-tabs" role="tablist" aria-label={t('trash.categories')}>
        <button
          aria-selected={activeTab === 'history'}
          className={activeTab === 'history' ? 'banner-tab banner-tab-active' : 'banner-tab'}
          onClick={() => onTabChange('history')}
          role="tab"
          type="button"
        >
          {t('trash.tabHistory', { count: totalPulls })}
        </button>
        <button
          aria-selected={activeTab === 'accounts'}
          className={activeTab === 'accounts' ? 'banner-tab banner-tab-active' : 'banner-tab'}
          onClick={() => onTabChange('accounts')}
          role="tab"
          type="button"
        >
          {t('trash.tabAccounts', { count: accounts.length })}
        </button>
        <button
          aria-selected={activeTab === 'backups'}
          className={activeTab === 'backups' ? 'banner-tab banner-tab-active' : 'banner-tab'}
          onClick={() => onTabChange('backups')}
          role="tab"
          type="button"
        >
          {t('trash.tabBackups', { count: backupSnapshots.length })}
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
                dateTimePreferences={dateTimePreferences}
                selected={selectedPullIds.has(pull.id)}
              />
            ))
          ) : (
            <div className="warp-empty">
              <strong>{isHistoryLoading ? t('trash.loading') : t('trash.empty')}</strong>
              <span>
                {trashRetentionDays === 0
                  ? t('trash.summary.never')
                  : t('trash.history.empty', {
                      retention: retentionLabel,
                    })}
              </span>
            </div>
          )
        ) : activeTab === 'accounts' ? (
          accounts.length > 0 ? (
            accounts.map((account) => (
              <TrashAccountRow
                account={account}
                dateTimePreferences={dateTimePreferences}
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
                {isAccountLoading ? t('trash.loadingAccounts') : t('trash.noAccounts')}
              </strong>
              <span>
                {trashRetentionDays === 0
                  ? t('trash.summary.never')
                  : t('trash.accounts.empty', {
                      retention: retentionLabel,
                    })}
              </span>
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
              dateTimePreferences={dateTimePreferences}
            />
          ))
        ) : (
          <div className="warp-empty">
            <strong>
              {isBackupLoading ? t('trash.loadingBackups') : t('trash.noBackups')}
            </strong>
            <span>
              {trashRetentionDays === 0
                ? t('trash.summary.never')
                : t('trash.backups.empty', {
                    retention: retentionLabel,
                  })}
            </span>
          </div>
        )}
      </div>

      {activeTab === 'history' ? (
        <footer className="history-pagination" aria-label={t('trash.pagination')}>
          <span>{t('common.page', { page, pages: pageCount })}</span>
          <div className="manual-pagination-controls">
            <button
              aria-label={t('trash.previousPage')}
              className="icon-button"
              disabled={page <= 1 || isHistoryLoading || isMutating}
              onClick={() => onPageChange(page - 1)}
              type="button"
            >
              <ChevronLeft size={16} aria-hidden="true" />
            </button>
            <button
              aria-label={t('trash.nextPage')}
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
  const { t } = useLocalization()
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
          {t('trash.restoreSelected', { count: selectedCount })}
        </button>
        <button
          className="history-delete-all-button"
          disabled={selectedCount === 0 || isLoading || isMutating}
          onClick={onDeleteSelected}
          type="button"
        >
          <Trash2 size={14} aria-hidden="true" />
          {t('common.deleteSelected', { count: selectedCount })}
        </button>
        <button
          className="history-delete-all-button"
          disabled={totalPulls === 0 || isLoading || isMutating}
          onClick={onDeleteAll}
          type="button"
        >
          <Trash2 size={14} aria-hidden="true" />
          {t('common.deleteAll')}
        </button>
        <button
          className="history-select-button"
          disabled={isMutating}
          onClick={() => onSelectionModeChange(false)}
          type="button"
        >
          <X size={14} aria-hidden="true" />
          {t('common.cancel')}
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
      {t('common.select')}
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
  const { t } = useLocalization()
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
          {t('trash.restoreSelected', { count: selectedCount })}
        </button>
        <button
          className="history-delete-all-button"
          disabled={selectedCount === 0 || isLoading || isMutating}
          onClick={onDeleteSelected}
          type="button"
        >
          <Trash2 size={14} aria-hidden="true" />
          {t('common.deleteSelected', { count: selectedCount })}
        </button>
        <button
          className="history-delete-all-button"
          disabled={totalBackups === 0 || isLoading || isMutating}
          onClick={onDeleteAll}
          type="button"
        >
          <Trash2 size={14} aria-hidden="true" />
          {t('common.deleteAll')}
        </button>
        <button
          className="history-select-button"
          disabled={isMutating}
          onClick={() => onSelectionModeChange(false)}
          type="button"
        >
          <X size={14} aria-hidden="true" />
          {t('common.cancel')}
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
      {t('common.select')}
    </button>
  )
}

function TrashRow({
  dateTimePreferences,
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
  dateTimePreferences: DateTimePreferences
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
  const { t } = useLocalization()
  return (
    <article className={isSelecting ? 'trash-row trash-row-selecting' : 'trash-row'}>
      {isSelecting ? (
        <input
          aria-label={t('history.selectItem', { item: pull.itemName })}
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
        <span>{getLocalizedBannerLabel(t, pull.bannerType)}</span>
      </div>
      <div className="trash-date">
        <span>
          {t('trash.warpedAt', {
            date: formatDateTimeValue(pull.pulledAt, dateTimePreferences) ?? '',
          })}
        </span>
        <span>
          {t('trash.deletedAt', {
            date:
              formatDateTimeValue(pull.deletedAt, dateTimePreferences, {
                assumeUtc: true,
              }) ?? '',
          })}
        </span>
      </div>
      <div className="trash-actions">
        <AppButton
          disabled={isDisabled}
          icon={RotateCcw}
          onClick={() => onRestore(pull)}
          variant="ghost"
        >
          {isRestoring ? t('common.restoring') : t('common.restore')}
        </AppButton>
        <button
          aria-label={
            isDeleting
              ? t('trash.deletingItem', { item: pull.itemName })
              : t('trash.permanentlyDeleteItem', { item: pull.itemName })
          }
          className="icon-button trash-permanent-button"
          disabled={isDisabled}
          onClick={() => onPermanentlyDelete(pull)}
          title={t('common.deletePermanently')}
          type="button"
        >
          <Trash2 size={16} aria-hidden="true" />
        </button>
      </div>
    </article>
  )
}

function TrashBackupRow({
  dateTimePreferences,
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
  dateTimePreferences: DateTimePreferences
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
  const { t } = useLocalization()
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
          aria-label={t('trash.selectBackup', { file: snapshot.fileName })}
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
        <strong>
          {t('backup.snapshotAt', {
            date: formatDateTimeValue(snapshot.exportedAt, dateTimePreferences) ?? '',
          })}
        </strong>
        <span title={snapshot.fileName}>{snapshot.fileName}</span>
      </div>
      <div className="trash-date">
        <span>
          {formatBackupSizeKilobytes(
            snapshot.sizeBytes,
            dateTimePreferences,
            t,
          )}
        </span>
        <span>
          {t('trash.deletedAt', {
            date:
              formatDateTimeValue(snapshot.deletedAtUnixMs, dateTimePreferences) ?? '',
          })}
        </span>
      </div>
      <div className="trash-actions">
        <AppButton
          disabled={isDisabled}
          icon={RotateCcw}
          onClick={() => onRestore(snapshot)}
          variant="ghost"
        >
          {isRestoring ? t('common.restoring') : t('common.restore')}
        </AppButton>
        <button
          aria-label={
            isDeleting
              ? t('trash.deletingBackup', { file: snapshot.fileName })
              : t('trash.permanentlyDeleteBackup', { file: snapshot.fileName })
          }
          className="icon-button trash-permanent-button"
          disabled={isDisabled}
          onClick={() => onPermanentlyDelete(snapshot)}
          title={t('common.deletePermanently')}
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
  dateTimePreferences,
  isDeleting,
  isDisabled,
  isRestoring,
  onPermanentlyDelete,
  onRestore,
}: {
  account: TrashedAccount
  dateTimePreferences: DateTimePreferences
  isDeleting: boolean
  isDisabled: boolean
  isRestoring: boolean
  onPermanentlyDelete: (account: TrashedAccount) => void
  onRestore: (account: TrashedAccount) => void
}) {
  const { t } = useLocalization()
  return (
    <article className="trash-row trash-account-row">
      <div className="trash-account-avatar" aria-hidden="true">
        <AccountAvatar avatarPath={account.avatarPath} fallbackSize={18} />
      </div>
      <div className="trash-item-copy">
        <strong>UID {account.uid}</strong>
        <span>{formatAccountMeta(account, t)}</span>
      </div>
      <div className="trash-date">
        <span>{formatLastPull(account.lastPullAt, dateTimePreferences, t)}</span>
        <span>
          {t('trash.deletedAt', {
            date:
              formatDateTimeValue(account.deletedAt, dateTimePreferences, {
                assumeUtc: true,
              }) ?? '',
          })}
        </span>
      </div>
      <div className="trash-actions">
        <AppButton
          disabled={isDisabled}
          icon={RotateCcw}
          onClick={() => onRestore(account)}
          variant="ghost"
        >
          {isRestoring ? t('common.restoring') : t('common.restore')}
        </AppButton>
        <button
          aria-label={
            isDeleting
              ? t('trash.deletingAccount', { uid: account.uid })
              : t('trash.permanentlyDeleteAccount', { uid: account.uid })
          }
          className="icon-button trash-permanent-button"
          disabled={isDisabled}
          onClick={() => onPermanentlyDelete(account)}
          title={t('common.deletePermanently')}
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

function formatAccountMeta(account: TrashedAccount, t: Translator) {
  const pulls = formatLocalizedPullCount(t, account.totalPulls)
  const region = account.region ?? 'asia'

  return `${pulls} - ${region.toUpperCase()}`
}

function formatLastPull(
  value: string | undefined,
  preferences: DateTimePreferences,
  t: Translator,
) {
  return value
    ? t('accounts.lastPull', {
        date: formatDateTimeValue(value, preferences) ?? '',
      })
    : t('accounts.noSavedPulls')
}

function formatBackupSizeKilobytes(
  size: number,
  preferences: DateTimePreferences,
  t: Translator,
) {
  if (!Number.isFinite(size) || size < 0) {
    return t('backup.sizeUnavailable')
  }

  const kilobytes = Math.max(1, Math.round(size / 1024))

  return `${formatNumber(kilobytes, preferences.language)} KB`
}
