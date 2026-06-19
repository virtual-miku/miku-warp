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

export type ListTrashedWarpPullsResult = {
  pulls: TrashedWarpPull[]
  total: number
}

export type TrashWarpPullMutationResult = {
  accountId: string
  pullId: string
  affectedPulls: number
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
