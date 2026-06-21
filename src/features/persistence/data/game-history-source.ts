import { invokeTauri } from './tauri-invoke'

export type GameHistorySourceScanStatus =
  | 'found'
  | 'needs_history_opened'
  | 'not_found'

export type GameHistorySourceScanResult = {
  status: GameHistorySourceScanStatus
  cacheFilesChecked: number
  candidateRoots: string[]
  matchedCachePath?: string
  urlPreview?: string
  endpointHost?: string
  detail: string
}

export type GameHistoryImportAccountInput = {
  id: string
  uid: string
  region?: string
  nickname?: string
}

export type ImportGameHistoryPayload = {
  account: GameHistoryImportAccountInput
  gamePath?: string
  maxPagesPerBanner?: number
}

export type ScanGameHistorySourcePayload = {
  gamePath?: string
}

export type ImportGameHistoryResult = {
  accountId: string
  uid: string
  importBatchId: string
  recordsFound: number
  recordsInserted: number
  recordsRestored: number
  recordsSkipped: number
  duplicateRecords: number
  bannerCount: number
  manualRecordsMerged: number
  manualRecordsMatched: number
  pagesFetched: number
  sourceCachePath: string
  endpointHost?: string
  detectedUid?: string
}

export function scanGameHistorySource(payload: ScanGameHistorySourcePayload) {
  return invokeTauri<GameHistorySourceScanResult>('scan_game_history_source', {
    input: payload,
  })
}

export function importGameHistory(payload: ImportGameHistoryPayload) {
  return invokeTauri<ImportGameHistoryResult>('import_game_history', {
    input: payload,
  })
}
