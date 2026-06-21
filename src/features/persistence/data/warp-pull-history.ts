import type { BannerType } from '../../warp-history/domain/banner'
import type { WarpPull } from '../../warp-history/domain/warp-pull'
import { invokeTauri } from './tauri-invoke'

export type ListWarpPullsInput = {
  accountId: string
  bannerType?: BannerType
  limit?: number
  offset?: number
  search?: string
  rarity?: 3 | 4 | 5
}

export type ListWarpBannerSummariesInput = {
  accountId: string
}

export type PersistedWarpPull = WarpPull

export type ListWarpPullsResult = {
  pulls: PersistedWarpPull[]
  total: number
}

export type WarpAccount = {
  id: string
  uid: string
  region?: string
  nickname?: string
  avatarPath?: string
  totalPulls: number
  lastPullAt?: string
}

export type DeleteWarpPullResult = {
  accountId: string
  pullId: string
  deletedPulls: number
  recomputedBanner: boolean
}

export type DeleteWarpPullsResult = {
  accountId: string
  requestedPulls: number
  deletedPulls: number
  recomputedBanners: number
}

export type DeleteAccountWarpHistoryResult = {
  accountId: string
  deletedPulls: number
  deletedImportBatches: number
}

export type UpdateAccountAvatarResult = {
  accountId: string
  avatarPath?: string
}

export type WarpBannerSummary = {
  bannerType: BannerType
  totalPulls: number
  currentFourStarPity: number
  currentFiveStarPity: number
  fourStarCount: number
  fiveStarCount: number
  fourStarPityTotal: number
  fiveStarPityTotal: number
  rateUpWins: number
  rateUpLosses: number
  rateUpStandardLosses: number
  rateUpCelestialLosses: number
  nextFiveStarGuaranteed: boolean | null
  lastFourStarPity?: number
  lastFiveStarPity?: number
  lastFourStarName?: string
  lastFiveStarName?: string
  lastPullAt?: string
  lastItemName?: string
  lastItemRarity?: number
}

export function listWarpPulls(query: ListWarpPullsInput) {
  return invokeTauri<ListWarpPullsResult>('list_warp_pulls', { query })
}

export function listAccounts() {
  return invokeTauri<WarpAccount[]>('list_accounts')
}

export function deleteWarpPull(accountId: string, pullId: string) {
  return invokeTauri<DeleteWarpPullResult>('delete_warp_pull', {
    input: { accountId, pullId },
  })
}

export function deleteWarpPulls(accountId: string, pullIds: string[]) {
  return invokeTauri<DeleteWarpPullsResult>('delete_warp_pulls', {
    input: { accountId, pullIds },
  })
}

export function deleteAccountWarpHistory(accountId: string) {
  return invokeTauri<DeleteAccountWarpHistoryResult>(
    'delete_account_warp_history',
    { input: { accountId } },
  )
}

export function listWarpBannerSummaries(
  query: ListWarpBannerSummariesInput,
) {
  return invokeTauri<WarpBannerSummary[]>('list_warp_banner_summaries', {
    query,
  })
}

export function updateAccountAvatar(
  accountId: string,
  avatarPath: string | undefined,
) {
  return invokeTauri<UpdateAccountAvatarResult>('update_account_avatar', {
    input: { accountId, avatarPath: avatarPath ?? null },
  })
}
