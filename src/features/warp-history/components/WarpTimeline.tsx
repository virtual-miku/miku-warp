import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Trash2 } from 'lucide-react'
import { getCatalogAssetUrl } from '../data/catalog-assets'
import { itemCatalog } from '../data/item-catalog'
import { getBannerLabel } from '../domain/banner'
import type { WarpPull } from '../domain/warp-pull'

type WarpTimelineProps = {
  pulls: WarpPull[]
  page: number
  pageSize: number
  rarityFilter: TimelineRarityFilter
  searchQuery: string
  totalPulls: number
  isLoading: boolean
  canDeleteAll: boolean
  deletingPullId?: string
  isDeletingAll: boolean
  showBannerLabel: boolean
  onPageChange: (page: number) => void
  onDeleteAll: () => void
  onDeletePull: (pull: WarpPull) => void
  onRarityFilterChange: (rarityFilter: TimelineRarityFilter) => void
  onSearchQueryChange: (searchQuery: string) => void
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
  deletingPullId,
  isDeletingAll,
  showBannerLabel,
  onPageChange,
  onDeleteAll,
  onDeletePull,
  onRarityFilterChange,
  onSearchQueryChange,
}: WarpTimelineProps) {
  const pageCount = Math.max(1, Math.ceil(totalPulls / pageSize))
  return (
    <section className="history-panel" aria-label="Warp history">
      <header className="panel-header">
        <h2>Warp history</h2>
        <div className="history-header-actions">
          <button
            className="history-delete-all-button"
            disabled={!canDeleteAll || isLoading || isDeletingAll}
            onClick={onDeleteAll}
            type="button"
          >
            <Trash2 size={14} aria-hidden="true" />
            {isDeletingAll ? 'Deleting' : 'Delete all'}
          </button>
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
              deletingPullId={deletingPullId}
              key={pull.id}
              onDeletePull={onDeletePull}
              pull={pull}
              showBannerLabel={showBannerLabel}
            />
          ))
        ) : (
          <div className="warp-empty">
            <strong>
              {totalPulls > 0 ? 'No matching pulls' : 'No game history imported yet'}
            </strong>
            <span>
              {totalPulls > 0
                ? 'Adjust search or rarity filters.'
                : 'Use Game import to fetch your official Warp Records. Manual text import is available for older records.'}
            </span>
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
  deletingPullId,
  onDeletePull,
  pull,
  showBannerLabel,
}: {
  deletingPullId?: string
  onDeletePull: (pull: WarpPull) => void
  pull: WarpPull
  showBannerLabel: boolean
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

  return (
    <article className="warp-row">
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
        {formatPullTime(pull.pulledAt)}
      </time>
      <div className="warp-pity">
        <strong>{formatPityAtPull(pull)}</strong>
      </div>
      <button
        aria-label={`Delete ${pull.itemName}`}
        className="warp-delete-button icon-button"
        disabled={deletingPullId !== undefined}
        onClick={() => onDeletePull(pull)}
        type="button"
      >
        <Trash2 size={15} aria-hidden="true" />
      </button>
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

function formatPullTime(value: string) {
  const date = new Date(value)
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

function formatItemType(value: WarpPull['itemType']) {
  return value === 'light_cone' ? 'Light Cone' : 'Character'
}

function formatPityAtPull(pull: WarpPull) {
  if (pull.rarity === 5 && pull.pityFiveAtPull) {
    return `Pity ${pull.pityFiveAtPull}`
  }

  if (pull.rarity >= 4 && pull.pityFourAtPull) {
    return `Pity ${pull.pityFourAtPull}`
  }

  return '-'
}
