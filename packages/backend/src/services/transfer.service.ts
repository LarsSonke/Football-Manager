import { prisma } from '../prisma'

// ─── Transfer window ──────────────────────────────────────────────────────────

export async function setTransferWindow(leagueId: string, userId: string, open: boolean) {
  const league = await prisma.league.findUnique({ where: { id: leagueId }, include: { clubs: true } })
  if (!league) throw new Error('League not found')
  if (league.status !== 'ACTIVE') throw new Error('League is not active')
  const creator = league.clubs.find(c => !c.isAI)
  if (creator?.userId !== userId) throw new Error('Only the league creator can manage the transfer window')
  return prisma.league.update({ where: { id: leagueId }, data: { transferWindowOpen: open } })
}
