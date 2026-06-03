import type { BannerType } from '../../warp-history/domain/banner'
import type { WarpPull } from '../../warp-history/domain/warp-pull'
import { invokeTauri } from './tauri-invoke'

export type ListWarpPullsInput = {
  accountId: string
  bannerType?: BannerType
  limit?: number
}

export type PersistedWarpPull = WarpPull

export function listWarpPulls(query: ListWarpPullsInput) {
  return invokeTauri<PersistedWarpPull[]>('list_warp_pulls', { query })
}
