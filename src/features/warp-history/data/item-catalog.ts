import generatedCatalog from './generated/star-rail-item-catalog.json'
import type { WarpItem } from '../domain/warp-item'

export type ItemCatalogMetadata = {
  schemaVersion: number
  source: {
    name: string
    repository: string
    branch: string
    license: string
    version?: string
    timestamp?: number
  }
  generatedAt: string
}

type GeneratedCatalog = ItemCatalogMetadata & {
  items: WarpItem[]
}

const catalog = generatedCatalog as GeneratedCatalog

export const itemCatalog = catalog.items
export const itemCatalogMetadata: ItemCatalogMetadata = {
  schemaVersion: catalog.schemaVersion,
  source: catalog.source,
  generatedAt: catalog.generatedAt,
}

