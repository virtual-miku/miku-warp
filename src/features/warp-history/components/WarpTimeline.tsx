import { useMemo, useState } from 'react'
import {
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  FileInput,
  Trash2,
  X,
} from 'lucide-react'
import { AppButton } from '../../../shared/ui/AppButton'
import { getCatalogAssetUrl } from '../data/catalog-assets'
import { itemCatalog } from '../data/item-catalog'
import { getBannerLabel, getFiveStarHardPity } from '../domain/banner'
import { getPityLevelClass } from '../domain/pity-level'
import type { WarpPull } from '../domain/warp-pull'
import type {
  AppLanguage,
  TimeZonePreference,
} from '../../settings/domain/localization'
import { formatDateTime } from '../../../shared/lib/date-time'

type WarpTimelineProps = {
  pulls: WarpPull[]
  page: number
  pageSize: number
  rarityFilter: TimelineRarityFilter
  searchQuery: string
  totalPulls: number
  isLoading: boolean
  canDeleteAll: boolean
  isDeletingAll: boolean
  isDeletingSelected: boolean
  isSelecting: boolean
  language: AppLanguage
  selectedPullIds: Set<string>
  showBannerLabel: boolean
  timeZone: TimeZonePreference
  onPageChange: (page: number) => void
  onDeleteAll: () => void
  onDeleteSelected: () => void
  onOpenImport: () => void
  onRarityFilterChange: (rarityFilter: TimelineRarityFilter) => void
  onSelectionModeChange: (isSelecting: boolean) => void
  onSearchQueryChange: (searchQuery: string) => void
  onTogglePullSelection: (pullId: string) => void
}

export type TimelineRarityFilter = 'all' | 5 | 4 | 3

export function WarpTimeline({
  pulls,
  page,
  pageSize,
  rarityFilter,
  searchQuery,
  totalPulls,
  isLoading,
  canDeleteAll,
  isDeletingAll,
  isDeletingSelected,
  isSelecting,
  language,
  selectedPullIds,
  showBannerLabel,
  timeZone,
  onPageChange,
  onDeleteAll,
  onDeleteSelected,
  onOpenImport,
  onRarityFilterChange,
  onSelectionModeChange,
  onSearchQueryChange,
  onTogglePullSelection,
}: WarpTimelineProps) {
  const pageCount = Math.max(1, Math.ceil(totalPulls / pageSize))
  const isDeleting = isDeletingAll || isDeletingSelected
  return (
    <section className="history-panel" aria-label="Warp history">
      <header className="panel-header">
        <h2>Warp history</h2>
        <div className="history-header-actions">
          {isSelecting ? (
            <>
              <button
                className="history-delete-all-button"
                disabled={selectedPullIds.size === 0 || isLoading || isDeleting}
                onClick={onDeleteSelected}
                type="button"
              >
                <Trash2 size={14} aria-hidden="true" />
                {isDeletingSelected
                  ? 'Deleting'
                  : `Delete selected (${selectedPullIds.size})`}
              </button>
              <button
                className="history-delete-all-button"
                disabled={!canDeleteAll || isLoading || isDeleting}
                onClick={onDeleteAll}
                type="button"
              >
                <Trash2 size={14} aria-hidden="true" />
                {isDeletingAll ? 'Deleting' : 'Delete all'}
              </button>
              <button
                className="history-select-button"
                disabled={isDeleting}
                onClick={() => onSelectionModeChange(false)}
                type="button"
              >
                <X size={14} aria-hidden="true" />
                Cancel
              </button>
            </>
          ) : (
            <button
              className="history-select-button"
              disabled={!canDeleteAll || isLoading}
              onClick={() => onSelectionModeChange(true)}
              type="button"
            >
              <CheckSquare size={14} aria-hidden="true" />
              Select
            </button>
          )}
        </div>
      </header>
      <div className="history-toolbar">
        <input
          aria-label="Search warp item"
          className="history-search"
          onChange={(event) => onSearchQueryChange(event.target.value)}
          placeholder="Search item"
          type="search"
          value={searchQuery}
        />
        <div className="history-filter-group" aria-label="Rarity filter">
          {(['all', 5, 4, 3] as const).map((filter) => (
            <button
              aria-pressed={rarityFilter === filter}
              className={[
                'history-filter-button',
                filter === 'all' ? undefined : `history-filter-button-${filter}`,
                rarityFilter === filter ? 'history-filter-button-active' : undefined,
              ]
                .filter(Boolean)
                .join(' ')}
              key={filter}
              onClick={() => onRarityFilterChange(filter)}
              type="button"
            >
              {filter === 'all' ? 'All' : `${filter}★`}
            </button>
          ))}
        </div>
      </div>
      <div className="warp-list">
        {pulls.length > 0 ? (
          pulls.map((pull) => (
            <WarpHistoryRow
              isSelecting={isSelecting}
              key={pull.id}
              language={language}
              onToggleSelection={onTogglePullSelection}
              pull={pull}
              selected={selectedPullIds.has(pull.id)}
              showBannerLabel={showBannerLabel}
              timeZone={timeZone}
            />
          ))
        ) : (
          <div className="warp-empty">
            <strong>
              {totalPulls > 0 ? 'No matching pulls' : 'No game history imported yet'}
            </strong>
            {totalPulls > 0 ? (
              <span>Adjust search or rarity filters.</span>
            ) : (
              <AppButton icon={FileInput} onClick={onOpenImport}>
                Import
              </AppButton>
            )}
          </div>
        )}
      </div>
      <footer className="history-pagination" aria-label="History pagination">
        <span>
          Page {page}/{pageCount}
        </span>
        <div className="manual-pagination-controls">
          <button
            aria-label="Previous history page"
            className="icon-button"
            disabled={page <= 1 || isLoading}
            onClick={() => onPageChange(page - 1)}
            type="button"
          >
            <ChevronLeft size={16} aria-hidden="true" />
          </button>
          <button
            aria-label="Next history page"
            className="icon-button"
            disabled={page >= pageCount || isLoading}
            onClick={() => onPageChange(page + 1)}
            type="button"
          >
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        </div>
      </footer>
    </section>
  )
}

function WarpHistoryRow({
  isSelecting,
  language,
  onToggleSelection,
  pull,
  selected,
  showBannerLabel,
  timeZone,
}: {
  isSelecting: boolean
  language: AppLanguage
  onToggleSelection: (pullId: string) => void
  pull: WarpPull
  selected: boolean
  showBannerLabel: boolean
  timeZone: TimeZonePreference
}) {
  const catalogItem = useMemo(
    () =>
      itemCatalog.find(
        (item) =>
          item.name === pull.itemName &&
          item.itemType === pull.itemType &&
          item.rarity === pull.rarity,
      ),
    [pull.itemName, pull.itemType, pull.rarity],
  )
  const pity = getPityAtPull(pull)

  return (
    <article className={isSelecting ? 'warp-row warp-row-selecting' : 'warp-row'}>
      {isSelecting ? (
        <input
          aria-label={`Select ${pull.itemName}`}
          checked={selected}
          className="history-select-checkbox"
          onChange={() => onToggleSelection(pull.id)}
          type="checkbox"
        />
      ) : null}
      <WarpHistoryItemIcon
        iconPath={pull.iconPath ?? catalogItem?.iconPath}
        rarity={pull.rarity}
      />
      <div>
        <span className={`warp-item-name warp-item-name-${pull.rarity}`}>
          {pull.itemName}
        </span>
        <span className="warp-item-meta">
          {showBannerLabel
            ? `${getBannerLabel(pull.bannerType)} - ${formatItemType(pull.itemType)}`
            : formatItemType(pull.itemType)}
        </span>
      </div>
      <time className="warp-time" dateTime={pull.pulledAt}>
        {formatPullTime(pull.pulledAt, language, timeZone)}
      </time>
      <div className="warp-pity">
        <strong
          className={
            pity
              ? getPityLevelClass(
                  pity.value,
                  pity.rarity === 5
                    ? getFiveStarHardPity(pull.bannerType)
                    : 10,
                )
              : undefined
          }
        >
          {pity ? `Pity ${pity.value}` : '-'}
        </strong>
      </div>
    </article>
  )
}

function WarpHistoryItemIcon({
  iconPath,
  rarity,
}: {
  iconPath?: string
  rarity: WarpPull['rarity']
}) {
  const [hasImageError, setHasImageError] = useState(false)
  const iconUrl = getCatalogAssetUrl(iconPath)

  return (
    <div className={`warp-item-icon warp-item-icon-${rarity}`}>
      {iconUrl && !hasImageError ? (
        <img
          alt=""
          loading="lazy"
          src={iconUrl}
          onError={() => setHasImageError(true)}
        />
      ) : (
        <span>{rarity}</span>
      )}
    </div>
  )
}

function formatPullTime(
  value: string,
  language: AppLanguage,
  timeZone: TimeZonePreference,
) {
  return formatDateTime(value, { language, timeZone }) ?? value
}

function formatItemType(value: WarpPull['itemType']) {
  return value === 'light_cone' ? 'Light Cone' : 'Character'
}

function getPityAtPull(pull: WarpPull) {
  if (pull.rarity === 5 && pull.pityFiveAtPull) {
    return { rarity: 5 as const, value: pull.pityFiveAtPull }
  }

  if (pull.rarity >= 4 && pull.pityFourAtPull) {
    return { rarity: 4 as const, value: pull.pityFourAtPull }
  }

  return undefined
}
