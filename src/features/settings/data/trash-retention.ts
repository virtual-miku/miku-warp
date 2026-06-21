import { invokeTauri } from '../../persistence/data/tauri-invoke'

export const trashRetentionOptions = [30, 90, 183, 365, 0] as const
export type TrashRetentionDays = (typeof trashRetentionOptions)[number]

export type TrashRetentionPolicy = {
  retentionDays: TrashRetentionDays
  updatedAt: string
}

export function getTrashRetentionPolicy() {
  return invokeTauri<TrashRetentionPolicy>('get_trash_retention_policy')
}

export function updateTrashRetentionPolicy(
  retentionDays: TrashRetentionDays,
) {
  return invokeTauri<TrashRetentionPolicy>('update_trash_retention_policy', {
    input: { retentionDays },
  })
}
