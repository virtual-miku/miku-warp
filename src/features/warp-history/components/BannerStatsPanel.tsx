import {
  getBannerLabel,
  getFiveStarHardPity,
  type BannerType,
} from '../domain/banner'
import type { WarpBannerSummary } from '../../persistence/data/warp-pull-history'

type BannerStatsPanelProps = {
  bannerType: BannerType
  summary?: WarpBannerSummary
}

export function BannerStatsPanel({
  bannerType,
  summary,
}: BannerStatsPanelProps) {
  return (
    <section className="banner-detail-panel" aria-label="Banner statistics">
      <header className="panel-header">
        <h2>{getBannerLabel(bannerType)} stats</h2>
      </header>
      <div className="banner-detail-grid">
        <StatItem
          label="Average 5★"
          value={formatAveragePity(
            summary?.fiveStarPityTotal,
            summary?.fiveStarCount,
          )}
          detail={`Total 5★ obtained: ${summary?.fiveStarCount ?? 0}`}
        />
        <StatItem
          label="Current 5★ pity"
          value={`${summary?.currentFiveStarPity ?? 0}/${getFiveStarHardPity(bannerType)}`}
          detail={formatLastPity(
            summary?.lastFiveStarName,
            summary?.lastFiveStarPity,
          )}
        />
        <StatItem
          label="Current 4★ pity"
          value={`${summary?.currentFourStarPity ?? 0}/10`}
          detail={formatLastPity(
            summary?.lastFourStarName,
            summary?.lastFourStarPity,
          )}
        />
      </div>
    </section>
  )
}

type StatItemProps = {
  label: string
  value: number | string
  detail: string
}

function StatItem({ label, value, detail }: StatItemProps) {
  return (
    <article className="banner-detail-item">
      <span>{label}</span>
      <strong>{value}</strong>
      <span>{detail}</span>
    </article>
  )
}

function formatAveragePity(
  total: number | undefined,
  count: number | undefined,
) {
  if (!total || !count) {
    return '-'
  }

  return `${(total / count).toFixed(1)} pity`
}

function formatLastPity(name: string | undefined, pity: number | undefined) {
  if (!name) {
    return 'Last: none'
  }

  return pity ? `Last: ${name} at ${pity}` : `Last: ${name}`
}
