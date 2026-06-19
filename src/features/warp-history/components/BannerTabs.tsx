import {
  bannerDefinitions,
  type BannerFilterType,
} from '../domain/banner'
import type { WarpBannerSummary } from '../../persistence/data/warp-pull-history'

type BannerTabsProps = {
  activeBannerType: BannerFilterType
  summaries: WarpBannerSummary[]
  onBannerTypeChange: (bannerType: BannerFilterType) => void
}

export function BannerTabs({
  activeBannerType,
  summaries,
  onBannerTypeChange,
}: BannerTabsProps) {
  const visibleBanners = visibleBannerDefinitions(summaries, activeBannerType)

  return (
    <div className="banner-tabs" role="tablist" aria-label="Warp banners">
      <button
        className={
          activeBannerType === 'all'
            ? 'banner-tab banner-tab-active'
            : 'banner-tab'
        }
        type="button"
        role="tab"
        aria-selected={activeBannerType === 'all'}
        onClick={() => onBannerTypeChange('all')}
      >
        All
      </button>
      {visibleBanners.map((banner) => (
        <button
          className={
            banner.type === activeBannerType
              ? 'banner-tab banner-tab-active'
              : 'banner-tab'
          }
          key={banner.type}
          type="button"
          role="tab"
          aria-selected={banner.type === activeBannerType}
          onClick={() => onBannerTypeChange(banner.type)}
        >
          {banner.label}
        </button>
      ))}
    </div>
  )
}

function visibleBannerDefinitions(
  summaries: WarpBannerSummary[],
  activeBannerType: BannerFilterType,
) {
  const bannersWithData = new Set(
    summaries
      .filter((summary) => summary.totalPulls > 0)
      .map((summary) => summary.bannerType),
  )

  return bannerDefinitions.filter(
    (banner) =>
      banner.type !== 'departure' ||
      banner.type === activeBannerType ||
      bannersWithData.has(banner.type),
  )
}
