import { describe, expect, it } from 'vitest'
import {
  createInitialGoogleDriveBackupPolicy,
  createInitialGoogleDriveBackupStatus,
  getCloudBackupPolicyDetail,
  getCloudBackupStatusLabel,
  googleDriveAppDataScope,
} from './cloud-backup'

describe('cloud backup status', () => {
  it('starts disconnected until OAuth and secure storage are configured', () => {
    const status = createInitialGoogleDriveBackupStatus()

    expect(status.provider).toBe('google_drive')
    expect(status.connectionStatus).toBe('not_configured')
    expect(status.oauthClientConfigured).toBe(false)
    expect(status.secureStorageStatus).toBe('ready')
    expect(status.canConnect).toBe(false)
    expect(status.canDisconnect).toBe(false)
    expect(status.canUpload).toBe(false)
    expect(status.scope).toBe(googleDriveAppDataScope)
    expect(status.detail).toBe(
      'Google Drive backup is not available in this build. Local JSON backup still works.',
    )
  })

  it('labels every supported connection state', () => {
    expect(getCloudBackupStatusLabel('not_configured')).toBe(
      'Drive backup unavailable',
    )
    expect(getCloudBackupStatusLabel('storage_unavailable')).toBe(
      'Secure storage unavailable',
    )
    expect(getCloudBackupStatusLabel('disconnected')).toBe('Not connected')
    expect(getCloudBackupStatusLabel('connecting')).toBe(
      'Waiting for Google login',
    )
    expect(getCloudBackupStatusLabel('connection_failed')).toBe(
      'Connection failed',
    )
    expect(getCloudBackupStatusLabel('connected')).toBe('Connected')
    expect(getCloudBackupStatusLabel('needs_reauth')).toBe('Needs re-login')
  })

  it('starts with auto backup disabled until the user opts in', () => {
    const policy = createInitialGoogleDriveBackupPolicy()

    expect(policy.provider).toBe('google_drive')
    expect(policy.autoBackupEnabled).toBe(false)
    expect(policy.triggerName).toBe('manual_import_saved')
    expect(policy.minIntervalMinutes).toBe(0)
    expect(getCloudBackupPolicyDetail(policy, false)).toBe(
      'Connect Drive first',
    )
    expect(getCloudBackupPolicyDetail(policy, true)).toBe('Off')
  })

  it('describes enabled auto backup policy readiness', () => {
    const policy = {
      ...createInitialGoogleDriveBackupPolicy(),
      autoBackupEnabled: true,
    }

    expect(getCloudBackupPolicyDetail(policy, true)).toBe(
      'After manual import',
    )
    expect(getCloudBackupPolicyDetail(policy, false)).toBe(
      'Enabled, waiting for Drive',
    )
  })
})
