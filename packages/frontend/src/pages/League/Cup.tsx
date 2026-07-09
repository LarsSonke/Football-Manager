import { useEffect, useState } from 'react'
import { Trophy } from 'lucide-react'
import { api } from '../../api/client'
import type { LeagueData } from './types'
import styles from './Cup.module.css'

// ─── Types ────────────────────────────────────────────────────────────────────

interface CupBracketMatch {
  matchId: string | null
  homeClubId: string | null
  awayClubId: string | null
  winnerId: string | null
  isBye: boolean
}

interface CupRoundDef {
  name: string
  code: string
  matchday: number
  matches: CupBracketMatch[]
}

interface CupBracketData {
  rounds: CupRoundDef[]
}

// ─── MatchCard ────────────────────────────────────────────────────────────────

function MatchCard({ m, clubMap, isFinal }: { m: CupBracketMatch; clubMap: Record<string, string>; isFinal: boolean }) {
  if (m.isBye && m.winnerId) {
    return (
      <div className={`${styles.matchCard} ${styles.matchCardBye}`}>
        <div className={styles.byeLabel}>{clubMap[m.winnerId] ?? ' - '}</div>
        <div className={styles.byeTag}>bye</div>
      </div>
    )
  }

  const homeName = m.homeClubId ? (clubMap[m.homeClubId] ?? m.homeClubId.slice(0, 8)) : '?'
  const awayName = m.awayClubId ? (clubMap[m.awayClubId] ?? m.awayClubId.slice(0, 8)) : '?'
  const winnerHome = m.winnerId === m.homeClubId
  const winnerAway = m.winnerId === m.awayClubId
  const played = !!m.winnerId

  return (
    <div className={`${styles.matchCard} ${played ? styles.matchCardPlayed : ''} ${isFinal ? styles.matchCardFinal : ''}`}>
      {isFinal && <div className={styles.finalTag}>FINAL</div>}
      <div
        className={styles.matchTeam}
        data-winner={String(winnerHome)}
        data-loser={String(played && !winnerHome)}
      >
        {homeName}
      </div>
      <div className={styles.matchVs}>vs</div>
      <div
        className={styles.matchTeam}
        data-winner={String(winnerAway)}
        data-loser={String(played && !winnerAway)}
      >
        {awayName}
      </div>
      {!played && !m.homeClubId && (
        <div className={styles.matchTbd}>TBD</div>
      )}
    </div>
  )
}

// ─── Cup ──────────────────────────────────────────────────────────────────────

export default function Cup({ leagueId, league }: { leagueId: string; league: LeagueData }) {
  const [bracket, setBracket] = useState<CupBracketData | null>(null)
  const [loading, setLoading] = useState(true)
  const clubMap = Object.fromEntries(league.clubs.map(c => [c.id, c.name]))

  useEffect(() => {
    setLoading(true)
    api.get(`/leagues/${leagueId}/cup`)
      .then(r => setBracket(r.data))
      .catch(() => setBracket(null))
      .finally(() => setLoading(false))
  }, [leagueId])

  if (loading) return <div className={styles.loading}>Loading bracket...</div>
  if (!bracket) return (
    <div className={styles.empty}>
      <div className={styles.emptyIcon}><Trophy size={40} /></div>
      <p>Cup bracket not available yet.</p>
    </div>
  )

  const totalRounds = bracket.rounds.length

  return (
    <div className={styles.scrollWrap}>
      <div className={styles.bracketRow}>
        {bracket.rounds.map((round, ri) => {
          const isFinalRound = ri === totalRounds - 1
          const isLastConnected = ri < totalRounds - 1
          // Group matches into pairs for connectors
          const pairs: CupBracketMatch[][] = []
          for (let i = 0; i < round.matches.length; i += 2) {
            pairs.push(round.matches.slice(i, i + 2))
          }
          const singleMatch = round.matches.length === 1

          return (
            <div key={ri} className={styles.roundWrapper}>
              {/* Round header */}
              <div className={`${styles.roundHeader} ${isFinalRound ? styles.roundHeaderFinal : ''}`}>
                <span className={styles.roundName}>{round.name}</span>
                <span className={styles.roundDay}>MD {round.matchday}</span>
              </div>

              {/* Match column */}
              <div className={`${styles.matchColumn} ${isFinalRound ? styles.matchColumnFinal : ''}`}>
                {singleMatch ? (
                  // Final: single match, no connector
                  <div className={styles.singleSlot}>
                    <MatchCard m={round.matches[0]} clubMap={clubMap} isFinal={isFinalRound} />
                  </div>
                ) : (
                  pairs.map((pair, pi) => (
                    <div key={pi} className={styles.matchPair}>
                      {pair.map((m, mi) => (
                        <div key={mi} className={styles.matchSlot}>
                          <MatchCard m={m} clubMap={clubMap} isFinal={false} />
                          {/* Horizontal arm to connector */}
                          {isLastConnected && <div className={styles.connectorArm} />}
                        </div>
                      ))}
                      {/* Vertical brace between pair arms */}
                      {isLastConnected && pair.length === 2 && (
                        <div className={styles.connectorBrace} />
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
