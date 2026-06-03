import type { Rarity, WarpItemType } from './warp-pull'

export type WarpItem = {
  id: string
  sourceId?: string
  name: string
  itemType: WarpItemType
  rarity: Rarity
  iconPath?: string
  previewPath?: string
  portraitPath?: string
}
