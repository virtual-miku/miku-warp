export type PityLevel = 'low' | 'medium' | 'high'

export function getPityLevel(pity: number, hardPity: number): PityLevel {
  const progress = pity / hardPity

  if (progress <= 0.5) {
    return 'low'
  }

  if (progress <= 0.75) {
    return 'medium'
  }

  return 'high'
}

export function getPityLevelClass(pity: number, hardPity: number) {
  return `pity-level-${getPityLevel(pity, hardPity)}`
}
