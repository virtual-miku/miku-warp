import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import {
  createInitialGoogleDriveBackupPolicy,
  createInitialGoogleDriveBackupStatus,
} from '../domain/cloud-backup'
import { BackupPanel } from './BackupPanel'

describe('BackupPanel Google Drive setup', () => {
  it('shows OAuth credential fields before Google Drive is configured', () => {
    const html = renderBackupPanel()

    expect(html).toContain('Desktop Client ID')
    expect(html).toContain('Desktop Client Secret (optional)')
    expect(html).toContain('Save &amp; connect')
    expect(html).not.toContain('Auto backup')
  })

  it('replaces credential fields with backup controls after connection', () => {
    const html = renderBackupPanel({
      ...createInitialGoogleDriveBackupStatus(),
      connectionStatus: 'connected',
      oauthClientConfigured: true,
      canConnect: false,
      canDisconnect: true,
      canUpload: true,
      label: 'Connected',
      detail: 'Google Drive is connected.',
    })

    expect(html).not.toContain('Desktop Client ID')
    expect(html).not.toContain('Desktop Client Secret')
    expect(html).toContain('Auto backup')
    expect(html).toContain('Disconnect')
  })
})

function renderBackupPanel(
  cloudBackupStatus = createInitialGoogleDriveBackupStatus(),
) {
  const noop = vi.fn()

  return renderToStaticMarkup(
    <BackupPanel
      cloudBackupPolicy={createInitialGoogleDriveBackupPolicy()}
      cloudBackupStatus={cloudBackupStatus}
      cloudSnapshots={[]}
      isCloudCancelling={false}
      isCloudConnecting={false}
      isCloudDisconnecting={false}
      isCloudPolicyUpdating={false}
      isCloudRestoring={false}
      isCloudUploading={false}
      isDeleting={false}
      isExporting={false}
      isImporting={false}
      isRestoring={false}
      onAutoBackupPolicyChange={noop}
      onCancelGoogleDrive={noop}
      onConnectGoogleDrive={noop}
      onDeleteSnapshot={noop}
      onDisconnectGoogleDrive={noop}
      onExportBackup={noop}
      onImportBackupJson={noop}
      onRestoreGoogleDriveBackup={noop}
      onRestoreSnapshot={noop}
      onUploadGoogleDriveBackup={noop}
      snapshots={[]}
    />,
  )
}
