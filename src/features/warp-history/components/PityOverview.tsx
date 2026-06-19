import type { PitySummary } from '../domain/pity'
import { getFiveStarHardPity, type BannerType } from '../domain/banner'

type PityOverviewProps = {
  bannerType: BannerType
  summary: PitySummary
}

type StellarJadeOverviewProps = {
  totalPulls: number
}

export function PityOverview({ bannerType, summary }: PityOverviewProps) {
  const fiveStarHardPity = getFiveStarHardPity(bannerType)

  return (
    <section className="pity-grid" aria-label="Pity overview">
      <article className="pity-card pity-accent-gold">
        <span>5★ pity</span>
        <strong>{summary.currentFiveStarPity}/{fiveStarHardPity}</strong>
        <span>
          Last: <b className="pity-last-five">{summary.lastFiveStarName ?? 'None'}</b>
        </span>
      </article>
      <article className="pity-card pity-accent-purple">
        <span>4★ pity</span>
        <strong>{summary.currentFourStarPity}/10</strong>
        <span>
          Last: <b className="pity-last-four">{summary.lastFourStarName ?? 'None'}</b>
        </span>
      </article>
      <article className="pity-card pity-accent-teal">
        <span>Stellar Jade spent</span>
        <strong>{formatStellarJade(summary.totalPulls * 160)}</strong>
        <span>{summary.totalPulls} pulls × 160</span>
      </article>
    </section>
  )
}

export function StellarJadeOverview({ totalPulls }: StellarJadeOverviewProps) {
  return (
    <section
      className="pity-grid stellar-jade-overview"
      aria-label="Stellar Jade overview"
    >
      <article className="pity-card pity-accent-teal">
        <span>Stellar Jade spent</span>
        <strong>{formatStellarJade(totalPulls * 160)}</strong>
        <span>{totalPulls} pulls × 160</span>
      </article>
    </section>
  )
}

function formatStellarJade(value: number) {
  return new Intl.NumberFormat('en-US').format(value)
}
