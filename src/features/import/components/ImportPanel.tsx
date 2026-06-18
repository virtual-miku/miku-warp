import { FileInput, History, RotateCcw } from 'lucide-react'
import { AppButton } from '../../../shared/ui/AppButton'
import type {
  GameHistorySourceScanResult,
  ImportGameHistoryResult,
} from '../../persistence/data/game-history-source'
import type { ManualImportPreview } from '../domain/manual-note-parser'
import {
  getManualImportStatus,
  getManualImportStatusLabel,
} from '../domain/manual-import-preview'

type ImportPanelProps = {
  gameHistoryImportError?: string
  gameHistoryImportResult?: ImportGameHistoryResult
  gameHistoryScan?: GameHistorySourceScanResult
  isGameHistoryImporting: boolean
  isGameHistoryScanning: boolean
  manualImportPreview: ManualImportPreview
  onImportGameHistory: () => void
  onScanGameHistory: () => void
  onOpenManualImport: () => void
}

export function ImportPanel({
  gameHistoryImportError,
  gameHistoryImportResult,
  gameHistoryScan,
  isGameHistoryImporting,
  isGameHistoryScanning,
  manualImportPreview,
  onImportGameHistory,
  onScanGameHistory,
  onOpenManualImport,
}: ImportPanelProps) {
  const status = getManualImportStatus(manualImportPreview)
  const gameHistoryTitle =
    gameHistoryScan?.matchedCachePath ?? gameHistoryScan?.urlPreview

  return (
    <section className="tool-panel" id="import" aria-label="Import sources">
      <header className="panel-header">
        <h2>Import</h2>
        <span className="status-pill">{manualImportPreview.totalPulls} detected</span>
      </header>
      <div className="tool-panel-body">
        <div className="tool-row">
          <div>
            <strong>Manual note</strong>
            <span>{manualImportPreview.groups.length} sessions parsed</span>
          </div>
          <AppButton icon={FileInput} onClick={onOpenManualImport}>
            Open
          </AppButton>
        </div>
        <div className="tool-row">
          <div>
            <strong>Catalog match</strong>
            <span>{manualImportPreview.recognizedPulls} items recognized</span>
          </div>
          <span className="status-pill">{getManualImportStatusLabel(status)}</span>
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
        {gameHistoryImportError || gameHistoryImportResult ? (
          <div
            className={[
              'backup-message',
              gameHistoryImportError ? 'backup-message-error' : undefined,
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <strong>
              {gameHistoryImportError ? 'Game import failed' : 'Game import saved'}
            </strong>
            <p>
              {gameHistoryImportError ??
                formatGameHistoryImportDetail(gameHistoryImportResult)}
            </p>
          </div>
        ) : null}
        <div className="tool-row">
          <div>
            <strong>Restore</strong>
            <span>Backup file</span>
          </div>
          <AppButton icon={RotateCcw} variant="ghost">
            Load
          </AppButton>
        </div>
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
    `${result.pagesFetched} pages fetched for UID ${result.uid}.`,
    result.endpointHost ? `Endpoint: ${result.endpointHost}` : undefined,
  ]
    .filter(Boolean)
    .join('\n')
}
