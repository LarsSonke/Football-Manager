import type { Club, PlayerInstance, Player, Match } from '@prisma/client'
import { calcTeamPhase, conditionMultiplier, type LineupEntry, type TeamPhaseScores } from '@football/shared'
import type { PlayerAttrsForRoles } from '@football/shared'
import { prisma } from '../prisma'

// ─── Types ────────────────────────────────────────────────────────────────────

type FullClub = Club & { squad: (PlayerInstance & { player: Player })[] }
type FullMatch = Match & { homeClub: FullClub; awayClub: FullClub }

interface SimResult {
  matchId: string
  homeClubId: string
  awayClubId: string
  homeScore: number
  awayScore: number
  stats: { home: TeamStats; away: TeamStats }
}

interface TeamStats {
  shots: number
  shotsOnTarget: number
  xG: number
  possession: number
  yellowCards: number
  redCards: number
}

interface ShotEvent {
  minute: number
  team: 'home' | 'away'
  shooterInstanceId: string
  assisterInstanceId: string | null
  xg: number
  onTarget: boolean
  isGoal: boolean
}

interface CardEvent {
  minute: number
  team: 'home' | 'away'
  instanceId: string
  type: 'yellow' | 'red'
}

// ─── Attribute extraction ─────────────────────────────────────────────────────

function toAttrs(p: Player): PlayerAttrsForRoles {
  return {
    atkCrossing: p.atkCrossing, atkFinishing: p.atkFinishing,
    atkHeadAccuracy: p.atkHeadAccuracy, atkShortPassing: p.atkShortPassing,
    atkVolleys: p.atkVolleys,
    sklDribbling: p.sklDribbling, sklCurve: p.sklCurve,
    sklFkAccuracy: p.sklFkAccuracy, sklLongPassing: p.sklLongPassing,
    sklBallControl: p.sklBallControl,
    movAcceleration: p.movAcceleration, movSprintSpeed: p.movSprintSpeed,
    movAgility: p.movAgility, movReactions: p.movReactions, movBalance: p.movBalance,
    powShotPower: p.powShotPower, powJumping: p.powJumping, powStamina: p.powStamina,
    powStrength: p.powStrength, powLongShots: p.powLongShots,
    menAggression: p.menAggression, menInterceptions: p.menInterceptions,
    menPositioning: p.menPositioning, menVision: p.menVision,
    menPenalties: p.menPenalties, menComposure: p.menComposure,
    defMarkingAware: p.defMarkingAware, defStandingTackle: p.defStandingTackle,
    defSlidingTackle: p.defSlidingTackle,
    gkDiving: p.gkDiving, gkHandling: p.gkHandling, gkKicking: p.gkKicking,
    gkPositioning: p.gkPositioning, gkReflexes: p.gkReflexes, gkSpeed: p.gkSpeed,
    weakFoot: p.weakFoot, skillMoves: p.skillMoves, heightCm: p.heightCm,
  }
}

// ─── Lineup construction ──────────────────────────────────────────────────────

function buildLineup(club: FullClub): LineupEntry[] {
  const tactic = club.tactic as { lineup?: { instanceId: string; position: string }[] } | null
  const instanceMap = Object.fromEntries(club.squad.map(s => [s.id, s]))
  const healthy = club.squad.filter(s => !s.injured)

  let slots: { instanceId: string; position: string }[] = []

  if (tactic?.lineup?.length === 11) {
    slots = tactic.lineup.filter(s => {
      const inst = instanceMap[s.instanceId]
      return inst && !inst.injured
    })

    // Replace injured starters with best available bench players
    if (slots.length < 11) {
      const startingIds = new Set(slots.map(s => s.instanceId))
      const bench = healthy
        .filter(s => !startingIds.has(s.id))
        .sort((a, b) => b.player.overall - a.player.overall)

      const tacticPositions = (tactic.lineup ?? []).map(s => s.position)
      for (const sub of bench) {
        if (slots.length >= 11) break
        // Find an unfilled slot position
        const injuredSlot = tactic.lineup!.find(
          s => !slots.find(f => f.position === s.position && instanceMap[s.instanceId] && !instanceMap[s.instanceId].injured)
        )
        slots.push({ instanceId: sub.id, position: injuredSlot?.position ?? sub.player.position })
      }
    }
  }

  // Fallback: best 11 healthy players by overall
  if (slots.length < 11) {
    const sorted = [...healthy].sort((a, b) => b.player.overall - a.player.overall).slice(0, 11)
    slots = sorted.map(s => ({ instanceId: s.id, position: s.player.position }))
  }

  return slots.slice(0, 11).map(slot => {
    const inst = instanceMap[slot.instanceId]
    return {
      instanceId: slot.instanceId,
      assignedPosition: slot.position,
      naturalPosition: inst.player.position,
      trainedPosition: inst.trainedPosition ?? null,
      attrs: toAttrs(inst.player),
      morale: inst.morale,
      form: inst.form,
      fitness: inst.fitness,
      matchStamina: inst.player.powStamina,
    }
  })
}

// ─── Stamina drain ────────────────────────────────────────────────────────────

const STAMINA_DRAIN_BASE     = 0.22   // per minute just playing
const STAMINA_DRAIN_PRESSING = 0.12   // extra drain when team presses
const STAMINA_DRAIN_ATTACK   = 0.08   // extra drain when team attacks

function drainStamina(
  lineup: LineupEntry[],
  hasAttacked: boolean,
  pressingIntensity: number,
): void {
  const pressDrain = (pressingIntensity / 100) * STAMINA_DRAIN_PRESSING
  const atkDrain   = hasAttacked ? STAMINA_DRAIN_ATTACK : 0
  for (const e of lineup) {
    e.matchStamina = Math.max(0, e.matchStamina - STAMINA_DRAIN_BASE - pressDrain - atkDrain)
  }
}

// ─── xG & shot generation ────────────────────────────────────────────────────

type ChanceType = 'long_shot' | 'header' | 'regular' | 'cutback' | 'one_on_one'

const BASE_XG: Record<ChanceType, number> = {
  long_shot:  0.04,
  header:     0.13,
  regular:    0.12,
  cutback:    0.28,
  one_on_one: 0.40,
}

function pickChanceType(attPhase: TeamPhaseScores, defPhase: TeamPhaseScores): ChanceType {
  // Counter attacks produce more one-on-ones; build-up more cutbacks/headers.
  // Approximate from phase score ratios.
  const counterScore = Math.max(0, attPhase.attackStrength - defPhase.midfieldControl)
  const buildupScore = attPhase.chanceCreation

  const r = rand()
  if (counterScore > 15 && r < 0.10) return 'one_on_one'
  if (r < 0.30 + (buildupScore - 65) / 300)  return 'long_shot'
  if (r < 0.50) return 'header'
  if (r < 0.85) return 'regular'
  return 'cutback'
}

function calcXg(
  type: ChanceType,
  finishQuality: number,
  gkQuality: number,
  isHome: boolean,
): number {
  const base = BASE_XG[type]
  const finBonus = (finishQuality - 65) / 200 * base
  const gkPenalty = (gkQuality    - 65) / 250 * base
  const homeBonus = isHome ? 0.005 : 0
  return clamp(base + finBonus - gkPenalty + homeBonus, 0.01, 0.85)
}

// ─── Player selection helpers ─────────────────────────────────────────────────

function pickShooter(lineup: LineupEntry[]): LineupEntry {
  // Prefer attacking players; fall back to any
  const atk = lineup.filter(e => ['ST','CF','LW','RW','CAM'].includes(e.assignedPosition))
  return atk.length > 0 ? atk[Math.floor(rand() * atk.length)] : lineup[Math.floor(rand() * lineup.length)]
}

function pickAssister(lineup: LineupEntry[], shooterInstanceId: string): LineupEntry | null {
  const others = lineup.filter(e => e.instanceId !== shooterInstanceId)
  if (others.length === 0 || rand() < 0.15) return null  // 15% unassisted
  const creators = others.filter(e => ['CAM','CM','LM','RM','LW','RW'].includes(e.assignedPosition))
  const pool = creators.length > 0 ? creators : others
  return pool[Math.floor(rand() * pool.length)]
}

function pickCardVictim(lineup: LineupEntry[]): LineupEntry {
  // Defenders and midfielders more likely to get booked
  const def = lineup.filter(e => ['CB','LB','RB','CDM'].includes(e.assignedPosition))
  const pool = def.length > 0 ? def : lineup
  return pool[Math.floor(rand() * pool.length)]
}

// ─── Main simulation ──────────────────────────────────────────────────────────

export async function simulateMatch(match: FullMatch): Promise<SimResult> {
  const homeLineup = buildLineup(match.homeClub)
  const awayLineup = buildLineup(match.awayClub)

  const homeTacticRaw = match.homeClub.tactic as { style?: string; pressingIntensity?: number; defensiveLine?: number; width?: number } | null
  const awayTacticRaw = match.awayClub.tactic as typeof homeTacticRaw

  const homeTactic = normaliseTactic(homeTacticRaw)
  const awayTactic = normaliseTactic(awayTacticRaw)

  // ── Compute phase scores ────────────────────────────────────────────────
  let homePhase = calcTeamPhase(homeLineup, homeTactic)
  let awayPhase = calcTeamPhase(awayLineup, awayTactic)

  // ── Match state ─────────────────────────────────────────────────────────
  const stats = {
    home: { shots: 0, shotsOnTarget: 0, xG: 0, possession: 0, yellowCards: 0, redCards: 0 },
    away: { shots: 0, shotsOnTarget: 0, xG: 0, possession: 0, yellowCards: 0, redCards: 0 },
  }

  let homeGoals = 0, awayGoals = 0
  let homePossessionMinutes = 0
  const shotEvents: ShotEvent[] = []
  const cardEvents: CardEvent[] = []

  // Goals scored by each player for MatchPerformance
  const goalsByInstance: Record<string, number>   = {}
  const assistsByInstance: Record<string, number> = {}

  // ── 90-minute loop ──────────────────────────────────────────────────────
  for (let minute = 1; minute <= 90; minute++) {
    // Re-compute phases every 15 minutes so stamina drain affects late-game strength
    if (minute % 15 === 0) {
      homePhase = calcTeamPhase(homeLineup, homeTactic)
      awayPhase = calcTeamPhase(awayLineup, awayTactic)
    }

    // ── Possession ────────────────────────────────────────────────────
    const homePossProb = clamp(
      0.50 + (homePhase.midfieldControl - awayPhase.midfieldControl) / 200 + 0.03,
      0.30, 0.70,
    )
    const homeHasBall = rand() < homePossProb
    if (homeHasBall) homePossessionMinutes++

    const attPhase  = homeHasBall ? homePhase : awayPhase
    const defPhase  = homeHasBall ? awayPhase : homePhase
    const attLineup = homeHasBall ? homeLineup : awayLineup
    const defLineup = homeHasBall ? awayLineup : homeLineup
    const team      = homeHasBall ? 'home' : 'away' as const

    // ── Shot attempt ──────────────────────────────────────────────────
    const shotProb = clamp(
      0.05 + 0.30 * attPhase.attackStrength / (attPhase.attackStrength + defPhase.defensiveStrength),
      0.05, 0.35,
    )

    if (rand() < shotProb) {
      stats[team].shots++
      const chanceType  = pickChanceType(attPhase, defPhase)
      const shooter     = pickShooter(attLineup)
      const assister    = pickAssister(attLineup, shooter.instanceId)
      const finQuality  = attPhase.finishingQuality * conditionMultiplier(shooter)
      const xg          = calcXg(chanceType, finQuality, defPhase.goalkeepingQuality, homeHasBall)
      const onTarget    = rand() < clamp(0.38 + (finQuality - 65) / 400, 0.25, 0.60)
      const isGoal      = onTarget && rand() < xg

      if (onTarget) stats[team].shotsOnTarget++
      stats[team].xG += xg

      if (isGoal) {
        if (homeHasBall) homeGoals++; else awayGoals++
        goalsByInstance[shooter.instanceId]  = (goalsByInstance[shooter.instanceId]  ?? 0) + 1
        if (assister) assistsByInstance[assister.instanceId] = (assistsByInstance[assister.instanceId] ?? 0) + 1
      }

      shotEvents.push({
        minute, team,
        shooterInstanceId: shooter.instanceId,
        assisterInstanceId: assister?.instanceId ?? null,
        xg, onTarget, isGoal,
      })

      drainStamina(attLineup, true, homeTactic?.pressingIntensity ?? 55)
    } else {
      drainStamina(attLineup, false, homeTactic?.pressingIntensity ?? 55)
    }

    // Defending team stamina drain (pressing)
    drainStamina(defLineup, false, awayTactic?.pressingIntensity ?? 55)

    // ── Yellow card ────────────────────────────────────────────────────
    // ~2.5 total yellows per game → 0.028/min for the defending team
    if (rand() < 0.028) {
      const victim = pickCardVictim(defLineup)
      const cardTeam = homeHasBall ? 'away' : 'home' as const
      stats[cardTeam].yellowCards++
      cardEvents.push({ minute, team: cardTeam, instanceId: victim.instanceId, type: 'yellow' })
    }

    // ── Red card (rare — ~0.08/game → 0.0009/min) ─────────────────────
    if (rand() < 0.0009) {
      const victim = pickCardVictim(defLineup)
      const cardTeam = homeHasBall ? 'away' : 'home' as const
      stats[cardTeam].redCards++
      cardEvents.push({ minute, team: cardTeam, instanceId: victim.instanceId, type: 'red' })
    }
  }

  stats.home.possession = Math.round((homePossessionMinutes / 90) * 100)
  stats.away.possession = 100 - stats.home.possession

  // ── Persist results ─────────────────────────────────────────────────
  await saveMatch(match, homeGoals, awayGoals, stats, shotEvents, cardEvents, homeLineup, awayLineup)
  await updateStandings(match.homeClubId, match.awayClubId, homeGoals, awayGoals)
  await applyMatchInjuries(match)
  await saveMatchPerformances(
    match, homeLineup, awayLineup, homeGoals, awayGoals,
    goalsByInstance, assistsByInstance,
  )

  return {
    matchId: match.id,
    homeClubId: match.homeClubId,
    awayClubId: match.awayClubId,
    homeScore: homeGoals,
    awayScore: awayGoals,
    stats,
  }
}

// ─── Tactic normalisation ─────────────────────────────────────────────────────

function normaliseTactic(raw: { style?: string; pressingIntensity?: number; defensiveLine?: number; width?: number } | null) {
  if (!raw) return null
  const validStyles = ['possession', 'counter', 'pressing', 'lowblock'] as const
  return {
    style:            (validStyles.includes(raw.style as typeof validStyles[number]) ? raw.style : 'possession') as typeof validStyles[number],
    pressingIntensity: raw.pressingIntensity ?? 55,
    defensiveLine:     raw.defensiveLine     ?? 50,
    width:             raw.width             ?? 50,
  }
}

// ─── Persistence ──────────────────────────────────────────────────────────────

async function saveMatch(
  match: FullMatch,
  homeGoals: number,
  awayGoals: number,
  stats: { home: TeamStats; away: TeamStats },
  shots: ShotEvent[],
  cards: CardEvent[],
  homeLineup: LineupEntry[],
  awayLineup: LineupEntry[],
): Promise<void> {
  await prisma.match.update({
    where: { id: match.id },
    data: {
      homeScore: homeGoals,
      awayScore: awayGoals,
      status: 'SIMULATED',
      simulatedAt: new Date(),
      homeTactic: (match.homeClub.tactic ?? undefined) as any,
      awayTactic: (match.awayClub.tactic ?? undefined) as any,
      stats: stats as any,
    },
  })

  // Write match events
  const eventData: { matchId: string; minute: number; type: string; detail: any }[] = []

  for (const s of shots) {
    if (s.isGoal) {
      eventData.push({
        matchId: match.id,
        minute: s.minute,
        type: 'GOAL',
        detail: {
          team: s.team,
          instanceId: s.shooterInstanceId,
          assistInstanceId: s.assisterInstanceId,
          xg: s.xg,
        },
      })
    }
  }

  for (const c of cards) {
    eventData.push({
      matchId: match.id,
      minute: c.minute,
      type: c.type === 'red' ? 'RED_CARD' : 'YELLOW_CARD',
      detail: { team: c.team, instanceId: c.instanceId },
    })
  }

  if (eventData.length > 0) {
    await prisma.matchEvent.createMany({ data: eventData as any })
  }
}

async function saveMatchPerformances(
  match: FullMatch,
  homeLineup: LineupEntry[],
  awayLineup: LineupEntry[],
  homeGoals: number,
  awayGoals: number,
  goalsByInstance: Record<string, number>,
  assistsByInstance: Record<string, number>,
): Promise<void> {
  const rows = [
    ...homeLineup.map(e => makePerformance(match.id, e, goalsByInstance, assistsByInstance, awayGoals, 'home')),
    ...awayLineup.map(e => makePerformance(match.id, e, goalsByInstance, assistsByInstance, homeGoals, 'away')),
  ]
  // upsert in case re-simulated
  await prisma.matchPerformance.createMany({ data: rows, skipDuplicates: true })
}

function makePerformance(
  matchId: string,
  entry: LineupEntry,
  goalsByInstance: Record<string, number>,
  assistsByInstance: Record<string, number>,
  goalsConceded: number,
  _team: 'home' | 'away',
): { matchId: string; instanceId: string; rating: number; goals: number; assists: number; minutesPlayed: number } {
  const goals   = goalsByInstance[entry.instanceId]   ?? 0
  const assists = assistsByInstance[entry.instanceId] ?? 0

  // Base rating 6.5; bonuses for goals/assists; penalty for goals conceded (defenders/GK)
  let rating = 6.5
  rating += goals   * 0.7
  rating += assists * 0.4

  const isDefender = ['GK','CB','LB','RB'].includes(entry.assignedPosition)
  if (isDefender && goalsConceded > 0) rating -= goalsConceded * 0.15

  // Small random noise ±0.25
  rating += (rand() - 0.5) * 0.5
  rating = clamp(rating, 4.0, 10.0)

  return {
    matchId,
    instanceId: entry.instanceId,
    rating: Math.round(rating * 10) / 10,
    goals,
    assists,
    minutesPlayed: 90,
  }
}

// ─── Standings ────────────────────────────────────────────────────────────────

async function updateStandings(homeId: string, awayId: string, h: number, a: number): Promise<void> {
  const homeUpdate =
    h > a ? { wins: { increment: 1 }, points: { increment: 3 } }
    : h === a ? { draws: { increment: 1 }, points: { increment: 1 } }
    : { losses: { increment: 1 } }

  const awayUpdate =
    a > h ? { wins: { increment: 1 }, points: { increment: 3 } }
    : a === h ? { draws: { increment: 1 }, points: { increment: 1 } }
    : { losses: { increment: 1 } }

  await Promise.all([
    prisma.club.update({ where: { id: homeId }, data: { ...homeUpdate, goalsFor: { increment: h }, goalsAgainst: { increment: a } } }),
    prisma.club.update({ where: { id: awayId }, data: { ...awayUpdate, goalsFor: { increment: a }, goalsAgainst: { increment: h } } }),
  ])
}

// ─── Injuries ─────────────────────────────────────────────────────────────────

async function applyMatchInjuries(match: FullMatch): Promise<void> {
  const candidates = [
    ...match.homeClub.squad,
    ...match.awayClub.squad,
  ].filter(p => !p.injured)

  const updates: Promise<unknown>[] = []
  for (const inst of candidates) {
    if (rand() < 0.04) {
      const days = Math.floor(rand() * 12) + 3  // 3–14 days
      updates.push(
        prisma.playerInstance.update({
          where: { id: inst.id },
          data: { injured: true, injuryDaysLeft: days },
        }),
      )
    }
  }
  await Promise.all(updates)
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function rand(): number { return Math.random() }

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}
