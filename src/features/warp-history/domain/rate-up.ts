import type { BannerType } from './banner'

export type NextRateUpChance = {
  chance?: number
  detail: string
  itemName?: string
}

export function getNextRateUpChance(
  bannerType: BannerType,
  lastFiveStarName?: string,
  nextFiveStarGuaranteed = false,
): NextRateUpChance {
  const baseChance = getBaseRateUpChance(bannerType)

  if (baseChance === undefined) {
    return { detail: '' }
  }

  if (nextFiveStarGuaranteed) {
    return {
      chance: 100,
      detail: lastFiveStarName ? 'Guaranteed after' : 'Guaranteed after an off-rate 5★',
      itemName: lastFiveStarName,
    }
  }

  return {
    chance: baseChance,
    detail: lastFiveStarName
      ? 'Base chance after'
      : 'Base chance before the first recorded 5★',
    itemName: lastFiveStarName,
  }
}

function getBaseRateUpChance(bannerType: BannerType) {
  if (
    bannerType === 'character_event' ||
    bannerType === 'collaboration_character'
  ) {
    return 50
  }

  if (
    bannerType === 'light_cone_event' ||
    bannerType === 'collaboration_light_cone'
  ) {
    return 75
  }

  return undefined
}
