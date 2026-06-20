import type { ReactNode } from 'react'
import {
  getBannerLabel,
  getFiveStarHardPity,
  isRateUpBanner,
  type BannerType,
} from '../domain/banner'
import type { WarpBannerSummary } from '../../persistence/data/warp-pull-history'
import { getPityLevelClass } from '../domain/pity-level'
import {
  getNextRateUpChance,
  getRateUpWinRateTone,
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
    summary?.nextFiveStarGuaranteed,
  )
  const averagePity = calculateAveragePity(
    summary?.fiveStarPityTotal,
    summary?.fiveStarCount,
  )
  const showRateUpStats = isRateUpBanner(bannerType)

  return (
    <section className="banner-detail-panel" aria-label="Banner statistics">
      <header className="panel-header">
        <h2>{getBannerLabel(bannerType)} stats</h2>
      </header>
      <div className="banner-detail-grid">
        <StatItem
          label="Average pity"
          value={formatAveragePity(averagePity)}
          valueClassName={
            averagePity === undefined
              ? undefined
              : getPityLevelClass(
                  averagePity,
                  getFiveStarHardPity(bannerType),
                )
          }
          detail={
            <>
              Total 5★ obtained:{' '}
              <span className="banner-detail-gold">
                {summary?.fiveStarCount ?? 0}
              </span>
            </>
          }
        />
        {showRateUpStats ? (
          <StatItem
            label="Next 5★ rate-up"
            value={
              nextRateUp.chance === undefined
                ? 'Unknown'
                : `${nextRateUp.chance}%`
            }
            detail={<RateUpDetail nextRateUp={nextRateUp} />}
          />
        ) : null}
        {showRateUpStats ? (
          <RateUpWinRateItem summary={summary} />
        ) : null}
      </div>
    </section>
  )
}

type StatItemProps = {
  label: string
  value: number | string
  detail: ReactNode
  valueClassName?: string
}

function StatItem({ label, value, detail, valueClassName }: StatItemProps) {
  return (
    <article className="banner-detail-item">
      <span className="banner-detail-label">{label}</span>
      <strong className={valueClassName}>{value}</strong>
      <p className="banner-detail-detail">{detail}</p>
    </article>
  )
}

function RateUpWinRateItem({ summary }: { summary?: WarpBannerSummary }) {
  const wins = summary?.rateUpWins ?? 0
  const losses = summary?.rateUpLosses ?? 0
  const uncertain = summary?.rateUpUncertain ?? 0
  const attempts = wins + losses
  const winRate = attempts > 0 ? Math.round((wins / attempts) * 100) : undefined

  return (
    <StatItem
      label="Rate-up win rate"
      value={winRate === undefined ? '-' : `${winRate}%`}
      valueClassName={
        winRate === undefined
          ? undefined
          : `rate-up-score-${getRateUpWinRateTone(winRate)}`
      }
      detail={
        attempts > 0 || uncertain > 0 ? (
          <RateUpOutcomeDetail
            losses={losses}
            uncertain={uncertain}
            wins={wins}
          />
        ) : (
          'No recorded rate-up result yet'
        )
      }
    />
  )
}

function RateUpOutcomeDetail({
  losses,
  uncertain,
  wins,
}: {
  losses: number
  uncertain: number
  wins: number
}) {
  return (
    <>
      <span className="rate-up-wins">
        {wins} {wins === 1 ? 'Win' : 'Wins'}
      </span>
      {' · '}
      <span className="rate-up-losses">
        {losses} {losses === 1 ? 'Loss' : 'Losses'}
      </span>
      {uncertain > 0 ? (
        <>
          <br />
          <span className="rate-up-uncertain">
            {uncertain} Celestial {uncertain === 1 ? 'invitation character' : 'invitation characters'}
          </span>
        </>
      ) : null}
    </>
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

function calculateAveragePity(
  total: number | undefined,
  count: number | undefined,
) {
  if (!total || !count) {
    return undefined
  }

  return Math.round(total / count)
}

function formatAveragePity(averagePity: number | undefined) {
  return averagePity === undefined ? '-' : averagePity
}
