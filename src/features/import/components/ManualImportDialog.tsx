import { useMemo, useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Clipboard,
  Eraser,
  Save,
  X,
} from 'lucide-react'
import { getCatalogAssetUrl } from '../../warp-history/data/catalog-assets'
import { itemCatalogMetadata } from '../../warp-history/data/item-catalog'
import type { ManualImportPreview } from '../domain/manual-note-parser'
import {
  getManualImportPreviewCategories,
  getManualImportPreviewRows,
  getManualImportRarityCounts,
  getManualImportStatus,
  type ManualImportPreviewCategoryKey,
  type ManualImportPreviewRow,
} from '../domain/manual-import-preview'
import { manualNoteSample } from '../data/manual-note-sample'
import { AppButton } from '../../../shared/ui/AppButton'
import { ManualItemSelector } from './ManualItemSelector'
import {
  buildManualItemSelectorPreview,
  type ManualItemSelection,
} from '../domain/manual-item-selector'
import { type BannerType } from '../../warp-history/domain/banner'
import type { Rarity } from '../../warp-history/domain/warp-pull'
import type { TimeZonePreference } from '../../settings/domain/localization'
import type { Translator } from '../../settings/domain/localization'
import { useLocalization } from '../../settings/components/localization-context'
import {
  formatLocalizedPullCount,
  getLocalizedBannerLabel,
  getLocalizedItemType,
} from '../../settings/domain/localized-labels'

const previewPageSize = 25
type RarityFilter = Rarity | 'all'
type ManualImportMode = 'text' | 'selector'

export type ManualImportSaveNotice = {
  tone: 'success' | 'error'
  title: string
  detail: string
}

export type ManualImportTargetAccount = {
  id: string
  uid: string
  region?: string
  nickname?: string
  totalPulls?: number
}

type ManualImportDialogProps = {
  accounts: ManualImportTargetAccount[]
  fallbackBannerType: BannerType
  isOpen: boolean
  isSaving: boolean
  note: string
  onSave: (accountId: string, preview: ManualImportPreview) => void
  onClose: () => void
  onNoteChange: (value: string) => void
  onSaveNoticeClose: () => void
  onTargetAccountChange: (accountId: string) => void
  preview: ManualImportPreview
  saveNotice?: ManualImportSaveNotice
  targetAccountId: string
  timeZone: TimeZonePreference
}

export function ManualImportDialog({
  isOpen,
  isSaving,
  note,
  onSave,
  onClose,
  onNoteChange,
  onSaveNoticeClose,
  onTargetAccountChange,
  accounts,
  fallbackBannerType,
  preview,
  saveNotice,
  targetAccountId,
  timeZone,
}: ManualImportDialogProps) {
  const { t } = useLocalization()
  const [importMode, setImportMode] = useState<ManualImportMode>('text')
  const [selectorSelections, setSelectorSelections] = useState<
    ManualItemSelection[]
  >([])
  const [activeCategoryKey, setActiveCategoryKey] =
    useState<ManualImportPreviewCategoryKey | 'all'>('all')
  const [activeRarityFilter, setActiveRarityFilter] =
    useState<RarityFilter>('all')
  const [previewPage, setPreviewPage] = useState(1)
  const selectorPreview = useMemo(
    () => buildManualItemSelectorPreview(selectorSelections),
    [selectorSelections],
  )
  const activePreview = importMode === 'text' ? preview : selectorPreview
  const categories = useMemo(
    () => getManualImportPreviewCategories(activePreview, fallbackBannerType),
    [activePreview, fallbackBannerType],
  )

  if (!isOpen) {
    return null
  }

  const hasActiveCategory =
    activeCategoryKey === 'all' ||
    categories.some((category) => category.key === activeCategoryKey)
  const selectedCategoryKey = hasActiveCategory ? activeCategoryKey : 'all'
  const categoryFilter =
    selectedCategoryKey === 'all'
      ? { fallbackBannerType }
      : { categoryKey: selectedCategoryKey, fallbackBannerType }
  const status = getManualImportStatus(activePreview)
  const rarityCounts = getManualImportRarityCounts(activePreview, categoryFilter)
  const categoryRows = getManualImportPreviewRows(
    activePreview,
    Number.MAX_SAFE_INTEGER,
    categoryFilter,
  )
  const filteredPreviewRows = filterRowsByRarity(
    categoryRows,
    activeRarityFilter,
  )
  const selectedTotalPulls = filteredPreviewRows.length
  const pageCount = Math.max(1, Math.ceil(selectedTotalPulls / previewPageSize))
  const activePage = Math.min(previewPage, pageCount)
  const previewRows = filteredPreviewRows.slice(
    (activePage - 1) * previewPageSize,
    activePage * previewPageSize,
  )
  const firstVisibleRow =
    selectedTotalPulls === 0 ? 0 : (activePage - 1) * previewPageSize + 1
  const lastVisibleRow = Math.min(activePage * previewPageSize, selectedTotalPulls)
  const targetAccount =
    accounts.find((account) => account.id === targetAccountId) ?? accounts[0]
  const selectedTargetAccountId = targetAccount?.id ?? targetAccountId
  const canSave =
    status === 'ready' &&
    activePreview.totalPulls > 0 &&
    !isSaving &&
    Boolean(targetAccount)
  const handleCategoryChange = (
    nextCategoryKey: ManualImportPreviewCategoryKey | 'all',
  ) => {
    setActiveCategoryKey(nextCategoryKey)
    setPreviewPage(1)
  }
  const handleRarityFilterChange = (nextRarityFilter: RarityFilter) => {
    setActiveRarityFilter((currentRarityFilter) =>
      currentRarityFilter === nextRarityFilter ? 'all' : nextRarityFilter,
    )
    setPreviewPage(1)
  }

  return (
    <div className="modal-backdrop">
      <section
        className="modal-panel manual-import-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="manual-import-title"
      >
        <header className="modal-header">
          <div>
            <span className="eyebrow">{t('import.manual')}</span>
            <h2 id="manual-import-title">{t('manual.title')}</h2>
          </div>
          <button className="icon-button" type="button" aria-label={t('common.close')} onClick={onClose}>
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <div
          aria-label={t('manual.methodAria')}
          className="manual-import-mode-tabs"
          role="tablist"
        >
          <button
            aria-selected={importMode === 'text'}
            className={
              importMode === 'text'
                ? 'manual-import-mode-tab manual-import-mode-tab-active'
                : 'manual-import-mode-tab'
            }
            onClick={() => setImportMode('text')}
            role="tab"
            type="button"
          >
            {t('manual.text')}
          </button>
          <button
            aria-selected={importMode === 'selector'}
            className={
              importMode === 'selector'
                ? 'manual-import-mode-tab manual-import-mode-tab-active'
                : 'manual-import-mode-tab'
            }
            onClick={() => setImportMode('selector')}
            role="tab"
            type="button"
          >
            {t('manual.selector')}
          </button>
        </div>

        <div className="manual-import-grid">
          {importMode === 'text' ? (
            <section
              className="manual-import-editor"
              aria-label={t('manual.noteInputAria')}
            >
              <label className="field-label" htmlFor="manual-note-input">
                {t('manual.note')}
              </label>
              <textarea
                className="manual-note-input"
                id="manual-note-input"
                spellCheck={false}
                value={note}
                onChange={(event) => onNoteChange(event.target.value)}
              />
              <div className="manual-import-actions">
                <AppButton
                  icon={Clipboard}
                  onClick={() => onNoteChange(manualNoteSample)}
                >
                  {t('manual.sample')}
                </AppButton>
                <AppButton
                  icon={Eraser}
                  variant="ghost"
                  onClick={() => onNoteChange('')}
                >
                  {t('manual.clear')}
                </AppButton>
              </div>
            </section>
          ) : (
            <ManualItemSelector
              fallbackBannerType={fallbackBannerType}
              onChange={setSelectorSelections}
              selections={selectorSelections}
              timeZone={timeZone}
            />
          )}

          <section className="manual-import-preview" aria-label={t('manual.previewAria')}>
            <div className="manual-target-account-field">
              <label htmlFor="manual-import-target-account">
                {t('manual.importToUid')}
              </label>
              <select
                id="manual-import-target-account"
                onChange={(event) => onTargetAccountChange(event.target.value)}
                value={selectedTargetAccountId}
              >
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    UID {account.uid} - {formatTargetAccountMeta(account, t)}
                  </option>
                ))}
              </select>
              <span>
                {t('manual.willBeAdded', {
                  pulls: formatLocalizedPullCount(t, activePreview.totalPulls),
                })}
              </span>
            </div>

            <div className="manual-category-tabs" role="tablist" aria-label={t('manual.previewCategories')}>
              <button
                className={
                  selectedCategoryKey === 'all'
                    ? 'manual-category-tab manual-category-tab-active'
                    : 'manual-category-tab'
                }
                type="button"
                role="tab"
                aria-selected={selectedCategoryKey === 'all'}
                onClick={() => handleCategoryChange('all')}
              >
                {t('common.all')} {activePreview.totalPulls}
              </button>
              {categories.map((category) => (
                <button
                  className={
                    selectedCategoryKey === category.key
                      ? 'manual-category-tab manual-category-tab-active'
                      : 'manual-category-tab'
                  }
                  key={category.key}
                  type="button"
                  role="tab"
                  aria-selected={selectedCategoryKey === category.key}
                  onClick={() => handleCategoryChange(category.key)}
                >
                  {formatPreviewCategory(category.bannerType, t)} {category.totalPulls}
                </button>
              ))}
            </div>

            <div className="manual-rarity-strip" aria-label={t('manual.rarityFilters')}>
              <button
                className={getRarityChipClass(5, activeRarityFilter)}
                type="button"
                aria-pressed={activeRarityFilter === 5}
                onClick={() => handleRarityFilterChange(5)}
              >
                5★ {rarityCounts.rarity5}
              </button>
              <button
                className={getRarityChipClass(4, activeRarityFilter)}
                type="button"
                aria-pressed={activeRarityFilter === 4}
                onClick={() => handleRarityFilterChange(4)}
              >
                4★ {rarityCounts.rarity4}
              </button>
              <button
                className={getRarityChipClass(3, activeRarityFilter)}
                type="button"
                aria-pressed={activeRarityFilter === 3}
                onClick={() => handleRarityFilterChange(3)}
              >
                3★ {rarityCounts.rarity3}
              </button>
            </div>

            {activePreview.issues.length > 0 ? (
              <div className="manual-issue-list" aria-label={t('manual.issuesAria')}>
                {activePreview.issues.slice(0, 4).map((issue) => (
                  <div className="manual-issue-row" key={`${issue.lineNumber}-${issue.value}`}>
                    <span>{t('manual.line', { line: issue.lineNumber })}</span>
                    <strong>
                      {issue.value || translateManualIssue(issue.message, t)}
                    </strong>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="manual-preview-table" aria-label={t('manual.rowsAria')}>
              {previewRows.length > 0 ? (
                previewRows.map((pull) => (
                  <div
                    className="manual-preview-row"
                    key={`${pull.lineNumber}-${pull.sequenceInGroup}-${pull.rawName}`}
                  >
                    <ManualPreviewItemIcon pull={pull} />
                    <div>
                      <div className="manual-preview-title">
                        <span className="manual-preview-pity">
                          {formatPreviewPity(pull, t)}
                        </span>
                        <strong
                          className={`manual-preview-name manual-preview-name-${pull.item?.rarity ?? 3}`}
                        >
                          {pull.item?.name ?? pull.rawName}
                        </strong>
                      </div>
                      <span className="manual-preview-meta">
                        {pull.groupTimestamp} -{' '}
                        {formatPreviewCategory(pull.effectiveBannerType, t)}
                      </span>
                    </div>
                    <div className="manual-preview-side">
                      <span>{formatItemType(pull.item?.itemType, t)}</span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="manual-preview-empty">{t('manual.noRows')}</div>
              )}
            </div>

            <footer className="manual-import-footer">
              <div className="manual-import-meta">
                <span>
                  {t('manual.catalogLabel', {
                    version: itemCatalogMetadata.source.version ?? t('manual.catalog'),
                  })}
                </span>
                <span>
                  {t('manual.range', {
                    first: firstVisibleRow,
                    last: lastVisibleRow,
                    total: selectedTotalPulls,
                  })}
                </span>
              </div>
              <div className="manual-pagination-controls" aria-label={t('manual.pagination')}>
                <button
                  className="icon-button"
                  type="button"
                  aria-label={t('manual.previousPage')}
                  disabled={activePage <= 1}
                  onClick={() => setPreviewPage(activePage - 1)}
                >
                  <ChevronLeft size={16} aria-hidden="true" />
                </button>
                <span>
                  {activePage}/{pageCount}
                </span>
                <button
                  className="icon-button"
                  type="button"
                  aria-label={t('manual.nextPage')}
                  disabled={activePage >= pageCount}
                  onClick={() => setPreviewPage(activePage + 1)}
                >
                  <ChevronRight size={16} aria-hidden="true" />
                </button>
              </div>
              <AppButton
                icon={Save}
                disabled={!canSave}
                onClick={() => onSave(selectedTargetAccountId, activePreview)}
              >
                {isSaving ? t('common.saving') : t('common.import')}
              </AppButton>
            </footer>
          </section>
        </div>
      </section>

      {saveNotice ? (
        <ManualImportSavePopup
          notice={saveNotice}
          onClose={onSaveNoticeClose}
        />
      ) : null}
    </div>
  )
}

function ManualImportSavePopup({
  notice,
  onClose,
}: {
  notice: ManualImportSaveNotice
  onClose: () => void
}) {
  const { t } = useLocalization()
  return (
    <aside
      className={`manual-save-popup manual-save-popup-${notice.tone}`}
      role={notice.tone === 'error' ? 'alert' : 'status'}
      aria-live={notice.tone === 'error' ? 'assertive' : 'polite'}
    >
      <div>
        <strong>{notice.title}</strong>
        <p>{notice.detail}</p>
      </div>
      <button
        className="icon-button"
        type="button"
        aria-label={t('manual.closeMessage')}
        onClick={onClose}
      >
        <X size={16} aria-hidden="true" />
      </button>
    </aside>
  )
}

function formatPreviewCategory(bannerType: BannerType | undefined, t: Translator) {
  return bannerType ? getLocalizedBannerLabel(t, bannerType) : t('manual.unassigned')
}

function ManualPreviewItemIcon({ pull }: { pull: ManualImportPreviewRow }) {
  const [hasImageError, setHasImageError] = useState(false)
  const iconUrl = getCatalogAssetUrl(pull.item?.iconPath)
  const rarity = pull.item?.rarity ?? 3

  return (
    <div className={`manual-preview-icon manual-preview-icon-${rarity}`}>
      {iconUrl && !hasImageError ? (
        <img
          alt=""
          loading="lazy"
          src={iconUrl}
          onError={() => setHasImageError(true)}
        />
      ) : (
        <span>{pull.item?.rarity ?? '?'}</span>
      )}
    </div>
  )
}

function formatPreviewPity(pull: ManualImportPreviewRow, t: Translator) {
  if (pull.item?.rarity === 5 && pull.pityFiveAtPull) {
    return t('history.pity', { value: pull.pityFiveAtPull })
  }

  if (pull.item?.rarity === 4 && pull.pityFourAtPull) {
    return t('history.pity', { value: pull.pityFourAtPull })
  }

  return '-'
}

function formatItemType(
  itemType: 'character' | 'light_cone' | undefined,
  t: Translator,
) {
  return itemType ? getLocalizedItemType(t, itemType) : t('manual.unknown')
}

function getRarityChipClass(rarity: Rarity, activeRarityFilter: RarityFilter) {
  return [
    'rarity-chip',
    'rarity-chip-button',
    `rarity-chip-${rarity}`,
    activeRarityFilter === rarity ? 'rarity-chip-active' : undefined,
  ]
    .filter(Boolean)
    .join(' ')
}

function filterRowsByRarity(
  rows: ManualImportPreviewRow[],
  rarityFilter: RarityFilter,
) {
  if (rarityFilter === 'all') {
    return rows
  }

  return rows.filter((row) => row.item?.rarity === rarityFilter)
}

function formatTargetAccountMeta(account: ManualImportTargetAccount, t: Translator) {
  const pulls =
    account.totalPulls === undefined
      ? t('manual.currentAccount')
      : formatLocalizedPullCount(t, account.totalPulls)
  const region = account.region ?? 'asia'

  return `${pulls}, ${region.toUpperCase()}`
}

function translateManualIssue(message: string, t: Translator) {
  const keys = {
    'Time appears without a date.': 'manual.issue.timeWithoutDate',
    'Section heading is not mapped to a banner type.':
      'manual.issue.unknownSection',
    'Item appears before the first timestamp.': 'manual.issue.beforeTimestamp',
    'Item is not available in the local catalog yet.':
      'manual.issue.missingCatalog',
    'Manual note is empty.': 'manual.issue.empty',
  } as const
  const key = keys[message as keyof typeof keys]

  return key ? t(key) : message
}
