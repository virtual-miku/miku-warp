import type { BannerType } from '../../warp-history/domain/banner'
import type { WarpPullSource } from '../../warp-history/domain/warp-pull'
import type { ManualImportPreview } from './manual-note-parser'

export type ManualImportDraftStatus = 'ready' | 'needs_review'

export type ManualImportDraftIssueCode =
  | 'parse_issue'
  | 'missing_banner_type'

export type ManualImportDraftIssue = {
  code: ManualImportDraftIssueCode
  lineNumber: number
  value: string
  message: string
}

export type ManualImportDraftOptions = {
  accountId: string
  fallbackBannerType?: BannerType
  timezone?: string
}

export type ManualImportDraftPull = {
  accountId: string
  bannerType: BannerType
  warpItemId: string
  pulledAt: string
  pulledAtTimezone?: string
  source: Extract<WarpPullSource, 'manual'>
  sourceLineNumber: number
  sequenceInTimestampGroup: number
  rawItemName: string
  itemName: string
  manualIdentityKey: string
}

export type ManualImportDraft = {
  accountId: string
  source: Extract<WarpPullSource, 'manual'>
  timezone?: string
  status: ManualImportDraftStatus
  recordsFound: number
  recordsReady: number
  recordsSkipped: number
  bannerTypes: BannerType[]
  pulls: ManualImportDraftPull[]
  issues: ManualImportDraftIssue[]
}

export function buildManualImportDraft(
  preview: ManualImportPreview,
  options: ManualImportDraftOptions,
): ManualImportDraft {
  const issues = preview.issues.map<ManualImportDraftIssue>((issue) => ({
    code: 'parse_issue',
    lineNumber: issue.lineNumber,
    value: issue.value,
    message: issue.message,
  }))
  const pulls: ManualImportDraftPull[] = []

  preview.groups.forEach((group) => {
    const bannerType = group.bannerType ?? options.fallbackBannerType

    if (!bannerType && group.pulls.some((pull) => pull.item)) {
      issues.push({
        code: 'missing_banner_type',
        lineNumber: group.lineNumber,
        value: group.rawTimestamp,
        message: 'Manual import group does not have a banner type.',
      })
      return
    }

    group.pulls.forEach((pull) => {
      if (!pull.item || !bannerType) {
        return
      }

      pulls.push({
        accountId: options.accountId,
        bannerType,
        warpItemId: pull.item.id,
        pulledAt: pull.pulledAt,
        pulledAtTimezone: options.timezone,
        source: 'manual',
        sourceLineNumber: pull.lineNumber,
        sequenceInTimestampGroup: pull.sequenceInGroup,
        rawItemName: pull.rawName,
        itemName: pull.item.name,
        manualIdentityKey: createManualPullIdentityKey({
          accountId: options.accountId,
          bannerType,
          pulledAt: pull.pulledAt,
          warpItemId: pull.item.id,
          sequenceInTimestampGroup: pull.sequenceInGroup,
        }),
      })
    })
  })

  const bannerTypes = Array.from(new Set(pulls.map((pull) => pull.bannerType)))

  return {
    accountId: options.accountId,
    source: 'manual',
    timezone: options.timezone,
    status: issues.length > 0 ? 'needs_review' : 'ready',
    recordsFound: preview.totalPulls,
    recordsReady: pulls.length,
    recordsSkipped: preview.totalPulls - pulls.length,
    bannerTypes,
    pulls,
    issues,
  }
}

export function createManualPullIdentityKey(input: {
  accountId: string
  bannerType: BannerType
  pulledAt: string
  warpItemId: string
  sequenceInTimestampGroup: number
}) {
  return JSON.stringify([
    input.accountId,
    input.bannerType,
    input.pulledAt,
    input.warpItemId,
    input.sequenceInTimestampGroup,
  ])
}
