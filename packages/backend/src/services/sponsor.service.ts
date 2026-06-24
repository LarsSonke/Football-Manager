import { prisma } from '../prisma'

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
