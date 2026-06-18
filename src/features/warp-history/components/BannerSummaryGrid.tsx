import {
  bannerDefinitions,
  getBannerLabel,
  type BannerType,
} from '../domain/banner'
import type { WarpBannerSummary } from '../../persistence/data/warp-pull-history'

type BannerSummaryGridProps = {
  activeBannerType: BannerType
  summaries: WarpBannerSummary[]
  onBannerTypeChange: (bannerType: BannerType) => void
}

export function BannerSummaryGrid({
  activeBannerType,
  summaries,
  onBannerTypeChange,
}: BannerSummaryGridProps) {
  const summaryByBanner = new Map(
    summaries.map((summary) => [summary.bannerType, summary]),
  )
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
        <span>{summaries.length} active banners</span>
      </header>
      <div className="banner-summary-grid">
        {visibleBanners.map((banner) => {
          const summary = summaryByBanner.get(banner.type)
          const isActive = activeBannerType === banner.type

          return (
            <button
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
              <strong>{summary?.totalPulls ?? 0}</strong>
              <span>{formatFiveStarLine(summary)}</span>
              <span>{formatLastPullLine(summary)}</span>
            </button>
          )
        })}
      </div>
    </section>
  )
}

function formatFiveStarLine(summary: WarpBannerSummary | undefined) {
  if (!summary || summary.totalPulls === 0) {
    return 'No pulls yet'
  }

  return `5-star pity ${summary.currentFiveStarPity} - ${summary.fiveStarCount} gold`
}

function formatLastPullLine(summary: WarpBannerSummary | undefined) {
  if (!summary?.lastItemName) {
    return 'Last: none'
  }

  return `Last: ${summary.lastItemName}`
}
