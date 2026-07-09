export type PersonalityType =
  | 'PROFESSIONAL' | 'LEADER' | 'MENTOR' | 'BIG_GAME_PLAYER' | 'CLUTCH'
  | 'TEMPERAMENTAL' | 'LOYAL' | 'AMBITIOUS' | 'INJURY_PRONE' | 'SHOWMAN'
  | 'CONSISTENT' | 'CONFIDENCE_PLAYER' | 'LATE_BLOOMER' | 'FAST_LEARNER'
  | 'HARD_WORKER' | 'MERCENARY' | 'TEAM_PLAYER' | 'SELFISH' | 'EMOTIONAL' | 'ICE_COLD'

export type DiscoveryTrigger =
  | 'goal' | 'lateGoal' | 'cupGoal' | 'yellowCard' | 'redCard'
  | 'training' | 'injury' | 'longService' | 'observation' | 'assist'

export interface PersonalityDef {
  type: PersonalityType
  label: string
  description: string
  rarityWeight: number // 0–1; higher = more common
  discoveryTriggers: DiscoveryTrigger[]
}

export const PERSONALITY_DEFS: PersonalityDef[] = [
  { type: 'PROFESSIONAL',      label: 'Professional',       description: 'Maintains composure under pressure. Morale rarely drops below 65.',                          rarityWeight: 0.25, discoveryTriggers: ['training', 'observation', 'longService'] },
  { type: 'LEADER',            label: 'Leader',             description: 'Raises the mood of those around them. All teammates gain morale when they lead by example.',  rarityWeight: 0.15, discoveryTriggers: ['goal', 'longService', 'observation'] },
  { type: 'MENTOR',            label: 'Mentor',             description: 'Nurtures young talent. Players aged 22 and under benefit from their presence.',               rarityWeight: 0.12, discoveryTriggers: ['training', 'longService', 'observation'] },
  { type: 'BIG_GAME_PLAYER',   label: 'Big Game Player',    description: 'Rises to the occasion. Delivers when the stakes are highest.',                               rarityWeight: 0.12, discoveryTriggers: ['goal', 'cupGoal', 'lateGoal'] },
  { type: 'CLUTCH',            label: 'Clutch',             description: 'Finds a way to score when it matters most. Form surges after late decisive goals.',          rarityWeight: 0.12, discoveryTriggers: ['lateGoal', 'goal'] },
  { type: 'TEMPERAMENTAL',     label: 'Temperamental',      description: 'Passionate but volatile. Prone to disciplinary issues and morale swings.',                   rarityWeight: 0.20, discoveryTriggers: ['yellowCard', 'redCard'] },
  { type: 'LOYAL',             label: 'Loyal',              description: 'Committed to the badge. Won\'t push for a transfer and morale stays high over time.',        rarityWeight: 0.20, discoveryTriggers: ['longService', 'observation'] },
  { type: 'AMBITIOUS',         label: 'Ambitious',          description: 'Driven to achieve trophies. Morale dips when the team underperforms.',                       rarityWeight: 0.18, discoveryTriggers: ['goal', 'observation'] },
  { type: 'INJURY_PRONE',      label: 'Injury Prone',       description: 'Picks up knocks more easily. Requires careful management and rotation.',                    rarityWeight: 0.15, discoveryTriggers: ['injury'] },
  { type: 'SHOWMAN',           label: 'Showman',            description: 'Loves the spotlight. Morale spikes after scoring and the crowd feeds off their energy.',     rarityWeight: 0.18, discoveryTriggers: ['goal', 'observation'] },
  { type: 'CONSISTENT',        label: 'Consistent',         description: 'Rarely has a bad game. Morale holds steady regardless of results.',                         rarityWeight: 0.18, discoveryTriggers: ['observation', 'training'] },
  { type: 'CONFIDENCE_PLAYER', label: 'Confidence Player',  description: 'Feeds off good form. Performance rises sharply on a winning streak, fragile otherwise.',    rarityWeight: 0.18, discoveryTriggers: ['goal', 'observation'] },
  { type: 'LATE_BLOOMER',      label: 'Late Bloomer',       description: 'Peaks later than most. Development continues well into their late twenties.',                rarityWeight: 0.12, discoveryTriggers: ['training', 'longService'] },
  { type: 'FAST_LEARNER',      label: 'Fast Learner',       description: 'Adapts quickly. Position training is 30% cheaper.',                                         rarityWeight: 0.18, discoveryTriggers: ['training', 'observation'] },
  { type: 'HARD_WORKER',       label: 'Hard Worker',        description: 'Never stops. Recovers fitness 20% faster than teammates.',                                  rarityWeight: 0.25, discoveryTriggers: ['training', 'observation'] },
  { type: 'MERCENARY',         label: 'Mercenary',          description: 'Motivated by money. Morale drops if they feel undervalued at the club.',                    rarityWeight: 0.15, discoveryTriggers: ['observation', 'longService'] },
  { type: 'TEAM_PLAYER',       label: 'Team Player',        description: 'Puts the collective first. The whole squad benefits when they lead with assists.',           rarityWeight: 0.22, discoveryTriggers: ['assist', 'observation'] },
  { type: 'SELFISH',           label: 'Selfish',            description: 'Individual glory over team success. Can be disruptive but still dangerous.',                 rarityWeight: 0.15, discoveryTriggers: ['goal', 'observation'] },
  { type: 'EMOTIONAL',         label: 'Emotional',          description: 'Wears their heart on their sleeve. Morale swings are more extreme in both directions.',      rarityWeight: 0.20, discoveryTriggers: ['yellowCard', 'observation', 'goal'] },
  { type: 'ICE_COLD',          label: 'Ice Cold',           description: 'Nerves of steel. Composure never falters under pressure.',                                   rarityWeight: 0.10, discoveryTriggers: ['lateGoal', 'goal', 'observation'] },
]

// Per-trigger discovery probability
const TRIGGER_CHANCE: Record<DiscoveryTrigger, number> = {
  goal: 0.07,
  lateGoal: 0.22,
  cupGoal: 0.15,
  yellowCard: 0.12,
  redCard: 0.28,
  training: 0.02,
  injury: 0.20,
  longService: 0.04,
  observation: 0.03,
  assist: 0.06,
}

export function assignPersonalities(): PersonalityType[] {
  const roll = Math.random()
  const count = roll < 0.35 ? 0 : roll < 0.80 ? 1 : 2
  if (count === 0) return []

  // Weighted shuffle, pick first `count` that pass their rarity roll
  const shuffled = [...PERSONALITY_DEFS].sort(() => Math.random() - 0.5)
  const selected: PersonalityType[] = []

  for (const def of shuffled) {
    if (selected.length >= count) break
    if (Math.random() < def.rarityWeight) selected.push(def.type)
  }

  // Fill remaining slots if weighted selection came up short
  if (selected.length < count) {
    for (const def of shuffled) {
      if (selected.length >= count) break
      if (!selected.includes(def.type)) selected.push(def.type)
    }
  }

  return selected.slice(0, count)
}

export function attemptDiscovery(
  hiddenPersonalities: string[],
  discoveredPersonalities: string[],
  trigger: DiscoveryTrigger,
): PersonalityType | null {
  const undiscovered = hiddenPersonalities.filter(p => !discoveredPersonalities.includes(p))
  if (undiscovered.length === 0) return null

  if (Math.random() > (TRIGGER_CHANCE[trigger] ?? 0.05)) return null

  // Prefer personalities that match the trigger
  const eligible = undiscovered.filter(p => {
    const def = PERSONALITY_DEFS.find(d => d.type === p)
    return def?.discoveryTriggers.includes(trigger)
  })

  const pool = eligible.length > 0 ? eligible : (Math.random() < 0.25 ? undiscovered : [])
  if (pool.length === 0) return null

  return pool[Math.floor(Math.random() * pool.length)] as PersonalityType
}

export function getPersonalityDef(type: string): PersonalityDef | undefined {
  return PERSONALITY_DEFS.find(d => d.type === type)
}
