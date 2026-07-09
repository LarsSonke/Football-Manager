export type { PlayerData } from '../League/types'

export interface AuctionPlayer {
  id: string
  name: string
  position: string
  overall: number
  potential: number
  age: number
  nationality: string | null
  baseValue: number
  photoUrl: string | null
  pace: number
  shooting: number
  passing: number
  dribbling: number
  defending: number
  physical: number
  positions?: string[]
  preferredRoles?: string[]
}

export type AuctionStatus = 'SCHEDULED' | 'OPEN' | 'WON' | 'UNSOLD'

export interface AuctionSummary {
  id: string
  instanceId: string
  player: AuctionPlayer
  openingBid: number
  currentBid: number
  winnerClubId: string | null
  releasedAt: string
  endsAt: string
  status: AuctionStatus
  bidCount: number
  myBid: number | null
  myMaxBid: number | null
  isLeading: boolean
  isWatching: boolean
}

export interface BudgetStats {
  totalBudget: number
  reservedBudget: number
  availableBudget: number
  wageBill: number
  wageCap: number
}

export interface WindowState {
  id: string
  status: 'PENDING' | 'OPEN' | 'CLOSED'
  opensAt: string | null
  scheduled: number
  open: number
  won: number
  unsold: number
}

export interface MarketPageData {
  window: WindowState
  budgetStats: BudgetStats | null
  myClubId: string | null
}

export interface ClubInfo {
  id: string
  name: string
  budget: number
  isAI: boolean
  user: { id: string; username: string } | null
}
