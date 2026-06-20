/**
 * Generates a full home-and-away round-robin schedule.
 * For N teams: produces 2*(N-1) matchdays, each with N/2 matches.
 */
export function generateRoundRobin(
  clubIds: string[],
): Array<Array<{ homeClubId: string; awayClubId: string }>> {
  const ids = [...clubIds]

  // Pad to even number with a bye slot
  if (ids.length % 2 !== 0) ids.push('BYE')

  const n = ids.length
  const rounds: Array<Array<{ homeClubId: string; awayClubId: string }>> = []

  const fixed = ids[0]
  const rotating = ids.slice(1)

  for (let round = 0; round < n - 1; round++) {
    const current = [fixed, ...rotating]
    const pairs: Array<{ homeClubId: string; awayClubId: string }> = []

    for (let i = 0; i < n / 2; i++) {
      const home = current[i]
      const away = current[n - 1 - i]
      if (home !== 'BYE' && away !== 'BYE') {
        pairs.push({ homeClubId: home, awayClubId: away })
      }
    }

    rounds.push(pairs)

    // Rotate all except the fixed team
    rotating.unshift(rotating.pop()!)
  }

  // Return fixtures (swap home/away for second half of season)
  const returnRounds = rounds.map((round) =>
    round.map((pair) => ({ homeClubId: pair.awayClubId, awayClubId: pair.homeClubId })),
  )

  return [...rounds, ...returnRounds]
}
