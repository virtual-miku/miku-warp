import type { BannerType } from './banner'

export type Rarity = 3 | 4 | 5

export type WarpItemType = 'character' | 'light_cone'

export type WarpPullSource = 'manual' | 'game_history' | 'backup_restore'

export type WarpPull = {
  id: string
  bannerType: BannerType
  itemName: string
  itemType: WarpItemType
  rarity: Rarity
  iconPath?: string
  pulledAt: string
  source: WarpPullSource
  pityFourAtPull?: number
  pityFiveAtPull?: number
}
