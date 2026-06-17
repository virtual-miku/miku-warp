import type { BannerType } from '../../warp-history/domain/banner'
import type { WarpPull } from '../../warp-history/domain/warp-pull'
import { invokeTauri } from './tauri-invoke'

export type ListWarpPullsInput = {
  accountId: string
  bannerType?: BannerType
  limit?: number
}

export type ListWarpBannerSummariesInput = {
  accountId: string
}

export type PersistedWarpPull = WarpPull

export type WarpBannerSummary = {
  bannerType: BannerType
  totalPulls: number
  currentFourStarPity: number
  currentFiveStarPity: number
  fourStarCount: number
  fiveStarCount: number
  fourStarPityTotal: number
  fiveStarPityTotal: number
  lastFourStarPity?: number
  lastFiveStarPity?: number
  lastFourStarName?: string
  lastFiveStarName?: string
  lastPullAt?: string
  lastItemName?: string
  lastItemRarity?: number
}

export function listWarpPulls(query: ListWarpPullsInput) {
  return invokeTauri<PersistedWarpPull[]>('list_warp_pulls', { query })
}

export function listWarpBannerSummaries(
  query: ListWarpBannerSummariesInput,
) {
  return invokeTauri<WarpBannerSummary[]>('list_warp_banner_summaries', {
    query,
  })
}
