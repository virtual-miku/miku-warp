import type { BannerType } from './banner'

const standardCharacterNames = new Set([
  'Bailu',
  'Bronya',
  'Clara',
  'Gepard',
  'Himeko',
  'Welt',
  'Yanqing',
])

const standardLightConeNames = new Set([
  "But the Battle Isn't Over",
  'In the Name of the World',
  'Moment of Victory',
  'Night on the Milky Way',
  'Sleep Like the Dead',
  'Something Irreplaceable',
  'Time Waits for No One',
])

export type NextRateUpChance = {
  chance?: number
  detail: string
}

export function getNextRateUpChance(
  bannerType: BannerType,
  lastFiveStarName?: string,
): NextRateUpChance {
  const baseChance = getBaseRateUpChance(bannerType)

  if (baseChance === undefined) {
    return { detail: 'This banner has no featured rate-up.' }
  }

  if (lastFiveStarName && isKnownOffRateItem(bannerType, lastFiveStarName)) {
    return {
      chance: 100,
      detail: `Guaranteed after ${lastFiveStarName}`,
    }
  }

  return {
    chance: baseChance,
    detail: lastFiveStarName
      ? `Base chance after ${lastFiveStarName}`
      : 'Base chance before the first recorded 5★',
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

function isKnownOffRateItem(bannerType: BannerType, itemName: string) {
  if (
    bannerType === 'character_event' ||
    bannerType === 'collaboration_character'
  ) {
    return standardCharacterNames.has(itemName)
  }

  return standardLightConeNames.has(itemName)
}
