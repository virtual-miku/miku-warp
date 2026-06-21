import type { BannerFilterType, BannerType } from '../../warp-history/domain/banner'
import type { WarpPull } from '../../warp-history/domain/warp-pull'
import type { Translator } from './localization'

const bannerMessageKeys = {
  departure: 'banner.departure',
  standard: 'banner.standard',
  character_event: 'banner.characterEvent',
  light_cone_event: 'banner.lightConeEvent',
  collaboration_character: 'banner.collabCharacter',
  collaboration_light_cone: 'banner.collabLightCone',
} as const

export function getLocalizedBannerLabel(t: Translator, type: BannerType) {
  return t(bannerMessageKeys[type])
}

export function getLocalizedBannerFilterLabel(
  t: Translator,
  type: BannerFilterType,
) {
  return type === 'all' ? t('common.all') : getLocalizedBannerLabel(t, type)
}

export function getLocalizedItemType(
  t: Translator,
  type: WarpPull['itemType'],
) {
  return type === 'light_cone'
    ? t('history.itemType.lightCone')
    : t('history.itemType.character')
}

export function formatLocalizedPullCount(t: Translator, count: number) {
  return t(count === 1 ? 'accounts.pull' : 'accounts.pulls', { count })
}
