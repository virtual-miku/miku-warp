import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { getCatalogAssetUrl } from '../data/catalog-assets'
import { itemCatalog } from '../data/item-catalog'
import type { WarpPull } from '../domain/warp-pull'

type WarpTimelineProps = {
  pulls: WarpPull[]
  page: number
  pageSize: number
  rarityFilter: TimelineRarityFilter
  searchQuery: string
  totalPulls: number
  isLoading: boolean
  onPageChange: (page: number) => void
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
  onPageChange,
  onRarityFilterChange,
  onSearchQueryChange,
}: WarpTimelineProps) {
  const pageCount = Math.max(1, Math.ceil(totalPulls / pageSize))
  const firstVisiblePull = totalPulls === 0 ? 0 : (page - 1) * pageSize + 1
  const lastVisiblePull = Math.min(page * pageSize, totalPulls)

  return (
    <section className="history-panel" aria-label="Warp history">
      <header className="panel-header">
        <h2>Warp history</h2>
        <span>{formatRecordCount(firstVisiblePull, lastVisiblePull, totalPulls, isLoading)}</span>
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
              className={
                rarityFilter === filter
                  ? 'history-filter-button history-filter-button-active'
                  : 'history-filter-button'
              }
              key={filter}
              onClick={() => onRarityFilterChange(filter)}
              type="button"
            >
              {filter === 'all' ? 'All' : `${filter}-star`}
            </button>
          ))}
        </div>
      </div>
      <div className="warp-list">
        {pulls.length > 0 ? (
          pulls.map((pull) => <WarpHistoryRow key={pull.id} pull={pull} />)
        ) : (
          <div className="warp-empty">
            <strong>
              {totalPulls > 0 ? 'No matching pulls' : 'No saved pulls yet'}
            </strong>
            <span>
              {totalPulls > 0
                ? 'Adjust search or rarity filters.'
                : 'Import manual notes to start tracking this banner.'}
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

function WarpHistoryRow({ pull }: { pull: WarpPull }) {
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
        <span className="warp-item-meta">{formatItemType(pull.itemType)}</span>
      </div>
      <time className="warp-time" dateTime={pull.pulledAt}>
        {formatPullTime(pull.pulledAt)}
      </time>
      <div className="warp-pity">
        <strong>{formatPityAtPull(pull)}</strong>
        <span>{formatSource(pull.source)}</span>
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

function formatRecordCount(
  firstVisiblePull: number,
  lastVisiblePull: number,
  totalPulls: number,
  isLoading: boolean,
) {
  if (isLoading) {
    return 'Loading'
  }

  if (totalPulls === 0) {
    return '0 records'
  }

  return `${firstVisiblePull}-${lastVisiblePull} of ${totalPulls}`
}

function formatPullTime(value: string) {
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function formatItemType(value: WarpPull['itemType']) {
  return value === 'light_cone' ? 'Light Cone' : 'Character'
}

function formatPityAtPull(pull: WarpPull) {
  if (pull.rarity === 5 && pull.pityFiveAtPull) {
    return `5-star pity ${pull.pityFiveAtPull}`
  }

  if (pull.rarity >= 4 && pull.pityFourAtPull) {
    return `4-star pity ${pull.pityFourAtPull}`
  }

  return '-'
}

function formatSource(value: WarpPull['source']) {
  if (value === 'game_history') {
    return 'Game history'
  }

  if (value === 'backup_restore') {
    return 'Backup'
  }

  return 'Manual'
}
