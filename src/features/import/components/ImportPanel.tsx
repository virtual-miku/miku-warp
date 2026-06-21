import { useEffect, useRef, type ReactNode } from 'react'
import { FileInput, FolderSearch, History, Search, X } from 'lucide-react'
import { AppButton } from '../../../shared/ui/AppButton'
import type {
  GameHistorySourceScanResult,
  ImportGameHistoryResult,
} from '../../persistence/data/game-history-source'
import type { GameInstallPathCandidate } from '../../persistence/data/game-install-path'
import { useLocalization } from '../../settings/components/localization-context'
import type { Translator } from '../../settings/domain/localization'

export type ImportPanelProps = {
  gameHistoryImportError?: string
  gameHistoryImportResult?: ImportGameHistoryResult
  gameHistoryPathError?: string
  gameHistoryScan?: GameHistorySourceScanResult
  gameInstallPath: string
  gameInstallPathReady: boolean
  gamePathCandidates: GameInstallPathCandidate[]
  isGameHistoryImporting: boolean
  isGamePathScanning: boolean
  isGamePathSelecting: boolean
  isGameHistoryScanning: boolean
  onFindGamePath: () => void
  onImportGameHistory: () => void
  onSelectGamePath: () => void
  onScanGameHistory: () => void
  onUseGamePathCandidate: (candidate: GameInstallPathCandidate) => void
  onOpenManualImport: () => void
}

type ImportDialogProps = ImportPanelProps & {
  isOpen: boolean
  onClose: () => void
}

export function ImportPanel(props: ImportPanelProps) {
  const { t } = useLocalization()
  return (
    <section className="tool-panel" id="import" aria-label={t('import.sourcesAria')}>
      <ImportControls {...props} />
    </section>
  )
}

export function ImportDialog({
  isOpen,
  onClose,
  ...importProps
}: ImportDialogProps) {
  const { t } = useLocalization()
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!isOpen) {
      return undefined
    }

    closeButtonRef.current?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) {
    return null
  }

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose()
        }
      }}
    >
      <section
        aria-labelledby="import-dialog-title"
        aria-modal="true"
        className="modal-panel import-dialog"
        role="dialog"
      >
        <header className="modal-header">
          <div>
            <span className="eyebrow">{t('import.records')}</span>
            <h2 id="import-dialog-title">{t('common.import')}</h2>
          </div>
          <button
            aria-label={t('import.close')}
            className="icon-button"
            onClick={onClose}
            ref={closeButtonRef}
            type="button"
          >
            <X aria-hidden="true" size={18} />
          </button>
        </header>
        <div className="import-dialog-content">
          <ImportControls {...importProps} />
        </div>
      </section>
    </div>
  )
}

function ImportControls({
  gameHistoryImportError,
  gameHistoryImportResult,
  gameHistoryPathError,
  gameHistoryScan,
  gameInstallPath,
  gameInstallPathReady,
  gamePathCandidates,
  isGameHistoryImporting,
  isGamePathScanning,
  isGamePathSelecting,
  isGameHistoryScanning,
  onFindGamePath,
  onImportGameHistory,
  onSelectGamePath,
  onScanGameHistory,
  onUseGamePathCandidate,
  onOpenManualImport,
}: ImportPanelProps) {
  const { t } = useLocalization()
  const gameHistoryTitle =
    gameHistoryScan?.matchedCachePath ?? gameHistoryScan?.urlPreview
  const gameHistorySourceFound = gameHistoryScan?.status === 'found'
  const hasGameImportMessage = Boolean(
    gameHistoryImportError || gameHistoryImportResult,
  )

  return (
    <div className="tool-panel-body">
      <div className="game-path-field">
          <div className="game-path-heading">
            <strong>{t('import.gameFolder')}</strong>
            <div className="game-path-actions">
              <AppButton
                disabled={
                  isGamePathScanning ||
                  isGamePathSelecting ||
                  isGameHistoryScanning ||
                  isGameHistoryImporting
                }
                icon={Search}
                className={
                  !gameInstallPathReady
                    ? 'app-button-flow-next'
                    : undefined
                }
                onClick={onFindGamePath}
                variant="ghost"
              >
                {isGamePathScanning ? t('import.scanning') : t('import.scan')}
              </AppButton>
              <AppButton
                disabled={
                  isGamePathSelecting ||
                  isGamePathScanning ||
                  isGameHistoryScanning ||
                  isGameHistoryImporting
                }
                icon={FolderSearch}
                onClick={onSelectGamePath}
                variant="ghost"
              >
                {isGamePathSelecting ? t('import.opening') : t('import.browse')}
              </AppButton>
            </div>
          </div>
          <span className="game-path-value" title={gameInstallPath}>
            {gameInstallPath}
          </span>
          {!gameInstallPathReady ? (
            <small>{t('import.folderHint')}</small>
          ) : null}
          {gamePathCandidates.length > 1 ? (
            <div
              className="game-path-candidate-list"
              aria-label={t('import.detectedFolders')}
            >
              {gamePathCandidates.map((candidate) => (
                <button
                  className="game-path-candidate"
                  key={candidate.path}
                  onClick={() => onUseGamePathCandidate(candidate)}
                  type="button"
                >
                  <strong>{candidate.path}</strong>
                  <span>{candidate.source}</span>
                </button>
              ))}
            </div>
          ) : null}
          {gameHistoryPathError ? (
            <div className="backup-message backup-message-error">
              <strong>{t('import.folderFailed')}</strong>
              <p>{gameHistoryPathError}</p>
            </div>
          ) : null}
        </div>
        {gameInstallPathReady ? (
          <div className="tool-row">
            <div>
              <strong>{t('import.scanRecords')}</strong>
              <span title={gameHistoryTitle}>
                {formatGameHistoryScanDetail(
                  gameHistoryScan,
                  isGameHistoryScanning,
                  t,
                )}
              </span>
            </div>
            <AppButton
              className={
                !gameHistorySourceFound
                  ? 'app-button-flow-next'
                  : undefined
              }
              disabled={isGameHistoryScanning}
              icon={History}
              onClick={onScanGameHistory}
              variant="ghost"
            >
              {isGameHistoryScanning ? t('import.scanning') : t('import.scan')}
            </AppButton>
          </div>
        ) : null}
        {gameHistorySourceFound ? (
          <>
            <div className="tool-row">
              <div>
                <strong>{t('import.gameSource')}</strong>
                <span>{formatGameHistorySourceMeta(gameHistoryScan, t)}</span>
              </div>
              <span
                className={getGameHistoryScanStatusClass(gameHistoryScan)}
              >
                {getGameHistoryScanStatusLabel(gameHistoryScan, t)}
              </span>
            </div>
            <div className="tool-row">
              <div>
                <strong>{t('import.gameImport')}</strong>
                <span>
                  {formatGameHistoryImportMeta(
                    gameHistoryImportResult,
                    isGameHistoryImporting,
                    t,
                  )}
                </span>
              </div>
              <AppButton
                className="app-button-flow-next"
                disabled={isGameHistoryImporting || isGameHistoryScanning}
                icon={History}
                onClick={onImportGameHistory}
              >
                {isGameHistoryImporting ? t('common.importing') : t('common.import')}
              </AppButton>
            </div>
          </>
        ) : null}
        {hasGameImportMessage ? (
          <div
            className={[
              'backup-message',
              gameHistoryImportError ? 'backup-message-error' : undefined,
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <strong>
              {gameHistoryImportError
                ? t('import.gameImportFailed')
                : t('import.gameImportSaved')}
            </strong>
            <p>
              {gameHistoryImportError ??
                formatGameHistoryImportDetail(gameHistoryImportResult, t)}
            </p>
          </div>
        ) : null}
        <div className="tool-row manual-import-row">
          <span className="manual-import-divider-label">{t('import.or')}</span>
          <div>
            <strong>{t('import.manual')}</strong>
          </div>
          <AppButton icon={FileInput} onClick={onOpenManualImport}>
            {t('common.open')}
          </AppButton>
        </div>
    </div>
  )
}

function formatGameHistoryScanDetail(
  scan: GameHistorySourceScanResult | undefined,
  isScanning: boolean,
  t: Translator,
): ReactNode {
  if (isScanning) {
    return t('import.scanningCache')
  }

  if (!scan) {
    return (
      <>
        {t('import.scanInstructionBefore')}{' '}
        <strong className="game-history-scan">
          {t('import.gameMenuPath')}
        </strong>{' '}
        {t('import.scanInstructionMiddle')}{' '}
        <strong className="game-history-scan">
          {t('import.scanInstructionButton')}
        </strong>{' '}
        {t('import.scanInstructionEnd')}
      </>
    )
  }

  if (scan.status === 'found') {
    return t('import.scanFound')
  }

  return scan.status === 'needs_history_opened'
    ? t('import.scanNeedsHistory')
    : t('import.scanNotFound')
}

function formatGameHistorySourceMeta(
  scan: GameHistorySourceScanResult | undefined,
  t: Translator,
) {
  if (!scan) {
    return t('import.notScanned')
  }

  if (scan.endpointHost) {
    return scan.endpointHost
  }

  if (scan.cacheFilesChecked > 0) {
    return t('import.cacheFilesChecked', { count: scan.cacheFilesChecked })
  }

  return t('import.candidateRoots', { count: scan.candidateRoots.length })
}

function getGameHistoryScanStatusLabel(
  scan: GameHistorySourceScanResult | undefined,
  t: Translator,
) {
  if (!scan) {
    return t('import.notScanned')
  }

  if (scan.status === 'found') {
    return t('import.found')
  }

  if (scan.status === 'needs_history_opened') {
    return t('import.openHistory')
  }

  return t('import.notFound')
}

function getGameHistoryScanStatusClass(
  scan: GameHistorySourceScanResult | undefined,
) {
  return scan?.status === 'found'
    ? 'status-pill status-pill-success'
    : 'status-pill'
}

function formatGameHistoryImportMeta(
  result: ImportGameHistoryResult | undefined,
  isImporting: boolean,
  t: Translator,
) {
  if (isImporting) {
    return t('import.fetching')
  }

  if (!result) {
    return t('import.notImported')
  }

  return t('import.meta', {
    inserted: result.recordsInserted,
    restored: result.recordsRestored,
    duplicates: result.duplicateRecords,
  })
}

function formatGameHistoryImportDetail(
  result: ImportGameHistoryResult | undefined,
  t: Translator,
) {
  if (!result) {
    return ''
  }

  return [
    t('import.detail', {
      inserted: result.recordsInserted,
      restored: result.recordsRestored,
      skipped: result.recordsSkipped,
      duplicates: result.duplicateRecords,
    }),
    result.manualRecordsMerged > 0
      ? t('import.manualMoved', { count: result.manualRecordsMerged, uid: result.uid })
      : undefined,
    result.manualRecordsMatched > 0
      ? t('import.manualMatched', { count: result.manualRecordsMatched })
      : undefined,
    t('import.pagesFetched', { count: result.pagesFetched, uid: result.uid }),
    result.endpointHost ? t('import.endpoint', { host: result.endpointHost }) : undefined,
  ]
    .filter(Boolean)
    .join('\n')
}
