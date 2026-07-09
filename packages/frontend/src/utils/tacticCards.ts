export interface TacticalFocusDef {
  id: string
  label: string
  emoji: string
  color: string
  description: string
  effects: string[]
  warning?: string
}

export const TACTICAL_FOCUS_DEFS: TacticalFocusDef[] = [
  {
    id: 'attack_wings',
    label: 'Attack the Wings',
    emoji: '↔',
    color: '#36e27e',
    description: 'Push wide players forward. More crosses, more width.',
    effects: ['Chance creation +8%'],
    warning: 'Weak against compact defences',
  },
  {
    id: 'through_middle',
    label: 'Play Through the Middle',
    emoji: '↑',
    color: '#27cdff',
    description: 'CAM and CM become more important. Higher through-ball frequency.',
    effects: ['Midfield control +6%', 'Chance creation +4%'],
  },
  {
    id: 'fast_counter',
    label: 'Fast Counter',
    emoji: '⚡',
    color: '#e8c84a',
    description: 'Conserve energy in possession, then explode on transition.',
    effects: ['Attack +6%'],
    warning: 'Chance quality −6%',
  },
  {
    id: 'patient_buildup',
    label: 'Patient Build-up',
    emoji: '⏳',
    color: '#a78bfa',
    description: 'High possession, more passes, fewer risky attacks.',
    effects: ['Midfield +8%', 'Chance creation +5%'],
    warning: 'Attack −4%',
  },
  {
    id: 'high_press',
    label: 'High Press',
    emoji: '🔥',
    color: '#cc3333',
    description: 'Force mistakes high up the pitch. More turnovers, more fatigue.',
    effects: ['Pressing +15%'],
    warning: 'Stamina drain ↑',
  },
  {
    id: 'park_bus',
    label: 'Park the Bus',
    emoji: '🚌',
    color: '#94a3b8',
    description: 'Compact and impenetrable. Very hard to break down.',
    effects: ['Defense +12%'],
    warning: 'Attack −15%',
  },
]

export interface TacticalCardDef {
  id: string
  label: string
  emoji: string
  color: string
  description: string
  effects: string[]
  warning?: string
}

export const TACTICAL_CARD_DEFS: TacticalCardDef[] = [
  {
    id: 'overlap_fullbacks',
    label: 'Overlap Fullbacks',
    emoji: '🔄',
    color: '#36e27e',
    description: 'Fullbacks join attacks more often. More crosses, more width.',
    effects: ['Chance creation +6%'],
    warning: 'Space in behind',
  },
  {
    id: 'target_weak_link',
    label: 'Target the Weak Link',
    emoji: '🎯',
    color: '#e8c84a',
    description: 'Attackers focus on the opponent\'s weakest defender.',
    effects: ['Finishing +8%'],
  },
  {
    id: 'high_risk_reward',
    label: 'High Risk, High Reward',
    emoji: '🎲',
    color: '#a78bfa',
    description: 'More direct passes and ambitious attacks. More chances and more turnovers.',
    effects: ['Attack +8%'],
    warning: 'Defense −6%',
  },
  {
    id: 'crowd_midfield',
    label: 'Crowd the Midfield',
    emoji: '🧱',
    color: '#27cdff',
    description: 'Better ball retention. Fewer chances from wide areas.',
    effects: ['Midfield +10%'],
    warning: 'Chance creation −6%',
  },
  {
    id: 'time_wasting',
    label: 'Time Wasting',
    emoji: '⏱',
    color: '#94a3b8',
    description: 'Effective when leading after the 75th minute. Slows the game down.',
    effects: ['Defense +10% when leading'],
  },
  {
    id: 'shoot_on_sight',
    label: 'Shoot on Sight',
    emoji: '💥',
    color: '#cc3333',
    description: 'More long-range efforts. Great with high-shooting players.',
    effects: ['Finishing +6%'],
    warning: 'Chance quality −4%',
  },
  {
    id: 'set_piece_focus',
    label: 'Set Piece Focus',
    emoji: '⚽',
    color: '#fb923c',
    description: 'Train specifically for dead-ball situations. Corners and free kicks become threats.',
    effects: ['Set piece attack +15%'],
  },
  {
    id: 'press_trap',
    label: 'Press Trap',
    emoji: '🕸',
    color: '#f43f5e',
    description: 'Invite opponents into your half, then spring the trap with numbers.',
    effects: ['Pressing +10%', 'Defense +4%'],
  },
  {
    id: 'direct_balls',
    label: 'Direct Balls Over Top',
    emoji: '📐',
    color: '#38bdf8',
    description: 'Skip the midfield with long balls. Simple and direct.',
    effects: ['Attack +5%'],
    warning: 'Midfield −10%',
  },
  {
    id: 'false_nine_drop',
    label: 'False Nine',
    emoji: '🔁',
    color: '#34d399',
    description: 'Forward drops deep to link play. Confuses the defence, opens channels.',
    effects: ['Chance creation +8%'],
    warning: 'Finishing −4%',
  },
]
