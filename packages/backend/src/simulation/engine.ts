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
  competition: string
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

function buildLineup(club: FullClub, matchday: number): LineupEntry[] {
  const tactic = club.tactic as { lineup?: { instanceId: string; position: string }[] } | null
  const instanceMap = Object.fromEntries(club.squad.map(s => [s.id, s]))
  const available = (inst: typeof club.squad[number]) => !inst.injured && inst.suspendedMatchday !== matchday
  const healthy = club.squad.filter(available)

  let slots: { instanceId: string; position: string }[] = []

  if (tactic?.lineup?.length === 11) {
    slots = tactic.lineup.filter(s => {
      const inst = instanceMap[s.instanceId]
      return inst && available(inst)
    })

    // Replace injured starters with best available bench players
    if (slots.length < 11) {
      const startingIds = new Set(slots.map(s => s.instanceId))
      const bench = healthy
        .filter(s => !startingIds.has(s.id))
        .sort((a, b) => b.player.overall - a.player.overall)

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

// ─── Bench builder ────────────────────────────────────────────────────────────

interface SubConfig {
  outInstanceId: string
  inInstanceId: string
  condition: { type: 'minute' | 'fitness'; value: number }
}

function buildBench(club: FullClub, matchday: number): LineupEntry[] {
  const tactic = club.tactic as { lineup?: { instanceId: string; position: string }[]; subs?: SubConfig[] } | null
  const instanceMap = Object.fromEntries(club.squad.map(s => [s.id, s]))
  const startingIds = new Set((tactic?.lineup ?? []).map(s => s.instanceId))
  return club.squad
    .filter(s => !s.injured && s.suspendedMatchday !== matchday && !startingIds.has(s.id))
    .sort((a, b) => b.player.overall - a.player.overall)
    .map(s => ({
      instanceId: s.id,
      assignedPosition: s.player.position,
      naturalPosition: s.player.position,
      trainedPosition: s.trainedPosition ?? null,
      attrs: toAttrs(s.player),
      morale: s.morale,
      form: s.form,
      fitness: s.fitness,
      matchStamina: s.player.powStamina,
    }))
}

function getSubConfigs(club: FullClub): SubConfig[] {
  const tactic = club.tactic as { subs?: SubConfig[] } | null
  return tactic?.subs ?? []
}

// ─── Substitution execution ───────────────────────────────────────────────────

interface SubEvent {
  minute: number
  team: 'home' | 'away'
  outInstanceId: string
  inInstanceId: string
}

function executeSubstitutions(
  lineup: LineupEntry[],
  bench: LineupEntry[],
  subConfigs: SubConfig[],
  minute: number,
  team: 'home' | 'away',
  usedSubs: Set<string>,
  subEvents: SubEvent[],
): void {
  for (const cfg of subConfigs) {
    if (usedSubs.has(cfg.outInstanceId)) continue
    const outIdx = lineup.findIndex(e => e.instanceId === cfg.outInstanceId)
    if (outIdx === -1) continue
    const subIn = bench.find(b => b.instanceId === cfg.inInstanceId)
    if (!subIn || usedSubs.has(cfg.inInstanceId)) continue

    const outEntry = lineup[outIdx]
    const triggered =
      cfg.condition.type === 'minute'
        ? minute >= cfg.condition.value
        : outEntry.matchStamina <= cfg.condition.value

    if (!triggered) continue

    lineup[outIdx] = { ...subIn, assignedPosition: outEntry.assignedPosition }
    usedSubs.add(cfg.outInstanceId)
    usedSubs.add(cfg.inInstanceId)
    subEvents.push({ minute, team, outInstanceId: cfg.outInstanceId, inInstanceId: cfg.inInstanceId })
  }
}

function executeAutoSubs(
  lineup: LineupEntry[],
  bench: LineupEntry[],
  minute: number,
  team: 'home' | 'away',
  maxSubs: number,
  usedSubs: Set<string>,
  subEvents: SubEvent[],
): void {
  // Auto-sub the most fatigued player once stamina drops below 30, up to maxSubs remaining
  const subsUsed = usedSubs.size / 2  // each sub consumes 2 IDs (out + in)
  if (subsUsed >= maxSubs) return
  if (minute < 60) return  // no early subs in auto mode

  const availableBench = bench.filter(b => !usedSubs.has(b.instanceId))
  if (availableBench.length === 0) return

  const mostFatigued = lineup
    .filter(e => !usedSubs.has(e.instanceId) && e.matchStamina < 30)
    .sort((a, b) => a.matchStamina - b.matchStamina)[0]

  if (!mostFatigued) return

  const outIdx = lineup.findIndex(e => e.instanceId === mostFatigued.instanceId)
  // Pick a bench player matching the same broad position group
  const posGroup = (pos: string) =>
    pos === 'GK' ? 0 : ['CB','LB','RB'].includes(pos) ? 1 : ['CDM','CM','CAM','LM','RM'].includes(pos) ? 2 : 3

  const sameGroup = availableBench.filter(b => posGroup(b.naturalPosition) === posGroup(mostFatigued.assignedPosition))
  const subIn = sameGroup[0] ?? availableBench[0]

  lineup[outIdx] = { ...subIn, assignedPosition: mostFatigued.assignedPosition }
  usedSubs.add(mostFatigued.instanceId)
  usedSubs.add(subIn.instanceId)
  subEvents.push({ minute, team, outInstanceId: mostFatigued.instanceId, inInstanceId: subIn.instanceId })
}

// ─── Main simulation ──────────────────────────────────────────────────────────

// ─── Boost helpers ────────────────────────────────────────────────────────────

const BOOST_ATTRS: Record<string, string[]> = {
  pace:      ['movSprintSpeed', 'movAcceleration'],
  shooting:  ['atkFinishing', 'powShotPower', 'powLongShots'],
  passing:   ['atkShortPassing', 'sklLongPassing', 'menVision'],
  defending: ['defMarkingAware', 'defStandingTackle', 'defSlidingTackle'],
  physical:  ['powStrength', 'powStamina', 'powJumping'],
}

function applyBoostsToPlayer(player: Player, boosts: { stat: string; amount: number }[]): Player {
  if (boosts.length === 0) return player
  const p = { ...player }
  for (const boost of boosts) {
    const attrs = BOOST_ATTRS[boost.stat] ?? []
    for (const attr of attrs) {
      (p as any)[attr] = Math.min(99, ((p as any)[attr] ?? 50) + boost.amount)
    }
    // Also bump the summary stat
    if (boost.stat in p) (p as any)[boost.stat] = Math.min(99, ((p as any)[boost.stat] ?? 50) + boost.amount)
  }
  return p
}

export async function simulateMatch(
  match: FullMatch,
  homeTacticOverride: NormalisedTactic | null = null,
  awayTacticOverride: NormalisedTactic | null = null,
): Promise<SimResult> {
  // Apply active stat boosts to player attributes (in-memory only, does not write to DB)
  const allInstanceIds = [...match.homeClub.squad, ...match.awayClub.squad].map(s => s.id)
  const activeBoosts = await prisma.playerBoost.findMany({
    where: { instanceId: { in: allInstanceIds }, matchdaysLeft: { gt: 0 } },
    select: { instanceId: true, stat: true, amount: true },
  })
  const boostMap: Record<string, { stat: string; amount: number }[]> = {}
  for (const b of activeBoosts) {
    if (!boostMap[b.instanceId]) boostMap[b.instanceId] = []
    boostMap[b.instanceId].push({ stat: b.stat, amount: b.amount })
  }
  const patchSquad = (squad: (PlayerInstance & { player: Player })[]) =>
    squad.map(inst => {
      const boosts = boostMap[inst.id]
      return boosts ? { ...inst, player: applyBoostsToPlayer(inst.player, boosts) } : inst
    })
  const homeClub: FullClub = { ...match.homeClub, squad: patchSquad(match.homeClub.squad) }
  const awayClub: FullClub = { ...match.awayClub, squad: patchSquad(match.awayClub.squad) }

  const homeLineup = buildLineup(homeClub, match.matchday)
  const awayLineup = buildLineup(awayClub, match.matchday)
  const homeBench  = buildBench(homeClub, match.matchday)
  const awayBench  = buildBench(awayClub, match.matchday)
  const homeSubConfigs = getSubConfigs(homeClub)
  const awaySubConfigs = getSubConfigs(awayClub)
  const homeUsedSubs = new Set<string>()
  const awayUsedSubs = new Set<string>()
  const subEvents: SubEvent[] = []

  const homeTacticRaw = homeClub.tactic as { style?: string; pressingIntensity?: number; defensiveLine?: number; width?: number } | null
  const awayTacticRaw = awayClub.tactic as typeof homeTacticRaw

  const homeTactic = homeTacticOverride ?? normaliseTactic(homeTacticRaw)
  const awayTactic = awayTacticOverride ?? normaliseTactic(awayTacticRaw)

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
  const goalsByInstance: Record<string, number>    = {}
  const assistsByInstance: Record<string, number>  = {}
  const redCardsByInstance: Record<string, boolean> = {}
  const yellowCardsByInstance: Record<string, number> = {}

  // ── 90-minute loop ──────────────────────────────────────────────────────
  for (let minute = 1; minute <= 90; minute++) {
    // Re-compute phases every 15 minutes so stamina drain affects late-game strength
    if (minute % 15 === 0) {
      homePhase = calcTeamPhase(homeLineup, homeTactic)
      awayPhase = calcTeamPhase(awayLineup, awayTactic)
    }

    // ── Substitutions ────────────────────────────────────────────────
    if (minute % 5 === 0) {
      if (homeSubConfigs.length > 0) {
        executeSubstitutions(homeLineup, homeBench, homeSubConfigs, minute, 'home', homeUsedSubs, subEvents)
      } else if (homeClub.isAI) {
        executeAutoSubs(homeLineup, homeBench, minute, 'home', 3, homeUsedSubs, subEvents)
      }
      if (awaySubConfigs.length > 0) {
        executeSubstitutions(awayLineup, awayBench, awaySubConfigs, minute, 'away', awayUsedSubs, subEvents)
      } else if (awayClub.isAI) {
        executeAutoSubs(awayLineup, awayBench, minute, 'away', 3, awayUsedSubs, subEvents)
      }
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
        nudgeMorale(attLineup, shooter.instanceId, 8)
        if (assister) nudgeMorale(attLineup, assister.instanceId, 4)
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
      nudgeMorale(defLineup, victim.instanceId, -5)
      yellowCardsByInstance[victim.instanceId] = (yellowCardsByInstance[victim.instanceId] ?? 0) + 1
    }

    // ── Red card (rare — ~0.08/game → 0.0009/min) ─────────────────────
    if (rand() < 0.0009) {
      const victim = pickCardVictim(defLineup)
      const cardTeam = homeHasBall ? 'away' : 'home' as const
      stats[cardTeam].redCards++
      cardEvents.push({ minute, team: cardTeam, instanceId: victim.instanceId, type: 'red' })
      redCardsByInstance[victim.instanceId] = true
      nudgeMorale(defLineup, victim.instanceId, -12)
    }
  }

  stats.home.possession = Math.round((homePossessionMinutes / 90) * 100)
  stats.away.possession = 100 - stats.home.possession

  // ── Persist results ─────────────────────────────────────────────────
  await saveMatch(match, homeGoals, awayGoals, stats, shotEvents, cardEvents, subEvents, homeLineup, awayLineup)
  await updateStandings(match.homeClubId, match.awayClubId, homeGoals, awayGoals)
  await applyMatchInjuries(match)
  await saveMatchPerformances(
    match, homeLineup, awayLineup, homeGoals, awayGoals,
    goalsByInstance, assistsByInstance, subEvents,
  )
  await updatePlayerConditions(
    match, homeLineup, awayLineup, homeGoals, awayGoals,
    goalsByInstance, assistsByInstance, redCardsByInstance, yellowCardsByInstance,
  )

  return {
    matchId: match.id,
    homeClubId: match.homeClubId,
    awayClubId: match.awayClubId,
    homeScore: homeGoals,
    awayScore: awayGoals,
    competition: match.competition ?? 'LEAGUE',
    stats,
  }
}

// ─── Tactic normalisation ─────────────────────────────────────────────────────

type NormalisedTactic = {
  style: 'possession' | 'counter' | 'pressing' | 'lowblock'
  pressingIntensity: number
  defensiveLine: number
  width: number
}

function normaliseTactic(raw: { style?: string; pressingIntensity?: number; defensiveLine?: number; width?: number } | null): NormalisedTactic | null {
  if (!raw) return null
  const validStyles = ['possession', 'counter', 'pressing', 'lowblock'] as const
  return {
    style:             (validStyles.includes(raw.style as typeof validStyles[number]) ? raw.style : 'possession') as NormalisedTactic['style'],
    pressingIntensity: raw.pressingIntensity ?? 55,
    defensiveLine:     raw.defensiveLine     ?? 50,
    width:             raw.width             ?? 50,
  }
}

// ─── AI match-specific tactic adaptation ─────────────────────────────────────
// Observed match-history profile for an opponent — built from their last N matches.
// Using real stats (possession, shots, xG, cards) rather than their stored tactic
// setting, so the AI reacts to how a team actually plays, not what they claim to.

export interface OpponentProfile {
  avgPossession:    number   // 0–100 — how much they dominate the ball
  avgShots:         number   // shots attempted per game
  avgXG:            number   // expected goals per game
  avgCards:         number   // yellow + 2×red per game (aggression proxy)
  goalsForPerGame:  number
  goalsAgainstPerGame: number
  gamesObserved:    number
}

export function buildOpponentProfile(
  clubId: string,
  recentMatches: {
    homeClubId: string
    awayClubId: string
    homeScore: number | null
    awayScore: number | null
    stats: unknown
  }[],
  club: { wins: number; draws: number; losses: number; goalsFor: number; goalsAgainst: number },
): OpponentProfile {
  const totalGames = club.wins + club.draws + club.losses

  // Fall back to season record when no detailed stats are available yet
  if (recentMatches.length === 0) {
    return {
      avgPossession:       50,
      avgShots:            10,
      avgXG:               1.3,
      avgCards:            2,
      goalsForPerGame:     totalGames > 0 ? club.goalsFor    / totalGames : 1.2,
      goalsAgainstPerGame: totalGames > 0 ? club.goalsAgainst / totalGames : 1.2,
      gamesObserved:       0,
    }
  }

  let sumPoss = 0, sumShots = 0, sumXG = 0, sumCards = 0, count = 0
  let sumGF = 0, sumGA = 0

  type MatchSide = { possession: number; shots: number; xG: number; yellowCards: number; redCards: number }
  for (const m of recentMatches) {
    const s = m.stats as { home: MatchSide; away: MatchSide } | null
    const isHome = m.homeClubId === clubId
    const side   = isHome ? s?.home : s?.away

    if (side) {
      sumPoss  += side.possession
      sumShots += side.shots
      sumXG    += side.xG
      sumCards += side.yellowCards + side.redCards * 2
      count++
    }

    sumGF += isHome ? (m.homeScore ?? 0) : (m.awayScore ?? 0)
    sumGA += isHome ? (m.awayScore ?? 0) : (m.homeScore ?? 0)
  }

  const n = recentMatches.length
  return {
    avgPossession:       count > 0 ? sumPoss  / count : 50,
    avgShots:            count > 0 ? sumShots / count : 10,
    avgXG:               count > 0 ? sumXG    / count : 1.3,
    avgCards:            count > 0 ? sumCards / count : 2,
    goalsForPerGame:     sumGF / n,
    goalsAgainstPerGame: sumGA / n,
    gamesObserved:       n,
  }
}

export function adaptTacticForOpponent(club: FullClub, opp: OpponentProfile): NormalisedTactic {
  const base = normaliseTactic(club.tactic as any) ?? {
    style: 'possession' as const, pressingIntensity: 55, defensiveLine: 50, width: 50,
  }

  let pressDelta = 0
  let lineDelta  = 0
  let widthDelta = 0
  let styleOverride: NormalisedTactic['style'] | null = null

  // ── Infer opponent behaviour from their actual match stats ────────────────

  // Possession: >58 → they dominate the ball; <42 → they play direct/deep
  if (opp.avgPossession > 58) {
    // High-possession team → press hard to disrupt their build-up
    pressDelta += 10
    lineDelta  += 6
  } else if (opp.avgPossession < 42) {
    // Low possession → they sit deep or counter → be patient and wide
    widthDelta += 12
    pressDelta += 6
    lineDelta  += 8
    styleOverride = 'possession'
  }

  // Shots volume: >14/game → high-volume attack; <7/game → very passive
  if (opp.avgShots > 14) {
    // They throw a lot at goal → drop the line, stay compact
    lineDelta  -= 10
    pressDelta -= 6
  } else if (opp.avgShots < 7) {
    // They barely create → push up, dominate
    lineDelta  += 8
    pressDelta += 6
  }

  // xG quality: >1.8 → genuinely dangerous; <0.7 → toothless
  if (opp.avgXG > 1.8) {
    lineDelta  -= 8
    pressDelta -= 4
  } else if (opp.avgXG < 0.7) {
    lineDelta  += 6
    pressDelta += 4
    widthDelta += 6
  }

  // Card rate: >4/game → physical and aggressive (probably pressing or lowblock)
  if (opp.avgCards > 4) {
    // Aggressive team → play direct over them, don't dwell on the ball
    pressDelta -= 8
    widthDelta -= 5
    if (base.style !== 'lowblock') styleOverride = 'counter'
  }

  // Scoring record: high scorers need defensive respect; leaky defence = attack
  if (opp.goalsForPerGame > 2.2) {
    lineDelta  -= 8
    pressDelta -= 4
  } else if (opp.goalsForPerGame < 0.8) {
    lineDelta  += 6
    pressDelta += 4
  }

  if (opp.goalsAgainstPerGame > 2.0) {
    // Leaky → push up, attack wide
    lineDelta  += 8
    widthDelta += 8
    pressDelta += 5
  } else if (opp.goalsAgainstPerGame < 0.6) {
    // Very solid defence → be patient, use width to probe
    widthDelta += 10
    pressDelta -= 4
    if (base.style !== 'pressing') styleOverride = 'possession'
  }

  // When fewer than 3 games observed, dampen the deltas (less confidence)
  if (opp.gamesObserved < 3) {
    const dampening = opp.gamesObserved === 0 ? 0.2 : 0.6
    pressDelta = Math.round(pressDelta * dampening)
    lineDelta  = Math.round(lineDelta  * dampening)
    widthDelta = Math.round(widthDelta * dampening)
    if (opp.gamesObserved === 0) styleOverride = null
  }

  return {
    style:             styleOverride ?? base.style,
    pressingIntensity: Math.round(clamp(base.pressingIntensity + pressDelta, 12, 95)),
    defensiveLine:     Math.round(clamp(base.defensiveLine     + lineDelta,  18, 85)),
    width:             Math.round(clamp(base.width             + widthDelta, 25, 85)),
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
  subs: SubEvent[],
  _homeLineup: LineupEntry[],
  _awayLineup: LineupEntry[],
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

  for (const s of subs) {
    eventData.push({
      matchId: match.id,
      minute: s.minute,
      type: 'SUBSTITUTION',
      detail: { team: s.team, outInstanceId: s.outInstanceId, inInstanceId: s.inInstanceId },
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
  subEvents: SubEvent[],
): Promise<void> {
  // Build minutes-played map: starters get 90 unless subbed off; subs-in get (90 - minute)
  const minutesMap: Record<string, number> = {}
  for (const e of [...homeLineup, ...awayLineup]) minutesMap[e.instanceId] = 90

  for (const s of subEvents) {
    minutesMap[s.outInstanceId] = Math.min(minutesMap[s.outInstanceId] ?? 90, s.minute)
    minutesMap[s.inInstanceId]  = 90 - s.minute
  }

  // Collect all unique participants (starters + subs-in)
  const homeSubIn = subEvents.filter(s => s.team === 'home').map(s => s.inInstanceId)
  const awaySubIn = subEvents.filter(s => s.team === 'away').map(s => s.inInstanceId)
  const instanceMap = Object.fromEntries(match.homeClub.squad.concat(match.awayClub.squad).map(s => [s.id, s]))

  const allHome: LineupEntry[] = [
    ...homeLineup,
    ...homeSubIn.map(id => {
      const s = instanceMap[id]
      if (!s) return null
      return { instanceId: id, assignedPosition: s.player.position, naturalPosition: s.player.position, trainedPosition: s.trainedPosition ?? null, attrs: toAttrs(s.player), morale: s.morale, form: s.form, fitness: s.fitness, matchStamina: s.player.powStamina }
    }).filter(Boolean) as LineupEntry[],
  ]
  const allAway: LineupEntry[] = [
    ...awayLineup,
    ...awaySubIn.map(id => {
      const s = instanceMap[id]
      if (!s) return null
      return { instanceId: id, assignedPosition: s.player.position, naturalPosition: s.player.position, trainedPosition: s.trainedPosition ?? null, attrs: toAttrs(s.player), morale: s.morale, form: s.form, fitness: s.fitness, matchStamina: s.player.powStamina }
    }).filter(Boolean) as LineupEntry[],
  ]

  const rows = [
    ...allHome.map(e => makePerformance(match.id, e, goalsByInstance, assistsByInstance, awayGoals, minutesMap[e.instanceId] ?? 90)),
    ...allAway.map(e => makePerformance(match.id, e, goalsByInstance, assistsByInstance, homeGoals, minutesMap[e.instanceId] ?? 90)),
  ]
  await prisma.matchPerformance.createMany({ data: rows, skipDuplicates: true })
}

function makePerformance(
  matchId: string,
  entry: LineupEntry,
  goalsByInstance: Record<string, number>,
  assistsByInstance: Record<string, number>,
  goalsConceded: number,
  minutesPlayed: number,
): { matchId: string; instanceId: string; rating: number; goals: number; assists: number; minutesPlayed: number; positionPlayed: string } {
  const goals   = goalsByInstance[entry.instanceId]   ?? 0
  const assists = assistsByInstance[entry.instanceId] ?? 0

  let rating = 6.5
  rating += goals   * 0.7
  rating += assists * 0.4

  const isDefender = ['GK','CB','LB','RB'].includes(entry.assignedPosition)
  if (isDefender && goalsConceded > 0) rating -= goalsConceded * 0.15

  // Scale noise for players with fewer minutes
  rating += (rand() - 0.5) * 0.5 * (minutesPlayed / 90)
  rating = clamp(rating, 4.0, 10.0)

  // GK playing outfield or outfield playing GK: heavily penalise match rating
  const isCrossRole = (entry.naturalPosition === 'GK') !== (entry.assignedPosition === 'GK')
  if (isCrossRole) {
    // Compress rating toward the floor — max ~5.0 no matter how many goals
    rating = 4.0 + (rating - 4.0) * 0.35
    rating = clamp(rating, 4.0, 5.0)
  }

  return {
    matchId,
    instanceId: entry.instanceId,
    rating: Math.round(rating * 10) / 10,
    goals,
    assists,
    minutesPlayed,
    positionPlayed: entry.assignedPosition,
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

// ─── Post-match condition updates ────────────────────────────────────────────
// Fitness drain for playing 90 min; form nudged by individual performance;
// morale shifted by team result.

// How much fitness a player loses playing a full match.
// Driven by their aggression/sprint (how hard they work), stamina (endurance),
// their position (wingers/CDMs cover the most ground), and tactic style.
function calcFitnessDrain(entry: LineupEntry, tacticStyle: string): number {
  const a = entry.attrs

  // Workload: how hard the player physically works (normalised around 0)
  // Aggression drives pressing & duels; sprint/acceleration drive distance covered
  const workloadScore = a.menAggression * 0.45 + a.movSprintSpeed * 0.30 + a.movAcceleration * 0.25
  const workloadMod   = (workloadScore - 65) / 65 * 0.30  // ±0.30 swing

  // Stamina efficiency: high stamina = better endurance = less drain
  const staminaMod = (a.powStamina - 65) / 65 * 0.30  // ±0.30 swing

  // Position load: how much ground each role covers in a typical match
  const posLoad: Record<string, number> = {
    GK:  0.65,
    CB:  0.85, LB: 1.05, RB: 1.05,
    CDM: 1.15,
    CM:  1.05, CAM: 0.95,
    LM:  1.12, RM:  1.12,
    LW:  1.12, RW:  1.12,
    CF:  0.90, ST:  0.85,
  }
  const posFactor = posLoad[entry.assignedPosition] ?? 1.00

  // Tactic style: pressing demands more running from everyone; low block much less
  const tacticFactor =
    tacticStyle === 'pressing'   ? 1.22 :
    tacticStyle === 'counter'    ? 1.08 :
    tacticStyle === 'possession' ? 1.00 :
    /* lowblock */                 0.78

  const drain = 18 * (1 + workloadMod - staminaMod) * posFactor * tacticFactor
  return clamp(Math.round(drain), 8, 32)
}

async function updatePlayerConditions(
  match: FullMatch,
  homeLineup: LineupEntry[],
  awayLineup: LineupEntry[],
  homeGoals: number,
  awayGoals: number,
  goalsByInstance: Record<string, number>,
  assistsByInstance: Record<string, number>,
  redCardsByInstance: Record<string, boolean>,
  yellowCardsByInstance: Record<string, number>,
): Promise<void> {
  const homeWon = homeGoals > awayGoals
  const awayWon = awayGoals > homeGoals
  const isDraw  = homeGoals === awayGoals

  const homeMoraleDelta = homeWon ? 5 : isDraw ? 1 : -4
  const awayMoraleDelta = awayWon ? 5 : isDraw ? 1 : -4

  const homeTacticStyle = (match.homeClub.tactic as any)?.style ?? 'possession'
  const awayTacticStyle = (match.awayClub.tactic as any)?.style ?? 'possession'

  const CLEAN_SHEET_POSITIONS = new Set(['GK','CB','LB','RB','CDM'])

  const instanceMap = Object.fromEntries(
    [...match.homeClub.squad, ...match.awayClub.squad].map(s => [s.id, s])
  )

  const updates: Promise<unknown>[] = []

  const processLineup = (lineup: LineupEntry[], moraleDelta: number, tacticStyle: string, goalsConceded: number) => {
    const resultSign = moraleDelta > 0 ? 1 : isDraw ? 0 : -1
    for (const entry of lineup) {
      const goals   = goalsByInstance[entry.instanceId]   ?? 0
      const assists = assistsByInstance[entry.instanceId] ?? 0
      const formDelta  = clamp(resultSign + goals * 2 + assists * 1, -8, 8)
      const fitnessDrain = calcFitnessDrain(entry, tacticStyle)

      let indivMorale = moraleDelta
      indivMorale += goals * 2
      indivMorale += assists * 1
      if (goals >= 3) indivMorale += 5
      if (goalsConceded === 0 && CLEAN_SHEET_POSITIONS.has(entry.assignedPosition)) indivMorale += 4
      if (redCardsByInstance[entry.instanceId]) indivMorale -= 8

      const yellowsThisMatch = yellowCardsByInstance[entry.instanceId] ?? 0
      const currentYellows   = instanceMap[entry.instanceId]?.yellowCards ?? 0
      const newYellows       = currentYellows + yellowsThisMatch
      const crossedThreshold = yellowsThisMatch > 0 && Math.floor(newYellows / 5) > Math.floor(currentYellows / 5)
      const isSuspended = redCardsByInstance[entry.instanceId] || crossedThreshold

      updates.push(prisma.playerInstance.update({
        where: { id: entry.instanceId },
        data: {
          fitness: clamp(entry.fitness - fitnessDrain, 10, 100),
          morale:  clamp(entry.morale  + indivMorale,  20, 100),
          form:    clamp(entry.form    + formDelta,     20, 100),
          ...(isSuspended ? { suspendedMatchday: match.matchday + 1 } : {}),
          ...(yellowsThisMatch > 0 ? { yellowCards: newYellows } : {}),
        },
      }))
    }
  }

  processLineup(homeLineup, homeMoraleDelta, homeTacticStyle, awayGoals)
  processLineup(awayLineup, awayMoraleDelta, awayTacticStyle, homeGoals)

  await Promise.all(updates)
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function rand(): number { return Math.random() }

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

// Mutates entry.morale in-place so next phase recalculation picks it up.
function nudgeMorale(lineup: LineupEntry[], instanceId: string, delta: number): void {
  const entry = lineup.find(e => e.instanceId === instanceId)
  if (entry) entry.morale = clamp(entry.morale + delta, 20, 100)
}
