import { prisma } from '../prisma'
import { Prisma } from '@prisma/client'
import { generateRoundRobin } from '../simulation/schedule'
import { generateCupBracket } from '../simulation/cup'
import type { GrowthEntry } from './sponsor.service'

const AI_TEAM_NAMES = [
  'FC Redwood', 'United City', 'Athletic Blue', 'Sporting Verde',
  'Royal Crown FC', 'Iron Gate FC', 'Silver Star United', 'Thunder Bay FC',
  'Coastal United', 'Mountain Lions FC', 'Valley United', 'Harbor City FC',
  'Riverside FC', 'Lakeside Athletic', 'Northgate FC', 'Southend United',
  'Eastside FC', 'Westbridge City',
]

export async function createLeague(
  userId: string,
  data: {
    name: string
    startingBudget: number
    maxClubs: number
    seasonLength: number
    squadSize: number
    hasCup?: boolean
    competitionType?: string
  },
) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { username: true } })
  if (!user) throw new Error('User not found')

  return prisma.league.create({
    data: {
      name: data.name,
      startingBudget: data.startingBudget,
      maxClubs: data.maxClubs,
      seasonLength: data.seasonLength,
      squadSize: data.squadSize,
      hasCup: data.hasCup ?? false,
      competitionType: (data.competitionType as any) ?? 'LEAGUE',
      clubs: {
        create: {
          name: `${user.username} FC`,
          budget: data.startingBudget,
          userId,
        },
      },
    },
    include: {
      clubs: { include: { user: { select: { id: true, username: true } } } },
    },
  })
}

export async function joinLeague(userId: string, leagueId: string, clubName: string) {
  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    include: { clubs: true },
  })
  if (!league) throw new Error('League not found')
  if (league.status !== 'SETUP') throw new Error('League has already started')

  const humanClubs = league.clubs.filter((c) => !c.isAI)
  if (humanClubs.length >= league.maxClubs) throw new Error('League is full')
  if (league.clubs.some((c) => c.userId === userId)) throw new Error('Already in this league')

  return prisma.club.create({
    data: { name: clubName, budget: league.startingBudget, userId, leagueId },
  })
}

export async function startDraft(leagueId: string, requestingUserId: string, draftType: 'SNAKE' | 'AUCTION' = 'SNAKE') {
  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    include: { clubs: true },
  })
  if (!league) throw new Error('League not found')
  if (league.status !== 'SETUP') throw new Error('Draft has already started')

  // Only the league creator (first club owner) can start the draft
  const firstClub = league.clubs.find((c) => !c.isAI)
  if (firstClub?.userId !== requestingUserId) throw new Error('Only the league creator can start the draft')

  const humanCount = league.clubs.filter((c) => !c.isAI).length
  const aiCount = league.maxClubs - humanCount
  const usedNames = new Set(league.clubs.map((c) => c.name))
  const availableAINames = AI_TEAM_NAMES.filter((n) => !usedNames.has(n))

  if (aiCount > 0) {
    await prisma.club.createMany({
      data: Array.from({ length: aiCount }, (_, i) => ({
        name: availableAINames[i] ?? `AI Club ${i + 1}`,
        budget: league.startingBudget,
        isAI: true,
        leagueId,
      })),
    })
  }

  const allClubs = await prisma.club.findMany({ where: { leagueId } })

  // Create player instances for this league in batches to avoid a single huge query
  const allPlayers = await prisma.player.findMany({ select: { id: true } })
  const BATCH = 500
  for (let i = 0; i < allPlayers.length; i += BATCH) {
    await prisma.playerInstance.createMany({
      data: allPlayers.slice(i, i + BATCH).map(p => ({ playerId: p.id, leagueId })),
      skipDuplicates: true,
    })
  }

  // Randomize initial draft order
  const shuffled = [...allClubs].sort(() => Math.random() - 0.5)

  const session = await prisma.draftSession.create({
    data: {
      leagueId,
      type: draftType,
      status: 'ACTIVE',
      pickOrder: shuffled.map((c) => c.id),
      currentRound: 1,
      currentPick: 0,
      roundsTotal: league.squadSize,
    },
  })

  await prisma.league.update({ where: { id: leagueId }, data: { status: 'DRAFTING' } })

  return { session, clubs: allClubs }
}

export async function startSeason(leagueId: string) {
  const league = await prisma.league.findUnique({ where: { id: leagueId }, select: { seasonLength: true, hasCup: true } })
  if (!league) throw new Error('League not found')

  const clubs = await prisma.club.findMany({ where: { leagueId } })
  const baseSchedule = generateRoundRobin(clubs.map((c) => c.id))

  // Cycle the round-robin to fill every matchday in the season
  const matchData: Array<{ leagueId: string; matchday: number; homeClubId: string; awayClubId: string }> = []
  for (let md = 0; md < league.seasonLength; md++) {
    const round = baseSchedule[md % baseSchedule.length]
    for (const pair of round) {
      matchData.push({ leagueId, matchday: md + 1, homeClubId: pair.homeClubId, awayClubId: pair.awayClubId })
    }
  }

  await prisma.match.createMany({ data: matchData })
  await assignAITactics(leagueId)

  if (league.hasCup) {
    await generateCupBracket(leagueId)
  }

  await prisma.league.update({ where: { id: leagueId }, data: { status: 'ACTIVE' } })
}

export async function startNewSeason(leagueId: string, userId: string): Promise<{ growthChanges: GrowthEntry[] }> {
  const league = await prisma.league.findUnique({ where: { id: leagueId }, include: { clubs: true } })
  if (!league) throw new Error('League not found')
  if (league.status !== 'FINISHED') throw new Error('Season has not finished yet')

  // Only the league creator can start a new season
  const creator = league.clubs.find((c) => !c.isAI)
  if (creator?.userId !== userId) throw new Error('Only the league creator can start a new season')

  // Save standings snapshot before clearing data
  const snapshot = {
    endedOnDay: league.currentDay,
    clubs: [...league.clubs]
      .sort((a, b) => b.points - a.points || (b.goalsFor - b.goalsAgainst) - (a.goalsFor - a.goalsAgainst))
      .map(c => ({
        id: c.id, name: c.name, isAI: c.isAI,
        wins: c.wins, draws: c.draws, losses: c.losses,
        goalsFor: c.goalsFor, goalsAgainst: c.goalsAgainst, points: c.points,
      })),
  }
  const existingHistory: any[] = Array.isArray((league as any).history) ? (league as any).history as any[] : []
  await prisma.league.update({
    where: { id: leagueId },
    data: { history: [...existingHistory, snapshot] as any },
  })

  // Fail any active sponsor deals that didn't complete last season
  await prisma.sponsorDeal.updateMany({
    where: { leagueId, status: 'ACTIVE' },
    data: { status: 'FAILED' },
  })

  // Clear match history (delete dependents first — no cascade set in schema)
  await prisma.transferListing.deleteMany({ where: { leagueId } })
  await prisma.playerBoost.deleteMany({ where: { leagueId } })
  await prisma.matchPerformance.deleteMany({ where: { match: { leagueId } } })
  await prisma.matchEvent.deleteMany({ where: { match: { leagueId } } })
  await prisma.match.deleteMany({ where: { leagueId } })
  // Reset cup bracket so it gets regenerated fresh
  await prisma.league.update({ where: { id: leagueId }, data: { cupBracket: Prisma.JsonNull } })

  // Reset all club standings
  await prisma.club.updateMany({
    where: { leagueId },
    data: { wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, points: 0 },
  })

  // Age players and apply potential-based growth/decline
  const growthChanges = await applySeasonGrowth(leagueId)

  // Reset all player instances to fresh condition
  await prisma.playerInstance.updateMany({
    where: { leagueId },
    data: { morale: 70, form: 70, fitness: 90, injured: false, injuryDaysLeft: 0, yellowCards: 0, suspendedMatchday: null },
  })

  // Generate new fixtures and re-derive AI tactics with fresh squad analysis
  await startSeason(leagueId)
  return { growthChanges }
}

// ─── Player growth ────────────────────────────────────────────────────────────

// Stats that can grow/decline, grouped by which positions benefit most
const GROWTH_WEIGHTS: Record<string, Partial<Record<string, number>>> = {
  GK:  { gkReflexes: 1.0, gkDiving: 1.0, gkPositioning: 0.9, gkHandling: 0.9, gkKicking: 0.7, gkSpeed: 0.6, movReactions: 0.5, powStrength: 0.3 },
  CB:  { defMarkingAware: 1.0, defStandingTackle: 1.0, defSlidingTackle: 0.9, menInterceptions: 0.8, powStrength: 0.8, atkHeadAccuracy: 0.7, powJumping: 0.7, sklLongPassing: 0.4, movReactions: 0.4 },
  LB:  { defMarkingAware: 0.9, defStandingTackle: 0.8, movSprintSpeed: 0.8, movAcceleration: 0.7, atkCrossing: 0.8, sklBallControl: 0.4, powStamina: 0.6 },
  RB:  { defMarkingAware: 0.9, defStandingTackle: 0.8, movSprintSpeed: 0.8, movAcceleration: 0.7, atkCrossing: 0.8, sklBallControl: 0.4, powStamina: 0.6 },
  CDM: { menInterceptions: 1.0, defMarkingAware: 0.9, defStandingTackle: 0.8, sklBallControl: 0.8, atkShortPassing: 0.7, powStamina: 0.7, menAggression: 0.6, menVision: 0.5 },
  CM:  { atkShortPassing: 1.0, menVision: 0.9, sklBallControl: 0.9, sklLongPassing: 0.8, powStamina: 0.8, movReactions: 0.6, menInterceptions: 0.5 },
  CAM: { menVision: 1.0, atkShortPassing: 0.9, sklBallControl: 0.9, sklDribbling: 0.8, atkFinishing: 0.7, movAgility: 0.6, menPositioning: 0.6 },
  LM:  { sklDribbling: 0.9, atkCrossing: 0.9, movSprintSpeed: 0.8, movAcceleration: 0.8, atkShortPassing: 0.7, powStamina: 0.7, sklBallControl: 0.6 },
  RM:  { sklDribbling: 0.9, atkCrossing: 0.9, movSprintSpeed: 0.8, movAcceleration: 0.8, atkShortPassing: 0.7, powStamina: 0.7, sklBallControl: 0.6 },
  LW:  { sklDribbling: 1.0, movAcceleration: 1.0, movSprintSpeed: 0.9, atkFinishing: 0.8, atkCrossing: 0.7, movAgility: 0.7, menPositioning: 0.5 },
  RW:  { sklDribbling: 1.0, movAcceleration: 1.0, movSprintSpeed: 0.9, atkFinishing: 0.8, atkCrossing: 0.7, movAgility: 0.7, menPositioning: 0.5 },
  CF:  { atkFinishing: 1.0, menPositioning: 1.0, sklDribbling: 0.8, powShotPower: 0.8, movAcceleration: 0.7, menComposure: 0.7 },
  ST:  { atkFinishing: 1.0, menPositioning: 1.0, powShotPower: 0.9, atkHeadAccuracy: 0.8, powStrength: 0.7, movSprintSpeed: 0.7, menComposure: 0.6 },
}

// Summary stat → detailed stats it tracks (for proportional update)
const SUMMARY_COMPONENTS: Record<string, string[]> = {
  pace:      ['movAcceleration', 'movSprintSpeed'],
  shooting:  ['atkFinishing', 'powShotPower', 'powLongShots', 'atkVolleys', 'menPositioning'],
  passing:   ['atkShortPassing', 'sklLongPassing', 'menVision', 'sklCurve', 'sklFkAccuracy'],
  dribbling: ['sklDribbling', 'sklBallControl', 'movAgility', 'movBalance', 'movReactions'],
  defending: ['defMarkingAware', 'defStandingTackle', 'defSlidingTackle', 'menInterceptions', 'menAggression'],
  physical:  ['powStrength', 'powJumping', 'powStamina'],
}

function calcGrowthDelta(age: number, potential: number, overall: number): number {
  const headroom = Math.max(0, potential - overall)

  let growthRate = 0
  if      (age <= 17) growthRate = 0.30
  else if (age <= 20) growthRate = 0.22
  else if (age <= 23) growthRate = 0.15
  else if (age <= 26) growthRate = 0.06
  // 27+: no growth

  const growth = Math.round(headroom * growthRate)

  let decline = 0
  if      (age >= 33) decline = 3 + (age - 33)
  else if (age >= 30) decline = Math.ceil((age - 29) * 0.8)
  else if (age >= 28) decline = 1

  // ±1 random noise
  const noise = Math.floor(Math.random() * 3) - 1
  return Math.max(-6, Math.min(8, growth - decline + noise))
}

function buildPlayerGrowthUpdate(player: {
  position: string; overall: number; potential: number; age: number
  pace: number; shooting: number; passing: number; dribbling: number; defending: number; physical: number
  [key: string]: number | string
}, delta: number): Record<string, number> {
  if (delta === 0) return {}

  const weights = GROWTH_WEIGHTS[player.position] ?? GROWTH_WEIGHTS['CM']!
  const sign = Math.sign(delta)
  const mag  = Math.abs(delta)

  const updates: Record<string, number> = {}

  // Detailed stats
  for (const [stat, weight] of Object.entries(weights)) {
    if (weight === undefined) continue
    const current = player[stat] as number
    if (typeof current !== 'number') continue
    const change = sign * Math.max(1, Math.round(mag * weight))
    updates[stat] = Math.max(20, Math.min(99, current + change))
  }

  // Summary stats — recalculate from updated detailed stats or approximate
  for (const [summary, components] of Object.entries(SUMMARY_COMPONENTS)) {
    const values = components.map(c => (updates[c] ?? player[c] as number)).filter(v => typeof v === 'number')
    if (values.length === 0) continue
    const avg = Math.round(values.reduce((s, v) => s + v, 0) / values.length)
    updates[summary] = Math.max(20, Math.min(99, avg))
  }

  // Overall — capped at potential for growth, floor at 30
  updates.overall = Math.max(30, Math.min(player.potential, player.overall + delta))
  updates.age = player.age + 1

  return updates
}

export async function applySeasonGrowth(leagueId: string): Promise<GrowthEntry[]> {
  const instances = await prisma.playerInstance.findMany({
    where: { leagueId },
    include: { player: true },
  })

  const playerMap = new Map<string, typeof instances[number]['player']>()
  const clubMap = new Map<string, string | null>()
  for (const inst of instances) {
    playerMap.set(inst.playerId, inst.player)
    clubMap.set(inst.playerId, inst.clubId)
  }

  const growthEntries: GrowthEntry[] = []

  const updates = [...playerMap.values()].map(player => {
    const delta = calcGrowthDelta(player.age, player.potential, player.overall)
    const changes = buildPlayerGrowthUpdate(
      player as any,
      delta,
    )
    if (Object.keys(changes).length === 0) return null
    growthEntries.push({
      playerId: player.id,
      playerName: player.name,
      position: player.position,
      clubId: clubMap.get(player.id) ?? null,
      overallWas: player.overall,
      overallNow: (changes.overall ?? player.overall) as number,
      ageWas: player.age,
    })
    return prisma.player.update({ where: { id: player.id }, data: changes })
  }).filter(Boolean) as Promise<unknown>[]

  await Promise.all(updates)
  return growthEntries
}

// ─── AI tactic assignment ─────────────────────────────────────────────────────

const AI_FORMATIONS: Record<string, string[]> = {
  '4-3-3':   ['GK','LB','CB','CB','RB','CM','CM','CM','LW','ST','RW'],
  '4-2-3-1': ['GK','LB','CB','CB','RB','CDM','CDM','LM','CAM','RM','ST'],
  '4-4-2':   ['GK','LB','CB','CB','RB','LM','CM','CM','RM','ST','ST'],
  '4-1-4-1': ['GK','LB','CB','CB','RB','CDM','LM','CM','RM','CAM','ST'],
  '3-5-2':   ['GK','CB','CB','CB','LM','CDM','CM','CM','RM','ST','ST'],
}

const POS_COMPAT: Record<string, string[]> = {
  GK:  ['GK'],
  CB:  ['CB'],
  LB:  ['LB','CB','LM'],
  RB:  ['RB','CB','RM'],
  CDM: ['CDM','CM'],
  CM:  ['CM','CDM','CAM'],
  CAM: ['CAM','CM','CF'],
  LM:  ['LM','LW','CM'],
  RM:  ['RM','RW','CM'],
  LW:  ['LW','LM','CF'],
  RW:  ['RW','RM','CF'],
  CF:  ['CF','ST','CAM'],
  ST:  ['ST','CF'],
}

type FullPlayer = {
  id: string
  position: string
  overall: number
  menAggression: number
  powStamina: number
  movSprintSpeed: number
  movAcceleration: number
  sklBallControl: number
  atkShortPassing: number
  sklDribbling: number
  defMarkingAware: number
  defStandingTackle: number
  powStrength: number
}

function attrAvg(players: FullPlayer[], fn: (p: FullPlayer) => number): number {
  if (players.length === 0) return 60
  return players.reduce((s, p) => s + fn(p), 0) / players.length
}

function clampInt(v: number, lo: number, hi: number): number {
  return Math.round(Math.max(lo, Math.min(hi, v)))
}

// Score how well the squad fills a given formation's slots
function scoreFormation(squad: { player: FullPlayer }[], slots: string[]): number {
  const remaining: Record<string, number> = {}
  for (const m of squad) {
    remaining[m.player.position] = (remaining[m.player.position] ?? 0) + 1
  }
  let score = 0
  for (const slot of slots) {
    for (const compat of (POS_COMPAT[slot] ?? [slot])) {
      if ((remaining[compat] ?? 0) > 0) { remaining[compat]--; score++; break }
    }
  }
  return score
}

function buildAILineup(
  squad: { id: string; player: FullPlayer }[],
  slots: string[],
): { instanceId: string; position: string }[] {
  const available = [...squad].sort((a, b) => b.player.overall - a.player.overall)
  const used = new Set<string>()
  const lineup: { instanceId: string; position: string }[] = []

  for (const slot of slots) {
    let picked: typeof available[number] | undefined
    for (const compatPos of (POS_COMPAT[slot] ?? [slot])) {
      picked = available.find(p => !used.has(p.id) && p.player.position === compatPos)
      if (picked) break
    }
    if (!picked) picked = available.find(p => !used.has(p.id))
    if (picked) { used.add(picked.id); lineup.push({ instanceId: picked.id, position: slot }) }
  }

  return lineup
}

function deriveAITactic(squad: { id: string; player: FullPlayer }[]) {
  const players = squad.map(s => s.player)
  const outfield = players.filter(p => p.position !== 'GK')

  // ── Squad attribute groups ────────────────────────────────────────────────
  const defenders  = players.filter(p => ['CB','LB','RB'].includes(p.position))
  const midfielders = players.filter(p => ['CDM','CM','CAM'].includes(p.position))
  const wingers    = players.filter(p => ['LW','RW','LM','RM'].includes(p.position))
  const forwards   = players.filter(p => ['ST','CF'].includes(p.position))

  // Key averages
  const avgAggression  = attrAvg(outfield,   p => p.menAggression)
  const avgStamina     = attrAvg(outfield,   p => p.powStamina)
  const avgPace        = attrAvg(outfield,   p => (p.movSprintSpeed + p.movAcceleration) / 2)
  const avgTechnical   = attrAvg(outfield,   p => (p.sklBallControl + p.atkShortPassing + p.sklDribbling) / 3)
  const midStamina     = attrAvg(midfielders.length ? midfielders : outfield, p => p.powStamina)
  const midAggression  = attrAvg(midfielders.length ? midfielders : outfield, p => p.menAggression)
  const fwdPace        = attrAvg(forwards.length    ? forwards    : outfield, p => (p.movSprintSpeed + p.movAcceleration) / 2)
  const defPace        = attrAvg(defenders.length   ? defenders   : outfield, p => (p.movSprintSpeed + p.movAcceleration) / 2)
  const defOrganisation = attrAvg(defenders.length  ? defenders   : outfield, p => (p.defMarkingAware + p.defStandingTackle) / 2)
  const wingerQuality  = attrAvg(wingers.length     ? wingers     : outfield, p => p.overall)
  const cmQuality      = attrAvg(midfielders.length ? midfielders : outfield, p => p.overall)

  // ── Style decision ────────────────────────────────────────────────────────
  // Each style gets a score from 0–100 based on how suited the squad is to it.
  // Small noise keeps identical squads from always picking the same style.
  const noise = () => (Math.random() - 0.5) * 8

  const styleScores: Record<string, number> = {
    // Pressing: needs midfielders with high aggression AND high stamina
    pressing:   (midAggression * 0.55 + midStamina * 0.45) + noise(),
    // Counter: needs fast forwards and doesn't need technical play
    counter:    (fwdPace * 0.60 + (100 - avgTechnical) * 0.20 + avgPace * 0.20) + noise(),
    // Possession: needs technical players and passing ability
    possession: (avgTechnical * 0.65 + attrAvg(outfield, p => p.atkShortPassing) * 0.35) + noise(),
    // Low block: needs organised defenders and strength to hold shape
    lowblock:   (defOrganisation * 0.55 + attrAvg(outfield, p => p.powStrength) * 0.25 + (100 - avgPace) * 0.20) + noise(),
  }

  const style = Object.entries(styleScores).sort((a, b) => b[1] - a[1])[0][0]

  // ── Pressing intensity: driven by mid stamina + aggression ────────────────
  // High stamina + aggression midfielders can sustain a high press
  const pressBase = midStamina * 0.55 + midAggression * 0.45
  const pressStyleOffset = style === 'pressing' ? 8 : style === 'lowblock' ? -18 : style === 'counter' ? -5 : 0
  const pressingIntensity = clampInt(pressBase * 0.90 + pressStyleOffset, 12, 95)

  // ── Defensive line: driven by defender pace + style ───────────────────────
  // Fast CBs can afford a high line; slow ones must sit deeper
  const lineBase = defPace * 0.70 + defOrganisation * 0.30
  const lineStyleOffset = style === 'pressing' ? 10 : style === 'lowblock' ? -22 : style === 'counter' ? -8 : 0
  const defensiveLine = clampInt(lineBase * 0.75 + lineStyleOffset, 18, 85)

  // ── Width: driven by winger quality relative to central midfield ──────────
  // Better wingers than CMs → play wider to exploit them
  const widthBase = 50 + (wingerQuality - cmQuality) * 0.6
  const widthStyleOffset = style === 'possession' ? 5 : style === 'counter' ? 8 : 0
  const width = clampInt(widthBase + widthStyleOffset, 25, 85)

  // ── Formation: pick whichever best fits the actual squad positions ─────────
  const formationKey = Object.entries(AI_FORMATIONS)
    .map(([key, slots]) => ({ key, score: scoreFormation(squad, slots) }))
    .sort((a, b) => b.score - a.score)[0].key

  const lineup = buildAILineup(squad, AI_FORMATIONS[formationKey])

  return { formation: formationKey, style, pressingIntensity, defensiveLine, width, lineup }
}

async function assignAITactics(leagueId: string): Promise<void> {
  const aiClubs = await prisma.club.findMany({
    where: { leagueId, isAI: true },
    include: {
      squad: {
        include: {
          player: {
            select: {
              id: true, position: true, overall: true,
              menAggression: true, powStamina: true,
              movSprintSpeed: true, movAcceleration: true,
              sklBallControl: true, atkShortPassing: true, sklDribbling: true,
              defMarkingAware: true, defStandingTackle: true, powStrength: true,
            },
          },
        },
      },
    },
  })

  await Promise.all(aiClubs.map(club => {
    const tactic = deriveAITactic(club.squad)
    return prisma.club.update({ where: { id: club.id }, data: { tactic } })
  }))
}

export async function updateLeague(
  leagueId: string,
  userId: string,
  data: { name?: string; startingBudget?: number; maxClubs?: number; seasonLength?: number; matchTime?: string; squadSize?: number },
) {
  const league = await prisma.league.findUnique({ where: { id: leagueId }, include: { clubs: true } })
  if (!league) throw new Error('League not found')
  if (league.status !== 'SETUP') throw new Error('Settings can only be changed before the draft starts')
  const firstHuman = league.clubs.find((c) => !c.isAI)
  if (firstHuman?.userId !== userId) throw new Error('Only the league creator can edit settings')
  return prisma.league.update({
    where: { id: leagueId },
    data,
    include: { clubs: { include: { user: { select: { id: true, username: true } } } } },
  })
}

export async function deleteLeague(leagueId: string, userId: string) {
  const league = await prisma.league.findUnique({ where: { id: leagueId }, include: { clubs: true } })
  if (!league) throw new Error('League not found')
  if (league.status === 'ACTIVE' || league.status === 'FINISHED') throw new Error('Cannot delete a league once the season has started')
  const firstHuman = league.clubs.find((c) => !c.isAI)
  if (firstHuman?.userId !== userId) throw new Error('Only the league creator can delete the league')

  // Cascade manually (schema uses RESTRICT on some FKs)
  await prisma.matchPerformance.deleteMany({ where: { match: { leagueId } } })
  await prisma.matchEvent.deleteMany({ where: { match: { leagueId } } })
  await prisma.draftPick.deleteMany({ where: { session: { leagueId } } })
  await prisma.draftSession.deleteMany({ where: { leagueId } })
  await prisma.playerInstance.deleteMany({ where: { leagueId } })
  await prisma.match.deleteMany({ where: { leagueId } })
  await prisma.club.deleteMany({ where: { leagueId } })
  await prisma.league.delete({ where: { id: leagueId } })
}

export async function kickClub(leagueId: string, clubId: string, userId: string) {
  const league = await prisma.league.findUnique({ where: { id: leagueId }, include: { clubs: true } })
  if (!league) throw new Error('League not found')
  if (league.status !== 'SETUP') throw new Error('Can only remove clubs before the draft starts')
  const firstHuman = league.clubs.find((c) => !c.isAI)
  if (firstHuman?.userId !== userId) throw new Error('Only the league creator can remove clubs')
  const club = league.clubs.find((c) => c.id === clubId)
  if (!club) throw new Error('Club not found')
  if (club.userId === userId) throw new Error("You can't remove your own club")
  await prisma.club.delete({ where: { id: clubId } })
}

export async function getLeague(leagueId: string) {
  return prisma.league.findUnique({
    where: { id: leagueId },
    include: {
      clubs: {
        include: {
          user: { select: { id: true, username: true } },
          squad: {
            include: {
              player: true,
              boosts: { where: { matchdaysLeft: { gt: 0 } }, select: { stat: true } },
            },
          },
        },
        orderBy: [{ points: 'desc' }, { goalsFor: 'desc' }],
      },
      draftSession: true,
    },
  })
}

export async function listUserLeagues(userId: string) {
  return prisma.club.findMany({
    where: { userId },
    include: {
      league: {
        select: {
          id: true,
          name: true,
          status: true,
          currentDay: true,
          seasonLength: true,
          maxClubs: true,
        },
      },
    },
  })
}
