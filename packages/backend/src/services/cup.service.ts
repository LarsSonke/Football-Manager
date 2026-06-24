import { prisma } from '../prisma'

// ─── Cup bracket (read-only) ──────────────────────────────────────────────────

export async function getCupBracket(leagueId: string) {
  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    select: { hasCup: true, cupBracket: true },
  })
  if (!league?.hasCup) return null
  if (!league.cupBracket) return null

  // Enrich bracket with club names
  const bracket = league.cupBracket as any
  const allClubIds = new Set<string>()
  for (const round of bracket.rounds ?? []) {
    for (const m of round.matches ?? []) {
      if (m.homeClubId) allClubIds.add(m.homeClubId)
      if (m.awayClubId) allClubIds.add(m.awayClubId)
      if (m.winnerId)   allClubIds.add(m.winnerId)
    }
  }
  const clubs = await prisma.club.findMany({
    where: { id: { in: [...allClubIds] } },
    select: { id: true, name: true, logoConfig: true },
  })
  const clubMap = Object.fromEntries(clubs.map(c => [c.id, c]))

  const enrichRound = (round: any) => ({
    ...round,
    matches: round.matches.map((m: any) => ({
      ...m,
      homeClub: m.homeClubId ? clubMap[m.homeClubId] : null,
      awayClub: m.awayClubId ? clubMap[m.awayClubId] : null,
      winner:   m.winnerId   ? clubMap[m.winnerId]   : null,
    })),
  })

  return { rounds: bracket.rounds.map(enrichRound) }
}
