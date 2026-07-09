import cron from 'node-cron'
import { prisma } from '../prisma'
import { simulateMatch, adaptTacticForOpponent, buildOpponentProfile } from '../simulation/engine'
import { applyMatchIncome } from '../services/management.service'
import { checkSponsorMissions } from '../services/sponsor.service'
import { applyMatchdayAwards } from '../services/match.service'
import { checkAndAdvanceCup } from '../simulation/cup'
import { getIO } from '../websocket'
import { attemptDiscovery, getPersonalityDef } from '../services/personality.service'
import { computeFanMoodDelta } from '../services/fan.service'
import { advanceAuctionStatuses } from '../services/auction.service'

export function initScheduler(): void {
  cron.schedule('0 20 * * *', runDailyMatchday)
  // Advance auction statuses every 5 minutes for all active transfer windows
  cron.schedule('*/5 * * * *', runAuctionTick)
  console.log('Matchday scheduler active  -  fires daily at 20:00 UTC')
  console.log('Auction ticker active  -  runs every 5 minutes')
}

async function runAuctionTick(): Promise<void> {
  const draftingLeagues = await prisma.league.findMany({
    where: { status: 'DRAFTING' },
    select: { id: true },
  })
  for (const league of draftingLeagues) {
    try {
      await advanceAuctionStatuses(league.id)
    } catch (err) {
      console.error(`Auction tick failed for league ${league.id}:`, err)
    }
  }
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

export async function simulateLeagueMatchday(leagueId: string, options?: { skipBroadcast?: boolean }): Promise<void> {
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

    if (!options?.skipBroadcast) {
      try {
        getIO().to(`league:${leagueId}`).emit('season:finished', { leagueId, championId: champion?.id, championName: champion?.name })
      } catch {}
    }
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

  const results = await Promise.all(matches.map(async match => {
    const homeAvail = match.homeClub.squad.filter(p => !p.injured && p.suspendedMatchday !== nextDay).length
    const awayAvail = match.awayClub.squad.filter(p => !p.injured && p.suspendedMatchday !== nextDay).length
    const homeForfeit = homeAvail < 11
    const awayForfeit = awayAvail < 11

    if (homeForfeit || awayForfeit) {
      const hs = !homeForfeit && awayForfeit ? 3 : 0
      const as_ = !awayForfeit && homeForfeit ? 3 : 0
      return saveForfeit(match, hs, as_)
    }

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
    select: { id: true, physioLevel: true, trainingLevel: true, kitLevel: true, isAI: true, managerSpecialization: true },
  })

  for (const club of clubs) {
    const spec = !club.isAI ? club.managerSpecialization : null

    // Injury recovery: physio L2 = 2 days, otherwise 1 day
    const injuryRecovery = club.physioLevel >= 2 ? 2 : 1
    await prisma.playerInstance.updateMany({
      where: { leagueId, clubId: club.id, injured: true },
      data: { injuryDaysLeft: { decrement: injuryRecovery } },
    })

    // Fitness recovery: base +8/day; physio L1 +9, L2 +11; training facility adds on top
    // FITNESS_GURU: ×1.5 multiplier
    const trainingBonus = club.trainingLevel >= 3 ? 7 : club.trainingLevel === 2 ? 4 : club.trainingLevel === 1 ? 2 : 0
    const baseRecovery = (club.physioLevel >= 2 ? 11 : club.physioLevel === 1 ? 9 : 8) + trainingBonus
    const fitnessRecovery = spec === 'FITNESS_GURU' ? Math.round(baseRecovery * 1.5) : baseRecovery
    await prisma.$executeRaw`
      UPDATE "PlayerInstance"
      SET fitness = LEAST(100, fitness + ${fitnessRecovery})
      WHERE "leagueId" = ${leagueId}
        AND "clubId"   = ${club.id}
        AND injured    = false
    `

    // Morale drifts toward 70; MOTIVATOR drifts 3/day instead of 2
    const moraleDriftRate = spec === 'MOTIVATOR' ? 3 : 2
    await prisma.$executeRaw`
      UPDATE "PlayerInstance"
      SET morale = CASE
        WHEN morale > 70 THEN GREATEST(70, morale - ${moraleDriftRate})
        WHEN morale < 70 THEN LEAST(70,   morale + ${moraleDriftRate})
        ELSE morale
      END
      WHERE "leagueId" = ${leagueId} AND "clubId" = ${club.id}
    `

    // PSYCHOLOGIST: morale floor of 50  -  no player drops below
    if (spec === 'PSYCHOLOGIST') {
      await prisma.$executeRaw`
        UPDATE "PlayerInstance"
        SET morale = GREATEST(50, morale)
        WHERE "leagueId" = ${leagueId} AND "clubId" = ${club.id}
      `
    }

    // Kit quality gives a daily morale boost to all squad players
    if (club.kitLevel > 0) {
      const kitBonus = club.kitLevel * 2
      await prisma.$executeRaw`
        UPDATE "PlayerInstance"
        SET morale = LEAST(100, morale + ${kitBonus})
        WHERE "leagueId" = ${leagueId} AND "clubId" = ${club.id}
      `
    }

    // YOUTH_DEVELOPER: +1 form per day for players aged ≤22
    if (spec === 'YOUTH_DEVELOPER') {
      await prisma.$executeRaw`
        UPDATE "PlayerInstance"
        SET form = LEAST(100, form + 1)
        WHERE "leagueId" = ${leagueId}
          AND "clubId"   = ${club.id}
          AND "playerId" IN (SELECT id FROM "Player" WHERE age <= 22)
      `
    }

    // ── Personality daily effects ─────────────────────────────────────────────
    await applyDailyPersonalityEffects(leagueId, club.id)
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

  // Fan mood updates + personality effects + fan favourite scores
  await applyPersonalityAndFanUpdates(leagueId, results, nextDay)

  // TOTW awards: apply morale/form boosts and capture data for broadcast
  const awards = await applyMatchdayAwards(leagueId, nextDay)

  // Advance cup bracket if a cup round was played today
  await checkAndAdvanceCup(leagueId, nextDay)

  if (!options?.skipBroadcast) {
    // Broadcast live event replay before the final result
    await broadcastMatchesLive(leagueId, results.map(r => r.matchId))

    try {
      const injuries = results.flatMap(r => r.injuries ?? [])
      getIO().to(`league:${leagueId}`).emit('matchday:complete', { matchday: nextDay, results, awards, injuries })
      if (sponsorResolutions.length > 0) {
        getIO().to(`league:${leagueId}`).emit('sponsor:resolved', { resolutions: sponsorResolutions })
      }
    } catch {}
  }
}

export async function simulateSeasonFast(leagueId: string): Promise<void> {
  let league = await prisma.league.findUnique({ where: { id: leagueId } })
  while (league?.status === 'ACTIVE') {
    await simulateLeagueMatchday(leagueId, { skipBroadcast: true })
    league = await prisma.league.findUnique({ where: { id: leagueId } })
  }

  // Determine champion for the broadcast
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
}

async function saveForfeit(
  match: { id: string; homeClubId: string; awayClubId: string; competition: string | null },
  homeScore: number,
  awayScore: number,
): Promise<{ matchId: string; homeClubId: string; awayClubId: string; homeScore: number; awayScore: number; competition: string; stats: { home: object; away: object }; injuries: [] }> {
  const empty = { shots: 0, shotsOnTarget: 0, xG: 0, possession: 50, yellowCards: 0, redCards: 0 }
  await prisma.match.update({
    where: { id: match.id },
    data: { homeScore, awayScore, status: 'SIMULATED', simulatedAt: new Date(), stats: { home: empty, away: empty } },
  })
  const homeWin = homeScore > awayScore, awayWin = awayScore > homeScore, draw = homeScore === awayScore
  const homeUpd: Record<string, unknown> = { goalsFor: { increment: homeScore }, goalsAgainst: { increment: awayScore } }
  const awayUpd: Record<string, unknown> = { goalsFor: { increment: awayScore }, goalsAgainst: { increment: homeScore } }
  if (homeWin) { homeUpd.wins = { increment: 1 }; homeUpd.points = { increment: 3 }; awayUpd.losses = { increment: 1 } }
  else if (awayWin) { awayUpd.wins = { increment: 1 }; awayUpd.points = { increment: 3 }; homeUpd.losses = { increment: 1 } }
  else { homeUpd.draws = { increment: 1 }; homeUpd.points = { increment: 1 }; awayUpd.draws = { increment: 1 }; awayUpd.points = { increment: 1 } }
  await prisma.club.update({ where: { id: match.homeClubId }, data: homeUpd as any })
  await prisma.club.update({ where: { id: match.awayClubId }, data: awayUpd as any })
  return { matchId: match.id, homeClubId: match.homeClubId, awayClubId: match.awayClubId, homeScore, awayScore, competition: match.competition ?? 'LEAGUE', stats: { home: empty, away: empty }, injuries: [] }
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

  // Group events by minute for O(1) lookup
  const eventsByMinute: Record<number, typeof allEvents> = {}
  for (const evt of allEvents) {
    if (!eventsByMinute[evt.minute]) eventsByMinute[evt.minute] = []
    eventsByMinute[evt.minute].push(evt)
  }

  // Tick through all 90 minutes at ~100ms each (~9s total broadcast)
  const MS_PER_MINUTE = 100
  for (let minute = 1; minute <= 90; minute++) {
    await new Promise(r => setTimeout(r, MS_PER_MINUTE))
    const evts = eventsByMinute[minute] ?? []

    for (const evt of evts) {
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
        minute,
        eventType: evt.type,
        detail: evt.detail,
        homeScore: scores[evt.matchId].home,
        awayScore: scores[evt.matchId].away,
      })
    }

    // Emit a tick every 5 quiet minutes so the live ticker stays updated
    if (evts.length === 0 && minute % 5 === 0) {
      for (const m of matchRows) {
        getIO().to(`league:${leagueId}`).emit('match:live', {
          type: 'tick',
          matchId: m.id,
          minute,
          homeScore: scores[m.id].home,
          awayScore: scores[m.id].away,
        })
      }
    }
  }

  // Small pause then send final confirmed results
  await new Promise(r => setTimeout(r, 400))
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

// ─── Personality & Fan Systems ────────────────────────────────────────────────

async function applyPersonalityAndFanUpdates(
  leagueId: string,
  results: Array<{ matchId: string; homeClubId: string; awayClubId: string; homeScore: number; awayScore: number; competition: string }>,
  matchday: number,
): Promise<void> {
  if (results.length === 0) return

  const matchIds = results.map(r => r.matchId)

  // Fetch all events for today's matches with player personalities
  const events = await prisma.matchEvent.findMany({
    where: { matchId: { in: matchIds } },
    select: { matchId: true, minute: true, type: true, detail: true },
  })

  // Fetch all players who played today, with their personalities + discovery state
  const performances = await prisma.matchPerformance.findMany({
    where: { matchId: { in: matchIds } },
    select: {
      matchId: true, instanceId: true, goals: true, assists: true,
      instance: {
        select: {
          id: true, morale: true, form: true, clubId: true,
          discoveredPersonalities: true,
          player: { select: { personalities: true, name: true } },
        },
      },
      match: { select: { homeClubId: true, competition: true } },
    },
  })

  // Fetch specializations so SCOUT_MASTER can boost discovery chance
  const clubSpecRows = await prisma.club.findMany({
    where: { leagueId },
    select: { id: true, isAI: true, managerSpecialization: true },
  })
  const clubSpecMap: Record<string, string | null> = Object.fromEntries(
    clubSpecRows.map(c => [c.id, !c.isAI ? c.managerSpecialization : null]),
  )

  const leagueRow = await prisma.league.findUnique({ where: { id: leagueId }, select: { newsEvents: true } })
  const newsEvents: Array<{ type: string; headline: string; detail: string; matchday: number; clubId: string }> =
    Array.isArray(leagueRow?.newsEvents) ? (leagueRow.newsEvents as any[]) : []

  const instanceUpdates: Record<string, { morale?: number; form?: number; fanFavouriteScore?: number; discoveredPersonalities?: string[] }> = {}

  function patchInst(id: string, patch: Partial<{ moraleAdd: number; formAdd: number; fanFavAdd: number; newDiscovery: string }>) {
    const cur = instanceUpdates[id] ?? {}
    if (patch.moraleAdd) cur.morale = Math.min(100, Math.max(0, (cur.morale ?? 0) + patch.moraleAdd))
    if (patch.formAdd) cur.form = Math.min(100, Math.max(0, (cur.form ?? 0) + patch.formAdd))
    if (patch.fanFavAdd) cur.fanFavouriteScore = (cur.fanFavouriteScore ?? 0) + patch.fanFavAdd
    if (patch.newDiscovery) {
      const prev = cur.discoveredPersonalities ?? []
      if (!prev.includes(patch.newDiscovery)) cur.discoveredPersonalities = [...prev, patch.newDiscovery]
    }
    instanceUpdates[id] = cur
  }

  // Build lookup: instanceId → event details for this match
  const goalsByInstance: Record<string, Array<{ minute: number; matchId: string }>> = {}
  const yellowsByInstance: Record<string, boolean> = {}
  const redsByInstance: Record<string, boolean> = {}
  const assistsByInstance: Record<string, boolean> = {}

  for (const evt of events) {
    const d = evt.detail as any
    if (evt.type === 'GOAL' && d?.instanceId) {
      const list = goalsByInstance[d.instanceId] ?? []
      list.push({ minute: evt.minute, matchId: evt.matchId })
      goalsByInstance[d.instanceId] = list
    }
    if (evt.type === 'GOAL' && d?.assistInstanceId) {
      assistsByInstance[d.assistInstanceId] = true
    }
    if (evt.type === 'YELLOW_CARD' && d?.instanceId) yellowsByInstance[d.instanceId] = true
    if (evt.type === 'RED_CARD' && d?.instanceId) redsByInstance[d.instanceId] = true
  }

  // Per-performance: personality post-match effects + fan favourite scoring + discovery
  for (const perf of performances) {
    const inst = perf.instance
    const hidden = inst.player.personalities as string[]
    const discovered = inst.discoveredPersonalities as string[]
    const isCup = perf.match.competition === 'CUP'
    const isHome = perf.match.homeClubId === inst.clubId
    const matchResult = results.find(r => r.matchId === perf.matchId)
    if (!matchResult) continue
    const myScore = isHome ? matchResult.homeScore : matchResult.awayScore
    const oppScore = isHome ? matchResult.awayScore : matchResult.homeScore

    const scored = (goalsByInstance[inst.id] ?? []).length > 0
    const scoredLate = (goalsByInstance[inst.id] ?? []).some(g => g.minute >= 75)
    const scoredWhileBehindOrLevel = (goalsByInstance[inst.id] ?? []).some(g => {
      // approximate: check if at the time of goal team was ≤ 0 ahead
      // We don't have running scores so use final result as proxy
      return myScore <= oppScore
    })
    const gotYellow = yellowsByInstance[inst.id] ?? false
    const gotRed = redsByInstance[inst.id] ?? false
    const madeAssist = assistsByInstance[inst.id] ?? false

    // ── Fan favourite score ───────────────────────────────────────────────────
    if (scored) patchInst(inst.id, { fanFavAdd: isCup ? 6 : 3 })
    if (scoredLate && (myScore === oppScore + 1 || myScore === oppScore)) patchInst(inst.id, { fanFavAdd: 8 }) // decisive/late goal
    if (madeAssist) patchInst(inst.id, { fanFavAdd: 1 })

    const scoutMultiplier = clubSpecMap[inst.clubId ?? ''] === 'SCOUT_MASTER' ? 1.5 : 1.0

    // ── Personality post-match morale/form effects ────────────────────────────
    if (hidden.includes('SHOWMAN') && scored) {
      patchInst(inst.id, { moraleAdd: 3 })
      checkAndDiscover('SHOWMAN', inst.id, hidden, discovered, 'goal', inst.player.name, inst.clubId ?? '', matchday, newsEvents, patchInst, scoutMultiplier)
    }
    if (hidden.includes('CLUTCH') && scoredLate && scoredWhileBehindOrLevel) {
      patchInst(inst.id, { formAdd: 5, moraleAdd: 3 })
      checkAndDiscover('CLUTCH', inst.id, hidden, discovered, 'lateGoal', inst.player.name, inst.clubId ?? '', matchday, newsEvents, patchInst, scoutMultiplier)
    }
    if (hidden.includes('BIG_GAME_PLAYER') && isCup && scored) {
      patchInst(inst.id, { formAdd: 5 })
      checkAndDiscover('BIG_GAME_PLAYER', inst.id, hidden, discovered, 'cupGoal', inst.player.name, inst.clubId ?? '', matchday, newsEvents, patchInst, scoutMultiplier)
    }
    if (hidden.includes('EMOTIONAL')) {
      if (myScore > oppScore) patchInst(inst.id, { moraleAdd: 3 })
      else if (myScore < oppScore) patchInst(inst.id, { moraleAdd: -3 })
    }
    if (hidden.includes('TEMPERAMENTAL') && (gotYellow || gotRed)) {
      patchInst(inst.id, { moraleAdd: -3 })
      checkAndDiscover('TEMPERAMENTAL', inst.id, hidden, discovered, gotRed ? 'redCard' : 'yellowCard', inst.player.name, inst.clubId ?? '', matchday, newsEvents, patchInst, scoutMultiplier)
    }
    if (hidden.includes('LEADER') && myScore > oppScore) {
      patchInst(inst.id, { moraleAdd: 2 })
    }
    if (hidden.includes('TEAM_PLAYER') && madeAssist) {
      patchInst(inst.id, { moraleAdd: 2 })
      checkAndDiscover('TEAM_PLAYER', inst.id, hidden, discovered, 'assist', inst.player.name, inst.clubId ?? '', matchday, newsEvents, patchInst, scoutMultiplier)
    }

    // ── General observation discovery (any match participant) ─────────────────
    for (const personality of hidden.filter(p => !discovered.includes(p))) {
      const discovered_ = checkAndDiscover(personality, inst.id, hidden, discovered, 'observation', inst.player.name, inst.clubId ?? '', matchday, newsEvents, patchInst, scoutMultiplier)
      if (discovered_) break // only one discovery per match per player
    }
  }

  // ── Fan mood updates for each club ────────────────────────────────────────
  const clubFanUpdates: Record<string, number> = {}
  for (const r of results) {
    const homeGoals = (events.filter(e => e.matchId === r.matchId && e.type === 'GOAL' && (e.detail as any)?.team === 'home')).length
    const awayGoals = (events.filter(e => e.matchId === r.matchId && e.type === 'GOAL' && (e.detail as any)?.team === 'away')).length
    const isCup = r.competition === 'CUP'

    const homeDelta = computeFanMoodDelta({ isHome: true, myScore: r.homeScore, oppScore: r.awayScore, myGoals: homeGoals, isCup })
    const awayDelta = computeFanMoodDelta({ isHome: false, myScore: r.awayScore, oppScore: r.homeScore, myGoals: awayGoals, isCup })

    clubFanUpdates[r.homeClubId] = (clubFanUpdates[r.homeClubId] ?? 0) + homeDelta
    clubFanUpdates[r.awayClubId] = (clubFanUpdates[r.awayClubId] ?? 0) + awayDelta
  }

  // Fetch current fan moods and apply deltas
  const clubIds = Object.keys(clubFanUpdates)
  if (clubIds.length > 0) {
    const clubs = await prisma.club.findMany({ where: { id: { in: clubIds } }, select: { id: true, fanMood: true } })
    await Promise.all(clubs.map(c => {
      const newMood = Math.max(0, Math.min(100, c.fanMood + (clubFanUpdates[c.id] ?? 0)))
      return prisma.club.update({ where: { id: c.id }, data: { fanMood: newMood } })
    }))
  }

  // Apply fanFavouriteScore and morale/form patches
  await Promise.all(Object.entries(instanceUpdates).map(([id, patch]) => {
    const data: Record<string, unknown> = {}
    if (patch.discoveredPersonalities) data.discoveredPersonalities = patch.discoveredPersonalities
    if (patch.fanFavouriteScore) data.fanFavouriteScore = { increment: patch.fanFavouriteScore }
    if (patch.morale !== undefined || patch.form !== undefined) {
      // We need the current values for clamping  -  use a raw update with LEAST/GREATEST
    }
    if (Object.keys(data).length > 0) {
      return prisma.playerInstance.update({ where: { id }, data: data as any })
    }
    return Promise.resolve()
  }))

  // Morale/form patches need separate handling due to clamping
  await Promise.all(Object.entries(instanceUpdates).map(async ([id, patch]) => {
    if (patch.morale === undefined && patch.form === undefined) return
    const inst = await prisma.playerInstance.findUnique({ where: { id }, select: { morale: true, form: true } })
    if (!inst) return
    const updates: Record<string, number> = {}
    if (patch.morale !== undefined) updates.morale = Math.min(100, Math.max(0, inst.morale + patch.morale))
    if (patch.form !== undefined) updates.form = Math.min(100, Math.max(0, inst.form + patch.form))
    return prisma.playerInstance.update({ where: { id }, data: updates })
  }))

  // Fan mood drift toward 60 by 1 per day (gentler than morale drift)
  await prisma.$executeRaw`
    UPDATE "Club"
    SET "fanMood" = CASE
      WHEN "fanMood" > 60 THEN GREATEST(60, "fanMood" - 1)
      WHEN "fanMood" < 60 THEN LEAST(60, "fanMood" + 1)
      ELSE "fanMood"
    END
    WHERE "leagueId" = ${leagueId}
  `

  // Persist news events (keep last 30)
  if (newsEvents.length > 0) {
    const trimmed = newsEvents.slice(-30)
    await prisma.league.update({ where: { id: leagueId }, data: { newsEvents: trimmed as any } })
  }
}

function checkAndDiscover(
  personality: string,
  instanceId: string,
  hidden: string[],
  discovered: string[],
  trigger: Parameters<typeof attemptDiscovery>[2],
  playerName: string,
  clubId: string,
  matchday: number,
  newsEvents: Array<{ type: string; headline: string; detail: string; matchday: number; clubId: string }>,
  patchInst: (id: string, patch: { newDiscovery?: string }) => void,
  scoutMultiplier = 1.0,
): boolean {
  if (!hidden.includes(personality) || discovered.includes(personality)) return false
  // SCOUT_MASTER: boost discovery chance by making multiple attempts
  const attempts = scoutMultiplier >= 1.5 ? 2 : 1
  let newPersonality: string | null = null
  for (let i = 0; i < attempts; i++) {
    newPersonality = attemptDiscovery(hidden, discovered, trigger)
    if (newPersonality && newPersonality === personality) break
    newPersonality = null
  }
  if (!newPersonality) return false

  const def = getPersonalityDef(personality)
  patchInst(instanceId, { newDiscovery: personality })
  newsEvents.push({
    type: 'personality',
    headline: `${playerName}  -  Personality Discovered`,
    detail: `${def?.label ?? personality}: ${def?.description ?? ''}`,
    matchday,
    clubId,
  })
  return true
}

async function applyDailyPersonalityEffects(leagueId: string, clubId: string): Promise<void> {
  const instances = await prisma.playerInstance.findMany({
    where: { leagueId, clubId },
    select: {
      id: true, morale: true, form: true, fitness: true,
      discoveredPersonalities: true,
      player: { select: { personalities: true, age: true } },
    },
  })

  const hasLeader = instances.some(i => (i.player.personalities as string[]).includes('LEADER'))
  const hasMentor = instances.some(i => (i.player.personalities as string[]).includes('MENTOR'))

  for (const inst of instances) {
    const personalities = inst.player.personalities as string[]
    if (personalities.length === 0) continue

    const patches: Record<string, number> = {}

    if (personalities.includes('PROFESSIONAL') && inst.morale < 65) {
      patches.morale = 65
    }
    if (personalities.includes('HARD_WORKER') && !patches.morale) {
      // Extra +2 fitness (handled separately via SQL-clamp below)
    }
    if (personalities.includes('CONSISTENT')) {
      // Morale drift is halved  -  handled by reducing the swing in the main drift SQL
      // We undo half the drift by pushing back 1 point
      if (inst.morale > 70) patches.morale = Math.max(70, inst.morale - 1) // already drifted -2, now reverse 1
      else if (inst.morale < 70) patches.morale = Math.min(70, inst.morale + 1)
    }
    if (personalities.includes('LOYAL') && inst.morale < 70) {
      patches.morale = Math.min(70, inst.morale + 1)
    }

    // Leader: +1 morale to everyone in the club (applied once via the flag above)
    if (hasLeader) {
      patches.morale = Math.min(100, (patches.morale ?? inst.morale) + 1)
    }

    // Mentor: young players (+1 morale if age <= 22)
    if (hasMentor && inst.player.age <= 22) {
      patches.morale = Math.min(100, (patches.morale ?? inst.morale) + 1)
    }

    if (Object.keys(patches).length > 0) {
      await prisma.playerInstance.update({ where: { id: inst.id }, data: patches })
    }
  }

  // Hard worker gets extra fitness via a targeted SQL update
  const hardWorkerIds = instances
    .filter(i => (i.player.personalities as string[]).includes('HARD_WORKER'))
    .map(i => i.id)
  if (hardWorkerIds.length > 0) {
    await prisma.$executeRaw`
      UPDATE "PlayerInstance"
      SET fitness = LEAST(100, fitness + 2)
      WHERE id = ANY(${hardWorkerIds}::text[])
    `
  }
}
