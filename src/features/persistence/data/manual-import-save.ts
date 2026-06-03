import { invoke } from '@tauri-apps/api/core'
import type {
  ManualImportDraft,
  ManualImportDraftPull,
} from '../../import/domain/manual-import-draft'

export type ManualImportAccountInput = {
  id: string
  uid: string
  region?: string
  nickname?: string
}

export type SaveManualImportDraftPayload = {
  account: ManualImportAccountInput
  status: ManualImportDraft['status']
  recordsFound: number
  recordsReady: number
  recordsSkipped: number
  issuesCount: number
  pulls: SaveManualImportDraftPullPayload[]
}

export type SaveManualImportDraftPullPayload = Pick<
  ManualImportDraftPull,
  | 'bannerType'
  | 'warpItemId'
  | 'pulledAt'
  | 'pulledAtTimezone'
  | 'sourceLineNumber'
  | 'sequenceInTimestampGroup'
  | 'rawItemName'
>

export type SaveManualImportDraftResult = {
  importBatchId: string
  recordsFound: number
  recordsInserted: number
  recordsSkipped: number
  duplicateRecords: number
  bannerCount: number
}

export function toSaveManualImportDraftPayload(
  account: ManualImportAccountInput,
  draft: ManualImportDraft,
): SaveManualImportDraftPayload {
  return {
    account,
    status: draft.status,
    recordsFound: draft.recordsFound,
    recordsReady: draft.recordsReady,
    recordsSkipped: draft.recordsSkipped,
    issuesCount: draft.issues.length,
    pulls: draft.pulls.map(toSaveManualImportDraftPullPayload),
  }
}

export function saveManualImportDraft(payload: SaveManualImportDraftPayload) {
  return invoke<SaveManualImportDraftResult>('save_manual_import_draft', {
    draft: payload,
  })
}

function toSaveManualImportDraftPullPayload(
  pull: ManualImportDraftPull,
): SaveManualImportDraftPullPayload {
  return {
    bannerType: pull.bannerType,
    warpItemId: pull.warpItemId,
    pulledAt: pull.pulledAt,
    pulledAtTimezone: pull.pulledAtTimezone,
    sourceLineNumber: pull.sourceLineNumber,
    sequenceInTimestampGroup: pull.sequenceInTimestampGroup,
    rawItemName: pull.rawItemName,
  }
}
