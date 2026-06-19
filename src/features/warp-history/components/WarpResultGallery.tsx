import { useEffect, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { listWarpPulls } from '../../persistence/data/warp-pull-history'
import { getCatalogAssetUrl } from '../data/catalog-assets'
import { itemCatalog } from '../data/item-catalog'
import {
  getFiveStarHardPity,
  type BannerFilterType,
} from '../domain/banner'
import { getPityLevelClass } from '../domain/pity-level'
import type { WarpPull } from '../domain/warp-pull'

const resultBatchSize = 12
const catalogIconByIdentity = new Map(
  itemCatalog.map((item) => [
    createCatalogItemKey(item.name, item.itemType, item.rarity),
    item.iconPath,
  ]),
)

type ResultRarity = 5 | 4 | 3

type WarpResultGalleryProps = {
  accountId: string
  bannerType: BannerFilterType
  refreshKey: string
}

export function WarpResultGallery({
  accountId,
  bannerType,
  refreshKey,
}: WarpResultGalleryProps) {
  const [rarity, setRarity] = useState<ResultRarity>(5)

  return (
    <section className="warp-result-gallery" aria-label="Warp result gallery">
      <header className="panel-header">
        <h2>Warp results</h2>
        <div className="history-filter-group" aria-label="Result rarity filter">
          {([5, 4, 3] as const).map((filterRarity) => (
            <button
              aria-pressed={rarity === filterRarity}
              className={[
                'history-filter-button',
                `history-filter-button-${filterRarity}`,
                rarity === filterRarity
                  ? 'history-filter-button-active'
                  : undefined,
              ]
                .filter(Boolean)
                .join(' ')}
              key={filterRarity}
              onClick={() => setRarity(filterRarity)}
              type="button"
            >
              {filterRarity}★
            </button>
          ))}
        </div>
      </header>

      <WarpResultList
        accountId={accountId}
        bannerType={bannerType}
        key={`${accountId}:${bannerType}:${rarity}:${refreshKey}`}
        rarity={rarity}
      />
    </section>
  )
}

type WarpResultListProps = {
  accountId: string
  bannerType: BannerFilterType
  rarity: ResultRarity
}

function WarpResultList({
  accountId,
  bannerType,
  rarity,
}: WarpResultListProps) {
  const [pulls, setPulls] = useState<WarpPull[]>([])
  const [totalPulls, setTotalPulls] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)

  useEffect(() => {
    let isActive = true

    listWarpPulls({
      accountId,
      bannerType: bannerType === 'all' ? undefined : bannerType,
      limit: resultBatchSize,
      offset: 0,
      rarity,
    })
      .then((result) => {
        if (isActive) {
          setPulls(result.pulls)
          setTotalPulls(result.total)
        }
      })
      .catch(() => {
        if (isActive) {
          setHasError(true)
        }
      })
      .finally(() => {
        if (isActive) {
          setIsLoading(false)
        }
      })

    return () => {
      isActive = false
    }
  }, [accountId, bannerType, rarity])

  const handleLoadMore = async () => {
    if (isLoading || (!hasError && pulls.length >= totalPulls)) {
      return
    }

    setIsLoading(true)
    setHasError(false)

    try {
      const result = await listWarpPulls({
        accountId,
        bannerType: bannerType === 'all' ? undefined : bannerType,
        limit: resultBatchSize,
        offset: pulls.length,
        rarity,
      })

      setPulls((currentPulls) => mergeUniquePulls(currentPulls, result.pulls))
      setTotalPulls(result.total)
    } catch {
      setHasError(true)
    } finally {
      setIsLoading(false)
    }
  }

  const hasMore = pulls.length < totalPulls

  return (
    <div className="warp-result-gallery-body">
      {pulls.length > 0 ? (
        <div className="warp-result-grid" role="list">
          {pulls.map((pull) => (
            <WarpResultItem key={pull.id} pull={pull} />
          ))}
        </div>
      ) : (
        <div className="warp-result-empty">
          {isLoading
            ? 'Loading results'
            : hasError
              ? 'Could not load warp results'
              : `No ${rarity}★ results for this banner`}
        </div>
      )}

      {hasMore || hasError ? (
        <button
          aria-label={isLoading ? 'Loading more results' : 'Show more results'}
          className="icon-button warp-result-expand"
          disabled={isLoading}
          onClick={() => void handleLoadMore()}
          title="Show more results"
          type="button"
        >
          <ChevronDown size={18} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  )
}

function WarpResultItem({ pull }: { pull: WarpPull }) {
  const [hasImageError, setHasImageError] = useState(false)
  const catalogIconPath = catalogIconByIdentity.get(
    createCatalogItemKey(pull.itemName, pull.itemType, pull.rarity),
  )
  const iconUrl = getCatalogAssetUrl(pull.iconPath ?? catalogIconPath)
  const pity = getResultPity(pull)
  const pityClassName = pity
    ? getPityLevelClass(
        pity,
        pull.rarity === 5 ? getFiveStarHardPity(pull.bannerType) : 10,
      )
    : undefined

  return (
    <article
      aria-label={
        pity ? `${pull.itemName}, obtained at pity ${pity}` : pull.itemName
      }
      className={`warp-result-item warp-result-item-${pull.rarity}`}
      role="listitem"
      title={pity ? `${pull.itemName} · Pity ${pity}` : pull.itemName}
    >
      {iconUrl && !hasImageError ? (
        <img
          alt=""
          loading="lazy"
          onError={() => setHasImageError(true)}
          src={iconUrl}
        />
      ) : (
        <span>{pull.rarity}★</span>
      )}
      {pity ? (
        <strong className={`warp-result-pity ${pityClassName}`}>{pity}</strong>
      ) : null}
    </article>
  )
}

function getResultPity(pull: WarpPull) {
  if (pull.rarity === 5) {
    return pull.pityFiveAtPull
  }

  if (pull.rarity === 4) {
    return pull.pityFourAtPull
  }

  return undefined
}

function createCatalogItemKey(
  itemName: string,
  itemType: WarpPull['itemType'],
  rarity: WarpPull['rarity'],
) {
  return `${itemType}:${rarity}:${itemName}`
}

function mergeUniquePulls(currentPulls: WarpPull[], nextPulls: WarpPull[]) {
  const knownPullIds = new Set(currentPulls.map((pull) => pull.id))
  return [
    ...currentPulls,
    ...nextPulls.filter((pull) => !knownPullIds.has(pull.id)),
  ]
}
