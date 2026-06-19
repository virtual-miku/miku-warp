export const googleDriveAppDataScope =
  'https://www.googleapis.com/auth/drive.appdata'

export type CloudBackupProvider = 'google_drive'

export type CloudBackupConnectionStatus =
  | 'not_configured'
  | 'storage_unavailable'
  | 'disconnected'
  | 'connecting'
  | 'connection_failed'
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

export type CloudBackupPolicyTrigger = 'data_changed'

export type CloudBackupPolicy = {
  provider: CloudBackupProvider
  autoBackupEnabled: boolean
  triggerName: CloudBackupPolicyTrigger
  minIntervalMinutes: number
  updatedAt: string
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
      'Google Drive backup is not available in this build. Local JSON backup still works.',
  }
}

export function createInitialGoogleDriveBackupPolicy(): CloudBackupPolicy {
  return {
    provider: 'google_drive',
    autoBackupEnabled: false,
    triggerName: 'data_changed',
    minIntervalMinutes: 0,
    updatedAt: '',
  }
}

export function getCloudBackupPolicyDetail(
  policy: CloudBackupPolicy,
  canUpload: boolean,
) {
  if (policy.autoBackupEnabled && canUpload) {
    return 'On every change'
  }

  if (policy.autoBackupEnabled) {
    return 'Drive pending'
  }

  return canUpload ? 'Local autosave only' : 'Local autosave on'
}

export function getCloudBackupStatusLabel(
  status: CloudBackupConnectionStatus,
) {
  switch (status) {
    case 'not_configured':
      return 'Drive backup unavailable'
    case 'storage_unavailable':
      return 'Secure storage unavailable'
    case 'disconnected':
      return 'Not connected'
    case 'connecting':
      return 'Waiting for Google login'
    case 'connection_failed':
      return 'Connection failed'
    case 'connected':
      return 'Connected'
    case 'needs_reauth':
      return 'Needs re-login'
  }
}
