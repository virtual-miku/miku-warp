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

export function scanGameHistorySource() {
  return invokeTauri<GameHistorySourceScanResult>('scan_game_history_source')
}
