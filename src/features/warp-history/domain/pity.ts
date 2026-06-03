import type { WarpPull } from './warp-pull'

export type PitySummary = {
  totalPulls: number
  currentFourStarPity: number
  currentFiveStarPity: number
  fourStarCount: number
  fiveStarCount: number
  lastFourStarName?: string
  lastFiveStarName?: string
}

export function annotatePityAtPull(pulls: WarpPull[]): WarpPull[] {
  const annotatedPulls = pulls.map((pull) => ({ ...pull }))
  const chronologicalPulls = annotatedPulls
    .map((pull, index) => ({ pull, index }))
    .sort((left, right) => {
      const timeDifference =
        new Date(left.pull.pulledAt).getTime() -
        new Date(right.pull.pulledAt).getTime()

      return timeDifference === 0 ? left.index - right.index : timeDifference
    })
  let fourStarPity = 0
  let fiveStarPity = 0

  for (const { pull } of chronologicalPulls) {
    fourStarPity += 1
    fiveStarPity += 1

    if (pull.rarity === 5) {
      pull.pityFourAtPull ??= fourStarPity
      pull.pityFiveAtPull ??= fiveStarPity
      fourStarPity = 0
      fiveStarPity = 0
    } else if (pull.rarity === 4) {
      pull.pityFourAtPull ??= fourStarPity
      fourStarPity = 0
    }
  }

  return annotatedPulls
}

export function calculatePitySummary(pulls: WarpPull[]): PitySummary {
  const sortedPulls = [...pulls].sort(
    (left, right) =>
      new Date(left.pulledAt).getTime() - new Date(right.pulledAt).getTime(),
  )

  return sortedPulls.reduce<PitySummary>(
    (summary, pull) => {
      const nextSummary = {
        ...summary,
        totalPulls: summary.totalPulls + 1,
        currentFourStarPity: summary.currentFourStarPity + 1,
        currentFiveStarPity: summary.currentFiveStarPity + 1,
      }

      if (pull.rarity === 5) {
        nextSummary.fiveStarCount += 1
        nextSummary.lastFiveStarName = pull.itemName
        nextSummary.currentFiveStarPity = 0
        nextSummary.currentFourStarPity = 0
      }

      if (pull.rarity === 4) {
        nextSummary.fourStarCount += 1
        nextSummary.lastFourStarName = pull.itemName
        nextSummary.currentFourStarPity = 0
      }

      return nextSummary
    },
    {
      totalPulls: 0,
      currentFourStarPity: 0,
      currentFiveStarPity: 0,
      fourStarCount: 0,
      fiveStarCount: 0,
    },
  )
}
