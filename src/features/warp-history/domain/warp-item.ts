import type { Rarity, WarpItemType } from './warp-pull'

export type WarpItem = {
  id: string
  name: string
  itemType: WarpItemType
  rarity: Rarity
}

