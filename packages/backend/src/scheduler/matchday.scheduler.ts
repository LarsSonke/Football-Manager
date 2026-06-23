import cron from 'node-cron'
import { prisma } from '../prisma'
import { simulateMatch, adaptTacticForOpponent, buildOpponentProfile } from '../simulation/engine'
import { applyMatchIncome, checkSponsorMissions, applyMatchdayAwards } from '../services/league.service'
import { checkAndAdvanceCup } from '../simulation/cup'
import { getIO } from '../websocket'

export function initScheduler(): void {
  cron.schedule('0 20 * * *', runDailyMatchday)
  console.log('Matchday scheduler active — fires daily at 20:00 UTC')
}

export async function runDailyMatchday(): Promise<void> {
  const activeLeagues = await prisma.league.findMany({ where: { status: 'ACTIVE' } })

  for (const league of activeLeagues) {
    try {
      await simulateLeagueMatchday(league.id)
    } catch (err) {
      console.error(`Matchday simulation failed for league ${league.id}:`, err)
    }
  }
}

async function simulateLeagueMatchday(leagueId: string): Promise<void> {
  const league = await prisma.league.findUnique({ where: { id: leagueId } })
  if (!league) return

  const nextDay = league.currentDay + 1

  if (nextDay > league.seasonLength) {
    await prisma.league.update({ where: { id: leagueId }, data: { status: 'FINISHED' } })

    // Determine champion: most points, tiebreak by goal difference, then goals for
    const clubs = await prisma.club.findMany({
      where: { leagueId },
      select: { id: true, name: true, points: true, goalsFor: true, goalsAgainst: true },
    })
    const champion = clubs.sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points
      const gdA = a.goalsFor - a.goalsAgainst, gdB = b.goalsFor - b.goalsAgainst
      if (gdB !== gdA) return gdB - gdA
      return b.goalsFor - a.goalsFor
    })[0]

    try {
      getIO().to(`league:${leagueId}`).emit('season:finished', { leagueId, championId: champion?.id, championName: champion?.name })
    } catch {}
    return
  }

  // Only check LEAGUE matches to avoid cup matches blocking progression
  const alreadySimulated = await prisma.match.count({
    where: { leagueId, matchday: nextDay, status: 'SIMULATED', competition: 'LEAGUE' },
  })
  if (alreadySimulated > 0) return

  const matches = await prisma.match.findMany({
    where: { leagueId, matchday: nextDay, status: 'SCHEDULED' },
    include: {
      homeClub: { include: { squad: { include: { player: true } } } },
      awayClub: { include: { squad: { include: { player: true } } } },
    },
  })

  // Gather all club IDs that appear in today's fixtures
  const clubIds = [...new Set(matches.flatMap(m => [m.homeClubId, m.awayClubId]))]

  type RecentMatch = { homeClubId: string; awayClubId: string; homeScore: number | null; awayScore: number | null; stats: unknown }
  // Fetch last 6 simulated matches for each club (enough for a reliable profile)
  const recentByClub: Record<string, RecentMatch[]> = {}
  await Promise.all(clubIds.map(async clubId => {
    recentByClub[clubId] = await prisma.match.findMany({
      where: {
        leagueId,
        status: 'SIMULATED',
        OR: [{ homeClubId: clubId }, { awayClubId: clubId }],
      },
      orderBy: { matchday: 'desc' },
      take: 6,
      select: {
        homeClubId: true, awayClubId: true,
        homeScore: true,  awayScore: true,
        stats: true,
      },
    })
  }))

  const results = await Promise.all(matches.map(match => {
    const homeTactic = match.homeClub.isAI
      ? adaptTacticForOpponent(
          match.homeClub,
          buildOpponentProfile(match.awayClubId, recentByClub[match.awayClubId] ?? [], match.awayClub),
        )
      : null
    const awayTactic = match.awayClub.isAI
      ? adaptTacticForOpponent(
          match.awayClub,
          buildOpponentProfile(match.homeClubId, recentByClub[match.homeClubId] ?? [], match.homeClub),
        )
      : null
    return simulateMatch(match, homeTactic, awayTactic)
  }))

  const clubs = await prisma.club.findMany({
    where: { leagueId },
    select: { id: true, physioLevel: true, trainingLevel: true, kitLevel: true },
  })

  for (const club of clubs) {
    // Injury recovery: physio L2 = 2 days, otherwise 1 day
    const injuryRecovery = club.physioLevel >= 2 ? 2 : 1
    await prisma.playerInstance.updateMany({
      where: { leagueId, clubId: club.id, injured: true },
      data: { injuryDaysLeft: { decrement: injuryRecovery } },
    })

    // Fitness recovery: base +8/day; physio L1 +9, L2 +11; training facility adds on top
    const trainingBonus = club.trainingLevel >= 3 ? 7 : club.trainingLevel === 2 ? 4 : club.trainingLevel === 1 ? 2 : 0
    const fitnessRecovery = (club.physioLevel >= 2 ? 11 : club.physioLevel === 1 ? 9 : 8) + trainingBonus
    // Use raw SQL so we can LEAST-clamp in one query per club
    await prisma.$executeRaw`
      UPDATE "PlayerInstance"
      SET fitness = LEAST(100, fitness + ${fitnessRecovery})
      WHERE "leagueId" = ${leagueId}
        AND "clubId"   = ${club.id}
        AND injured    = false
    `

    // Morale drifts toward 70 by 2 points/day (prevents permanent extremes)
    await prisma.$executeRaw`
      UPDATE "PlayerInstance"
      SET morale = CASE
        WHEN morale > 70 THEN GREATEST(70, morale - 2)
        WHEN morale < 70 THEN LEAST(70,   morale + 2)
        ELSE morale
      END
      WHERE "leagueId" = ${leagueId} AND "clubId" = ${club.id}
    `

    // Kit quality gives a daily morale boost to all squad players
    if (club.kitLevel > 0) {
      const kitBonus = club.kitLevel * 2  // +2 / +4 / +6 morale per matchday
      await prisma.$executeRaw`
        UPDATE "PlayerInstance"
        SET morale = LEAST(100, morale + ${kitBonus})
        WHERE "leagueId" = ${leagueId} AND "clubId" = ${club.id}
      `
    }
  }

  // Clear players who have fully recovered from injury
  await prisma.playerInstance.updateMany({
    where: { leagueId, injured: true, injuryDaysLeft: { lte: 0 } },
    data: { injured: false, injuryDaysLeft: 0 },
  })

  // Decrement active stat boosts and delete expired ones
  await prisma.playerBoost.updateMany({
    where: { leagueId, matchdaysLeft: { gt: 0 } },
    data: { matchdaysLeft: { decrement: 1 } },
  })
  await prisma.playerBoost.deleteMany({ where: { leagueId, matchdaysLeft: { lte: 0 } } })

  await prisma.league.update({ where: { id: leagueId }, data: { currentDay: nextDay } })

  // Apply match-day income (only LEAGUE matches count for income/sponsors)
  const leagueResults = results.filter(r => r.competition === 'LEAGUE')
  await applyMatchIncome(leagueId, leagueResults)
  const sponsorResolutions = await checkSponsorMissions(leagueId, nextDay)
  await applyAchievementMorale(leagueId, leagueResults.map(r => r.matchId))
  await deductMatchdayWages(leagueId)

  // TOTW awards: apply morale/form boosts and capture data for broadcast
  const awards = await applyMatchdayAwards(leagueId, nextDay)

  // Advance cup bracket if a cup round was played today
  await checkAndAdvanceCup(leagueId, nextDay)

  // Broadcast live event replay before the final result
  await broadcastMatchesLive(leagueId, results.map(r => r.matchId))

  try {
    getIO().to(`league:${leagueId}`).emit('matchday:complete', { matchday: nextDay, results, awards })
    if (sponsorResolutions.length > 0) {
      getIO().to(`league:${leagueId}`).emit('sponsor:resolved', { resolutions: sponsorResolutions })
    }
  } catch {}
}

async function broadcastMatchesLive(leagueId: string, matchIds: string[]): Promise<void> {
  if (matchIds.length === 0) return

  const [matchRows, allEvents] = await Promise.all([
    prisma.match.findMany({
      where: { id: { in: matchIds } },
      select: {
        id: true,
        homeClubId: true, awayClubId: true,
        homeScore: true, awayScore: true,
        homeClub: { select: { id: true, name: true } },
        awayClub: { select: { id: true, name: true } },
      },
    }),
    prisma.matchEvent.findMany({
      where: { matchId: { in: matchIds } },
      orderBy: [{ minute: 'asc' }],
    }),
  ])

  const matchMap = Object.fromEntries(matchRows.map(m => [m.id, m]))

  // Announce all matches are starting
  for (const m of matchRows) {
    getIO().to(`league:${leagueId}`).emit('match:live', {
      type: 'start',
      matchId: m.id,
      homeClub: m.homeClub,
      awayClub: m.awayClub,
      homeScore: 0, awayScore: 0,
    })
  }

  // Track running scores per match
  const scores: Record<string, { home: number; away: number }> = {}
  for (const m of matchRows) scores[m.id] = { home: 0, away: 0 }

  // Replay events at ~150ms per gap minute, capped at 800ms
  let prevMinute = 0
  for (const evt of allEvents) {
    const gap = evt.minute - prevMinute
    if (gap > 0) await new Promise(r => setTimeout(r, Math.min(gap * 150, 800)))
    prevMinute = evt.minute

    const m = matchMap[evt.matchId]
    if (!m) continue
    const d = evt.detail as any
    if (evt.type === 'GOAL') {
      if (d?.team === 'home') scores[evt.matchId].home++
      else if (d?.team === 'away') scores[evt.matchId].away++
    }

    getIO().to(`league:${leagueId}`).emit('match:live', {
      type: 'event',
      matchId: evt.matchId,
      minute: evt.minute,
      eventType: evt.type,
      detail: evt.detail,
      homeScore: scores[evt.matchId].home,
      awayScore: scores[evt.matchId].away,
    })
  }

  // Small pause then send final confirmed results
  await new Promise(r => setTimeout(r, 600))
  for (const m of matchRows) {
    getIO().to(`league:${leagueId}`).emit('match:live', {
      type: 'end',
      matchId: m.id,
      homeScore: m.homeScore ?? 0,
      awayScore: m.awayScore ?? 0,
    })
  }
}

// Morale boosts for season top scorer and matchday MOTM
async function applyAchievementMorale(leagueId: string, matchIds: string[]): Promise<void> {
  const updates: Promise<unknown>[] = []

  // ── Season top scorer boost ──────────────────────────────────────────────────
  // Gives a small ongoing morale reward to whoever leads the golden boot race.
  const seasonGroups = await prisma.matchPerformance.groupBy({
    by: ['instanceId'],
    where: { match: { leagueId } },
    _sum: { goals: true },
    orderBy: { _sum: { goals: 'desc' } },
    take: 1,
  })
  const topScorer = seasonGroups[0]
  if (topScorer && (topScorer._sum.goals ?? 0) > 0) {
    const inst = await prisma.playerInstance.findUnique({ where: { id: topScorer.instanceId }, select: { morale: true } })
    if (inst) {
      updates.push(prisma.playerInstance.update({
        where: { id: topScorer.instanceId },
        data: { morale: Math.min(100, inst.morale + 4) },
      }))
    }
  }

  await Promise.all(updates)
}

// Deduct each club's total squad wages from their budget after every matchday
async function deductMatchdayWages(leagueId: string): Promise<void> {
  const clubs = await prisma.club.findMany({
    where: { leagueId },
    select: { id: true, squad: { select: { wage: true } } },
  })
  await Promise.all(clubs.map(c => {
    const total = c.squad.reduce((s, p) => s + p.wage, 0)
    return total > 0
      ? prisma.club.update({ where: { id: c.id }, data: { budget: { decrement: total } } })
      : Promise.resolve()
  }))
}
