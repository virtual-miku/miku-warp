export const bannerDefinitions = [
  { type: 'departure', label: 'Beginner (Departure)' },
  { type: 'standard', label: 'Standard' },
  { type: 'character_event', label: 'Character Event' },
  { type: 'light_cone_event', label: 'Light Cone Event' },
  { type: 'collaboration_character', label: 'Collab Character' },
  { type: 'collaboration_light_cone', label: 'Collab Light Cone' },
] as const

export type BannerType = (typeof bannerDefinitions)[number]['type']
export type BannerFilterType = 'all' | BannerType

export function getBannerLabel(type: BannerType) {
  return bannerDefinitions.find((banner) => banner.type === type)?.label ?? type
}

export function getBannerFilterLabel(type: BannerFilterType) {
  return type === 'all' ? 'All' : getBannerLabel(type)
}
