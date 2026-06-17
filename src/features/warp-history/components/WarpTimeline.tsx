import { useMemo, useState } from 'react'
import type { WarpPull } from '../domain/warp-pull'

type WarpTimelineProps = {
  pulls: WarpPull[]
}

type RarityFilter = 'all' | 5 | 4 | 3

export function WarpTimeline({ pulls }: WarpTimelineProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [rarityFilter, setRarityFilter] = useState<RarityFilter>('all')
  const visiblePulls = useMemo(
    () => filterPulls(pulls, searchQuery, rarityFilter).slice().reverse(),
    [pulls, rarityFilter, searchQuery],
  )

  return (
    <section className="history-panel" aria-label="Warp history">
      <header className="panel-header">
        <h2>Recent pulls</h2>
        <span>{formatRecordCount(visiblePulls.length, pulls.length)}</span>
      </header>
      <div className="history-toolbar">
        <input
          aria-label="Search warp item"
          className="history-search"
          onChange={(event) => setSearchQuery(event.target.value)}
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
              onClick={() => setRarityFilter(filter)}
              type="button"
            >
              {filter === 'all' ? 'All' : `${filter}-star`}
            </button>
          ))}
        </div>
      </div>
      <div className="warp-list">
        {visiblePulls.length > 0 ? (
          visiblePulls.map((pull) => (
            <article className="warp-row" key={pull.id}>
              <div className={`warp-rarity warp-rarity-${pull.rarity}`}>
                {pull.rarity}
              </div>
              <div>
                <span className="warp-item-name">{pull.itemName}</span>
                <span className="warp-item-meta">
                  {formatItemType(pull.itemType)}
                </span>
              </div>
              <time className="warp-time" dateTime={pull.pulledAt}>
                {formatPullTime(pull.pulledAt)}
              </time>
              <div className="warp-pity">
                <strong>{formatPityAtPull(pull)}</strong>
                <span>{formatSource(pull.source)}</span>
              </div>
            </article>
          ))
        ) : (
          <div className="warp-empty">
            <strong>
              {pulls.length > 0 ? 'No matching pulls' : 'No saved pulls yet'}
            </strong>
            <span>
              {pulls.length > 0
                ? 'Adjust search or rarity filters.'
                : 'Import manual notes to start tracking this banner.'}
            </span>
          </div>
        )}
      </div>
    </section>
  )
}

function filterPulls(
  pulls: WarpPull[],
  searchQuery: string,
  rarityFilter: RarityFilter,
) {
  const normalizedSearchQuery = searchQuery.trim().toLowerCase()

  return pulls.filter((pull) => {
    const matchesRarity =
      rarityFilter === 'all' ? true : pull.rarity === rarityFilter
    const matchesSearch =
      normalizedSearchQuery.length === 0
        ? true
        : pull.itemName.toLowerCase().includes(normalizedSearchQuery)

    return matchesRarity && matchesSearch
  })
}

function formatRecordCount(visibleCount: number, totalCount: number) {
  if (visibleCount === totalCount) {
    return `${totalCount} records`
  }

  return `${visibleCount} of ${totalCount}`
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
