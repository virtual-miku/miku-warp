import { useState } from 'react'
import { UserRound } from 'lucide-react'
import { getCatalogAssetUrl } from '../../warp-history/data/catalog-assets'

type AccountAvatarProps = {
  avatarPath?: string
  fallbackSize?: number
}

export function AccountAvatar({
  avatarPath,
  fallbackSize = 20,
}: AccountAvatarProps) {
  const [erroredAvatarPath, setErroredAvatarPath] = useState<string>()
  const avatarUrl = getCatalogAssetUrl(avatarPath)
  const shouldShowImage = avatarUrl && avatarPath !== erroredAvatarPath

  if (shouldShowImage) {
    return (
      <img
        alt=""
        loading="lazy"
        onError={() => {
          setErroredAvatarPath(avatarPath)
        }}
        src={avatarUrl}
      />
    )
  }

  return <UserRound size={fallbackSize} aria-hidden="true" />
}
