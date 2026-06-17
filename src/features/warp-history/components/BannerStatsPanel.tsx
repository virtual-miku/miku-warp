import { getBannerLabel, type BannerType } from '../domain/banner'
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
        <span>{summary?.totalPulls ?? 0} pulls</span>
      </header>
      <div className="banner-detail-grid">
        <StatItem
          label="Average 5-star"
          value={formatAveragePity(
            summary?.fiveStarPityTotal,
            summary?.fiveStarCount,
          )}
          detail={`${summary?.fiveStarCount ?? 0} gold records`}
        />
        <StatItem
          label="Current 5-star pity"
          value={summary?.currentFiveStarPity ?? 0}
          detail={formatLastPity(
            summary?.lastFiveStarName,
            summary?.lastFiveStarPity,
          )}
        />
        <StatItem
          label="Current 4-star pity"
          value={summary?.currentFourStarPity ?? 0}
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

  return (total / count).toFixed(1)
}

function formatLastPity(name: string | undefined, pity: number | undefined) {
  if (!name) {
    return 'Last: none'
  }

  return pity ? `Last: ${name} at ${pity}` : `Last: ${name}`
}
