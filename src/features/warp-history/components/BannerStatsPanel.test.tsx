import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { WarpBannerSummary } from '../../persistence/data/warp-pull-history'
import { BannerStatsPanel } from './BannerStatsPanel'

describe('BannerStatsPanel rate-up outcomes', () => {
  it('shows total losses with a hidden standard and Celestial breakdown', () => {
    const summary: WarpBannerSummary = {
      bannerType: 'collaboration_character',
      totalPulls: 450,
      currentFourStarPity: 0,
      currentFiveStarPity: 0,
      fourStarCount: 0,
      fiveStarCount: 9,
      fourStarPityTotal: 0,
      fiveStarPityTotal: 423,
      rateUpWins: 5,
      rateUpLosses: 4,
      rateUpStandardLosses: 2,
      rateUpCelestialLosses: 2,
      nextFiveStarGuaranteed: false,
      lastFiveStarName: 'Saber',
    }

    const html = renderToStaticMarkup(
      <BannerStatsPanel
        bannerType="collaboration_character"
        summary={summary}
      />,
    )

    expect(html).toContain('56%')
    expect(html).toContain('5 Wins')
    expect(html).toContain('4 Losses')
    expect(html).toContain('4 losses. Show loss breakdown')
    expect(html).toContain('rate-up-standard-losses')
    expect(html).toContain('rate-up-celestial-losses')
    expect(html).toContain('<b>2</b> Standard characters')
    expect(html).toContain('<b>2</b> Celestial Invitation characters')
    expect(html).not.toContain('rate-up-uncertain')
  })

  it('keeps Light Cone losses as plain text without a character breakdown', () => {
    const summary: WarpBannerSummary = {
      bannerType: 'light_cone_event',
      totalPulls: 120,
      currentFourStarPity: 0,
      currentFiveStarPity: 0,
      fourStarCount: 0,
      fiveStarCount: 2,
      fourStarPityTotal: 0,
      fiveStarPityTotal: 98,
      rateUpWins: 1,
      rateUpLosses: 1,
      rateUpStandardLosses: 1,
      rateUpCelestialLosses: 0,
      nextFiveStarGuaranteed: true,
      lastFiveStarName: 'Night on the Milky Way',
    }

    const html = renderToStaticMarkup(
      <BannerStatsPanel bannerType="light_cone_event" summary={summary} />,
    )

    expect(html).toContain('1 Win')
    expect(html).toContain('1 Loss')
    expect(html).toContain('rate-up-losses')
    expect(html).not.toContain('Show loss breakdown')
    expect(html).not.toContain('Celestial Invitation')
  })
})
