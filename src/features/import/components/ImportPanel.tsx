import { FileInput, FolderSearch, History } from 'lucide-react'
import { AppButton } from '../../../shared/ui/AppButton'
import type {
  GameHistorySourceScanResult,
  ImportGameHistoryResult,
} from '../../persistence/data/game-history-source'
import type { ManualImportPreview } from '../domain/manual-note-parser'

type ImportPanelProps = {
  gameHistoryImportError?: string
  gameHistoryImportResult?: ImportGameHistoryResult
  gameHistoryPathError?: string
  gameHistoryScan?: GameHistorySourceScanResult
  gameInstallPath: string
  isGameHistoryImporting: boolean
  isGamePathSelecting: boolean
  isGameHistoryScanning: boolean
  manualImportPreview: ManualImportPreview
  onImportGameHistory: () => void
  onSelectGamePath: () => void
  onScanGameHistory: () => void
  onOpenManualImport: () => void
}

export function ImportPanel({
  gameHistoryImportError,
  gameHistoryImportResult,
  gameHistoryPathError,
  gameHistoryScan,
  gameInstallPath,
  isGameHistoryImporting,
  isGamePathSelecting,
  isGameHistoryScanning,
  manualImportPreview,
  onImportGameHistory,
  onSelectGamePath,
  onScanGameHistory,
  onOpenManualImport,
}: ImportPanelProps) {
  const gameHistoryTitle =
    gameHistoryScan?.matchedCachePath ?? gameHistoryScan?.urlPreview
  const hasGameHistoryMessage = Boolean(
    gameHistoryPathError || gameHistoryImportError || gameHistoryImportResult,
  )

  return (
    <section className="tool-panel" id="import" aria-label="Import sources">
      <header className="panel-header">
        <h2>Import</h2>
      </header>
      <div className="tool-panel-body">
        <div className="game-path-field">
          <div className="game-path-heading">
            <strong>Game folder</strong>
            <AppButton
              disabled={
                isGamePathSelecting ||
                isGameHistoryScanning ||
                isGameHistoryImporting
              }
              icon={FolderSearch}
              onClick={onSelectGamePath}
              variant="ghost"
            >
              {isGamePathSelecting ? 'Opening' : 'Browse'}
            </AppButton>
          </div>
          <span className="game-path-value" title={gameInstallPath}>
            {gameInstallPath}
          </span>
          <small>Choose the folder containing StarRail_Data.</small>
        </div>
        <div className="tool-row">
          <div>
            <strong>Game history</strong>
            <span title={gameHistoryTitle}>
              {formatGameHistoryScanDetail(
                gameHistoryScan,
                isGameHistoryScanning,
              )}
            </span>
          </div>
          <AppButton
            disabled={isGameHistoryScanning}
            icon={History}
            onClick={onScanGameHistory}
            variant="ghost"
          >
            {isGameHistoryScanning ? 'Scanning' : 'Scan'}
          </AppButton>
        </div>
        <div className="tool-row">
          <div>
            <strong>Game source</strong>
            <span>{formatGameHistorySourceMeta(gameHistoryScan)}</span>
          </div>
          <span className="status-pill">
            {getGameHistoryScanStatusLabel(gameHistoryScan)}
          </span>
        </div>
        <div className="tool-row">
          <div>
            <strong>Game import</strong>
            <span>
              {formatGameHistoryImportMeta(
                gameHistoryImportResult,
                isGameHistoryImporting,
              )}
            </span>
          </div>
          <AppButton
            disabled={isGameHistoryImporting || isGameHistoryScanning}
            icon={History}
            onClick={onImportGameHistory}
          >
            {isGameHistoryImporting ? 'Importing' : 'Import'}
          </AppButton>
        </div>
        <div className="tool-row manual-import-row">
          <div>
            <strong>Manual import from text</strong>
            <span>{manualImportPreview.totalPulls} detected</span>
          </div>
          <AppButton icon={FileInput} onClick={onOpenManualImport}>
            Open
          </AppButton>
        </div>
        {hasGameHistoryMessage ? (
          <div
            className={[
              'backup-message',
              gameHistoryPathError || gameHistoryImportError
                ? 'backup-message-error'
                : undefined,
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <strong>
              {gameHistoryPathError
                ? 'Folder selection failed'
                : gameHistoryImportError
                  ? 'Game import failed'
                  : 'Game import saved'}
            </strong>
            <p>
              {gameHistoryPathError ??
                gameHistoryImportError ??
                formatGameHistoryImportDetail(gameHistoryImportResult)}
            </p>
          </div>
        ) : null}
      </div>
    </section>
  )
}

function formatGameHistoryScanDetail(
  scan: GameHistorySourceScanResult | undefined,
  isScanning: boolean,
) {
  if (isScanning) {
    return 'Scanning local cache'
  }

  if (!scan) {
    return 'Local cache'
  }

  return scan.detail
}

function formatGameHistorySourceMeta(
  scan: GameHistorySourceScanResult | undefined,
) {
  if (!scan) {
    return 'Not scanned'
  }

  if (scan.endpointHost) {
    return scan.endpointHost
  }

  if (scan.cacheFilesChecked > 0) {
    return `${scan.cacheFilesChecked} cache files checked`
  }

  return `${scan.candidateRoots.length} candidate roots`
}

function getGameHistoryScanStatusLabel(
  scan: GameHistorySourceScanResult | undefined,
) {
  if (!scan) {
    return 'Not scanned'
  }

  if (scan.status === 'found') {
    return 'Found'
  }

  if (scan.status === 'needs_history_opened') {
    return 'Open history'
  }

  return 'Not found'
}

function formatGameHistoryImportMeta(
  result: ImportGameHistoryResult | undefined,
  isImporting: boolean,
) {
  if (isImporting) {
    return 'Fetching game history'
  }

  if (!result) {
    return 'Not imported'
  }

  return `${result.recordsInserted} new, ${result.duplicateRecords} duplicates`
}

function formatGameHistoryImportDetail(
  result: ImportGameHistoryResult | undefined,
) {
  if (!result) {
    return ''
  }

  return [
    `${result.recordsInserted} inserted, ${result.recordsSkipped} skipped, ${result.duplicateRecords} duplicates.`,
    result.manualRecordsMerged > 0
      ? `${result.manualRecordsMerged} manual records moved to UID ${result.uid}.`
      : undefined,
    result.manualRecordsMatched > 0
      ? `${result.manualRecordsMatched} manual records matched with game history.`
      : undefined,
    `${result.pagesFetched} pages fetched for UID ${result.uid}.`,
    result.endpointHost ? `Endpoint: ${result.endpointHost}` : undefined,
  ]
    .filter(Boolean)
    .join('\n')
}
