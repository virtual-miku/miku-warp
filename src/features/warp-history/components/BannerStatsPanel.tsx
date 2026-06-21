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
import { useLocalization } from '../../settings/components/localization-context'
import type { Translator } from '../../settings/domain/localization'

type BannerStatsPanelProps = {
  bannerType: BannerType
  summary?: WarpBannerSummary
}

export function BannerStatsPanel({
  bannerType,
  summary,
}: BannerStatsPanelProps) {
  const { t } = useLocalization()
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
    <section className="banner-detail-panel" aria-label={t('stats.ariaLabel')}>
      <div className="banner-detail-grid">
        <StatItem
          label={t('stats.averagePity')}
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
              {t('stats.totalFiveStar')}{' '}
              <span className="banner-detail-gold">
                {summary?.fiveStarCount ?? 0}
              </span>
            </>
          }
        />
        {showRateUpStats ? (
          <StatItem
            label={t('stats.nextRateUp')}
            value={
              nextRateUp.chance === undefined
                ? t('stats.unknown')
                : `${nextRateUp.chance}%`
            }
            detail={<RateUpDetail nextRateUp={nextRateUp} t={t} />}
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
  const { t } = useLocalization()
  const wins = summary?.rateUpWins ?? 0
  const losses = summary?.rateUpLosses ?? 0
  const standardLosses = summary?.rateUpStandardLosses ?? 0
  const celestialLosses = summary?.rateUpCelestialLosses ?? 0
  const attempts = wins + losses
  const winRate = attempts > 0 ? Math.round((wins / attempts) * 100) : undefined

  return (
    <StatItem
      label={t('stats.winRate')}
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
          t('stats.noResult')
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
  const { t } = useLocalization()
  return (
    <>
      <span className="rate-up-wins">
        {t(wins === 1 ? 'stats.win' : 'stats.wins', { count: wins })}
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
          {t(losses === 1 ? 'stats.loss' : 'stats.losses', { count: losses })}
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
  const { t } = useLocalization()
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
        aria-label={t('stats.lossBreakdownAria', {
          losses: t(losses === 1 ? 'stats.lossLower' : 'stats.lossesLower', {
            count: losses,
          }),
        })}
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
        {t(losses === 1 ? 'stats.loss' : 'stats.losses', { count: losses })}
        <Info aria-hidden="true" size={12} strokeWidth={2.4} />
      </button>
      <span
        className="rate-up-loss-tooltip"
        hidden={!isOpen}
        id={tooltipId}
        role="tooltip"
      >
        <span className="rate-up-standard-losses">
          <b>{standardLosses}</b>{' '}
          {t(
            standardLosses === 1
              ? 'stats.standardCharacterLabel'
              : 'stats.standardCharactersLabel',
          )}
        </span>
        <span className="rate-up-celestial-losses">
          <b>{celestialLosses}</b>{' '}
          {t(
            celestialLosses === 1
              ? 'stats.celestialCharacterLabel'
              : 'stats.celestialCharactersLabel',
          )}
        </span>
        <small>{t('stats.pinHint')}</small>
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

function RateUpDetail({
  nextRateUp,
  t,
}: {
  nextRateUp: NextRateUpChance
  t: Translator
}) {
  const detail = translateRateUpDetail(t, nextRateUp.detail)
  if (!nextRateUp.itemName) {
    return detail
  }

  return (
    <>
      {detail}{' '}
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

function translateRateUpDetail(t: Translator, detail: string) {
  const match = legacyRateUpDetailMessages.find(([pattern]) =>
    pattern.test(detail),
  )

  return match ? t(match[1]) : detail
}

const legacyRateUpDetailMessages = [
  [/^Celestial Invitation result after$/, 'stats.celestialAfter'],
  [
    /^Celestial Invitation prevents an exact rate-up prediction$/,
    'stats.celestialUnknown',
  ],
  [/^Guaranteed after$/, 'stats.guaranteedAfter'],
  [/^Guaranteed after an off-rate 5/, 'stats.guaranteedOffRate'],
  [/^Base chance after$/, 'stats.baseAfter'],
  [/^Base chance before the first recorded 5/, 'stats.baseBeforeFirst'],
] as const satisfies readonly [RegExp, Parameters<Translator>[0]][]
