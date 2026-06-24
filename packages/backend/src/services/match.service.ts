import { prisma } from '../prisma'

const POS_ORDER = ['GK','CB','LB','RB','CDM','CM','CAM','LM','RM','LW','RW','CF','ST']

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

// ─── TOTW shared helpers ──────────────────────────────────────────────────────

type TOTWPerf = Awaited<ReturnType<typeof fetchMatchdayPerfs>>[number]

async function fetchMatchdayPerfs(leagueId: string, matchday: number) {
  return prisma.matchPerformance.findMany({
    where: { match: { leagueId, matchday, status: 'SIMULATED' } },
    orderBy: { rating: 'desc' },
    include: {
      instance: {
        include: {
          player: { select: { name: true, position: true, overall: true, photoUrl: true } },
          club: { select: { id: true, name: true, logoConfig: true, kitConfig: true } },
        },
      },
      match: { select: { homeClubId: true, awayClubId: true, homeScore: true, awayScore: true } },
    },
  })
}

function buildTOTW(perfs: TOTWPerf[]) {
  const posGroup = (p: string) => {
    if (p === 'GK') return 'GK'
    if (['CB', 'LB', 'RB'].includes(p)) return 'DEF'
    if (['CDM', 'CM', 'CAM', 'LM', 'RM'].includes(p)) return 'MID'
    return 'ATT'
  }
  const slots = { GK: 1, DEF: 4, MID: 3, ATT: 3 }
  const counts: Record<string, number> = { GK: 0, DEF: 0, MID: 0, ATT: 0 }
  const selected: TOTWPerf[] = []
  const used = new Set<string>()

  for (const p of perfs) {
    const grp = posGroup(p.positionPlayed ?? p.instance.player.position)
    if (counts[grp] < slots[grp] && !used.has(p.instanceId)) {
      selected.push(p); counts[grp]++; used.add(p.instanceId)
    }
    if (selected.length === 11) break
  }
  return selected
}

function serializeAwards(matchday: number, perfs: TOTWPerf[], selected: TOTWPerf[]) {
  const motm = perfs[0]
  const byGoals = [...perfs].sort((a, b) => b.goals - a.goals || b.rating - a.rating)
  const byAssists = [...perfs].sort((a, b) => b.assists - a.assists || b.rating - a.rating)

  const fmt = (p: TOTWPerf) => ({
    instanceId: p.instanceId,
    playerName: p.instance.player.name,
    position: p.positionPlayed ?? p.instance.player.position,
    clubId: p.instance.club?.id ?? null,
    clubName: p.instance.club?.name ?? '—',
    clubLogoConfig: p.instance.club?.logoConfig ?? null,
    clubKitConfig: p.instance.club?.kitConfig ?? null,
    photoUrl: p.instance.player.photoUrl ?? null,
    rating: Math.round(p.rating * 10) / 10,
    goals: p.goals,
    assists: p.assists,
  })

  return {
    matchday,
    teamOfTheWeek: selected.map(fmt),
    motm: motm ? fmt(motm) : null,
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

// ─── Called by the scheduler: apply boosts + return award data ────────────────

export async function applyMatchdayAwards(leagueId: string, matchday: number) {
  const perfs = await fetchMatchdayPerfs(leagueId, matchday)
  if (perfs.length === 0) return null

  const selected = buildTOTW(perfs)
  const motm = perfs[0]

  // TOTW players: +5 morale, +5 form
  // MOTM additionally: +3 morale, +3 form
  const boosts = new Map<string, { morale: number; form: number }>()
  for (const p of selected) boosts.set(p.instanceId, { morale: 5, form: 5 })
  if (motm) {
    const existing = boosts.get(motm.instanceId) ?? { morale: 0, form: 0 }
    boosts.set(motm.instanceId, { morale: existing.morale + 3, form: existing.form + 3 })
  }

  // Fetch current morale/form for the affected instances
  const instances = await prisma.playerInstance.findMany({
    where: { id: { in: [...boosts.keys()] } },
    select: { id: true, morale: true, form: true },
  })

  await Promise.all(instances.map(inst => {
    const b = boosts.get(inst.id)!
    return prisma.playerInstance.update({
      where: { id: inst.id },
      data: {
        morale: Math.min(100, inst.morale + b.morale),
        form:   Math.min(100, inst.form   + b.form),
      },
    })
  }))

  return serializeAwards(matchday, perfs, selected)
}

// ─── Called by the REST endpoint (read-only, no side effects) ─────────────────

export async function getMatchdayStars(leagueId: string) {
  const league = await prisma.league.findUnique({ where: { id: leagueId }, select: { currentDay: true } })
  if (!league || league.currentDay === 0) return null
  const perfs = await fetchMatchdayPerfs(leagueId, league.currentDay)
  if (perfs.length === 0) return null
  return serializeAwards(league.currentDay, perfs, buildTOTW(perfs))
}

// ─── Match events (for rewatch) ───────────────────────────────────────────────

export async function getMatchEvents(leagueId: string, matchId: string) {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    select: {
      id: true, leagueId: true, status: true,
      homeScore: true, awayScore: true,
      homeClub: { select: { id: true, name: true, logoConfig: true, kitConfig: true } },
      awayClub: { select: { id: true, name: true, logoConfig: true, kitConfig: true } },
    },
  })
  if (!match || match.leagueId !== leagueId || match.status !== 'SIMULATED') return null

  const events = await prisma.matchEvent.findMany({
    where: { matchId },
    orderBy: { minute: 'asc' },
  })
  return { match, events }
}
