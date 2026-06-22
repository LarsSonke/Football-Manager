import { prisma } from '../prisma'
import { generateRoundRobin } from '../simulation/schedule'

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
  const clubs = await prisma.club.findMany({ where: { leagueId } })
  const schedule = generateRoundRobin(clubs.map((c) => c.id))

  const matchData = schedule.flatMap((round, i) =>
    round.map((pair) => ({
      leagueId,
      matchday: i + 1,
      homeClubId: pair.homeClubId,
      awayClubId: pair.awayClubId,
    })),
  )

  await prisma.match.createMany({ data: matchData })
  await assignAITactics(leagueId)
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
  await prisma.matchPerformance.deleteMany({ where: { match: { leagueId } } })
  await prisma.matchEvent.deleteMany({ where: { match: { leagueId } } })
  await prisma.match.deleteMany({ where: { leagueId } })

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
          squad: { include: { player: true } },
        },
        orderBy: [{ points: 'desc' }, { goalsFor: 'desc' }],
      },
      draftSession: true,
    },
  })
}

export async function getLeagueMatches(leagueId: string) {
  return prisma.match.findMany({
    where: { leagueId },
    include: {
      homeClub: { select: { id: true, name: true } },
      awayClub: { select: { id: true, name: true } },
    },
    orderBy: { matchday: 'asc' },
  })
}

const POS_ORDER = ['GK','CB','LB','RB','CDM','CM','CAM','LM','RM','LW','RW','CF','ST']

export async function getMatchDetail(leagueId: string, matchId: string) {
  const match = await prisma.match.findFirst({
    where: { id: matchId, leagueId },
    include: {
      homeClub: { select: { id: true, name: true, logoConfig: true } },
      awayClub: { select: { id: true, name: true, logoConfig: true } },
      events: { orderBy: { minute: 'asc' } },
      performances: {
        include: {
          instance: {
            include: { player: { select: { name: true, position: true } } },
          },
        },
      },
    },
  })
  if (!match) return null

  // Build instanceId → player info lookup
  const instanceInfo: Record<string, { name: string; position: string }> = {}
  for (const p of match.performances) {
    instanceInfo[p.instanceId] = { name: p.instance.player.name, position: p.instance.player.position }
  }

  const events = match.events.map(e => {
    const d = e.detail as any
    const isSub = e.type === 'SUBSTITUTION'
    return {
      id: e.id,
      minute: e.minute,
      type: e.type,
      team: (d?.team ?? null) as 'home' | 'away' | null,
      playerName: isSub
        ? (d?.outInstanceId ? (instanceInfo[d.outInstanceId]?.name ?? null) : null)
        : (d?.instanceId    ? (instanceInfo[d.instanceId]?.name    ?? null) : null),
      assistName: isSub
        ? (d?.inInstanceId      ? (instanceInfo[d.inInstanceId]?.name      ?? null) : null)
        : (d?.assistInstanceId  ? (instanceInfo[d.assistInstanceId]?.name  ?? null) : null),
      xg: (d?.xg ?? null) as number | null,
    }
  })

  const mapPerf = (p: (typeof match.performances)[number]) => ({
    instanceId: p.instanceId,
    playerName: p.instance.player.name,
    position: p.instance.player.position,
    positionPlayed: p.positionPlayed ?? null,
    rating: p.rating,
    goals: p.goals,
    assists: p.assists,
    minutesPlayed: p.minutesPlayed,
  })

  const sortPerfs = (arr: ReturnType<typeof mapPerf>[]) =>
    arr.sort((a, b) => POS_ORDER.indexOf(a.positionPlayed ?? a.position) - POS_ORDER.indexOf(b.positionPlayed ?? b.position))

  const homePerfs = sortPerfs(
    match.performances.filter(p => p.instance.clubId === match.homeClubId).map(mapPerf),
  )
  const awayPerfs = sortPerfs(
    match.performances.filter(p => p.instance.clubId === match.awayClubId).map(mapPerf),
  )

  return {
    id: match.id,
    matchday: match.matchday,
    status: match.status,
    simulatedAt: match.simulatedAt,
    homeClub: match.homeClub,
    awayClub: match.awayClub,
    homeScore: match.homeScore,
    awayScore: match.awayScore,
    stats: match.stats as { home: { shots: number; shotsOnTarget: number; xG: number; possession: number; yellowCards: number; redCards: number }; away: { shots: number; shotsOnTarget: number; xG: number; possession: number; yellowCards: number; redCards: number } } | null,
    events,
    performances: { home: homePerfs, away: awayPerfs },
  }
}

// ─── Season stats ────────────────────────────────────────────────────────────

export async function getLeagueStats(leagueId: string) {
  const [groups, gkPerfs] = await Promise.all([
    prisma.matchPerformance.groupBy({
      by: ['instanceId'],
      where: { match: { leagueId } },
      _sum: { goals: true, assists: true },
      _avg: { rating: true },
      _count: { instanceId: true },
    }),
    // Clean sheets: GK performances where their team conceded 0
    prisma.matchPerformance.findMany({
      where: {
        match: { leagueId },
        positionPlayed: 'GK',
      },
      include: {
        match: { select: { homeClubId: true, awayClubId: true, homeScore: true, awayScore: true } },
        instance: { select: { clubId: true } },
      },
    }),
  ])

  if (groups.length === 0) return []

  // Count clean sheets per instanceId
  const cleanSheetMap: Record<string, number> = {}
  for (const p of gkPerfs) {
    const m = p.match
    if (m.homeScore == null || m.awayScore == null) continue
    const clubId = p.instance.clubId
    const conceded = clubId === m.homeClubId ? m.awayScore : m.homeScore
    if (conceded === 0) cleanSheetMap[p.instanceId] = (cleanSheetMap[p.instanceId] ?? 0) + 1
  }

  const instances = await prisma.playerInstance.findMany({
    where: { id: { in: groups.map(g => g.instanceId) } },
    include: {
      player: { select: { name: true, position: true } },
      club: { select: { id: true, name: true, logoConfig: true } },
    },
  })

  const instanceMap = Object.fromEntries(instances.map(i => [i.id, i]))

  return groups.map(g => {
    const inst = instanceMap[g.instanceId]
    return {
      instanceId: g.instanceId,
      playerName: inst?.player.name ?? 'Unknown',
      position: inst?.player.position ?? '?',
      clubId: inst?.club?.id ?? null,
      clubName: inst?.club?.name ?? '—',
      clubLogoConfig: inst?.club?.logoConfig ?? null,
      goals: g._sum.goals ?? 0,
      assists: g._sum.assists ?? 0,
      appearances: g._count.instanceId,
      avgRating: g._avg.rating ? Math.round(g._avg.rating * 10) / 10 : 0,
      cleanSheets: cleanSheetMap[g.instanceId] ?? 0,
    }
  })
}

export async function getMatchdayStars(leagueId: string) {
  const league = await prisma.league.findUnique({ where: { id: leagueId }, select: { currentDay: true, status: true } })
  if (!league || league.currentDay === 0) return null

  const lastMatchday = league.currentDay

  const perfs = await prisma.matchPerformance.findMany({
    where: { match: { leagueId, matchday: lastMatchday, status: 'SIMULATED' } },
    orderBy: { rating: 'desc' },
    include: {
      instance: {
        include: {
          player: { select: { name: true, position: true, overall: true } },
          club: { select: { id: true, name: true, logoConfig: true } },
        },
      },
      match: { select: { homeClubId: true, awayClubId: true, homeScore: true, awayScore: true } },
    },
  })

  if (perfs.length === 0) return null

  // Build best XI: 1 GK, 4 DEF, 3 MID, 3 ATT (by rating, no duplicate clubs max 2)
  const GK_POS = ['GK']
  const DEF_POS = ['CB', 'LB', 'RB']
  const MID_POS = ['CDM', 'CM', 'CAM', 'LM', 'RM']
  const ATT_POS = ['LW', 'RW', 'CF', 'ST']
  const posGroup = (p: string) => {
    if (GK_POS.includes(p)) return 'GK'
    if (DEF_POS.includes(p)) return 'DEF'
    if (MID_POS.includes(p)) return 'MID'
    return 'ATT'
  }
  const slots = { GK: 1, DEF: 4, MID: 3, ATT: 3 }
  const counts: Record<string, number> = { GK: 0, DEF: 0, MID: 0, ATT: 0 }
  const selected: typeof perfs = []
  const usedInstances = new Set<string>()

  for (const p of perfs) {
    const pos = p.positionPlayed ?? p.instance.player.position
    const grp = posGroup(pos)
    if (counts[grp] < slots[grp] && !usedInstances.has(p.instanceId)) {
      selected.push(p)
      counts[grp]++
      usedInstances.add(p.instanceId)
    }
    if (selected.length === 11) break
  }

  // Also find top scorer and top assister of the matchday
  const byGoals = [...perfs].sort((a, b) => b.goals - a.goals || b.rating - a.rating)
  const byAssists = [...perfs].sort((a, b) => b.assists - a.assists || b.rating - a.rating)
  const motm = perfs[0]

  return {
    matchday: lastMatchday,
    teamOfTheWeek: selected.map(p => ({
      instanceId: p.instanceId,
      playerName: p.instance.player.name,
      position: p.positionPlayed ?? p.instance.player.position,
      clubId: p.instance.club?.id ?? null,
      clubName: p.instance.club?.name ?? '—',
      clubLogoConfig: p.instance.club?.logoConfig ?? null,
      rating: Math.round(p.rating * 10) / 10,
      goals: p.goals,
      assists: p.assists,
    })),
    motm: motm ? {
      instanceId: motm.instanceId,
      playerName: motm.instance.player.name,
      position: motm.positionPlayed ?? motm.instance.player.position,
      clubId: motm.instance.club?.id ?? null,
      clubName: motm.instance.club?.name ?? '—',
      clubLogoConfig: motm.instance.club?.logoConfig ?? null,
      rating: Math.round(motm.rating * 10) / 10,
      goals: motm.goals,
      assists: motm.assists,
    } : null,
    topScorer: byGoals[0]?.goals > 0 ? {
      instanceId: byGoals[0].instanceId,
      playerName: byGoals[0].instance.player.name,
      goals: byGoals[0].goals,
      clubName: byGoals[0].instance.club?.name ?? '—',
      clubLogoConfig: byGoals[0].instance.club?.logoConfig ?? null,
    } : null,
    topAssist: byAssists[0]?.assists > 0 ? {
      instanceId: byAssists[0].instanceId,
      playerName: byAssists[0].instance.player.name,
      assists: byAssists[0].assists,
      clubName: byAssists[0].instance.club?.name ?? '—',
      clubLogoConfig: byAssists[0].instance.club?.logoConfig ?? null,
    } : null,
  }
}

// ─── Physio ───────────────────────────────────────────────────────────────────

const PHYSIO_UPGRADE_COSTS = [15_000, 30_000] // level 0→1, 1→2

export async function upgradePhysio(leagueId: string, userId: string) {
  const club = await prisma.club.findFirst({ where: { leagueId, userId } })
  if (!club) throw new Error('You do not have a club in this league')
  if (club.physioLevel >= 2) throw new Error('Physio already at max level')
  const cost = PHYSIO_UPGRADE_COSTS[club.physioLevel]
  if (club.budget < cost) throw new Error(`Insufficient budget — need €${(cost / 1000).toFixed(0)}k`)
  return prisma.club.update({
    where: { id: club.id },
    data: { physioLevel: { increment: 1 }, budget: { decrement: cost } },
  })
}

// Heal cost: €1,000/day remaining, reduced by physio level
function healCost(daysLeft: number, physioLevel: number): number {
  const discount = physioLevel >= 2 ? 0.3 : physioLevel >= 1 ? 0.6 : 1.0
  return Math.round(daysLeft * 1_000 * discount)
}

export async function healPlayer(leagueId: string, userId: string, instanceId: string) {
  const club = await prisma.club.findFirst({ where: { leagueId, userId } })
  if (!club) throw new Error('You do not have a club in this league')
  const instance = await prisma.playerInstance.findUnique({ where: { id: instanceId } })
  if (!instance || instance.clubId !== club.id) throw new Error('Player not found in your squad')
  if (!instance.injured) throw new Error('Player is not injured')
  const cost = healCost(instance.injuryDaysLeft, club.physioLevel)
  if (club.budget < cost) throw new Error(`Insufficient budget — need €${(cost / 1000).toFixed(1)}k`)
  await prisma.$transaction([
    prisma.playerInstance.update({ where: { id: instanceId }, data: { injured: false, injuryDaysLeft: 0 } }),
    prisma.club.update({ where: { id: club.id }, data: { budget: { decrement: cost } } }),
  ])
  return { cost, budgetLeft: club.budget - cost }
}

// ─── Position training ────────────────────────────────────────────────────────

const VALID_POSITIONS = ['GK','CB','LB','RB','CDM','CM','CAM','LM','RM','LW','RW','CF','ST'] as const

function posGroup(pos: string): number {
  if (pos === 'GK') return 0
  if (['CB','LB','RB'].includes(pos)) return 1
  if (['CDM','CM','CAM','LM','RM'].includes(pos)) return 2
  return 3
}

export function calcTrainCost(fromPos: string, toPos: string): number | null {
  const fg = posGroup(fromPos), tg = posGroup(toPos)
  if (fg === 0 || tg === 0) return null  // GK <-> outfield not allowed
  if (fg === tg) return 3_000
  if (Math.abs(fg - tg) === 1) return 7_000
  return 12_000
}

export async function trainPlayer(
  leagueId: string,
  userId: string,
  instanceId: string,
  targetPosition: string,
) {
  if (!(VALID_POSITIONS as readonly string[]).includes(targetPosition))
    throw new Error('Invalid position')
  const club = await prisma.club.findFirst({ where: { leagueId, userId } })
  if (!club) throw new Error('You do not have a club in this league')
  const instance = await prisma.playerInstance.findUnique({
    where: { id: instanceId },
    include: { player: { select: { position: true } } },
  })
  if (!instance || instance.clubId !== club.id) throw new Error('Player not found in your squad')
  if (instance.player.position === targetPosition) throw new Error('Player already plays there naturally')
  const cost = calcTrainCost(instance.player.position, targetPosition)
  if (cost === null) throw new Error('Cannot train a goalkeeper to an outfield position or vice versa')
  if (club.budget < cost) throw new Error(`Insufficient budget — need €${(cost / 1000).toFixed(0)}k`)
  await prisma.$transaction([
    prisma.playerInstance.update({ where: { id: instanceId }, data: { trainedPosition: targetPosition } }),
    prisma.club.update({ where: { id: club.id }, data: { budget: { decrement: cost } } }),
  ])
  return { targetPosition, cost, budgetLeft: club.budget - cost }
}

// ─── MATCH INCOME ─────────────────────────────────────────────────────────────

export async function applyMatchIncome(
  leagueId: string,
  results: Array<{ homeClubId: string; awayClubId: string; homeScore: number; awayScore: number }>,
) {
  const league = await prisma.league.findUnique({ where: { id: leagueId }, select: { startingBudget: true } })
  if (!league) return

  const base = Math.round(league.startingBudget * 0.004)   // ~0.4% of starting budget per match
  const winBonus = Math.round(league.startingBudget * 0.006)
  const drawBonus = Math.round(league.startingBudget * 0.002)

  for (const r of results) {
    const homeBonus = r.homeScore > r.awayScore ? winBonus : r.homeScore === r.awayScore ? drawBonus : 0
    const awayBonus = r.awayScore > r.homeScore ? winBonus : r.homeScore === r.awayScore ? drawBonus : 0
    await prisma.club.update({ where: { id: r.homeClubId }, data: { budget: { increment: base + homeBonus } } })
    await prisma.club.update({ where: { id: r.awayClubId }, data: { budget: { increment: base + awayBonus } } })
  }
}

// ─── SPONSOR DEALS ────────────────────────────────────────────────────────────

export type GrowthEntry = {
  playerId: string
  playerName: string
  position: string
  clubId: string | null
  overallWas: number
  overallNow: number
  ageWas: number
}

const SPONSOR_POOL = [
  { name: 'Apex Energy',     emoji: '⚡' },
  { name: 'Ironclad Sports', emoji: '🛡️' },
  { name: 'Veloce Gear',     emoji: '🏎️' },
  { name: 'Summit Finance',  emoji: '💰' },
  { name: 'Nova Telecom',    emoji: '📡' },
  { name: 'Titan Brewing',   emoji: '🍺' },
  { name: 'Skyline Autos',   emoji: '🚗' },
  { name: 'Crest Insurance', emoji: '🏠' },
]

function pickSponsor(used: Set<string>) {
  const available = SPONSOR_POOL.filter(s => !used.has(s.name))
  return available[Math.floor(Math.random() * available.length)] ?? SPONSOR_POOL[0]
}

export async function getAvailableDeals(leagueId: string, userId: string) {
  const club = await prisma.club.findFirst({
    where: { leagueId, userId },
    include: {
      league: { select: { startingBudget: true, currentDay: true } },
      squad: {
        include: { player: { select: { id: true, name: true, overall: true, position: true } } },
        where: { injured: false },
      },
    },
  })
  if (!club) throw new Error('You do not have a club in this league')

  const scale = club.league.startingBudget / 150_000
  const used = new Set<string>()
  const deals: Array<{
    type: string; sponsorName: string; sponsorEmoji: string
    mission: string; params: object; cost: number; reward: number
  }> = []

  const squad = club.squad.sort((a, b) => b.player.overall - a.player.overall)

  // 1. PLAY_PLAYER — pick a random squad member
  if (squad.length > 0) {
    const target = squad[Math.floor(Math.random() * Math.min(squad.length, 15))]
    const sp = pickSponsor(used); used.add(sp.name)
    const cost = Math.round(3_000 * scale)
    deals.push({
      type: 'PLAY_PLAYER', sponsorName: sp.name, sponsorEmoji: sp.emoji,
      mission: `Start ${target.player.name} in the next match`,
      params: { instanceId: target.id, playerName: target.player.name },
      cost, reward: Math.round(cost * 2.2),
    })
  }

  // 2. WIN_MATCH
  {
    const sp = pickSponsor(used); used.add(sp.name)
    const cost = Math.round(5_000 * scale)
    deals.push({
      type: 'WIN_MATCH', sponsorName: sp.name, sponsorEmoji: sp.emoji,
      mission: 'Win the next match', params: {},
      cost, reward: Math.round(cost * 2.0),
    })
  }

  // 3. CLEAN_SHEET
  {
    const sp = pickSponsor(used); used.add(sp.name)
    const cost = Math.round(4_000 * scale)
    deals.push({
      type: 'CLEAN_SHEET', sponsorName: sp.name, sponsorEmoji: sp.emoji,
      mission: 'Keep a clean sheet in the next match', params: {},
      cost, reward: Math.round(cost * 2.1),
    })
  }

  // 4. SCORE_GOALS — score 3+ goals
  {
    const sp = pickSponsor(used); used.add(sp.name)
    const cost = Math.round(4_500 * scale)
    deals.push({
      type: 'SCORE_GOALS', sponsorName: sp.name, sponsorEmoji: sp.emoji,
      mission: 'Score at least 3 goals in the next match', params: { goals: 3 },
      cost, reward: Math.round(cost * 2.0),
    })
  }

  // 5. PLAYER_RATING — top player rated 7.5+
  if (squad.length > 0) {
    const star = squad[0]
    const sp = pickSponsor(used); used.add(sp.name)
    const cost = Math.round(3_500 * scale)
    deals.push({
      type: 'PLAYER_RATING', sponsorName: sp.name, sponsorEmoji: sp.emoji,
      mission: `${star.player.name} must achieve a rating of 7.5 or higher`,
      params: { instanceId: star.id, playerName: star.player.name, minRating: 7.5 },
      cost, reward: Math.round(cost * 2.3),
    })
  }

  return deals
}

export async function signSponsorDeal(
  leagueId: string,
  userId: string,
  dealIndex: number,
) {
  const club = await prisma.club.findFirst({
    where: { leagueId, userId },
    include: {
      league: { select: { startingBudget: true, currentDay: true, status: true } },
      squad: {
        include: { player: { select: { id: true, name: true, overall: true, position: true } } },
        where: { injured: false },
      },
    },
  })
  if (!club) throw new Error('You do not have a club in this league')
  if (club.league.status !== 'ACTIVE') throw new Error('League is not active')

  const existing = await prisma.sponsorDeal.count({ where: { clubId: club.id, status: 'ACTIVE' } })
  if (existing >= 3) throw new Error('You already have 3 active sponsor deals')

  // Re-generate deals deterministically for the same squad state
  const deals = await getAvailableDeals(leagueId, userId)
  if (dealIndex < 0 || dealIndex >= deals.length) throw new Error('Invalid deal index')

  const deal = deals[dealIndex]
  if (club.budget < deal.cost) throw new Error(`Insufficient budget — need €${(deal.cost / 1000).toFixed(1)}k`)

  const [created] = await prisma.$transaction([
    prisma.sponsorDeal.create({
      data: {
        clubId: club.id,
        leagueId,
        sponsorName: deal.sponsorName,
        sponsorEmoji: deal.sponsorEmoji,
        mission: deal.mission,
        type: deal.type as any,
        params: deal.params,
        cost: deal.cost,
        reward: deal.reward,
        status: 'ACTIVE',
        targetMatchday: club.league.currentDay + 1,
      },
    }),
    prisma.club.update({ where: { id: club.id }, data: { budget: { decrement: deal.cost } } }),
  ])

  return created
}

export async function getClubSponsorDeals(leagueId: string, userId: string) {
  const club = await prisma.club.findFirst({ where: { leagueId, userId } })
  if (!club) throw new Error('You do not have a club in this league')

  const [available, active, history] = await Promise.all([
    getAvailableDeals(leagueId, userId),
    prisma.sponsorDeal.findMany({
      where: { clubId: club.id, status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.sponsorDeal.findMany({
      where: { clubId: club.id, status: { in: ['COMPLETED', 'FAILED'] } },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
  ])

  return { available, active, history }
}

export async function checkSponsorMissions(leagueId: string, matchday: number): Promise<Array<{ clubId: string; sponsorName: string; sponsorEmoji: string; completed: boolean; reward: number }>> {
  const deals = await prisma.sponsorDeal.findMany({
    where: { leagueId, status: 'ACTIVE', targetMatchday: matchday },
    include: { club: true },
  })
  if (deals.length === 0) return []
  const resolved: Array<{ clubId: string; sponsorName: string; sponsorEmoji: string; completed: boolean; reward: number }> = []

  const matches = await prisma.match.findMany({
    where: { leagueId, matchday, status: 'SIMULATED' },
    include: { performances: true },
  })

  for (const deal of deals) {
    const match = matches.find(
      m => m.homeClubId === deal.clubId || m.awayClubId === deal.clubId,
    )
    if (!match) {
      // No match this day — fail the deal
      await prisma.sponsorDeal.update({ where: { id: deal.id }, data: { status: 'FAILED' } })
      continue
    }

    const isHome = match.homeClubId === deal.clubId
    const clubScore = isHome ? (match.homeScore ?? 0) : (match.awayScore ?? 0)
    const oppScore  = isHome ? (match.awayScore  ?? 0) : (match.homeScore ?? 0)
    const params = deal.params as any

    let completed = false
    switch (deal.type) {
      case 'WIN_MATCH':
        completed = clubScore > oppScore
        break
      case 'CLEAN_SHEET':
        completed = oppScore === 0
        break
      case 'SCORE_GOALS':
        completed = clubScore >= (params.goals ?? 3)
        break
      case 'PLAY_PLAYER': {
        const played = match.performances.some(
          p => p.instanceId === params.instanceId && p.minutesPlayed > 0,
        )
        completed = played
        break
      }
      case 'PLAYER_RATING': {
        const perf = match.performances.find(p => p.instanceId === params.instanceId)
        completed = !!perf && perf.rating >= (params.minRating ?? 7.5)
        break
      }
    }

    await prisma.$transaction([
      prisma.sponsorDeal.update({
        where: { id: deal.id },
        data: { status: completed ? 'COMPLETED' : 'FAILED' },
      }),
      ...(completed
        ? [prisma.club.update({ where: { id: deal.clubId }, data: { budget: { increment: deal.reward } } })]
        : []),
    ])
    resolved.push({ clubId: deal.clubId, sponsorName: deal.sponsorName, sponsorEmoji: deal.sponsorEmoji, completed, reward: deal.reward })
  }
  return resolved
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
