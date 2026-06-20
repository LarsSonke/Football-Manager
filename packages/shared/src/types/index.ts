export type Position =
  | 'GK'
  | 'CB' | 'LB' | 'RB'
  | 'CDM' | 'CM' | 'CAM' | 'LM' | 'RM'
  | 'LW' | 'RW' | 'CF' | 'ST'

export type LeagueStatus = 'SETUP' | 'DRAFTING' | 'ACTIVE' | 'FINISHED'
export type DraftType = 'SNAKE' | 'AUCTION'
export type DraftStatus = 'PENDING' | 'ACTIVE' | 'COMPLETED'
export type MatchStatus = 'SCHEDULED' | 'SIMULATED'
export type EventType = 'GOAL' | 'OWN_GOAL' | 'YELLOW_CARD' | 'RED_CARD' | 'SUBSTITUTION' | 'PENALTY_MISS'
export type TacticStyle = 'possession' | 'counter' | 'pressing' | 'lowblock'

export interface PlayerBase {
  id: string
  name: string
  nationality: string | null
  position: Position
  age: number
  overall: number
  pace: number
  shooting: number
  passing: number
  dribbling: number
  defending: number
  physical: number
  preferredRoles: string[]
  baseValue: number
  photoUrl: string | null
}

export interface PlayerInstanceState {
  morale: number    // 0–100
  form: number      // 0–100
  fitness: number   // 0–100
  injured: boolean
}

export interface TacticConfig {
  formation: string          // e.g. "4-3-3"
  style: TacticStyle
  pressingIntensity: number  // 0–100
  defensiveLine: number      // 0–100
  width: number              // 0–100
}

export interface LineupSlot {
  instanceId: string
  position: Position
}

// ─── Socket.io event payloads ─────────────────────────────────────────────────

export interface DraftPickEvent {
  pick: {
    clubId: string
    playerId: string
    round: number
    pickNumber: number
    price: number
  }
  nextClubId: string | null
  draftComplete: boolean
}

export interface MatchdayCompleteEvent {
  matchday: number
  results: MatchResult[]
}

export interface TeamMatchStats {
  shots: number
  shotsOnTarget: number
  xG: number
  possession: number   // 0–100 percentage
  yellowCards: number
  redCards: number
}

export interface MatchResult {
  matchId: string
  homeClubId: string
  awayClubId: string
  homeScore: number
  awayScore: number
  stats?: { home: TeamMatchStats; away: TeamMatchStats }
}
