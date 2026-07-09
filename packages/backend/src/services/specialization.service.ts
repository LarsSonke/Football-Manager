export type SpecializationType =
  | 'YOUTH_DEVELOPER'
  | 'NEGOTIATOR'
  | 'FITNESS_GURU'
  | 'SCOUT_MASTER'
  | 'MOTIVATOR'
  | 'TACTICAL_GENIUS'
  | 'FINANCIAL_EXPERT'
  | 'SET_PIECE_SPECIALIST'
  | 'PSYCHOLOGIST'
  | 'RISK_TAKER'

export const VALID_SPECIALIZATIONS: SpecializationType[] = [
  'YOUTH_DEVELOPER', 'NEGOTIATOR', 'FITNESS_GURU', 'SCOUT_MASTER', 'MOTIVATOR',
  'TACTICAL_GENIUS', 'FINANCIAL_EXPERT', 'SET_PIECE_SPECIALIST', 'PSYCHOLOGIST', 'RISK_TAKER',
]

export interface SpecializationDef {
  type: SpecializationType
  label: string
  emoji: string
  description: string
  effects: string[]
}

export const SPECIALIZATION_DEFS: SpecializationDef[] = [
  {
    type: 'YOUTH_DEVELOPER',
    label: 'Youth Developer',
    emoji: '🌱',
    description: 'Young players flourish under your coaching. Your academy is the envy of the league.',
    effects: ['Players aged ≤22 gain +1 form per day', 'Encourages building through youth'],
  },
  {
    type: 'NEGOTIATOR',
    label: 'Negotiator',
    emoji: '🤝',
    description: 'You drive a hard bargain at every table. Transfer fees bend to your advantage.',
    effects: ['15% discount on all player purchases', 'Encourages active transfer market play'],
  },
  {
    type: 'FITNESS_GURU',
    label: 'Fitness Guru',
    emoji: '💪',
    description: 'Recovery is your obsession. Players leave every session fresher than they arrived.',
    effects: ['Fitness recovery rate ×1.5 per day', 'Encourages high-press, high-tempo play'],
  },
  {
    type: 'SCOUT_MASTER',
    label: 'Scout Master',
    emoji: '🔭',
    description: 'You read players like a book. Hidden traits surface faster in your dressing room.',
    effects: ['Personality discovery chance ×1.5', 'Encourages deep squad knowledge'],
  },
  {
    type: 'MOTIVATOR',
    label: 'Motivator',
    emoji: '🔥',
    description: 'Your team talks are legendary. Players bounce back from defeat faster than anyone.',
    effects: ['Morale recovery rate ×1.5 per day', 'Encourages resilience-first management'],
  },
  {
    type: 'TACTICAL_GENIUS',
    label: 'Tactical Genius',
    emoji: '📐',
    description: 'Your match plans are surgical. Tactical adjustments produce noticeably stronger phase scores.',
    effects: ['+8% attack & defence phase strength in-match', 'Encourages detail-oriented tactic setup'],
  },
  {
    type: 'FINANCIAL_EXPERT',
    label: 'Financial Expert',
    emoji: '💰',
    description: 'Your commercial instincts turn a football club into a money machine.',
    effects: ['+25% match day and commercial income', 'Encourages stadium and marketing investment'],
  },
  {
    type: 'SET_PIECE_SPECIALIST',
    label: 'Set Piece Specialist',
    emoji: '🎯',
    description: 'Dead-ball situations are your weapon. Corners and free kicks become genuine threats.',
    effects: ['10% chance of high-quality set-piece chance per shot', 'Encourages patient, width-based play'],
  },
  {
    type: 'PSYCHOLOGIST',
    label: 'Psychologist',
    emoji: '🧠',
    description: 'You know how to keep players grounded during the darkest runs.',
    effects: ['Squad morale never drops below 50', 'Encourages risk-taking, knowing the floor is safe'],
  },
  {
    type: 'RISK_TAKER',
    label: 'Risk Taker',
    emoji: '🎲',
    description: 'You play to win big. Matches produce more extreme results  -  glorious or disastrous.',
    effects: ['±20% xG variance on all chances', 'Encourages all-or-nothing tactics'],
  },
]

export function getSpecializationDef(type: string): SpecializationDef | undefined {
  return SPECIALIZATION_DEFS.find(d => d.type === type)
}
