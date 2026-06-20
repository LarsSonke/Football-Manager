import type { PlayerInstanceState } from '../types'

export interface EffectiveRatingInput extends PlayerInstanceState {
  overall: number
}

export function effectiveRating(
  player: EffectiveRatingInput,
  tacticalFit: number,  // 0.0–1.0
): number {
  const moraleModifier  = (player.morale  - 70) * 0.1
  const formModifier    = (player.form    - 70) * 0.075
  const fitnessModifier = player.fitness >= 70 ? 0 : (player.fitness - 70) * 0.15
  const tacticModifier  = (tacticalFit - 0.7) * 10
  const injuryModifier  = player.injured ? -20 : 0

  const raw =
    player.overall +
    moraleModifier +
    formModifier +
    fitnessModifier +
    tacticModifier +
    injuryModifier

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

  if (playerPosition === 'GK' || lineupPosition === 'GK') return 0.2

  return 0.5
}
