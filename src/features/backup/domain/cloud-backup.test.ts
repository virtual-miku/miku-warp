import { describe, expect, it } from 'vitest'
import {
  createInitialGoogleDriveBackupStatus,
  getCloudBackupStatusLabel,
  googleDriveAppDataScope,
} from './cloud-backup'

describe('cloud backup status', () => {
  it('starts disconnected until OAuth and secure storage are configured', () => {
    const status = createInitialGoogleDriveBackupStatus()

    expect(status.provider).toBe('google_drive')
    expect(status.connectionStatus).toBe('not_configured')
    expect(status.canConnect).toBe(false)
    expect(status.canUpload).toBe(false)
    expect(status.scope).toBe(googleDriveAppDataScope)
  })

  it('labels every supported connection state', () => {
    expect(getCloudBackupStatusLabel('not_configured')).toBe(
      'OAuth setup required',
    )
    expect(getCloudBackupStatusLabel('disconnected')).toBe('Not connected')
    expect(getCloudBackupStatusLabel('connected')).toBe('Connected')
    expect(getCloudBackupStatusLabel('needs_reauth')).toBe('Needs re-login')
  })
})
