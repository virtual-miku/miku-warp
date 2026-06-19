import type { ReactNode } from 'react'
import { getBannerLabel, type BannerType } from '../domain/banner'
import type { WarpBannerSummary } from '../../persistence/data/warp-pull-history'
import {
  getNextRateUpChance,
  type NextRateUpChance,
} from '../domain/rate-up'

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
          detail={
            <>
              Total 5★ obtained:{' '}
              <span className="banner-detail-gold">
                {summary?.fiveStarCount ?? 0}
              </span>
            </>
          }
        />
        {nextRateUp.chance !== undefined ? (
          <StatItem
            label="Next 5★ rate-up"
            value={`${nextRateUp.chance}%`}
            detail={<RateUpDetail nextRateUp={nextRateUp} />}
          />
        ) : null}
      </div>
    </section>
  )
}

type StatItemProps = {
  label: string
  value: number | string
  detail: ReactNode
}

function StatItem({ label, value, detail }: StatItemProps) {
  return (
    <article className="banner-detail-item">
      <span className="banner-detail-label">{label}</span>
      <strong>{value}</strong>
      <p className="banner-detail-detail">{detail}</p>
    </article>
  )
}

function RateUpDetail({ nextRateUp }: { nextRateUp: NextRateUpChance }) {
  if (!nextRateUp.itemName) {
    return nextRateUp.detail
  }

  return (
    <>
      {nextRateUp.detail}{' '}
      <span className="banner-detail-gold">{nextRateUp.itemName}</span>
    </>
  )
}

function formatAveragePity(
  total: number | undefined,
  count: number | undefined,
) {
  if (!total || !count) {
    return '-'
  }

  return `Pity ${Math.round(total / count)}`
}
