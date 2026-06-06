export const googleDriveAppDataScope =
  'https://www.googleapis.com/auth/drive.appdata'

export type CloudBackupProvider = 'google_drive'

export type CloudBackupConnectionStatus =
  | 'not_configured'
  | 'storage_unavailable'
  | 'disconnected'
  | 'connected'
  | 'needs_reauth'

export type CloudBackupStorageSpace = 'app_data_folder'

export type SecureTokenStorageStatus = 'ready' | 'unavailable'

export type CloudBackupStatus = {
  provider: CloudBackupProvider
  connectionStatus: CloudBackupConnectionStatus
  storageSpace: CloudBackupStorageSpace
  scope: typeof googleDriveAppDataScope
  secureStorageStatus: SecureTokenStorageStatus
  oauthClientConfigured: boolean
  canConnect: boolean
  canDisconnect: boolean
  canUpload: boolean
  label: string
  detail: string
}

export function createInitialGoogleDriveBackupStatus(): CloudBackupStatus {
  return {
    provider: 'google_drive',
    connectionStatus: 'not_configured',
    storageSpace: 'app_data_folder',
    scope: googleDriveAppDataScope,
    secureStorageStatus: 'ready',
    oauthClientConfigured: false,
    canConnect: false,
    canDisconnect: false,
    canUpload: false,
    label: getCloudBackupStatusLabel('not_configured'),
    detail:
      'Google OAuth client and secure token storage must be configured before Drive backup can be enabled.',
  }
}

export function getCloudBackupStatusLabel(
  status: CloudBackupConnectionStatus,
) {
  switch (status) {
    case 'not_configured':
      return 'OAuth setup required'
    case 'storage_unavailable':
      return 'Secure storage unavailable'
    case 'disconnected':
      return 'Not connected'
    case 'connected':
      return 'Connected'
    case 'needs_reauth':
      return 'Needs re-login'
  }
}
