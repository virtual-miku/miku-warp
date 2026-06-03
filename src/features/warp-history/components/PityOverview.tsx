import type { PitySummary } from '../domain/pity'

type PityOverviewProps = {
  summary: PitySummary
}

export function PityOverview({ summary }: PityOverviewProps) {
  return (
    <section className="pity-grid" aria-label="Pity overview">
      <article className="pity-card pity-accent-gold">
        <span>5-star pity</span>
        <strong>{summary.currentFiveStarPity}</strong>
        <span>Last: {summary.lastFiveStarName ?? 'None'}</span>
      </article>
      <article className="pity-card pity-accent-purple">
        <span>4-star pity</span>
        <strong>{summary.currentFourStarPity}</strong>
        <span>Last: {summary.lastFourStarName ?? 'None'}</span>
      </article>
      <article className="pity-card pity-accent-teal">
        <span>Total pulls</span>
        <strong>{summary.totalPulls}</strong>
        <span>{summary.fiveStarCount} gold records</span>
      </article>
    </section>
  )
}

