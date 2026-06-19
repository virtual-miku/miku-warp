import { getBannerLabel, type BannerType } from '../domain/banner'
import type { WarpBannerSummary } from '../../persistence/data/warp-pull-history'
import { getNextRateUpChance } from '../domain/rate-up'

type BannerStatsPanelProps = {
  bannerType: BannerType
  summary?: WarpBannerSummary
}

export function BannerStatsPanel({
  bannerType,
  summary,
}: BannerStatsPanelProps) {
  const nextRateUp = getNextRateUpChance(
    bannerType,
    summary?.lastFiveStarName,
  )

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
          detailClassName="banner-detail-gold"
        />
        <StatItem
          label="Next 5★ rate-up"
          value={nextRateUp.chance === undefined ? 'N/A' : `${nextRateUp.chance}%`}
          detail={nextRateUp.detail}
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
  detailClassName?: string
}

function StatItem({ label, value, detail, detailClassName }: StatItemProps) {
  return (
    <article className="banner-detail-item">
      <span>{label}</span>
      <strong>{value}</strong>
      <span className={detailClassName}>{detail}</span>
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

  return `Pity ${(total / count).toFixed(1)}`
}

function formatLastPity(name: string | undefined, pity: number | undefined) {
  if (!name) {
    return 'Last: none'
  }

  return pity ? `Last: ${name} at ${pity}` : `Last: ${name}`
}
