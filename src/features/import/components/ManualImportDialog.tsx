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
  getManualImportStatusLabel,
  type ManualImportPreviewCategoryKey,
  type ManualImportPreviewRow,
} from '../domain/manual-import-preview'
import { manualNoteSample } from '../data/manual-note-sample'
import { AppButton } from '../../../shared/ui/AppButton'
import {
  getBannerLabel,
  type BannerType,
} from '../../warp-history/domain/banner'
import type { Rarity } from '../../warp-history/domain/warp-pull'

const previewPageSize = 25
type RarityFilter = Rarity | 'all'

export type ManualImportSaveNotice = {
  tone: 'success' | 'error'
  title: string
  detail: string
}

type ManualImportDialogProps = {
  isOpen: boolean
  isSaving: boolean
  note: string
  onSave: () => void
  onClose: () => void
  onNoteChange: (value: string) => void
  onSaveNoticeClose: () => void
  fallbackBannerType: BannerType
  preview: ManualImportPreview
  saveNotice?: ManualImportSaveNotice
}

export function ManualImportDialog({
  isOpen,
  isSaving,
  note,
  onSave,
  onClose,
  onNoteChange,
  onSaveNoticeClose,
  fallbackBannerType,
  preview,
  saveNotice,
}: ManualImportDialogProps) {
  const [activeCategoryKey, setActiveCategoryKey] =
    useState<ManualImportPreviewCategoryKey | 'all'>('all')
  const [activeRarityFilter, setActiveRarityFilter] =
    useState<RarityFilter>('all')
  const [previewPage, setPreviewPage] = useState(1)
  const categories = useMemo(
    () => getManualImportPreviewCategories(preview, fallbackBannerType),
    [fallbackBannerType, preview],
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
  const status = getManualImportStatus(preview)
  const statusLabel = getManualImportStatusLabel(status)
  const rarityCounts = getManualImportRarityCounts(preview, categoryFilter)
  const categoryRows = getManualImportPreviewRows(
    preview,
    Number.MAX_SAFE_INTEGER,
    categoryFilter,
  )
  const filteredPreviewRows = filterRowsByRarity(
    categoryRows,
    activeRarityFilter,
  )
  const selectedTotalPulls = filteredPreviewRows.length
  const selectedRecognizedPulls = filteredPreviewRows.filter(
    (pull) => pull.item,
  ).length
  const selectedGroupCount = countPreviewGroups(filteredPreviewRows)
  const pageCount = Math.max(1, Math.ceil(selectedTotalPulls / previewPageSize))
  const activePage = Math.min(previewPage, pageCount)
  const previewRows = filteredPreviewRows.slice(
    (activePage - 1) * previewPageSize,
    activePage * previewPageSize,
  )
  const firstVisibleRow =
    selectedTotalPulls === 0 ? 0 : (activePage - 1) * previewPageSize + 1
  const lastVisibleRow = Math.min(activePage * previewPageSize, selectedTotalPulls)
  const canSave = status === 'ready' && preview.totalPulls > 0 && !isSaving
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
            <span className="eyebrow">Manual import</span>
            <h2 id="manual-import-title">Warp note</h2>
          </div>
          <button className="icon-button" type="button" aria-label="Close" onClick={onClose}>
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <div className="manual-import-grid">
          <section className="manual-import-editor" aria-label="Manual note input">
            <label className="field-label" htmlFor="manual-note-input">
              Note
            </label>
            <textarea
              className="manual-note-input"
              id="manual-note-input"
              spellCheck={false}
              value={note}
              onChange={(event) => onNoteChange(event.target.value)}
            />
            <div className="manual-import-actions">
              <AppButton icon={Clipboard} onClick={() => onNoteChange(manualNoteSample)}>
                Sample
              </AppButton>
              <AppButton icon={Eraser} variant="ghost" onClick={() => onNoteChange('')}>
                Clear
              </AppButton>
            </div>
          </section>

          <section className="manual-import-preview" aria-label="Manual import preview">
            <div className="manual-summary-grid">
              <article className="manual-summary-card">
                <span>Status</span>
                <strong>{statusLabel}</strong>
              </article>
              <article className="manual-summary-card">
                <span>Pulls</span>
                <strong>{selectedTotalPulls}</strong>
              </article>
              <article className="manual-summary-card">
                <span>Groups</span>
                <strong>{selectedGroupCount}</strong>
              </article>
              <article className="manual-summary-card">
                <span>Matched</span>
                <strong>{selectedRecognizedPulls}</strong>
              </article>
            </div>

            <div className="manual-category-tabs" role="tablist" aria-label="Preview categories">
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
                All {preview.totalPulls}
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
                  {formatPreviewCategory(category.bannerType)} {category.totalPulls}
                </button>
              ))}
            </div>

            <div className="manual-rarity-strip" aria-label="Rarity filters">
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

            {preview.issues.length > 0 ? (
              <div className="manual-issue-list" aria-label="Manual import issues">
                {preview.issues.slice(0, 4).map((issue) => (
                  <div className="manual-issue-row" key={`${issue.lineNumber}-${issue.value}`}>
                    <span>Line {issue.lineNumber}</span>
                    <strong>{issue.value || issue.message}</strong>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="manual-preview-table" aria-label="Recognized pull rows">
              {previewRows.length > 0 ? (
                previewRows.map((pull) => (
                  <div className="manual-preview-row" key={`${pull.lineNumber}-${pull.rawName}`}>
                    <ManualPreviewItemIcon pull={pull} />
                    <div>
                      <div className="manual-preview-title">
                        <span className="manual-preview-pity">
                          {formatPreviewPity(pull)}
                        </span>
                        <strong
                          className={`manual-preview-name manual-preview-name-${pull.item?.rarity ?? 3}`}
                        >
                          {pull.item?.name ?? pull.rawName}
                        </strong>
                      </div>
                      <span className="manual-preview-meta">
                        {pull.groupTimestamp} -{' '}
                        {formatPreviewCategory(pull.effectiveBannerType)}
                      </span>
                    </div>
                    <div className="manual-preview-side">
                      <span>{formatItemType(pull.item?.itemType)}</span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="manual-preview-empty">No rows</div>
              )}
            </div>

            <footer className="manual-import-footer">
              <div className="manual-import-meta">
                <span>{itemCatalogMetadata.source.version ?? 'Catalog'} catalog</span>
                <span>
                  {firstVisibleRow}-{lastVisibleRow} of {selectedTotalPulls}
                </span>
              </div>
              <div className="manual-pagination-controls" aria-label="Preview pagination">
                <button
                  className="icon-button"
                  type="button"
                  aria-label="Previous preview page"
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
                  aria-label="Next preview page"
                  disabled={activePage >= pageCount}
                  onClick={() => setPreviewPage(activePage + 1)}
                >
                  <ChevronRight size={16} aria-hidden="true" />
                </button>
              </div>
              <AppButton icon={Save} disabled={!canSave} onClick={onSave}>
                {isSaving ? 'Saving' : 'Import'}
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
        aria-label="Close save message"
        onClick={onClose}
      >
        <X size={16} aria-hidden="true" />
      </button>
    </aside>
  )
}

function formatPreviewCategory(bannerType?: BannerType) {
  return bannerType ? getBannerLabel(bannerType) : 'Unassigned'
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

function formatPreviewPity(pull: ManualImportPreviewRow) {
  if (pull.pityFiveAtPull) {
    return `Pity ${pull.pityFiveAtPull}`
  }

  return '-'
}

function formatItemType(itemType?: 'character' | 'light_cone') {
  if (itemType === 'light_cone') {
    return 'Light Cone'
  }

  if (itemType === 'character') {
    return 'Character'
  }

  return 'Unknown'
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

function countPreviewGroups(rows: ManualImportPreviewRow[]) {
  return new Set(
    rows.map((row) =>
      JSON.stringify([
        row.effectiveBannerType ?? 'unassigned',
        row.groupLineNumber,
        row.groupTimestamp,
      ]),
    ),
  ).size
}
