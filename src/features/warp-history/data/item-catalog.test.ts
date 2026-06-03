import { describe, expect, it } from 'vitest'
import { itemCatalog, itemCatalogMetadata } from './item-catalog'

describe('itemCatalog', () => {
  it('loads generated StarRailRes metadata', () => {
    expect(itemCatalogMetadata.source).toMatchObject({
      name: 'Mar-7th/StarRailRes',
      license: 'AGPL-3.0',
    })
    expect(itemCatalog.length).toBeGreaterThan(200)
  })

  it('contains known warp items', () => {
    expect(itemCatalog).toContainEqual(
      expect.objectContaining({
        name: 'Pela',
        itemType: 'character',
        rarity: 4,
      }),
    )
    expect(itemCatalog).toContainEqual(
      expect.objectContaining({
        name: 'Data Bank',
        itemType: 'light_cone',
        rarity: 3,
      }),
    )
  })

  it('excludes resource placeholders from matching catalog', () => {
    expect(itemCatalog.some((item) => item.name.includes('{'))).toBe(false)
  })
})

