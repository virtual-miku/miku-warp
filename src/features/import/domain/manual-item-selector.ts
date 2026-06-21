import {
  getBannerLabel,
  type BannerType,
} from '../../warp-history/domain/banner'
import type { WarpItem } from '../../warp-history/domain/warp-item'
import type {
  ManualImportGroup,
  ManualImportPreview,
} from './manual-note-parser'

export type ManualItemSelection = {
  id: string
  bannerType: BannerType
  item: WarpItem
  pity: number
  pulledAt: string
}

export function buildManualItemSelectorPreview(
  selections: ManualItemSelection[],
): ManualImportPreview {
  const groups: ManualImportGroup[] = []
  const groupByIdentity = new Map<string, ManualImportGroup>()

  selections.forEach((selection, index) => {
    const lineNumber = index + 1
    const groupIdentity = JSON.stringify([
      selection.bannerType,
      selection.pulledAt,
    ])
    let group = groupByIdentity.get(groupIdentity)

    if (!group) {
      group = {
        bannerType: selection.bannerType,
        lineNumber,
        pulledAt: selection.pulledAt,
        pulls: [],
        rawSectionHeading: getBannerLabel(selection.bannerType),
        rawTimestamp: formatManualSelectorTimestamp(selection.pulledAt),
      }
      groupByIdentity.set(groupIdentity, group)
      groups.push(group)
    }

    group.pulls.push({
      bannerType: selection.bannerType,
      item: selection.item,
      lineNumber,
      matchedBy: 'exact',
      matchedName: selection.item.name,
      normalizedName: selection.item.name.toLocaleLowerCase('en-US'),
      pityOverride: selection.pity,
      pulledAt: selection.pulledAt,
      rawName: selection.item.name,
      sequenceInGroup: group.pulls.length + 1,
    })
  })

  const bannerTypes = Array.from(
    new Set(selections.map((selection) => selection.bannerType)),
  )

  return {
    groups,
    issues: [],
    recognizedPulls: selections.length,
    sections: bannerTypes.map((bannerType, index) => ({
      bannerType,
      lineNumber: index + 1,
      rawHeading: getBannerLabel(bannerType),
    })),
    totalLines: selections.length,
    totalPulls: selections.length,
    unresolvedNames: [],
  }
}

export function formatLocalDateTimeInput(date: Date) {
  const dateParts = [
    date.getFullYear(),
    date.getMonth() + 1,
    date.getDate(),
  ].map((part, index) =>
    index === 0 ? part.toString() : part.toString().padStart(2, '0'),
  )
  const timeParts = [date.getHours(), date.getMinutes(), date.getSeconds()].map(
    (part) => part.toString().padStart(2, '0'),
  )

  return `${dateParts.join('-')}T${timeParts.join(':')}`
}

function formatManualSelectorTimestamp(value: string) {
  return value.replace('T', ' ')
}
