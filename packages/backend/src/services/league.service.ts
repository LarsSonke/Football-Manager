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

export async function startDraft(leagueId: string, requestingUserId: string) {
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
      type: 'SNAKE',
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
  await prisma.league.update({ where: { id: leagueId }, data: { status: 'ACTIVE' } })
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
      homeClub: { select: { id: true, name: true } },
      awayClub: { select: { id: true, name: true } },
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
    return {
      id: e.id,
      minute: e.minute,
      type: e.type,
      team: (d?.team ?? null) as 'home' | 'away' | null,
      playerName: d?.instanceId ? (instanceInfo[d.instanceId]?.name ?? null) : null,
      assistName: d?.assistInstanceId ? (instanceInfo[d.assistInstanceId]?.name ?? null) : null,
      xg: (d?.xg ?? null) as number | null,
    }
  })

  const mapPerf = (p: (typeof match.performances)[number]) => ({
    instanceId: p.instanceId,
    playerName: p.instance.player.name,
    position: p.instance.player.position,
    rating: p.rating,
    goals: p.goals,
    assists: p.assists,
    minutesPlayed: p.minutesPlayed,
  })

  const sortPerfs = (arr: ReturnType<typeof mapPerf>[]) =>
    arr.sort((a, b) => POS_ORDER.indexOf(a.position) - POS_ORDER.indexOf(b.position))

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
