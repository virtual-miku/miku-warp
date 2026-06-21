import { useEffect, useRef, useState } from 'react'
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
import { useLocalization } from '../../settings/components/localization-context'

const resultColumnMinWidth = 62
const resultColumnGap = 10
const initialResultRows = 3
const additionalResultRows = 3
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
  const { t } = useLocalization()
  const [rarity, setRarity] = useState<ResultRarity>(5)

  return (
    <section className="warp-result-gallery" aria-label={t('results.ariaLabel')}>
      <header className="panel-header">
        <h2>{t('results.title')}</h2>
        <div className="history-filter-group" aria-label={t('results.rarityFilter')}>
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
  const { t } = useLocalization()
  const galleryBodyRef = useRef<HTMLDivElement>(null)
  const [columnCount, setColumnCount] = useState(0)
  const [visibleRows, setVisibleRows] = useState(initialResultRows)
  const [retryKey, setRetryKey] = useState(0)
  const [pulls, setPulls] = useState<WarpPull[]>([])
  const [totalPulls, setTotalPulls] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)

  useEffect(() => {
    const galleryBody = galleryBodyRef.current

    if (!galleryBody) {
      return
    }

    const updateColumnCount = () => {
      const contentWidth = Math.max(
        0,
        galleryBody.getBoundingClientRect().width - 32,
      )
      const nextColumnCount = Math.max(
        1,
        Math.floor(
          (contentWidth + resultColumnGap) /
            (resultColumnMinWidth + resultColumnGap),
        ),
      )

      setColumnCount(nextColumnCount)
    }

    updateColumnCount()

    const resizeObserver = new ResizeObserver(updateColumnCount)
    resizeObserver.observe(galleryBody)

    return () => resizeObserver.disconnect()
  }, [])

  useEffect(() => {
    const resultLimit = columnCount * visibleRows

    if (resultLimit === 0) {
      return
    }

    let isActive = true

    listWarpPulls({
      accountId,
      bannerType: bannerType === 'all' ? undefined : bannerType,
      limit: resultLimit,
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
  }, [accountId, bannerType, columnCount, rarity, retryKey, visibleRows])

  const handleLoadMore = () => {
    if (isLoading) {
      return
    }

    if (hasError) {
      setIsLoading(true)
      setHasError(false)
      setRetryKey((currentKey) => currentKey + 1)
      return
    }

    setIsLoading(true)
    setVisibleRows((currentRows) => currentRows + additionalResultRows)
  }

  const hasMore = pulls.length < totalPulls
  const visiblePulls = getVisiblePulls(pulls, columnCount, totalPulls)
  const expandLabel = isLoading
    ? t('results.loadingMore')
    : hasError
      ? t('results.retryAria')
      : t('results.showMoreAria')

  return (
    <div className="warp-result-gallery-body" ref={galleryBodyRef}>
      {visiblePulls.length > 0 ? (
        <div className="warp-result-grid" role="list">
          {visiblePulls.map((pull) => (
            <WarpResultItem key={pull.id} pull={pull} />
          ))}
        </div>
      ) : (
        <div className="warp-result-empty">
          {isLoading
            ? t('results.loading')
            : hasError
              ? t('results.loadFailed')
              : t('results.empty', { rarity })}
        </div>
      )}

      {hasMore || hasError ? (
        <button
          aria-label={expandLabel}
          className={`icon-button warp-result-expand warp-result-expand-${rarity}`}
          disabled={isLoading}
          onClick={() => void handleLoadMore()}
          title={expandLabel}
          type="button"
        >
          <span>{hasError ? t('common.tryAgain') : t('results.showMore')}</span>
          <ChevronDown size={16} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  )
}

function WarpResultItem({ pull }: { pull: WarpPull }) {
  const { t } = useLocalization()
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
        pity
          ? t('results.obtainedAtPity', { item: pull.itemName, pity })
          : pull.itemName
      }
      className={`warp-result-item warp-result-item-${pull.rarity}`}
      role="listitem"
      title={
        pity
          ? t('results.pityTitle', { item: pull.itemName, pity })
          : pull.itemName
      }
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

function getVisiblePulls(
  pulls: WarpPull[],
  columnCount: number,
  totalPulls: number,
) {
  if (columnCount === 0 || pulls.length >= totalPulls) {
    return pulls
  }

  const completeRowCount = Math.floor(pulls.length / columnCount) * columnCount
  return pulls.slice(0, completeRowCount)
}
