export const FAN_FAV_THRESHOLD = 50   // fan favourite
export const FAN_LEGEND_THRESHOLD = 100 // club legend

export type FanFavStatus = 'none' | 'favourite' | 'legend'

export interface FanMoodInfo {
  mood: number
  stars: number // 1–5
  label: string
  commentary: string
}

export function getFanFavStatus(score: number): FanFavStatus {
  if (score >= FAN_LEGEND_THRESHOLD) return 'legend'
  if (score >= FAN_FAV_THRESHOLD) return 'favourite'
  return 'none'
}

export function getFanMoodInfo(mood: number): FanMoodInfo {
  if (mood >= 90) return { mood, stars: 5, label: 'Ecstatic',    commentary: 'The supporters are absolutely loving life right now. This is a golden era for the club.' }
  if (mood >= 80) return { mood, stars: 4, label: 'Delighted',   commentary: 'The fans are buzzing. The football has been brilliant and the results back it up.' }
  if (mood >= 70) return { mood, stars: 4, label: 'Happy',       commentary: 'Supporters are satisfied with the direction of the club. Good times at the ground.' }
  if (mood >= 60) return { mood, stars: 3, label: 'Content',     commentary: 'The fans are broadly positive, though there is always room to dream bigger.' }
  if (mood >= 50) return { mood, stars: 3, label: 'Neutral',     commentary: 'Supporters are neither excited nor disappointed. They expect better going forward.' }
  if (mood >= 40) return { mood, stars: 2, label: 'Frustrated',  commentary: 'The patience of the supporters is wearing thin. Results need to improve soon.' }
  if (mood >= 30) return { mood, stars: 2, label: 'Unhappy',     commentary: 'Real discontent in the stands. The supporters are calling for answers.' }
  if (mood >= 20) return { mood, stars: 1, label: 'Angry',       commentary: 'The mood has turned. Vocal protests are growing. Something must change.' }
  return               { mood, stars: 1, label: 'Furious',       commentary: 'Full crisis mode. The supporters have had enough. Decisive action is needed immediately.' }
}

export function computeFanMoodDelta(params: {
  isHome: boolean
  myScore: number
  oppScore: number
  myGoals: number
  isCup?: boolean
}): number {
  const { isHome, myScore, oppScore, myGoals, isCup } = params

  let delta = 0

  if (myScore > oppScore) {
    delta = isHome ? 5 : 7  // away wins generate extra excitement
    if (isCup) delta += 3
  } else if (myScore === oppScore) {
    delta = isCup ? -4 : -2  // cup draws are worse
  } else {
    delta = isHome ? -7 : -5  // home losses hurt more
    if (isCup) delta -= 3
  }

  // Goals scored boost the mood regardless of result (fans love attacking football)
  delta += Math.round(myGoals * 0.8)

  return Math.max(-14, Math.min(14, delta))
}

// Fan mood income multiplier: 0.85x at mood 0 → 1.15x at mood 100
export function fanMoodIncomeMultiplier(mood: number): number {
  return 1 + (mood - 60) * 0.0025
}
