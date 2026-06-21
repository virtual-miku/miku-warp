import { describe, expect, it } from 'vitest'
import { itemCatalog } from '../../warp-history/data/item-catalog'
import { manualNoteSample } from '../data/manual-note-sample'
import {
  normalizeWarpItemName,
  parseManualWarpNote,
  toLogicalManualNoteLines,
} from './manual-note-parser'

describe('parseManualWarpNote', () => {
  it('parses timestamp groups and matches known items', () => {
    const preview = parseManualWarpNote(manualNoteSample, itemCatalog)

    expect(preview.sections.map((section) => section.bannerType)).toEqual([
      'collaboration_character',
      'collaboration_light_cone',
      'character_event',
      'light_cone_event',
      'standard',
    ])
    expect(preview.groups).toHaveLength(5)
    expect(preview.totalPulls).toBe(5)
    expect(preview.recognizedPulls).toBe(5)
    expect(preview.unresolvedNames).toEqual([])

    expect(preview.groups[0]).toMatchObject({
      lineNumber: 2,
      rawTimestamp: '2025-07-11 11:23:51',
      pulledAt: '2025-07-11T11:23:51',
      bannerType: 'collaboration_character',
    })

    expect(preview.groups.map((group) => group.pulls[0]?.rawName)).toEqual([
      'Saber',
      'A Thankless Coronation',
      'Sparkle',
      'Earthly Escapade',
      'Clara',
    ])
  })

  it('normalizes curly apostrophes when matching catalog items', () => {
    const preview = parseManualWarpNote(
      `2025-07-11 11:20:01
Dream\u2019s Montage`,
      itemCatalog,
    )
    const dreamMontage = preview.groups[0].pulls[0]

    expect(dreamMontage).toMatchObject({
      lineNumber: 2,
      sequenceInGroup: 1,
      rawName: 'Dream\u2019s Montage',
    })
    expect(dreamMontage.item).toMatchObject({
      name: "Dream's Montage",
      itemType: 'light_cone',
      rarity: 4,
    })
  })

  it('reports every unknown item but only lists unresolved names once', () => {
    const preview = parseManualWarpNote(
      `2025-07-11 11:20:01
Unknown Light Cone
Pela
Unknown Light Cone`,
      itemCatalog,
    )

    expect(preview.totalPulls).toBe(3)
    expect(preview.recognizedPulls).toBe(1)
    expect(preview.unresolvedNames).toEqual(['Unknown Light Cone'])
    expect(preview.issues.filter((issue) => issue.code === 'item_not_found')).toHaveLength(2)
  })

  it('maps supported section headings to banner types', () => {
    const preview = parseManualWarpNote(
      `Warp Kolaborasi Karakter
2025-07-11 11:20:01
Pela
Event Warp Light Cone
2025-07-12 11:20:01
Data Bank
Warp Bintang-Bintang
2025-07-13 11:20:01
Arrows`,
      itemCatalog,
    )

    expect(preview.sections).toEqual([
      expect.objectContaining({
        lineNumber: 1,
        rawHeading: 'Warp Kolaborasi Karakter',
        bannerType: 'collaboration_character',
      }),
      expect.objectContaining({
        lineNumber: 4,
        rawHeading: 'Event Warp Light Cone',
        bannerType: 'light_cone_event',
      }),
      expect.objectContaining({
        lineNumber: 7,
        rawHeading: 'Warp Bintang-Bintang',
        bannerType: 'standard',
      }),
    ])
    expect(preview.groups.map((group) => group.bannerType)).toEqual([
      'collaboration_character',
      'light_cone_event',
      'standard',
    ])
  })

  it('maps common heading aliases to banner types', () => {
    const preview = parseManualWarpNote(
      `Character Event Warp
2025-07-11 11:20:01
Pela
Light Cone Event Warp
2025-07-12 11:20:01
Data Bank
Warp Bintang Bintang
2025-07-13 11:20:01
Arrows
Departure Warp
2025-07-14 11:20:01
Amber`,
      itemCatalog,
    )

    expect(preview.groups.map((group) => group.bannerType)).toEqual([
      'character_event',
      'light_cone_event',
      'standard',
      'departure',
    ])
  })

  it('parses PDF-style inline numbered pulls', () => {
    const preview = parseManualWarpNote(
      `Warp  Kolaborasi  Karakter
2025-07-11  11:20:01  1.  Pela  2.  Darting  Arrow
3.  Data  Bank`,
      itemCatalog,
    )

    expect(preview.sections[0]).toMatchObject({
      rawHeading: 'Warp Kolaborasi Karakter',
      bannerType: 'collaboration_character',
    })
    expect(preview.groups[0]).toMatchObject({
      rawTimestamp: '2025-07-11 11:20:01',
      pulledAt: '2025-07-11T11:20:01',
      bannerType: 'collaboration_character',
    })
    expect(preview.groups[0].pulls.map((pull) => pull.rawName)).toEqual([
      'Pela',
      'Darting Arrow',
      'Data Bank',
    ])
  })

  it('parses numbered pull lines and keeps only the item names', () => {
    const preview = parseManualWarpNote(
      `Warp Kolaborasi Karakter
2025-07-11 11:20:01
1. Pela
2. Darting Arrow
3. Adversarial
4. Data Bank
5. Data Bank
6. Dream’s Montage
7. Amber
8. Arrows
9. Hidden Shadow
10. Multiplication
2025-07-11 11:20:25
11. Mediation
12. A Secret Vow
13. Amber
14. Reminiscence
15. Darting Arrow
16. Meshing Cogs
17. Multiplication
18. Fine Fruit
19. Data Bank
20. Dan Heng`,
      itemCatalog,
    )

    expect(preview.sections[0]?.bannerType).toBe('collaboration_character')
    expect(preview.groups).toHaveLength(2)
    expect(preview.totalPulls).toBe(20)
    expect(preview.recognizedPulls).toBe(20)
    expect(preview.issues).toEqual([])
    expect(preview.groups[0].pulls.map((pull) => pull.rawName)).toEqual([
      'Pela',
      'Darting Arrow',
      'Adversarial',
      'Data Bank',
      'Data Bank',
      'Dream’s Montage',
      'Amber',
      'Arrows',
      'Hidden Shadow',
      'Multiplication',
    ])
    expect(preview.groups[1].pulls.map((pull) => pull.rawName)).toEqual([
      'Mediation',
      'A Secret Vow',
      'Amber',
      'Reminiscence',
      'Darting Arrow',
      'Meshing Cogs',
      'Multiplication',
      'Fine Fruit',
      'Data Bank',
      'Dan Heng',
    ])
  })

  it('matches known typo aliases without changing the raw note line', () => {
    const preview = parseManualWarpNote(
      `2025-07-11 11:20:01
Lingering Tears
Collapsed Sky
Darting Aroow
Night of the Milky Way
Day One of My Life
Reminscence`,
      itemCatalog,
    )

    expect(preview.issues).toEqual([])
    expect(preview.recognizedPulls).toBe(6)
    expect(preview.groups[0].pulls.map((pull) => pull.rawName)).toEqual([
      'Lingering Tears',
      'Collapsed Sky',
      'Darting Aroow',
      'Night of the Milky Way',
      'Day One of My Life',
      'Reminscence',
    ])
    expect(preview.groups[0].pulls.map((pull) => pull.matchedName)).toEqual([
      'Lingering Tear',
      'Collapsing Sky',
      'Darting Arrow',
      'Night on the Milky Way',
      'Day One of My New Life',
      'Reminiscence',
    ])
    expect(preview.groups[0].pulls.every((pull) => pull.matchedBy === 'alias')).toBe(true)
  })

  it('accepts timestamps with one digit hour and normalizes the stored value', () => {
    const preview = parseManualWarpNote(
      `2024-05-08 9:32:25
Arrows`,
      itemCatalog,
    )

    expect(preview.groups[0]).toMatchObject({
      rawTimestamp: '2024-05-08 9:32:25',
      pulledAt: '2024-05-08T09:32:25',
    })
    expect(preview.totalPulls).toBe(1)
  })

  it('reports time-only lines without counting them as pulls', () => {
    const preview = parseManualWarpNote(
      `2025-07-11 11:20:01
Pela
5:57:04
Data Bank`,
      itemCatalog,
    )

    expect(preview.totalPulls).toBe(2)
    expect(preview.issues).toEqual([
      expect.objectContaining({
        code: 'time_without_date',
        lineNumber: 3,
        value: '5:57:04',
      }),
    ])
  })

  it('keeps items before the first timestamp out of import groups', () => {
    const preview = parseManualWarpNote(
      `Pela
2025-07-11 11:20:01
Data Bank`,
      itemCatalog,
    )

    expect(preview.totalPulls).toBe(1)
    expect(preview.groups[0].pulls[0].rawName).toBe('Data Bank')
    expect(preview.issues).toEqual([
      expect.objectContaining({
        code: 'item_before_timestamp',
        lineNumber: 1,
        value: 'Pela',
      }),
    ])
  })

  it('reports empty input', () => {
    const preview = parseManualWarpNote('  \n  ', itemCatalog)

    expect(preview.totalPulls).toBe(0)
    expect(preview.issues).toEqual([
      expect.objectContaining({
        code: 'empty_input',
      }),
    ])
  })
})

describe('normalizeWarpItemName', () => {
  it('normalizes spacing, case, and quote variants', () => {
    expect(normalizeWarpItemName('  DREAM\u2019S   MONTAGE  ')).toBe("dream's montage")
  })
})

describe('toLogicalManualNoteLines', () => {
  it('splits timestamp and numbered pull chunks from PDF text extraction', () => {
    expect(
      toLogicalManualNoteLines(
        '2025-07-11  11:20:01  1.  Pela  2.  Darting  Arrow',
      ),
    ).toEqual([
      { lineNumber: 1, value: '2025-07-11 11:20:01' },
      { lineNumber: 1, value: 'Pela' },
      { lineNumber: 1, value: 'Darting Arrow' },
    ])
  })
})
