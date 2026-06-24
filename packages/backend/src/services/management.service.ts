import { prisma } from '../prisma'

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

const MARKETING_BONUS = [0, 0.05, 0.10, 0.18]
const STADIUM_BONUS   = [0, 0.08, 0.15, 0.25]
const VIP_PASSIVE_PCT = [0, 0.001, 0.002, 0.004]  // % of startingBudget per matchday

export async function applyMatchIncome(
  leagueId: string,
  results: Array<{ homeClubId: string; awayClubId: string; homeScore: number; awayScore: number }>,
) {
  const league = await prisma.league.findUnique({ where: { id: leagueId }, select: { startingBudget: true } })
  if (!league) return

  const sb = league.startingBudget
  const base     = Math.round(sb * 0.004)
  const winBonus = Math.round(sb * 0.006)
  const drawBonus = Math.round(sb * 0.002)

  // Fetch club upgrade levels for all participating clubs
  const clubIds = [...new Set(results.flatMap(r => [r.homeClubId, r.awayClubId]))]
  const clubRows = await prisma.club.findMany({
    where: { id: { in: clubIds } },
    select: { id: true, stadiumLevel: true, marketingLevel: true, vipLevel: true },
  })
  const clubMap = Object.fromEntries(clubRows.map(c => [c.id, c]))

  for (const r of results) {
    const home = clubMap[r.homeClubId]
    const away = clubMap[r.awayClubId]

    const homeResultBonus = r.homeScore > r.awayScore ? winBonus : r.homeScore === r.awayScore ? drawBonus : 0
    const awayResultBonus = r.awayScore > r.homeScore ? winBonus : r.homeScore === r.awayScore ? drawBonus : 0

    const homeMarketing = home ? MARKETING_BONUS[home.marketingLevel] ?? 0 : 0
    const awayMarketing = away ? MARKETING_BONUS[away.marketingLevel] ?? 0 : 0
    const homeStadium   = home ? STADIUM_BONUS[home.stadiumLevel] ?? 0 : 0

    const homeIncome = Math.round((base + homeResultBonus) * (1 + homeMarketing + homeStadium))
    const awayIncome = Math.round((base + awayResultBonus) * (1 + awayMarketing))

    await prisma.club.update({ where: { id: r.homeClubId }, data: { budget: { increment: homeIncome } } })
    await prisma.club.update({ where: { id: r.awayClubId }, data: { budget: { increment: awayIncome } } })
  }

  // VIP passive income for ALL clubs in the league each matchday
  const allClubs = await prisma.club.findMany({
    where: { leagueId },
    select: { id: true, vipLevel: true },
  })
  for (const c of allClubs) {
    if (c.vipLevel <= 0) continue
    const vipIncome = Math.round(sb * (VIP_PASSIVE_PCT[c.vipLevel] ?? 0))
    if (vipIncome > 0) {
      await prisma.club.update({ where: { id: c.id }, data: { budget: { increment: vipIncome } } })
    }
  }
}

// ─── Club upgrades (staff + facilities) ──────────────────────────────────────

type UpgradeType = 'scout' | 'coach' | 'trainer' | 'marketing' | 'stadium' | 'training' | 'kit' | 'vip'

const UPGRADE_FIELD: Record<UpgradeType, string> = {
  scout: 'scoutLevel', coach: 'coachLevel', trainer: 'trainerLevel', marketing: 'marketingLevel',
  stadium: 'stadiumLevel', training: 'trainingLevel', kit: 'kitLevel', vip: 'vipLevel',
}

// Cost as fraction of starting budget per level (index = currentLevel)
const UPGRADE_COSTS_PCT: Record<UpgradeType, number[]> = {
  scout:     [0.04, 0.08, 0.15],
  coach:     [0.04, 0.08, 0.15],
  trainer:   [0.04, 0.08, 0.15],
  marketing: [0.04, 0.08, 0.15],
  stadium:   [0.07, 0.14, 0.24],
  training:  [0.05, 0.10, 0.18],
  kit:       [0.02, 0.04, 0.07],
  vip:       [0.06, 0.12, 0.20],
}

export async function upgradeClub(leagueId: string, userId: string, upgradeType: UpgradeType) {
  const club = await prisma.club.findFirst({
    where: { leagueId, userId },
    include: { league: { select: { startingBudget: true, status: true } } },
  })
  if (!club) throw new Error('You do not have a club in this league')
  if (club.league.status !== 'ACTIVE') throw new Error('Upgrades are only available during an active season')

  const field = UPGRADE_FIELD[upgradeType]
  const currentLevel = (club as any)[field] as number
  if (currentLevel >= 3) throw new Error(`${upgradeType} is already at max level`)

  const pcts = UPGRADE_COSTS_PCT[upgradeType]
  const cost = Math.round(club.league.startingBudget * pcts[currentLevel])
  if (club.budget < cost) throw new Error(`Insufficient budget — need €${Math.round(cost / 1000)}k`)

  return prisma.club.update({
    where: { id: club.id },
    data: { [field]: { increment: 1 }, budget: { decrement: cost } },
  })
}

// ─── Stat boosts ─────────────────────────────────────────────────────────────

const BOOST_COST_PCT  = 0.025  // 2.5% of starting budget
const BOOST_AMOUNT    = 5
const BOOST_DURATION  = 5      // matchdays

export async function purchaseBoost(leagueId: string, userId: string, instanceId: string, stat: string) {
  const validStats = ['pace', 'shooting', 'passing', 'defending', 'physical']
  if (!validStats.includes(stat)) throw new Error('Invalid stat')

  const club = await prisma.club.findFirst({
    where: { leagueId, userId },
    include: { league: { select: { startingBudget: true, status: true } } },
  })
  if (!club) throw new Error('You do not have a club in this league')
  if (club.league.status !== 'ACTIVE') throw new Error('Boosts are only available during an active season')

  const instance = await prisma.playerInstance.findUnique({ where: { id: instanceId } })
  if (!instance || instance.clubId !== club.id) throw new Error('Player not in your squad')

  // Only one active boost per stat per player
  const existing = await prisma.playerBoost.count({
    where: { instanceId, stat, matchdaysLeft: { gt: 0 } },
  })
  if (existing > 0) throw new Error(`Player already has an active ${stat} boost`)

  const cost = Math.round(club.league.startingBudget * BOOST_COST_PCT)
  if (club.budget < cost) throw new Error(`Insufficient budget — need €${Math.round(cost / 1000)}k`)

  await prisma.$transaction([
    prisma.playerBoost.create({
      data: { leagueId, instanceId, stat, amount: BOOST_AMOUNT, matchdaysLeft: BOOST_DURATION },
    }),
    prisma.club.update({ where: { id: club.id }, data: { budget: { decrement: cost } } }),
  ])

  return { stat, amount: BOOST_AMOUNT, matchdaysLeft: BOOST_DURATION, cost }
}

// ─── Scout report ─────────────────────────────────────────────────────────────

export async function getScoutReport(leagueId: string, userId: string, targetClubId: string) {
  const myClub = await prisma.club.findFirst({ where: { leagueId, userId } })
  if (!myClub) throw new Error('You do not have a club in this league')

  const scoutLevel = myClub.scoutLevel

  const recentMatches = await prisma.match.findMany({
    where: {
      leagueId,
      status: 'SIMULATED',
      OR: [{ homeClubId: targetClubId }, { awayClubId: targetClubId }],
    },
    orderBy: { matchday: 'desc' },
    take: scoutLevel >= 3 ? 6 : 3,
    select: {
      id: true, matchday: true,
      homeClubId: true, awayClubId: true,
      homeScore: true, awayScore: true,
      homeTactic: true, awayTactic: true,
      stats: true,
    },
  })

  const report: Record<string, unknown> = {
    scoutLevel,
    recentResults: recentMatches.map(m => {
      const isHome = m.homeClubId === targetClubId
      return {
        matchday: m.matchday,
        goalsFor: isHome ? m.homeScore : m.awayScore,
        goalsAgainst: isHome ? m.awayScore : m.homeScore,
      }
    }),
  }

  if (scoutLevel >= 2) {
    // Reveal tactic style and formation
    const tactics = recentMatches
      .map(m => (m.homeClubId === targetClubId ? m.homeTactic : m.awayTactic))
      .filter(Boolean) as any[]
    const latestTactic = tactics[0]
    if (latestTactic) {
      report.lastKnownFormation = latestTactic.formation ?? null
      report.lastKnownStyle = latestTactic.style ?? null
      report.lastKnownPressing = latestTactic.pressingIntensity ?? null
      report.lastKnownDefLine = latestTactic.defensiveLine ?? null
    }
    // Average stats over last 3 matches
    const statRows = recentMatches.map(m => {
      const s = m.stats as any
      return m.homeClubId === targetClubId ? s?.home : s?.away
    }).filter(Boolean)
    if (statRows.length > 0) {
      report.avgStats = {
        shots: Math.round(statRows.reduce((s: number, r: any) => s + (r.shots ?? 0), 0) / statRows.length),
        possession: Math.round(statRows.reduce((s: number, r: any) => s + (r.possession ?? 50), 0) / statRows.length),
        xG: Math.round(statRows.reduce((s: number, r: any) => s + (r.xG ?? 0), 0) / statRows.length * 10) / 10,
      }
    }
  }

  if (scoutLevel >= 3) {
    // Reveal likely lineup (current squad sorted by position + overall)
    const targetClub = await prisma.club.findUnique({
      where: { id: targetClubId },
      include: {
        squad: {
          where: { injured: false },
          include: { player: { select: { name: true, position: true, overall: true } } },
          orderBy: [{ player: { overall: 'desc' } }],
          take: 16,
        },
      },
    })
    report.likelySquad = targetClub?.squad.map(inst => ({
      name: inst.player.name,
      position: inst.player.position,
      overall: inst.player.overall,
      fitness: inst.fitness,
    })) ?? []
  }

  return report
}

// ─── Coach advice ─────────────────────────────────────────────────────────────

export async function getCoachAdvice(leagueId: string, userId: string) {
  const club = await prisma.club.findFirst({
    where: { leagueId, userId },
    include: {
      squad: {
        where: { injured: false },
        include: { player: { select: { name: true, position: true, overall: true, age: true } } },
        orderBy: [{ player: { overall: 'desc' } }],
      },
    },
  })
  if (!club) throw new Error('You do not have a club in this league')
  if (club.coachLevel === 0) throw new Error('Upgrade to Coach level 1 to receive advice')

  const posCount = club.squad.reduce((acc, inst) => {
    acc[inst.player.position] = (acc[inst.player.position] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)

  const advice: Record<string, unknown> = { coachLevel: club.coachLevel }

  // L1: formation recommendation based on squad depth
  const formationScores = [
    { formation: '4-3-3',   reqs: { GK:1,CB:2,LB:1,RB:1,CM:3,LW:1,ST:1,RW:1 } },
    { formation: '4-2-3-1', reqs: { GK:1,CB:2,LB:1,RB:1,CDM:2,CAM:1,ST:1 } },
    { formation: '4-4-2',   reqs: { GK:1,CB:2,LB:1,RB:1,CM:2,LM:1,RM:1,ST:2 } },
    { formation: '3-5-2',   reqs: { GK:1,CB:3,CDM:1,CM:2,LM:1,RM:1,ST:2 } },
    { formation: '4-1-4-1', reqs: { GK:1,CB:2,LB:1,RB:1,CDM:1,CM:2,LM:1,RM:1,ST:1 } },
  ].map(f => {
    const score = Object.entries(f.reqs).reduce((s, [pos, req]) => s + Math.min(posCount[pos] ?? 0, req), 0)
    return { formation: f.formation, score }
  })
  formationScores.sort((a, b) => b.score - a.score)
  advice.recommendedFormation = formationScores[0].formation
  advice.formationReason = `Your squad has strong ${formationScores[0].formation} coverage`

  if (club.coachLevel >= 2) {
    // Optimal lineup suggestion: best available player per position
    const tactic = club.tactic as any
    advice.currentFormation = tactic?.formation ?? null
    advice.topPlayers = club.squad.slice(0, 11).map(inst => ({
      name: inst.player.name,
      position: inst.player.position,
      overall: inst.player.overall,
    }))
  }

  if (club.coachLevel >= 3) {
    // Tactic style advice based on squad attributes
    const outfield = club.squad.filter(inst => inst.player.position !== 'GK')
    const avgOverall = outfield.length
      ? Math.round(outfield.reduce((s, inst) => s + inst.player.overall, 0) / outfield.length)
      : 70
    advice.styleAdvice = avgOverall >= 80
      ? 'Your high-quality squad suits possession play'
      : avgOverall >= 74
      ? 'A balanced counter-attacking approach suits your squad'
      : 'With a developing squad, a low block will minimize mistakes'
  }

  return advice
}

// ─── Kit config ───────────────────────────────────────────────────────────────

export async function saveKit(leagueId: string, userId: string, kitConfig: unknown) {
  const club = await prisma.club.findFirst({ where: { leagueId, userId } })
  if (!club) throw new Error('You do not have a club in this league')
  return prisma.club.update({ where: { id: club.id }, data: { kitConfig: kitConfig as any } })
}
