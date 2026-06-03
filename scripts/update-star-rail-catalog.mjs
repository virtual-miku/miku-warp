import { mkdir, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const STAR_RAIL_RES = {
  name: 'Mar-7th/StarRailRes',
  repository: 'https://github.com/Mar-7th/StarRailRes',
  branch: 'master',
  license: 'AGPL-3.0',
}

const rawBaseUrl =
  'https://raw.githubusercontent.com/Mar-7th/StarRailRes/master'

const resourceUrls = {
  info: `${rawBaseUrl}/info.json`,
  characters: `${rawBaseUrl}/index_new/en/characters.json`,
  lightCones: `${rawBaseUrl}/index_new/en/light_cones.json`,
}

const projectRoot = path.dirname(fileURLToPath(import.meta.url))
const outputPath = path.resolve(
  projectRoot,
  '../src/features/warp-history/data/generated/star-rail-item-catalog.json',
)

const [info, characters, lightCones] = await Promise.all([
  fetchJson(resourceUrls.info),
  fetchJson(resourceUrls.characters),
  fetchJson(resourceUrls.lightCones),
])

const items = [
  ...Object.values(characters).map((character) =>
    toWarpItem(character, 'character'),
  ),
  ...Object.values(lightCones).map((lightCone) =>
    toWarpItem(lightCone, 'light_cone'),
  ),
]
  .filter((item) => item.rarity === 3 || item.rarity === 4 || item.rarity === 5)
  .filter((item) => !item.name.includes('{'))
  .sort((left, right) => {
    if (left.itemType !== right.itemType) {
      return left.itemType.localeCompare(right.itemType)
    }

    return left.name.localeCompare(right.name)
  })

const catalog = {
  schemaVersion: 1,
  source: {
    ...STAR_RAIL_RES,
    version: info.version,
    timestamp: info.timestamp,
  },
  generatedAt: new Date().toISOString(),
  items,
}

await mkdir(path.dirname(outputPath), { recursive: true })
await writeFile(`${outputPath}.tmp`, `${JSON.stringify(catalog, null, 2)}\n`)
await rename(`${outputPath}.tmp`, outputPath)

console.log(
  `Generated ${items.length} warp items from ${STAR_RAIL_RES.name} ${info.version}.`,
)
console.log(outputPath)

async function fetchJson(url) {
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`)
  }

  return response.json()
}

function toWarpItem(resource, itemType) {
  return removeEmptyFields({
    id: `${itemType === 'character' ? 'character' : 'light-cone'}-${resource.id}`,
    sourceId: resource.id,
    name: resource.name,
    itemType,
    rarity: resource.rarity,
    iconPath: resource.icon,
    previewPath: resource.preview,
    portraitPath: resource.portrait,
  })
}

function removeEmptyFields(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined && entry !== ''),
  )
}
