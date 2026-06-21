import type { BannerType } from '../../warp-history/domain/banner'
import type {
  Rarity,
  WarpItemType,
  WarpPullSource,
} from '../../warp-history/domain/warp-pull'
import { invokeTauri } from '../../persistence/data/tauri-invoke'

export type TrashedWarpPull = {
  id: string
  bannerType: BannerType
  itemName: string
  itemType: WarpItemType
  rarity: Rarity
  iconPath?: string
  pulledAt: string
  source: WarpPullSource
  deletedAt: string
}

export type TrashedAccount = {
  id: string
  uid: string
  region?: string
  nickname?: string
  avatarPath?: string
  totalPulls: number
  lastPullAt?: string
  deletedAt: string
}

export type ListTrashedWarpPullsResult = {
  pulls: TrashedWarpPull[]
  total: number
}

export type TrashWarpPullMutationResult = {
  accountId: string
  pullId: string
  affectedPulls: number
}

export type TrashAccountMutationResult = {
  accountId: string
  affectedAccounts: number
}

export function listTrashedWarpPulls(
  accountId: string,
  limit: number,
  offset: number,
) {
  return invokeTauri<ListTrashedWarpPullsResult>('list_trashed_warp_pulls', {
    query: { accountId, limit, offset },
  })
}

export function restoreTrashedWarpPull(accountId: string, pullId: string) {
  return invokeTauri<TrashWarpPullMutationResult>('restore_trashed_warp_pull', {
    input: { accountId, pullId },
  })
}

export function permanentlyDeleteTrashedWarpPull(
  accountId: string,
  pullId: string,
) {
  return invokeTauri<TrashWarpPullMutationResult>(
    'permanently_delete_trashed_warp_pull',
    { input: { accountId, pullId } },
  )
}

export function listTrashedAccounts() {
  return invokeTauri<TrashedAccount[]>('list_trashed_accounts')
}

export function restoreTrashedAccount(accountId: string) {
  return invokeTauri<TrashAccountMutationResult>('restore_trashed_account', {
    input: { accountId },
  })
}

export function permanentlyDeleteTrashedAccount(accountId: string) {
  return invokeTauri<TrashAccountMutationResult>(
    'permanently_delete_trashed_account',
    { input: { accountId } },
  )
}
