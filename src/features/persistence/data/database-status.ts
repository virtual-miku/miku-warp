import { invoke } from '@tauri-apps/api/core'

export type DatabaseDriverStatus = 'ready'

export type DatabaseStatus = {
  databasePath: string
  databaseFileExists: boolean
  isInitialized: boolean
  appliedMigrations: string[]
  plannedMigrations: string[]
  migrationCount: number
  driverStatus: DatabaseDriverStatus
}

export function getDatabaseStatus() {
  return invoke<DatabaseStatus>('get_database_status')
}
