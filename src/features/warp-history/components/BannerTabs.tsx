import {
  bannerDefinitions,
  type BannerType,
} from '../domain/banner'

type BannerTabsProps = {
  activeBannerType: BannerType
  onBannerTypeChange: (bannerType: BannerType) => void
}

export function BannerTabs({
  activeBannerType,
  onBannerTypeChange,
}: BannerTabsProps) {
  return (
    <div className="banner-tabs" role="tablist" aria-label="Warp banners">
      {bannerDefinitions.map((banner) => (
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
