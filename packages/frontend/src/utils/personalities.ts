export interface PersonalityInfo {
  label: string
  description: string
  color: string // badge accent color
}

export const PERSONALITY_MAP: Record<string, PersonalityInfo> = {
  PROFESSIONAL:      { label: 'Professional',      color: '#4ade80', description: 'Maintains composure under pressure. Morale stays stable.' },
  LEADER:            { label: 'Leader',             color: '#facc15', description: 'Raises the mood of teammates. Captain material.' },
  MENTOR:            { label: 'Mentor',             color: '#a78bfa', description: 'Nurtures younger players. Boosts development of squad.' },
  BIG_GAME_PLAYER:   { label: 'Big Game Player',    color: '#f97316', description: 'Rises to the occasion in cup matches and high stakes games.' },
  CLUTCH:            { label: 'Clutch',             color: '#e5202f', description: 'Scores when it matters most. Form surges after late goals.' },
  TEMPERAMENTAL:     { label: 'Temperamental',      color: '#f87171', description: 'Passionate but volatile. Prone to disciplinary issues.' },
  LOYAL:             { label: 'Loyal',              color: '#34d399', description: 'Committed to the badge. Won\'t push for a transfer.' },
  AMBITIOUS:         { label: 'Ambitious',          color: '#60a5fa', description: 'Driven to win trophies. Morale dips if results stagnate.' },
  INJURY_PRONE:      { label: 'Injury Prone',       color: '#fb923c', description: 'Picks up knocks more easily. Needs careful rotation.' },
  SHOWMAN:           { label: 'Showman',            color: '#c084fc', description: 'Loves the spotlight. Morale spikes after scoring.' },
  CONSISTENT:        { label: 'Consistent',         color: '#22d3ee', description: 'Rarely has a bad game. Morale holds steady regardless of results.' },
  CONFIDENCE_PLAYER: { label: 'Confidence Player',  color: '#fbbf24', description: 'Feeds off good form. Fragile in poor runs.' },
  LATE_BLOOMER:      { label: 'Late Bloomer',       color: '#86efac', description: 'Peaks later than most. Development continues into late 20s.' },
  FAST_LEARNER:      { label: 'Fast Learner',       color: '#67e8f9', description: 'Adapts quickly. Position training costs 30% less.' },
  HARD_WORKER:       { label: 'Hard Worker',        color: '#a3e635', description: 'Never stops running. Recovers fitness faster.' },
  MERCENARY:         { label: 'Mercenary',          color: '#94a3b8', description: 'Contract driven. Morale drops if they feel undervalued.' },
  TEAM_PLAYER:       { label: 'Team Player',        color: '#4ade80', description: 'Puts the collective first. Morale rises after assists.' },
  SELFISH:           { label: 'Selfish',            color: '#f43f5e', description: 'Wants individual glory. Can be disruptive but dangerous.' },
  EMOTIONAL:         { label: 'Emotional',          color: '#fb7185', description: 'Wears heart on sleeve. Morale swings are more extreme.' },
  ICE_COLD:          { label: 'Ice Cold',           color: '#bae6fd', description: 'Nerves of steel. Composure never falters under pressure.' },
}

export function getPersonalityInfo(type: string): PersonalityInfo {
  return PERSONALITY_MAP[type] ?? { label: type, color: '#94a3b8', description: '' }
}

export function getFanMoodInfo(mood: number): { stars: number; label: string; commentary: string } {
  if (mood >= 90) return { stars: 5, label: 'Ecstatic',   commentary: 'The supporters are absolutely loving life. This is a golden era for the club.' }
  if (mood >= 80) return { stars: 4, label: 'Delighted',  commentary: 'The fans are buzzing. The football has been brilliant and the results back it up.' }
  if (mood >= 70) return { stars: 4, label: 'Happy',      commentary: 'Supporters are satisfied with the direction of the club. Good times at the ground.' }
  if (mood >= 60) return { stars: 3, label: 'Content',    commentary: 'The fans are broadly positive, though there is always room to dream bigger.' }
  if (mood >= 50) return { stars: 3, label: 'Neutral',    commentary: 'Supporters are neither excited nor disappointed. They expect better going forward.' }
  if (mood >= 40) return { stars: 2, label: 'Frustrated', commentary: 'The patience of the supporters is wearing thin. Results need to improve soon.' }
  if (mood >= 30) return { stars: 2, label: 'Unhappy',    commentary: 'Real discontent in the stands. The supporters are calling for answers.' }
  if (mood >= 20) return { stars: 1, label: 'Angry',      commentary: 'The mood has turned. Vocal protests are growing. Something must change.' }
  return               { stars: 1, label: 'Furious',     commentary: 'Full crisis mode. The supporters have had enough. Decisive action needed.' }
}
