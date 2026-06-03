import type {
  ManualImportPreview,
  ManualImportPull,
} from './manual-note-parser'
import {
  bannerDefinitions,
  type BannerType,
} from '../../warp-history/domain/banner'

export type ManualImportStatus = 'empty' | 'ready' | 'needs_review'
export type ManualImportPreviewCategoryKey = BannerType | 'unassigned'

export type ManualImportRarityCounts = {
  rarity3: number
  rarity4: number
  rarity5: number
}

export type ManualImportPreviewRow = ManualImportPull & {
  effectiveBannerType?: BannerType
  groupLineNumber: number
  groupTimestamp: string
  pityFourAtPull?: number
  pityFiveAtPull?: number
  rawSectionHeading?: string
}

export type ManualImportPreviewCategory = {
  key: ManualImportPreviewCategoryKey
  bannerType?: BannerType
  groupCount: number
  totalPulls: number
  recognizedPulls: number
}

export type ManualImportPreviewFilterOptions = {
  categoryKey?: ManualImportPreviewCategoryKey
  fallbackBannerType?: BannerType
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
  options: ManualImportPreviewFilterOptions = {},
): ManualImportRarityCounts {
  return filterManualImportGroups(preview, options).reduce<ManualImportRarityCounts>(
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

export function getManualImportPreviewCategories(
  preview: ManualImportPreview,
  fallbackBannerType?: BannerType,
): ManualImportPreviewCategory[] {
  const categoryMap = new Map<
    ManualImportPreviewCategoryKey,
    ManualImportPreviewCategory
  >()

  preview.groups.forEach((group) => {
    const effectiveBannerType = group.bannerType ?? fallbackBannerType
    const key = effectiveBannerType ?? 'unassigned'
    const category = categoryMap.get(key) ?? {
      key,
      bannerType: effectiveBannerType,
      groupCount: 0,
      totalPulls: 0,
      recognizedPulls: 0,
    }

    category.groupCount += 1
    category.totalPulls += group.pulls.length
    category.recognizedPulls += group.pulls.filter((pull) => pull.item).length
    categoryMap.set(key, category)
  })

  return Array.from(categoryMap.values()).sort(compareManualImportCategory)
}

export function getManualImportPreviewRows(
  preview: ManualImportPreview,
  limit = 12,
  options: ManualImportPreviewFilterOptions = {},
): ManualImportPreviewRow[] {
  const rows = filterManualImportGroups(preview, options)
    .flatMap((group) =>
      group.pulls.map((pull) => ({
        ...pull,
        effectiveBannerType: group.bannerType ?? options.fallbackBannerType,
        groupLineNumber: group.lineNumber,
        groupTimestamp: group.rawTimestamp,
        rawSectionHeading: group.rawSectionHeading,
      })),
    )

  annotateManualImportPity(rows)

  return rows
    .slice(0, limit)
}

export function getManualImportPreviewTotalPulls(
  preview: ManualImportPreview,
  options: ManualImportPreviewFilterOptions = {},
) {
  return filterManualImportGroups(preview, options).reduce(
    (totalPulls, group) => totalPulls + group.pulls.length,
    0,
  )
}

export function getManualImportPreviewRecognizedPulls(
  preview: ManualImportPreview,
  options: ManualImportPreviewFilterOptions = {},
) {
  return filterManualImportGroups(preview, options).reduce(
    (recognizedPulls, group) =>
      recognizedPulls + group.pulls.filter((pull) => pull.item).length,
    0,
  )
}

export function getManualImportPreviewGroupCount(
  preview: ManualImportPreview,
  options: ManualImportPreviewFilterOptions = {},
) {
  return filterManualImportGroups(preview, options).length
}

function filterManualImportGroups(
  preview: ManualImportPreview,
  options: ManualImportPreviewFilterOptions,
) {
  if (!options.categoryKey) {
    return preview.groups
  }

  return preview.groups.filter((group) => {
    const effectiveBannerType = group.bannerType ?? options.fallbackBannerType

    if (options.categoryKey === 'unassigned') {
      return !effectiveBannerType
    }

    return effectiveBannerType === options.categoryKey
  })
}

function compareManualImportCategory(
  left: ManualImportPreviewCategory,
  right: ManualImportPreviewCategory,
) {
  const leftIndex = bannerDefinitions.findIndex(
    (banner) => banner.type === left.bannerType,
  )
  const rightIndex = bannerDefinitions.findIndex(
    (banner) => banner.type === right.bannerType,
  )

  return categorySortIndex(leftIndex) - categorySortIndex(rightIndex)
}

function categorySortIndex(index: number) {
  return index === -1 ? Number.MAX_SAFE_INTEGER : index
}

function annotateManualImportPity(rows: ManualImportPreviewRow[]) {
  const pityStateByBanner = new Map<
    ManualImportPreviewCategoryKey,
    { fourStarPity: number; fiveStarPity: number }
  >()

  rows.forEach((row) => {
    const rarity = row.item?.rarity

    if (!rarity) {
      return
    }

    const pityKey = row.effectiveBannerType ?? 'unassigned'
    const pityState = pityStateByBanner.get(pityKey) ?? {
      fourStarPity: 0,
      fiveStarPity: 0,
    }

    pityState.fourStarPity += 1
    pityState.fiveStarPity += 1

    row.pityFourAtPull = pityState.fourStarPity
    row.pityFiveAtPull = pityState.fiveStarPity

    if (rarity === 5) {
      pityState.fourStarPity = 0
      pityState.fiveStarPity = 0
    } else if (rarity === 4) {
      pityState.fourStarPity = 0
    }

    pityStateByBanner.set(pityKey, pityState)
  })
}
