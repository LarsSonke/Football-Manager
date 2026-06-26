import { prisma } from '../prisma'

export interface NewsItem {
  type: 'result' | 'scorer' | 'streak' | 'injury' | 'transfer' | 'upset'
  headline: string
  detail: string
  matchday: number
}

export async function getLeagueNews(leagueId: string): Promise<NewsItem[]> {
  const league = await prisma.league.findUnique({ where: { id: leagueId }, select: { currentDay: true } })
  if (!league || league.currentDay === 0) return []

  const day = league.currentDay

  const [recentMatches, allClubs, injuries, listings, scorerGroups] = await Promise.all([
    // Last 2 matchdays of completed LEAGUE results
    prisma.match.findMany({
      where: { leagueId, status: 'SIMULATED', competition: 'LEAGUE', matchday: { gte: Math.max(1, day - 1) } },
      include: {
        homeClub: { select: { id: true, name: true, points: true } },
        awayClub: { select: { id: true, name: true, points: true } },
      },
      orderBy: { matchday: 'desc' },
    }),
    // All clubs — used for streak computation
    prisma.club.findMany({ where: { leagueId }, select: { id: true, name: true } }),
    // Injured players (top 3)
    prisma.playerInstance.findMany({
      where: { leagueId, injured: true },
      include: { player: { select: { name: true, position: true } }, club: { select: { name: true } } },
      take: 3,
    }),
    // Recent transfer listings (top 2)
    prisma.transferListing.findMany({
      where: { leagueId },
      include: {
        instance: { include: { player: { select: { name: true, overall: true, position: true } } } },
        sellerClub: { select: { name: true } },
      },
      take: 2,
      orderBy: { createdAt: 'desc' },
    }),
    // Season top scorers
    prisma.matchPerformance.groupBy({
      by: ['instanceId'],
      where: { match: { leagueId } },
      _sum: { goals: true },
      orderBy: { _sum: { goals: 'desc' } },
      take: 3,
    }),
  ])

  const items: NewsItem[] = []

  // ── Match results ─────────────────────────────────────────────────────────────
  for (const m of recentMatches) {
    const hs = m.homeScore ?? 0
    const as_ = m.awayScore ?? 0
    if (hs > as_) {
      items.push({
        type: 'result',
        headline: `${m.homeClub.name} beat ${m.awayClub.name} ${hs}–${as_}`,
        detail: `Day ${m.matchday} · League`,
        matchday: m.matchday,
      })
    } else if (as_ > hs) {
      items.push({
        type: 'result',
        headline: `${m.awayClub.name} win away at ${m.homeClub.name} ${as_}–${hs}`,
        detail: `Day ${m.matchday} · League`,
        matchday: m.matchday,
      })
    } else {
      items.push({
        type: 'result',
        headline: `${m.homeClub.name} vs ${m.awayClub.name} ends all square ${hs}–${as_}`,
        detail: `Day ${m.matchday} · League`,
        matchday: m.matchday,
      })
    }
  }

  // ── Streaks (query last 5 matchdays of all results, compute per club) ─────────
  if (day >= 3) {
    const form5 = await prisma.match.findMany({
      where: { leagueId, status: 'SIMULATED', competition: 'LEAGUE', matchday: { gte: Math.max(1, day - 4) } },
      select: { homeClubId: true, awayClubId: true, homeScore: true, awayScore: true, matchday: true },
      orderBy: { matchday: 'desc' },
    })

    for (const club of allClubs) {
      // Already sorted desc by matchday — iterate most-recent-first
      const clubMatches = form5.filter(m => m.homeClubId === club.id || m.awayClubId === club.id)
      if (clubMatches.length < 3) continue

      let winStreak = 0, lossStreak = 0, unbeatenStreak = 0
      let winBroken = false, lossBroken = false, unbeatenBroken = false

      for (const m of clubMatches) {
        const isHome = m.homeClubId === club.id
        const ms = isHome ? m.homeScore! : m.awayScore!
        const os = isHome ? m.awayScore! : m.homeScore!
        const r = ms > os ? 'W' : ms === os ? 'D' : 'L'
        if (!winBroken && r === 'W') winStreak++; else winBroken = true
        if (!lossBroken && r === 'L') lossStreak++; else lossBroken = true
        if (!unbeatenBroken && r !== 'L') unbeatenStreak++; else unbeatenBroken = true
      }

      if (winStreak >= 3) {
        items.push({ type: 'streak', headline: `${club.name} on a ${winStreak}-game winning streak`, detail: `Day ${day} · Form`, matchday: day })
      } else if (unbeatenStreak >= 4 && winStreak < unbeatenStreak) {
        items.push({ type: 'streak', headline: `${club.name} unbeaten in ${unbeatenStreak} matches`, detail: `Day ${day} · Form`, matchday: day })
      } else if (lossStreak >= 3) {
        items.push({ type: 'streak', headline: `${club.name} winless in ${lossStreak} straight`, detail: `Day ${day} · Form`, matchday: day })
      }
    }
  }

  // ── Top scorer ────────────────────────────────────────────────────────────────
  const topScorerGroup = scorerGroups.find(g => (g._sum.goals ?? 0) > 0)
  if (topScorerGroup) {
    const inst = await prisma.playerInstance.findUnique({
      where: { id: topScorerGroup.instanceId },
      include: { player: { select: { name: true, position: true } }, club: { select: { name: true } } },
    })
    if (inst) {
      items.push({
        type: 'scorer',
        headline: `${inst.player.name} leads the Golden Boot race`,
        detail: `Day ${day} · ${inst.player.position} · ${topScorerGroup._sum.goals} goals · ${inst.club?.name ?? ''}`,
        matchday: day,
      })
    }
  }

  // ── Injuries ─────────────────────────────────────────────────────────────────
  for (const p of injuries) {
    if (p.club) {
      items.push({
        type: 'injury',
        headline: `${p.player.name} sidelined with injury`,
        detail: `Day ${day} · ${p.player.position} · ${p.club.name}`,
        matchday: day,
      })
    }
  }

  // ── Transfer listings ─────────────────────────────────────────────────────────
  for (const l of listings) {
    items.push({
      type: 'transfer',
      headline: `${l.instance.player.name} available for transfer`,
      detail: `Day ${day} · ${l.instance.player.position} · OVR ${l.instance.player.overall} · €${(l.askingPrice / 1000).toFixed(0)}k · ${l.sellerClub.name}`,
      matchday: day,
    })
  }

  // Sort: most recent matchday first, then results before meta items
  items.sort((a, b) => {
    if (b.matchday !== a.matchday) return b.matchday - a.matchday
    const order = ['result', 'upset', 'streak', 'scorer', 'injury', 'transfer']
    return order.indexOf(a.type) - order.indexOf(b.type)
  })

  return items.slice(0, 12)
}
