import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ClubBadge } from '../../components/ClubBadge'
import type { MatchData, ClubData, LeagueData } from './types'
import styles from './Fixtures.module.css'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

export default function Fixtures({ matches, clubs, myClubId, currentDay, leagueId }: { matches: MatchData[]; clubs: ClubData[]; myClubId: string | undefined; currentDay: number; leagueId: string }) {
  const clubMap = Object.fromEntries(clubs.map(c => [c.id, c]))
  const grouped = matches.reduce<Record<number, MatchData[]>>((acc, m) => {
    acc[m.matchday] = acc[m.matchday] ?? []
    acc[m.matchday].push(m)
    return acc
  }, {})

  const days = Object.keys(grouped).map(Number).sort((a, b) => a - b)
  const [visibleFrom, setVisibleFrom] = useState(() => Math.max(1, currentDay - 1))
  const WINDOW = 5
  const visibleDays = days.filter(d => d >= visibleFrom && d < visibleFrom + WINDOW)

  return (
    <div>
      <div className={styles.paginationBar}>
        <button className={`btn btn-outline ${styles.paginationBtn}`} onClick={() => setVisibleFrom(v => Math.max(1, v - WINDOW))} disabled={visibleFrom <= 1}>← Earlier</button>
        <span className={styles.paginationLabel}>Matchdays {visibleFrom} – {Math.min(visibleFrom + WINDOW - 1, days[days.length - 1] ?? 1)}</span>
        <button className={`btn btn-outline ${styles.paginationBtn}`} onClick={() => setVisibleFrom(v => v + WINDOW)} disabled={visibleFrom + WINDOW > (days[days.length - 1] ?? 1)}>Later →</button>
      </div>

      {visibleDays.map(day => (
        <div key={day} className={styles.matchdayGroup}>
          <div className={styles.matchdayHeader}>
            <span className={styles.matchdayTitle}>Matchday {day}</span>
            {day === currentDay && <span className="badge badge-active">Latest</span>}
            {day === currentDay + 1 && <span className="badge badge-drafting">Next</span>}
          </div>
          <div className={styles.matchList}>
            {grouped[day].map(match => {
              const isMyMatch = match.homeClubId === myClubId || match.awayClubId === myClubId
              const simulated = match.status === 'SIMULATED'
              const h = match.homeScore ?? 0, a = match.awayScore ?? 0
              const homeWin = simulated && h > a, awayWin = simulated && a > h, isDraw = simulated && h === a
              let myResult: 'W'|'D'|'L'|null = null
              if (isMyMatch && simulated) {
                const iAmHome = match.homeClubId === myClubId
                myResult = isDraw ? 'D' : (iAmHome ? homeWin : awayWin) ? 'W' : 'L'
              }

              const rowContent = (
                <>
                  <div className={styles.homeCell}>
                    <div
                      className={styles.clubName}
                      data-bold={String(match.homeClubId === myClubId)}
                      data-winner={String(homeWin)}
                      data-simulated={String(simulated)}
                    >
                      {clubMap[match.homeClubId]?.name ?? match.homeClub.name}
                    </div>
                    <ClubBadge name={match.homeClub.name} size={22} logoConfig={clubMap[match.homeClubId]?.logoConfig} />
                  </div>
                  <div className={styles.scoreCell}>
                    {simulated ? (
                      <div className={styles.scoreInner}>
                        {myResult && <span className={styles.myResult} data-result={myResult}>{myResult}</span>}
                        <span className={styles.scoreValue}>{h} – {a}</span>
                        {myResult && <span className={styles.scoreSpacer} />}
                      </div>
                    ) : (
                      <span className={styles.vsLabel}>vs</span>
                    )}
                  </div>
                  <div className={styles.awayCell}>
                    <ClubBadge name={match.awayClub.name} size={22} logoConfig={clubMap[match.awayClubId]?.logoConfig} />
                    <div
                      className={styles.clubName}
                      data-bold={String(match.awayClubId === myClubId)}
                      data-winner={String(awayWin)}
                      data-simulated={String(simulated)}
                    >
                      {clubMap[match.awayClubId]?.name ?? match.awayClub.name}
                    </div>
                  </div>
                </>
              )

              return simulated ? (
                <Link
                  key={match.id}
                  to={`/league/${leagueId}/match/${match.id}`}
                  state={{ tab: 'fixtures' }}
                  className={styles.matchRow}
                  data-mine={String(isMyMatch)}
                  data-clickable="true"
                >
                  {rowContent}
                </Link>
              ) : (
                <div
                  key={match.id}
                  className={styles.matchRow}
                  data-mine={String(isMyMatch)}
                  data-clickable="false"
                >
                  {rowContent}
                </div>
              )
            })}
          </div>
        </div>
      ))}
      {visibleDays.length === 0 && <p className={styles.emptyState}>No fixtures in this range.</p>}
    </div>
  )
}

// ─── Draft Summary Overlay ────────────────────────────────────────────────────

export function DraftSummaryOverlay({ league, onDismiss }: { league: LeagueData; onDismiss: () => void }) {
  const clubs = [...league.clubs].sort((a, b) => {
    const aHuman = !a.isAI ? 1 : 0
    const bHuman = !b.isAI ? 1 : 0
    return bHuman - aHuman || a.name.localeCompare(b.name)
  })

  return (
    <div className={styles.draftOverlay}>
      <div className={styles.draftPanel}>
        <div className={styles.draftHeader}>
          <div>
            <div className={styles.draftHeaderLabel}>Draft Complete · {league.name}</div>
            <div className={styles.draftHeaderTitle}>Every Club Has Its Squad</div>
          </div>
          <button onClick={onDismiss} className={styles.draftCloseBtn}>Close</button>
        </div>
        <div className={styles.draftClubGrid}>
          {clubs.map(club => {
            const topPicks = [...club.squad]
              .sort((a, b) => b.player.overall - a.player.overall)
              .slice(0, 4)
            return (
              <div key={club.id} className={styles.draftClubCard}>
                <div className={styles.draftClubHeader}>
                  <ClubBadge name={club.name} size={28} logoConfig={club.logoConfig} />
                  <div>
                    <div className={styles.draftClubName}>{club.name}</div>
                    <div className={styles.draftClubType}>{club.isAI ? 'AI' : club.user?.username}</div>
                  </div>
                </div>
                <div className={styles.draftPlayerList}>
                  {topPicks.map(p => {
                    const posSuffix = p.player.position === 'GK' ? 'gk' : ['CB','LB','RB'].includes(p.player.position) ? 'def' : ['CDM','CM','CAM','LM','RM'].includes(p.player.position) ? 'mid' : 'att'
                    const tier = p.player.overall >= 85 ? 'gold' : p.player.overall >= 75 ? 'green' : 'dim'
                    return (
                      <div key={p.id} className={styles.draftPlayerRow}>
                        <span className={`pos pos-${posSuffix}`} style={{ fontSize: 9 }}>{p.player.position}</span>
                        <span className={styles.draftPlayerName}>{p.player.name}</span>
                        <span className={styles.draftPlayerOvr} data-tier={tier}>{p.player.overall}</span>
                      </div>
                    )
                  })}
                  {club.squad.length > 4 && (
                    <div className={styles.draftMorePlayers}>+{club.squad.length - 4} more</div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
        <div className={styles.draftFooter}>
          <button className="btn btn-green" onClick={onDismiss}>Let's Play →</button>
        </div>
      </div>
    </div>
  )
}
