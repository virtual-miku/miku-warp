import type {
  ManualImportPreview,
  ManualImportPull,
} from './manual-note-parser'

export type ManualImportStatus = 'empty' | 'ready' | 'needs_review'

export type ManualImportRarityCounts = {
  rarity3: number
  rarity4: number
  rarity5: number
}

export type ManualImportPreviewRow = ManualImportPull & {
  groupTimestamp: string
}

export function getManualImportStatus(
  preview: ManualImportPreview,
): ManualImportStatus {
  if (preview.totalPulls === 0) {
    return 'empty'
  }

  if (preview.issues.length > 0) {
    return 'needs_review'
  }

  return 'ready'
}

export function getManualImportStatusLabel(status: ManualImportStatus) {
  if (status === 'needs_review') {
    return 'Needs review'
  }

  if (status === 'empty') {
    return 'Empty'
  }

  return 'Ready'
}

export function getManualImportRarityCounts(
  preview: ManualImportPreview,
): ManualImportRarityCounts {
  return preview.groups.reduce<ManualImportRarityCounts>(
    (counts, group) => {
      group.pulls.forEach((pull) => {
        if (pull.item?.rarity === 3) {
          counts.rarity3 += 1
        }

        if (pull.item?.rarity === 4) {
          counts.rarity4 += 1
        }

        if (pull.item?.rarity === 5) {
          counts.rarity5 += 1
        }
      })

      return counts
    },
    { rarity3: 0, rarity4: 0, rarity5: 0 },
  )
}

export function getManualImportPreviewRows(
  preview: ManualImportPreview,
  limit = 12,
): ManualImportPreviewRow[] {
  return preview.groups
    .flatMap((group) =>
      group.pulls.map((pull) => ({
        ...pull,
        groupTimestamp: group.rawTimestamp,
      })),
    )
    .slice(0, limit)
}

