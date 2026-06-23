import { prisma } from '../prisma'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CupBracketMatch {
  matchId: string | null
  homeClubId: string | null
  awayClubId: string | null
  winnerId: string | null
  isBye: boolean
}

export interface CupRoundDef {
  name: string
  code: string
  matchday: number
  matches: CupBracketMatch[]
}

export interface CupBracketData {
  rounds: CupRoundDef[]
}

const ROUND_NAMES: Record<number, string> = {
  32: 'Round of 32', 16: 'Round of 16', 8: 'Quarter-finals', 4: 'Semi-finals', 2: 'Final',
}
const ROUND_CODES: Record<number, string> = {
  32: 'R32', 16: 'R16', 8: 'QF', 4: 'SF', 2: 'F',
}

// ─── Generate bracket at season start ────────────────────────────────────────

export async function generateCupBracket(leagueId: string): Promise<void> {
  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    select: { seasonLength: true },
  })
  const clubs = await prisma.club.findMany({ where: { leagueId }, select: { id: true } })

  if (!league || clubs.length < 4) return

  const n = clubs.length
  let b = 1
  while (b < n) b *= 2

  const seeded = [...clubs].sort(() => Math.random() - 0.5)

  const totalRounds = Math.log2(b)
  const step = Math.floor(league.seasonLength / (totalRounds + 1))

  // R1: (b-n) top seeds get byes, remaining play actual matches
  const byeCount = b - n
  const byeClubs  = seeded.slice(0, byeCount)
  const r1Clubs   = seeded.slice(byeCount)

  const rounds: CupRoundDef[] = []

  // ── Round 1 ──────────────────────────────────────────────────────────────
  const r1Matches: CupBracketMatch[] = []
  for (let i = 0; i < r1Clubs.length; i += 2) {
    r1Matches.push({
      homeClubId: r1Clubs[i].id,
      awayClubId: r1Clubs[i + 1]?.id ?? null,
      matchId: null,
      winnerId: null,
      isBye: false,
    })
  }
  for (const bye of byeClubs) {
    r1Matches.push({ homeClubId: bye.id, awayClubId: null, matchId: null, winnerId: bye.id, isBye: true })
  }

  rounds.push({
    name: ROUND_NAMES[b] ?? `Round of ${b}`,
    code: ROUND_CODES[b] ?? `R${b}`,
    matchday: step,
    matches: r1Matches,
  })

  // ── Later rounds (placeholder, filled after each cup matchday) ───────────
  let remaining = b / 2
  let mdIdx = 2
  while (remaining >= 2) {
    const slots: CupBracketMatch[] = Array.from({ length: remaining / 2 }, () => ({
      homeClubId: null, awayClubId: null, matchId: null, winnerId: null, isBye: false,
    }))
    rounds.push({
      name: ROUND_NAMES[remaining] ?? `Round of ${remaining}`,
      code: ROUND_CODES[remaining] ?? `R${remaining}`,
      matchday: Math.min(step * mdIdx, league.seasonLength - 1),
      matches: slots,
    })
    remaining /= 2
    mdIdx++
  }

  // Create DB match records for R1 actual matches
  for (const slot of rounds[0].matches) {
    if (!slot.isBye && slot.homeClubId && slot.awayClubId) {
      const m = await prisma.match.create({
        data: {
          leagueId,
          matchday: rounds[0].matchday,
          homeClubId: slot.homeClubId,
          awayClubId: slot.awayClubId,
          competition: 'CUP',
          cupRound: rounds[0].code,
        },
      })
      slot.matchId = m.id
    }
  }

  const bracket: CupBracketData = { rounds }

  // If R1 had no actual matches (all byes), advance R1 immediately
  const r1HasActualMatches = rounds[0].matches.some(m => !m.isBye)
  if (!r1HasActualMatches && rounds.length >= 2) {
    await fillNextRound(bracket, 0, leagueId)
  }

  await prisma.league.update({ where: { id: leagueId }, data: { cupBracket: bracket as any } })
}

// ─── Called by scheduler after cup matchday ──────────────────────────────────

export async function checkAndAdvanceCup(leagueId: string, matchday: number): Promise<void> {
  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    select: { hasCup: true, cupBracket: true },
  })
  if (!league?.hasCup || !league.cupBracket) return

  const bracket = league.cupBracket as unknown as CupBracketData
  const roundIdx = bracket.rounds.findIndex(r => r.matchday === matchday)
  if (roundIdx === -1) return

  const currentRound = bracket.rounds[roundIdx]
  const actualMatches = currentRound.matches.filter(m => !m.isBye && m.matchId)

  if (actualMatches.length > 0) {
    const matchIds = actualMatches.map(m => m.matchId!)
    const results = await prisma.match.findMany({
      where: { id: { in: matchIds }, status: 'SIMULATED' },
      select: { id: true, homeClubId: true, awayClubId: true, homeScore: true, awayScore: true },
    })
    if (results.length < matchIds.length) return // not all played yet

    const resultMap = Object.fromEntries(results.map(r => [r.id, r]))
    for (const slot of currentRound.matches) {
      if (slot.isBye || !slot.matchId || slot.winnerId) continue
      const r = resultMap[slot.matchId]
      if (!r) continue
      const hs = r.homeScore ?? 0, as_ = r.awayScore ?? 0
      if (hs > as_) slot.winnerId = r.homeClubId
      else if (as_ > hs) slot.winnerId = r.awayClubId
      else slot.winnerId = Math.random() < 0.5 ? r.homeClubId : r.awayClubId  // penalty sim
    }
  } else {
    // All byes, winners already set
  }

  // Advance to next round if there is one (and this wasn't the final)
  if (roundIdx + 1 < bracket.rounds.length) {
    await fillNextRound(bracket, roundIdx, leagueId)
  }

  await prisma.league.update({ where: { id: leagueId }, data: { cupBracket: bracket as any } })
}

// ─── Fill next round slots with winners from completed round ─────────────────

async function fillNextRound(bracket: CupBracketData, completedIdx: number, leagueId: string): Promise<void> {
  if (completedIdx + 1 >= bracket.rounds.length) return

  const current = bracket.rounds[completedIdx]
  const next = bracket.rounds[completedIdx + 1]

  // Collect winners: actual match winners first, then bye winners, keeping order
  const actualWinners = current.matches.filter(m => !m.isBye).map(m => m.winnerId).filter(Boolean) as string[]
  const byeWinners    = current.matches.filter(m => m.isBye).map(m => m.winnerId).filter(Boolean) as string[]
  const winners = [...actualWinners, ...byeWinners]

  for (let i = 0; i < winners.length; i += 2) {
    const slot = next.matches[i / 2]
    if (!slot) break
    slot.homeClubId = winners[i]
    slot.awayClubId = winners[i + 1] ?? null

    if (slot.homeClubId && slot.awayClubId) {
      const m = await prisma.match.create({
        data: {
          leagueId,
          matchday: next.matchday,
          homeClubId: slot.homeClubId,
          awayClubId: slot.awayClubId,
          competition: 'CUP',
          cupRound: next.code,
        },
      })
      slot.matchId = m.id
    } else if (slot.homeClubId) {
      // Odd winner (shouldn't happen with powers-of-2 bracket, but handle gracefully)
      slot.winnerId = slot.homeClubId
      slot.isBye = true
    }
  }
}
