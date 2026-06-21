import { useState } from 'react'
import { UserRound } from 'lucide-react'
import { getCatalogAssetUrl } from '../../warp-history/data/catalog-assets'

const DEFAULT_ACCOUNT_AVATAR_PATH =
  '/icon/avatar/UI_Message_Contacts_Anonymous.png'

type AccountAvatarProps = {
  avatarPath?: string
  fallbackSize?: number
}

export function AccountAvatar({
  avatarPath,
  fallbackSize = 20,
}: AccountAvatarProps) {
  const [erroredAvatarPath, setErroredAvatarPath] = useState<string>()
  const visibleAvatarPath = avatarPath ?? DEFAULT_ACCOUNT_AVATAR_PATH
  const avatarUrl = getCatalogAssetUrl(visibleAvatarPath)
  const shouldShowImage =
    avatarUrl && visibleAvatarPath !== erroredAvatarPath

  if (shouldShowImage) {
    return (
      <img
        alt=""
        loading="lazy"
        onError={() => {
          setErroredAvatarPath(visibleAvatarPath)
        }}
        src={avatarUrl}
      />
    )
  }

  return <UserRound size={fallbackSize} aria-hidden="true" />
}
