import type { WarpItem } from '../../warp-history/domain/warp-item'

const timestampPattern = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/

export type ManualImportIssueCode =
  | 'empty_input'
  | 'item_before_timestamp'
  | 'item_not_found'

export type ManualImportIssue = {
  code: ManualImportIssueCode
  lineNumber: number
  value: string
  message: string
}

export type ManualImportPull = {
  lineNumber: number
  sequenceInGroup: number
  rawName: string
  normalizedName: string
  pulledAt: string
  item?: WarpItem
}

export type ManualImportGroup = {
  lineNumber: number
  rawTimestamp: string
  pulledAt: string
  pulls: ManualImportPull[]
}

export type ManualImportPreview = {
  groups: ManualImportGroup[]
  issues: ManualImportIssue[]
  totalLines: number
  totalPulls: number
  recognizedPulls: number
  unresolvedNames: string[]
}

export function parseManualWarpNote(
  text: string,
  catalog: WarpItem[],
): ManualImportPreview {
  const itemIndex = buildItemIndex(catalog)
  const groups: ManualImportGroup[] = []
  const issues: ManualImportIssue[] = []
  const lines = text.split(/\r?\n/)

  let currentGroup: ManualImportGroup | undefined

  lines.forEach((line, index) => {
    const lineNumber = index + 1
    const value = line.trim()

    if (!value) {
      return
    }

    const timestamp = parseManualTimestamp(value)

    if (timestamp) {
      currentGroup = {
        lineNumber,
        rawTimestamp: value,
        pulledAt: timestamp,
        pulls: [],
      }
      groups.push(currentGroup)
      return
    }

    if (!currentGroup) {
      issues.push({
        code: 'item_before_timestamp',
        lineNumber,
        value,
        message: 'Item appears before the first timestamp.',
      })
      return
    }

    const normalizedName = normalizeWarpItemName(value)
    const item = itemIndex.get(normalizedName)

    if (!item) {
      issues.push({
        code: 'item_not_found',
        lineNumber,
        value,
        message: 'Item is not available in the local catalog yet.',
      })
    }

    currentGroup.pulls.push({
      lineNumber,
      sequenceInGroup: currentGroup.pulls.length + 1,
      rawName: value,
      normalizedName,
      pulledAt: currentGroup.pulledAt,
      item,
    })
  })

  if (groups.length === 0 && issues.length === 0) {
    issues.push({
      code: 'empty_input',
      lineNumber: 1,
      value: '',
      message: 'Manual note is empty.',
    })
  }

  const pulls = groups.flatMap((group) => group.pulls)
  const unresolvedNames = Array.from(
    new Set(pulls.filter((pull) => !pull.item).map((pull) => pull.rawName)),
  )

  return {
    groups,
    issues,
    totalLines: lines.length,
    totalPulls: pulls.length,
    recognizedPulls: pulls.filter((pull) => pull.item).length,
    unresolvedNames,
  }
}

export function normalizeWarpItemName(value: string) {
  return value
    .normalize('NFKC')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('en-US')
}

function buildItemIndex(catalog: WarpItem[]) {
  return new Map(
    catalog.map((item) => [normalizeWarpItemName(item.name), item]),
  )
}

function parseManualTimestamp(value: string) {
  const match = timestampPattern.exec(value)

  if (!match) {
    return undefined
  }

  const [, year, month, day, hour, minute, second] = match
  return `${year}-${month}-${day}T${hour}:${minute}:${second}`
}
