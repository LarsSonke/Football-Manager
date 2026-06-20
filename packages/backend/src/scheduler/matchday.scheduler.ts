import cron from 'node-cron'
import { prisma } from '../prisma'
import { simulateMatch } from '../simulation/engine'
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
    try { getIO().to(`league:${leagueId}`).emit('season:finished', { leagueId }) } catch {}
    return
  }

  const alreadySimulated = await prisma.match.count({
    where: { leagueId, matchday: nextDay, status: 'SIMULATED' },
  })
  if (alreadySimulated > 0) return

  const matches = await prisma.match.findMany({
    where: { leagueId, matchday: nextDay, status: 'SCHEDULED' },
    include: {
      homeClub: { include: { squad: { include: { player: true } } } },
      awayClub: { include: { squad: { include: { player: true } } } },
    },
  })

  const results = await Promise.all(matches.map(simulateMatch))

  // Decrement injuryDaysLeft per club — physio level 2 recovers 2 days/day
  const clubs = await prisma.club.findMany({
    where: { leagueId },
    select: { id: true, physioLevel: true },
  })

  for (const club of clubs) {
    const daysRecovered = club.physioLevel >= 2 ? 2 : 1
    await prisma.playerInstance.updateMany({
      where: { leagueId, clubId: club.id, injured: true },
      data: { injuryDaysLeft: { decrement: daysRecovered } },
    })
  }

  // Clear players who have fully recovered
  await prisma.playerInstance.updateMany({
    where: { leagueId, injured: true, injuryDaysLeft: { lte: 0 } },
    data: { injured: false, injuryDaysLeft: 0 },
  })

  await prisma.league.update({ where: { id: leagueId }, data: { currentDay: nextDay } })

  try {
    getIO().to(`league:${leagueId}`).emit('matchday:complete', { matchday: nextDay, results })
  } catch {}
}
