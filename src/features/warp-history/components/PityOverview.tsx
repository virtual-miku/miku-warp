import type { PitySummary } from '../domain/pity'
import { getFiveStarHardPity, type BannerType } from '../domain/banner'

const STELLAR_JADE_ICON_PATH = '/icon/item/900001.png'
const STAR_SYMBOL = '\u2605'
const MULTIPLY_SYMBOL = '\u00d7'

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
      <article className="pity-card pity-accent-teal">
        <span>Stellar Jade spent</span>
        <StellarJadeValue value={summary.totalPulls * 160} />
        <span>{`${summary.totalPulls} pulls ${MULTIPLY_SYMBOL} 160`}</span>
      </article>
      <article className="pity-card pity-accent-gold">
        <span>{`5${STAR_SYMBOL} pity`}</span>
        <strong>
          {summary.currentFiveStarPity}/{fiveStarHardPity}
        </strong>
        <span>
          Last:{' '}
          <b className="pity-last-five">
            {summary.lastFiveStarName ?? 'None'}
          </b>
        </span>
      </article>
      <article className="pity-card pity-accent-purple">
        <span>{`4${STAR_SYMBOL} pity`}</span>
        <strong>{summary.currentFourStarPity}/10</strong>
        <span>
          Last:{' '}
          <b className="pity-last-four">
            {summary.lastFourStarName ?? 'None'}
          </b>
        </span>
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
        <StellarJadeValue value={totalPulls * 160} />
        <span>{`${totalPulls} pulls ${MULTIPLY_SYMBOL} 160`}</span>
      </article>
    </section>
  )
}

function StellarJadeValue({ value }: { value: number }) {
  return (
    <strong className="stellar-jade-value">
      {formatStellarJade(value)}
      <img src={STELLAR_JADE_ICON_PATH} alt="" aria-hidden="true" />
    </strong>
  )
}

function formatStellarJade(value: number) {
  return new Intl.NumberFormat('en-US').format(value)
}
