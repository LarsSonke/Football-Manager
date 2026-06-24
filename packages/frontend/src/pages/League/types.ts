import { useEffect, useState } from 'react'
import { type LogoConfig } from '../../components/ClubBadge'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PlayerData {
  id: string; name: string; nationality: string | null; position: string
  age: number; overall: number; potential: number
  pace: number; shooting: number; passing: number
  dribbling: number; defending: number; physical: number
  // Detailed sub-stats
  atkCrossing: number; atkFinishing: number; atkHeadAccuracy: number
  atkShortPassing: number; atkVolleys: number
  sklDribbling: number; sklCurve: number; sklFkAccuracy: number
  sklLongPassing: number; sklBallControl: number
  movAcceleration: number; movSprintSpeed: number; movAgility: number
  movReactions: number; movBalance: number
  powShotPower: number; powJumping: number; powStamina: number
  powStrength: number; powLongShots: number
  menAggression: number; menInterceptions: number; menPositioning: number
  menVision: number; menPenalties: number; menComposure: number
  defMarkingAware: number; defStandingTackle: number; defSlidingTackle: number
  gkDiving: number; gkHandling: number; gkKicking: number
  gkPositioning: number; gkReflexes: number; gkSpeed: number
  weakFoot: number; skillMoves: number; heightCm: number
  positions: string[]
  preferredRoles: string[]; baseValue: number
  photoUrl: string | null
}

export interface SquadPlayer {
  id: string; playerId: string; player: PlayerData
  morale: number; form: number; fitness: number; injured: boolean; injuryDaysLeft: number
  suspendedMatchday: number | null; yellowCards: number; trainedPosition: string | null; wage: number
  boosts?: Array<{ stat: string }>
}

export interface LineupSlot { instanceId: string; position: string; role?: string }
export interface SubSlot {
  outInstanceId: string
  inInstanceId: string
  condition: { type: 'minute' | 'fitness'; value: number }
}
export interface TacticData {
  formation: string
  style: 'possession' | 'counter' | 'pressing' | 'lowblock'
  pressingIntensity: number
  defensiveLine: number
  width: number
  lineup: LineupSlot[]
  subs?: SubSlot[]
  customSlots?: { position: string; x: number; y: number }[]
}

export type CustomSlot = { id: string; position: string; x: number; y: number }

export interface ClubData {
  id: string; name: string; budget: number; isAI: boolean
  wins: number; draws: number; losses: number
  goalsFor: number; goalsAgainst: number; points: number
  physioLevel: number
  scoutLevel: number; coachLevel: number; trainerLevel: number; marketingLevel: number
  stadiumLevel: number; trainingLevel: number; kitLevel: number; vipLevel: number
  logoConfig: LogoConfig | null
  kitConfig: unknown | null
  user: { id: string; username: string } | null
  squad: SquadPlayer[]
  tactic: TacticData | null
}

export interface LeagueData {
  id: string; name: string; status: string
  currentDay: number; seasonLength: number; startingBudget: number
  maxClubs: number; matchTime: string; squadSize: number
  clubs: ClubData[]
  draftSession: { id: string; status: string; currentRound: number; roundsTotal: number; pickOrder: string[]; currentPick: number } | null
  history?: SeasonSnapshot[] | null
  hasCup?: boolean
  transferWindowOpen?: boolean
  cupBracket?: unknown
  competitionType?: string
}

export interface MatchData {
  id: string; matchday: number; status: string
  homeClubId: string; awayClubId: string
  homeScore: number | null; awayScore: number | null
  homeClub: { id: string; name: string }
  awayClub: { id: string; name: string }
}

export interface SeasonSnapshot {
  endedOnDay: number
  clubs: Array<{
    id: string; name: string; isAI: boolean
    wins: number; draws: number; losses: number
    goalsFor: number; goalsAgainst: number; points: number
  }>
}

export interface GrowthChange {
  playerId: string; playerName: string; position: string; clubId: string | null
  overallWas: number; overallNow: number; ageWas: number
}

export interface LiveMatchState {
  matchId: string
  homeClub: { id: string; name: string }
  awayClub: { id: string; name: string }
  homeScore: number
  awayScore: number
  events: Array<{ minute: number; eventType: string; detail: unknown; homeScore: number; awayScore: number }>
  status: 'live' | 'ended'
}

export type Tab = 'overview' | 'squad' | 'fixtures' | 'standings' | 'stats' | 'tactics' | 'transfers' | 'messages' | 'manage' | 'management' | 'cup'

export interface StatEntry {
  instanceId: string
  playerName: string
  position: string
  clubId: string | null
  clubName: string
  clubLogoConfig: LogoConfig | null
  goals: number
  assists: number
  appearances: number
  avgRating: number
  cleanSheets: number
}

export interface AwardEntry {
  instanceId: string
  playerName: string
  position: string
  clubId: string | null
  clubName: string
  clubLogoConfig: LogoConfig | null
  clubKitConfig: unknown | null
  photoUrl: string | null
  rating: number
  goals: number
  assists: number
}

export interface MatchdayAwards {
  matchday: number
  teamOfTheWeek: AwardEntry[]
  motm: AwardEntry | null
  topScorer: { instanceId: string; playerName: string; goals: number; clubName: string; clubLogoConfig: LogoConfig | null } | null
  topAssist: { instanceId: string; playerName: string; assists: number; clubName: string; clubLogoConfig: LogoConfig | null } | null
}

export type StatCategory = 'goals' | 'assists' | 'rating' | 'appearances' | 'cleanSheets'

export interface MessageData {
  id: string; leagueId: string
  fromUserId: string; toUserId: string
  text: string | null; type: 'TEXT' | 'TRANSFER_OFFER'
  instanceId: string | null; offerPrice: number | null
  offerStatus: 'PENDING' | 'ACCEPTED' | 'REJECTED' | null
  createdAt: string
  fromUser: { id: string; username: string }
  toUser: { id: string; username: string }
}

export interface InboxEntry {
  user: { id: string; username: string } | null
  clubName: string
  lastMessage: MessageData | null
}

export interface LeagueChatMessage {
  id: string; leagueId: string
  fromUserId: string; text: string; createdAt: string
  fromUser: { id: string; username: string }
}

export interface FreeAgent {
  id: string; playerId: string; player: PlayerData
  morale: number; form: number; fitness: number
  injured: boolean; injuryDaysLeft: number
  trainedPosition: string | null; wage: number
}

export interface TransferListing {
  id: string
  instanceId: string
  askingPrice: number
  sellerClub: { id: string; name: string }
  instance: {
    id: string; morale: number; form: number; fitness: number
    injured: boolean; injuryDaysLeft: number
    yellowCards: number; suspendedMatchday: number | null
    player: PlayerData
  }
}

export interface AvailableDeal {
  type: string; sponsorName: string; sponsorEmoji: string
  mission: string; params: object; cost: number; reward: number
}

export interface ActiveDeal {
  id: string; sponsorName: string; sponsorEmoji: string
  mission: string; type: string; cost: number; reward: number
  status: string; targetMatchday: number
}

export interface CupBracketMatch {
  matchId: string | null
  homeClubId: string | null
  awayClubId: string | null
  winnerId: string | null
  isBye: boolean
}

export interface CupRoundDef {
  name: string
  code: string
  matchday: number
  matches: CupBracketMatch[]
}

export interface CupBracketData {
  rounds: CupRoundDef[]
}

// ─── Mobile hook ─────────────────────────────────────────────────────────────

export function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(() => window.innerWidth < 768)
  useEffect(() => {
    const fn = () => setMobile(window.innerWidth < 768)
    window.addEventListener('resize', fn)
    return () => window.removeEventListener('resize', fn)
  }, [])
  return mobile
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

export function getBadgeColor(name: string): string {
  const palette = ['#27cdff','#36e27e','#e9c46a','#e8806a','#f97316','#a78bfa','#34d399','#fbbf24']
  let h = 0
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  return palette[Math.abs(h) % palette.length]
}

export function posClass(pos: string): string {
  if (pos === 'GK') return 'pos pos-gk'
  if (['CB','LB','RB'].includes(pos)) return 'pos pos-def'
  if (['CDM','CM','CAM','LM','RM'].includes(pos)) return 'pos pos-mid'
  return 'pos pos-att'
}

export function utcTimeToLocal(utcTime: string): string {
  const [hh, mm] = utcTime.split(':').map(Number)
  const now = new Date()
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hh, mm, 0))
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export const POS_ORDER = ['GK','CB','LB','RB','CDM','CM','CAM','LM','RM','LW','RW','CF','ST']

export function squadAvgOvr(club: ClubData): number | null {
  if (!club.squad?.length) return null
  const top = [...club.squad].sort((a, b) => b.player.overall - a.player.overall).slice(0, 11)
  return Math.round(top.reduce((s, p) => s + p.player.overall, 0) / top.length)
}
