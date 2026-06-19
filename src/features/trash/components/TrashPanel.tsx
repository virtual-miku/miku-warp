import { useState } from 'react'
import { ChevronLeft, ChevronRight, RotateCcw, Trash2 } from 'lucide-react'
import { getCatalogAssetUrl } from '../../warp-history/data/catalog-assets'
import { getBannerLabel } from '../../warp-history/domain/banner'
import { AppButton } from '../../../shared/ui/AppButton'
import type { TrashedWarpPull } from '../data/trash-history'

type TrashPanelProps = {
  deletingPullId?: string
  error?: string
  isLoading: boolean
  page: number
  pageSize: number
  pulls: TrashedWarpPull[]
  restoringPullId?: string
  totalPulls: number
  onPageChange: (page: number) => void
  onPermanentlyDelete: (pull: TrashedWarpPull) => void
  onRestore: (pull: TrashedWarpPull) => void
}

export function TrashPanel({
  deletingPullId,
  error,
  isLoading,
  page,
  pageSize,
  pulls,
  restoringPullId,
  totalPulls,
  onPageChange,
  onPermanentlyDelete,
  onRestore,
}: TrashPanelProps) {
  const pageCount = Math.max(1, Math.ceil(totalPulls / pageSize))
  const isMutating = deletingPullId !== undefined || restoringPullId !== undefined

  return (
    <section className="history-panel trash-panel" aria-label="Trash history">
      <header className="panel-header">
        <div>
          <h2>Deleted history</h2>
          <span>Items are removed permanently after six months.</span>
        </div>
      </header>

      {error ? (
        <div className="trash-error" role="alert">
          {error}
        </div>
      ) : null}

      <div className="trash-list">
        {pulls.length > 0 ? (
          pulls.map((pull) => (
            <TrashRow
              isDeleting={deletingPullId === pull.id}
              isDisabled={isMutating}
              isRestoring={restoringPullId === pull.id}
              key={pull.id}
              onPermanentlyDelete={onPermanentlyDelete}
              onRestore={onRestore}
              pull={pull}
            />
          ))
        ) : (
          <div className="warp-empty">
            <strong>{isLoading ? 'Loading Trash' : 'Trash is empty'}</strong>
            <span>Deleted warp records will stay here for six months.</span>
          </div>
        )}
      </div>

      <footer className="history-pagination" aria-label="Trash pagination">
        <span>Page {page}/{pageCount}</span>
        <div className="manual-pagination-controls">
          <button
            aria-label="Previous Trash page"
            className="icon-button"
            disabled={page <= 1 || isLoading || isMutating}
            onClick={() => onPageChange(page - 1)}
            type="button"
          >
            <ChevronLeft size={16} aria-hidden="true" />
          </button>
          <button
            aria-label="Next Trash page"
            className="icon-button"
            disabled={page >= pageCount || isLoading || isMutating}
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

function TrashRow({
  isDeleting,
  isDisabled,
  isRestoring,
  onPermanentlyDelete,
  onRestore,
  pull,
}: {
  isDeleting: boolean
  isDisabled: boolean
  isRestoring: boolean
  onPermanentlyDelete: (pull: TrashedWarpPull) => void
  onRestore: (pull: TrashedWarpPull) => void
  pull: TrashedWarpPull
}) {
  return (
    <article className="trash-row">
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

function formatDateTime(value: string, isUtc = false) {
  const normalizedValue = isUtc && !value.endsWith('Z') ? `${value}Z` : value
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
