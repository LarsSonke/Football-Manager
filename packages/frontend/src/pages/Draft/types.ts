// Draft-specific types
// PlayerData is re-exported from the shared League types (superset of what Draft needs)
export type { PlayerData } from '../League/types'
import type { PlayerData } from '../League/types'

export interface AvailablePlayer {
  id: string; playerId: string; player: PlayerData
}

export interface PickRecord {
  id: string; round: number; pickNumber: number; price: number; playerId: string
  club: { id: string; name: string }
}

export interface AuctionRound {
  nominatorIdx: number
  instanceId: string | null
  playerId: string | null
  highBid: number
  highBidderId: string | null
  endsAt: string | null
  budgets: Record<string, number>
}

export interface DraftSession {
  id: string; status: string; type: string
  currentRound: number; roundsTotal: number
  currentPick: number; pickOrder: string[]
  pickTimeLimit: number
  picks: PickRecord[]
  auctionState?: AuctionRound | null
}

export interface PickedPlayer {
  id: string; name: string; position: string; overall: number; photoUrl?: string | null
}

export interface DraftState {
  session: DraftSession
  availablePlayers: AvailablePlayer[]
  currentClubId: string | null
  pickedPlayerMap: Record<string, PickedPlayer>
}

export interface ClubInfo {
  id: string; name: string; budget: number; isAI: boolean
  user: { id: string; username: string } | null
}
