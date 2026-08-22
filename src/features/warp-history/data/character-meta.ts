import generatedMeta from './generated/star-rail-character-meta.json'

type CharacterPathMeta = {
  name: string
  icon: string
}

type GeneratedCharacterMeta = {
  schemaVersion: number
  characters: Record<string, string>
  paths: Record<string, CharacterPathMeta>
}

const meta = generatedMeta as GeneratedCharacterMeta

export function getCharacterPath(avatarId: number) {
  const pathId = meta.characters[String(avatarId)]
  if (!pathId) {
    return undefined
  }
  return meta.paths[pathId]
}
