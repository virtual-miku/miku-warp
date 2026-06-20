import avatarCatalog from './generated/account-avatar-options.json'

export type AccountAvatarOption = {
  id: string
  label: string
  path: string
}

export const accountAvatarOptions =
  avatarCatalog.avatars satisfies AccountAvatarOption[]
