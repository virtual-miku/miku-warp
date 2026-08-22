import { invokeTauri } from './tauri-invoke'

export type RosterLightCone = {
  name: string
  rarity: number
  level: number
  superimpose: number
  icon: string
}

export type RosterCharacter = {
  id: number
  name: string
  rarity: number
  level: number
  eidolon: number
  element: string
  portrait: string
  lightCone?: RosterLightCone
}

export function importCharacterRoster(accountId: string, payload: string) {
  return invokeTauri<RosterCharacter[]>('import_character_roster', {
    input: { accountId, payload },
  })
}

export function getCharacterRoster(accountId: string) {
  return invokeTauri<RosterCharacter[]>('get_character_roster', {
    input: { accountId },
  })
}
