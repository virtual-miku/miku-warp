import {
  bannerDefinitions,
  type BannerFilterType,
  type BannerType,
  getBannerLabel,
} from '../domain/banner'
import type { WarpBannerSummary } from '../../persistence/data/warp-pull-history'

const STAR_RAIL_PASS_ICON_PATH = '/icon/item/101.png'
const STAR_RAIL_SPECIAL_PASS_ICON_PATH = '/icon/item/102.png'

type BannerSummaryGridProps = {
  activeBannerType: BannerFilterType
  summaries: WarpBannerSummary[]
  onBannerTypeChange: (bannerType: BannerFilterType) => void
}

export function BannerSummaryGrid({
  activeBannerType,
  summaries,
  onBannerTypeChange,
}: BannerSummaryGridProps) {
  const summaryByBanner = new Map(
    summaries.map((summary) => [summary.bannerType, summary]),
  )
  const allSummary = summarizeAllBanners(summaries)
  const visibleBanners = bannerDefinitions.filter((banner) => {
    const summary = summaryByBanner.get(banner.type)

    return (
      banner.type !== 'departure' ||
      banner.type === activeBannerType ||
      (summary?.totalPulls ?? 0) > 0
    )
  })

  return (
    <section className="banner-summary-panel" aria-label="Banner summary">
      <header className="panel-header">
        <h2>Banner progress</h2>
      </header>
      <div className="banner-summary-grid">
        <button
          aria-label={`All banners: ${formatPullCount(allSummary.totalPulls)}`}
          aria-pressed={activeBannerType === 'all'}
          className={
            activeBannerType === 'all'
              ? 'banner-summary-card banner-summary-card-active'
              : 'banner-summary-card'
          }
          onClick={() => onBannerTypeChange('all')}
          type="button"
        >
          <span>All</span>
          <strong>
            {allSummary.totalPulls}{' '}
            <small>{getPullNoun(allSummary.totalPulls)}</small>
          </strong>
        </button>
        {visibleBanners.map((banner) => {
          const summary = summaryByBanner.get(banner.type)
          const isActive = activeBannerType === banner.type

          return (
            <button
              aria-label={`${getBannerLabel(banner.type)}: ${formatPullCount(summary?.totalPulls ?? 0)}`}
              aria-pressed={isActive}
              className={
                isActive
                  ? 'banner-summary-card banner-summary-card-active'
                  : 'banner-summary-card'
              }
              key={banner.type}
              onClick={() => onBannerTypeChange(banner.type)}
              type="button"
            >
              <span>{getBannerLabel(banner.type)}</span>
              <strong className="banner-pull-value">
                {summary?.totalPulls ?? 0}
                <img
                  alt=""
                  aria-hidden="true"
                  src={getBannerPassIconPath(banner.type)}
                />
              </strong>
            </button>
          )
        })}
      </div>
    </section>
  )
}

function getPullNoun(totalPulls: number) {
  return totalPulls === 1 ? 'pull' : 'pulls'
}

function formatPullCount(totalPulls: number) {
  return `${totalPulls} ${getPullNoun(totalPulls)}`
}

function getBannerPassIconPath(bannerType: BannerType) {
  return bannerType === 'standard' || bannerType === 'departure'
    ? STAR_RAIL_PASS_ICON_PATH
    : STAR_RAIL_SPECIAL_PASS_ICON_PATH
}

function summarizeAllBanners(summaries: WarpBannerSummary[]) {
  return summaries.reduce<{
    totalPulls: number
  }>(
    (result, summary) => {
      return {
        totalPulls: result.totalPulls + summary.totalPulls,
      }
    },
    {
      totalPulls: 0,
    },
  )
}
