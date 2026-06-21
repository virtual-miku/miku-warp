import type { PitySummary } from '../domain/pity'
import { getFiveStarHardPity, type BannerType } from '../domain/banner'
import { useLocalization } from '../../settings/components/localization-context'
import { formatNumber } from '../../../shared/lib/date-time'

const STELLAR_JADE_ICON_PATH = '/icon/item/900001.png'

type PityOverviewProps = {
  bannerType: BannerType
  summary: PitySummary
}

type StellarJadeOverviewProps = {
  totalPulls: number
}

export function PityOverview({ bannerType, summary }: PityOverviewProps) {
  const { language, t } = useLocalization()
  const fiveStarHardPity = getFiveStarHardPity(bannerType)

  return (
    <section className="pity-grid" aria-label={t('pity.overviewAria')}>
      <article className="pity-card pity-accent-teal">
        <span>{t('pity.stellarJadeSpent')}</span>
        <StellarJadeValue language={language} value={summary.totalPulls * 160} />
        <span>{t('pity.pullCalculation', { count: summary.totalPulls })}</span>
      </article>
      <article className="pity-card pity-accent-gold">
        <span>{t('pity.fiveStar')}</span>
        <strong>
          {summary.currentFiveStarPity}/{fiveStarHardPity}
        </strong>
        <span>
          {t('pity.last')}{' '}
          <b className="pity-last-five">
            {summary.lastFiveStarName ?? t('common.none')}
          </b>
        </span>
      </article>
      <article className="pity-card pity-accent-purple">
        <span>{t('pity.fourStar')}</span>
        <strong>{summary.currentFourStarPity}/10</strong>
        <span>
          {t('pity.last')}{' '}
          <b className="pity-last-four">
            {summary.lastFourStarName ?? t('common.none')}
          </b>
        </span>
      </article>
    </section>
  )
}

export function StellarJadeOverview({ totalPulls }: StellarJadeOverviewProps) {
  const { language, t } = useLocalization()
  return (
    <section
      className="pity-grid stellar-jade-overview"
      aria-label={t('pity.stellarJadeAria')}
    >
      <article className="pity-card pity-accent-teal">
        <span>{t('pity.stellarJadeSpent')}</span>
        <StellarJadeValue language={language} value={totalPulls * 160} />
        <span>{t('pity.pullCalculation', { count: totalPulls })}</span>
      </article>
    </section>
  )
}

function StellarJadeValue({ language, value }: { language: 'en' | 'id'; value: number }) {
  return (
    <strong className="stellar-jade-value">
      {formatNumber(value, language)}
      <img src={STELLAR_JADE_ICON_PATH} alt="" aria-hidden="true" />
    </strong>
  )
}
