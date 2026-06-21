import { Info } from 'lucide-react'
import { useId, useState, type KeyboardEvent, type ReactNode } from 'react'
import {
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
          <RateUpWinRateItem bannerType={bannerType} summary={summary} />
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
      <div className="banner-detail-detail">{detail}</div>
    </article>
  )
}

function RateUpWinRateItem({
  bannerType,
  summary,
}: {
  bannerType: BannerType
  summary?: WarpBannerSummary
}) {
  const wins = summary?.rateUpWins ?? 0
  const losses = summary?.rateUpLosses ?? 0
  const standardLosses = summary?.rateUpStandardLosses ?? 0
  const celestialLosses = summary?.rateUpCelestialLosses ?? 0
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
        attempts > 0 ? (
          <RateUpOutcomeDetail
            celestialLosses={celestialLosses}
            losses={losses}
            showLossBreakdown={isCharacterRateUpBanner(bannerType)}
            standardLosses={standardLosses}
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
  celestialLosses,
  losses,
  showLossBreakdown,
  standardLosses,
  wins,
}: {
  celestialLosses: number
  losses: number
  showLossBreakdown: boolean
  standardLosses: number
  wins: number
}) {
  return (
    <>
      <span className="rate-up-wins">
        {wins} {wins === 1 ? 'Win' : 'Wins'}
      </span>
      {' · '}
      {showLossBreakdown ? (
        <RateUpLossBreakdown
          celestialLosses={celestialLosses}
          losses={losses}
          standardLosses={standardLosses}
        />
      ) : (
        <span className="rate-up-losses">
          {losses} {losses === 1 ? 'Loss' : 'Losses'}
        </span>
      )}
    </>
  )
}

function RateUpLossBreakdown({
  celestialLosses,
  losses,
  standardLosses,
}: {
  celestialLosses: number
  losses: number
  standardLosses: number
}) {
  const tooltipId = useId()
  const [isOpen, setIsOpen] = useState(false)
  const [isPinned, setIsPinned] = useState(false)

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'Escape') {
      return
    }

    setIsPinned(false)
    setIsOpen(false)
  }

  const handleToggle = () => {
    setIsPinned((current) => {
      const next = !current
      setIsOpen(next)
      return next
    })
  }

  return (
    <span
      className="rate-up-loss-breakdown"
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => {
        if (!isPinned) {
          setIsOpen(false)
        }
      }}
    >
      <button
        aria-describedby={isOpen ? tooltipId : undefined}
        aria-expanded={isOpen}
        aria-label={`${losses} ${losses === 1 ? 'loss' : 'losses'}. Show loss breakdown`}
        className="rate-up-loss-trigger"
        onBlur={() => {
          if (!isPinned) {
            setIsOpen(false)
          }
        }}
        onClick={handleToggle}
        onFocus={() => setIsOpen(true)}
        onKeyDown={handleKeyDown}
        type="button"
      >
        {losses} {losses === 1 ? 'Loss' : 'Losses'}
        <Info aria-hidden="true" size={12} strokeWidth={2.4} />
      </button>
      <span
        className="rate-up-loss-tooltip"
        hidden={!isOpen}
        id={tooltipId}
        role="tooltip"
      >
        <span className="rate-up-standard-losses">
          <b>{standardLosses}</b> Standard{' '}
          {standardLosses === 1 ? 'character' : 'characters'}
        </span>
        <span className="rate-up-celestial-losses">
          <b>{celestialLosses}</b> Celestial Invitation{' '}
          {celestialLosses === 1 ? 'character' : 'characters'}
        </span>
        <small>Click Losses to keep this open</small>
      </span>
    </span>
  )
}

function isCharacterRateUpBanner(bannerType: BannerType) {
  return (
    bannerType === 'character_event' ||
    bannerType === 'collaboration_character'
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
