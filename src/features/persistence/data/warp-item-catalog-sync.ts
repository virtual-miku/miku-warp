import { invoke } from '@tauri-apps/api/core'
import type { WarpItem } from '../../warp-history/domain/warp-item'

export type SyncWarpItemCatalogResult = {
  received: number
  inserted: number
  updated: number
  unchanged: number
  totalInDatabase: number
}

export function syncWarpItemCatalog(items: WarpItem[]) {
  return invoke<SyncWarpItemCatalogResult>('sync_warp_item_catalog', {
    items,
  })
}
