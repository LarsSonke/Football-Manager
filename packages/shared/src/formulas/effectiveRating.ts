import type { PlayerInstanceState } from '../types'

export interface EffectiveRatingInput extends PlayerInstanceState {
  overall: number
}

export function effectiveRating(
  player: EffectiveRatingInput,
  tacticalFit: number,  // negative = extreme cross-role (e.g. GK playing outfield)
): number {
  const moraleModifier  = (player.morale  - 70) * 0.1
  const formModifier    = (player.form    - 70) * 0.075
  const fitnessModifier = player.fitness >= 70 ? 0 : (player.fitness - 70) * 0.15
  const injuryModifier  = player.injured ? -20 : 0

  // tacticalFit < 0 signals a severe cross-role mismatch (GK ↔ outfield): apply ~40% reduction
  const baseRating = tacticalFit < 0
    ? player.overall * 0.60
    : player.overall + (tacticalFit - 0.7) * 10

  const raw = baseRating + moraleModifier + formModifier + fitnessModifier + injuryModifier
  return Math.max(40, Math.min(99, raw))
}

export function tacticFitScore(
  playerPosition: string,
  lineupPosition: string,
  trainedPosition?: string | null,
): number {
  if (playerPosition === lineupPosition) return 1.0
  // Trained position: better than adjacent but not natural
  if (trainedPosition && trainedPosition === lineupPosition) return 0.85

  const adjacencyMap: Record<string, string[]> = {
    ST:  ['CF', 'LW', 'RW'],
    CF:  ['ST', 'CAM', 'LW', 'RW'],
    LW:  ['LM', 'CF', 'CAM'],
    RW:  ['RM', 'CF', 'CAM'],
    CAM: ['CM', 'CF', 'LW', 'RW'],
    CM:  ['CAM', 'CDM', 'LM', 'RM'],
    LM:  ['LW', 'CM'],
    RM:  ['RW', 'CM'],
    CDM: ['CM', 'CB'],
    CB:  ['CDM', 'LB', 'RB'],
    LB:  ['CB', 'LM'],
    RB:  ['CB', 'RM'],
    GK:  [],
  }

  const adjacent = adjacencyMap[playerPosition] ?? []
  if (adjacent.includes(lineupPosition)) return 0.7

  // GK playing outfield or outfield playing GK: return negative to signal extreme mismatch
  if (playerPosition === 'GK' || lineupPosition === 'GK') return -1.0

  return 0.5
}
