import type { WarpItem } from '../../warp-history/domain/warp-item'
import type { BannerType } from '../../warp-history/domain/banner'

const timestampPattern = /^(\d{4})-(\d{2})-(\d{2}) (\d{1,2}):(\d{2}):(\d{2})$/
const inlineTimestampPattern = /(\d{4}-\d{2}-\d{2} \d{1,2}:\d{2}:\d{2})/g
const numberedPullPattern = /(^|\s)(\d{1,4})\.\s+/g
const timeOnlyPattern = /^\d{1,2}:\d{2}:\d{2}$/

export type ManualImportIssueCode =
  | 'empty_input'
  | 'item_before_timestamp'
  | 'item_not_found'
  | 'time_without_date'
  | 'unknown_section_heading'

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
  pityOverride?: number
  bannerType?: BannerType
  matchedBy: 'exact' | 'alias' | 'unmatched'
  matchedName?: string
  item?: WarpItem
}

export type ManualImportGroup = {
  lineNumber: number
  rawTimestamp: string
  pulledAt: string
  bannerType?: BannerType
  rawSectionHeading?: string
  pulls: ManualImportPull[]
}

export type ManualImportSection = {
  lineNumber: number
  rawHeading: string
  bannerType: BannerType
}

export type ManualImportPreview = {
  sections: ManualImportSection[]
  groups: ManualImportGroup[]
  issues: ManualImportIssue[]
  totalLines: number
  totalPulls: number
  recognizedPulls: number
  unresolvedNames: string[]
}

export type ManualWarpNoteParserOptions = {
  itemAliases?: Record<string, string>
  sectionHeadings?: Record<string, BannerType>
}

export const defaultManualItemAliases: Record<string, string> = {
  arrow: 'Arrows',
  'collapsed sky': 'Collapsing Sky',
  collapsing: 'Collapsing Sky',
  'colalpsing sky': 'Collapsing Sky',
  'darting aroow': 'Darting Arrow',
  'day one of my life': 'Day One of My New Life',
  'lingering tears': 'Lingering Tear',
  'night of the milky way': 'Night on the Milky Way',
  reminscence: 'Reminiscence',
}

export const defaultManualSectionHeadings: Record<string, BannerType> = {
  'character event warp': 'character_event',
  'collaboration character warp': 'collaboration_character',
  'collaboration light cone warp': 'collaboration_light_cone',
  'departure warp': 'departure',
  'event warp karakter': 'character_event',
  'event warp light cone': 'light_cone_event',
  'light cone event warp': 'light_cone_event',
  'stellar warp': 'standard',
  'warp bintang bintang': 'standard',
  'warp bintang-bintang': 'standard',
  'warp event karakter': 'character_event',
  'warp event light cone': 'light_cone_event',
  'warp kolaborasi character': 'collaboration_character',
  'warp kolaborasi karakter': 'collaboration_character',
  'warp kolaborasi light cone': 'collaboration_light_cone',
  'warp pemula': 'departure',
}

export function parseManualWarpNote(
  text: string,
  catalog: WarpItem[],
  options: ManualWarpNoteParserOptions = {},
): ManualImportPreview {
  const itemIndex = buildItemIndex(catalog)
  const aliasIndex = buildAliasIndex(options.itemAliases ?? defaultManualItemAliases)
  const sectionHeadingIndex = buildSectionHeadingIndex(
    options.sectionHeadings ?? defaultManualSectionHeadings,
  )
  const sections: ManualImportSection[] = []
  const groups: ManualImportGroup[] = []
  const issues: ManualImportIssue[] = []
  const lines = toLogicalManualNoteLines(text)

  let currentGroup: ManualImportGroup | undefined
  let currentSection: ManualImportSection | undefined

  lines.forEach((line) => {
    const lineNumber = line.lineNumber
    const value = line.value

    if (!value) {
      return
    }

    const sectionBannerType = sectionHeadingIndex.get(normalizeWarpItemName(value))

    if (sectionBannerType) {
      currentSection = {
        lineNumber,
        rawHeading: value,
        bannerType: sectionBannerType,
      }
      sections.push(currentSection)
      currentGroup = undefined
      return
    }

    const timestamp = parseManualTimestamp(value)

    if (timestamp) {
      currentGroup = {
        lineNumber,
        rawTimestamp: value,
        pulledAt: timestamp,
        bannerType: currentSection?.bannerType,
        rawSectionHeading: currentSection?.rawHeading,
        pulls: [],
      }
      groups.push(currentGroup)
      return
    }

    if (timeOnlyPattern.test(value)) {
      issues.push({
        code: 'time_without_date',
        lineNumber,
        value,
        message: 'Time appears without a date.',
      })
      return
    }

    if (looksLikeSectionHeading(value)) {
      issues.push({
        code: 'unknown_section_heading',
        lineNumber,
        value,
        message: 'Section heading is not mapped to a banner type.',
      })
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
    const aliasTarget = aliasIndex.get(normalizedName)
    const item = itemIndex.get(aliasTarget ?? normalizedName)

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
      bannerType: currentGroup.bannerType,
      matchedBy: item ? (aliasTarget ? 'alias' : 'exact') : 'unmatched',
      matchedName: item?.name,
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
    sections,
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
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('en-US')
}

export function toLogicalManualNoteLines(text: string) {
  return text
    .split(/\r?\n/)
    .flatMap((line, index) => splitPhysicalLine(line, index + 1))
}

function buildItemIndex(catalog: WarpItem[]) {
  return new Map(
    catalog.map((item) => [normalizeWarpItemName(item.name), item]),
  )
}

function buildAliasIndex(aliases: Record<string, string>) {
  return new Map(
    Object.entries(aliases).map(([source, target]) => [
      normalizeWarpItemName(source),
      normalizeWarpItemName(target),
    ]),
  )
}

function buildSectionHeadingIndex(sectionHeadings: Record<string, BannerType>) {
  return new Map(
    Object.entries(sectionHeadings).map(([heading, bannerType]) => [
      normalizeWarpItemName(heading),
      bannerType,
    ]),
  )
}

function parseManualTimestamp(value: string) {
  const match = timestampPattern.exec(value)

  if (!match) {
    return undefined
  }

  const [, year, month, day, hour, minute, second] = match
  return `${year}-${month}-${day}T${hour.padStart(2, '0')}:${minute}:${second}`
}

function looksLikeSectionHeading(value: string) {
  return /\b(warp|event)\b/i.test(value)
}

function splitPhysicalLine(line: string, lineNumber: number) {
  const normalizedLine = line
    .normalize('NFKC')
    .replace(/[\u2018\u2019]/g, '\u2019')
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()

  if (!normalizedLine) {
    return []
  }

  const expandedLine = normalizedLine
    .replace(inlineTimestampPattern, '\n$1\n')
    .replace(numberedPullPattern, '\n$2. ')

  return expandedLine
    .split(/\n+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => ({
      lineNumber,
      value: part.replace(/^\d{1,4}\.\s+/, '').trim(),
    }))
    .filter((part) => part.value)
}
