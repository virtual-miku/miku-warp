import type { WarpItem } from '../../warp-history/domain/warp-item'
import { invokeTauri } from './tauri-invoke'

export type SyncWarpItemCatalogResult = {
  received: number
  inserted: number
  updated: number
  unchanged: number
  totalInDatabase: number
}

export function syncWarpItemCatalog(items: WarpItem[]) {
  return invokeTauri<SyncWarpItemCatalogResult>('sync_warp_item_catalog', {
    items,
  })
}
