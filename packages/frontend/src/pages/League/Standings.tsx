import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Trophy } from 'lucide-react'
import { ClubBadge } from '../../components/ClubBadge'
import { posClass } from '../../utils/helpers'
import type { ClubData, MatchData, SeasonSnapshot } from './types'
import styles from './Standings.module.css'

type Zone = 'champion' | 'top4' | 'mid' | 'rel'

function getZone(i: number, total: number): Zone {
  if (i === 0) return 'champion'
  if (i < 4) return 'top4'
  if (i >= total - 3) return 'rel'
  return 'mid'
}

const legendItems: Array<{ zone: Zone; label: string }> = [
  { zone: 'champion', label: 'Champion' },
  { zone: 'top4',     label: 'Top 4' },
  { zone: 'rel',      label: 'Relegation' },
]

export default function Standings({
  clubs, myClubId, leagueId, prevPositions = {}, matches = [], history,
}: {
  clubs: ClubData[]
  myClubId: string | undefined
  leagueId: string
  prevPositions?: Record<string, number>
  matches?: MatchData[]
  history?: SeasonSnapshot[] | null
}) {
  const navigate = useNavigate()
  const [selectedClub, setSelectedClub] = useState<ClubData | null>(null)

  const sorted = [...clubs].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points
    return (b.goalsFor - b.goalsAgainst) - (a.goalsFor - a.goalsAgainst)
  })

  return (
    <>
      {/* ── Club detail overlay ── */}
      {selectedClub && (
        <div
          className={styles.modalOverlay}
          onClick={e => { if (e.target === e.currentTarget) setSelectedClub(null) }}
        >
          <div className={styles.modalPanel}>
            {/* Header */}
            <div className={styles.modalHeader}>
              <ClubBadge name={selectedClub.name} size={42} logoConfig={selectedClub.logoConfig} />
              <div className={styles.modalHeaderInfo}>
                <div className={styles.modalClubName}>{selectedClub.name}</div>
                <div className={styles.modalClubType}>{selectedClub.isAI ? 'AI Club' : selectedClub.user?.username}</div>
              </div>
              <button onClick={() => setSelectedClub(null)} className={styles.modalCloseBtn}>✕</button>
            </div>

            {/* W / D / L + Pts */}
            <div className={styles.wdlBar}>
              <div className={styles.wdlItem}>
                <span className={styles.wdlValue} data-type="W">{selectedClub.wins}</span>
                <span className={styles.wdlLabel}>W</span>
              </div>
              <div className={styles.wdlItem}>
                <span className={styles.wdlValue} data-type="D">{selectedClub.draws}</span>
                <span className={styles.wdlLabel}>D</span>
              </div>
              <div className={styles.wdlItem}>
                <span className={styles.wdlValue} data-type="L">{selectedClub.losses}</span>
                <span className={styles.wdlLabel}>L</span>
              </div>
              <div className={styles.ptsItem}>
                <span className={styles.ptsValue}>{selectedClub.points}</span>
                <span className={styles.ptsLabel}>PTS</span>
              </div>
            </div>

            {/* Top 11 players */}
            <div className={styles.playerListBody}>
              <div className={styles.playerListTitle}>Top Players</div>
              {[...selectedClub.squad]
                .sort((a, b) => b.player.overall - a.player.overall)
                .slice(0, 11)
                .map(p => {
                  const tier = p.player.overall >= 85 ? 'gold' : p.player.overall >= 75 ? 'green' : 'dim'
                  return (
                    <div key={p.id} className={styles.playerRow}>
                      <span className={`${posClass(p.player.position)} ${styles.posTagSm}`}>{p.player.position}</span>
                      <div className={styles.playerName}>{p.player.name}</div>
                      <span className={styles.playerOvr} data-tier={tier}>{p.player.overall}</span>
                    </div>
                  )
                })}
              {selectedClub.squad.length === 0 && (
                <div className={styles.emptySquad}>No players yet</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Main table panel ── */}
      <div className={styles.tablePanel}>
        <div className={styles.panelHeading}>
          <span className={styles.panelTitle}>League Table</span>
          <span className={styles.panelMeta}>{sorted.length} Clubs</span>
        </div>

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr className={styles.theadRow}>
                {(['#', 'Club', 'P', 'W', 'D', 'L', 'GF', 'GA', 'GD', 'Pts', 'Form'] as const).map(h => (
                  <th
                    key={h}
                    className={`${styles.th} ${(h === 'GF' || h === 'GA' || h === 'Form') ? styles.thHideMobile : ''}`}
                    data-align={h === 'Club' ? 'left' : 'center'}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((club, i) => {
                const zone = getZone(i, sorted.length)
                const isMe = club.id === myClubId
                const gd = club.goalsFor - club.goalsAgainst
                const played = club.wins + club.draws + club.losses
                const prev = prevPositions[club.id]
                const delta = prev !== undefined ? prev - (i + 1) : 0
                const clubMatches = matches
                  .filter(m => m.status === 'SIMULATED' && (m.homeClubId === club.id || m.awayClubId === club.id))
                  .sort((a, b) => b.matchday - a.matchday)
                  .slice(0, 5)
                  .reverse()
                const form = clubMatches.map(m => {
                  const isHome = m.homeClubId === club.id
                  const myScore = isHome ? m.homeScore! : m.awayScore!
                  const opScore = isHome ? m.awayScore! : m.homeScore!
                  return myScore > opScore ? 'W' : myScore === opScore ? 'D' : 'L'
                })

                return (
                  <tr
                    key={club.id}
                    className={styles.clubRow}
                    data-zone={zone}
                    data-mine={String(isMe)}
                    onClick={() => navigate(`/league/${leagueId}/club/${club.id}`)}
                  >
                    {/* # position */}
                    <td className={styles.tdPos}>
                      <span className={styles.posNumber} data-zone={zone}>{i + 1}</span>
                      {delta !== 0 && (
                        <span className={styles.posDelta} data-up={String(delta > 0)}>
                          {delta > 0 ? `▲${delta}` : `▼${Math.abs(delta)}`}
                        </span>
                      )}
                    </td>

                    {/* Club name + badge */}
                    <td className={styles.tdClub}>
                      <div className={styles.clubCellInner}>
                        <ClubBadge name={club.name} size={26} logoConfig={club.logoConfig} />
                        <div>
                          <div className={styles.clubNameText} data-mine={String(isMe)}>{club.name}</div>
                          <div className={styles.clubUserText}>{club.isAI ? 'AI' : club.user?.username}</div>
                        </div>
                      </div>
                    </td>

                    {/* Stats */}
                    <td className={styles.tdStat}>{played}</td>
                    <td className={styles.tdWins}>{club.wins}</td>
                    <td className={styles.tdStat}>{club.draws}</td>
                    <td className={styles.tdLosses}>{club.losses}</td>
                    <td className={`${styles.tdStat} ${styles.tdHideMobile}`}>{club.goalsFor}</td>
                    <td className={`${styles.tdStat} ${styles.tdHideMobile}`}>{club.goalsAgainst}</td>
                    <td className={styles.tdGd} data-pos={String(gd > 0)} data-neg={String(gd < 0)}>
                      {gd > 0 ? `+${gd}` : gd}
                    </td>

                    {/* Points */}
                    <td className={styles.tdPts}>
                      <span className={styles.ptsDisplay} data-mine={String(isMe)} data-zone={zone}>
                        {club.points}
                      </span>
                    </td>

                    {/* Form */}
                    <td className={`${styles.tdForm} ${styles.tdHideMobile}`}>
                      <div className={styles.formDots}>
                        {form.map((r, fi) => (
                          <div key={fi} className={styles.formDot} data-result={r}>{r}</div>
                        ))}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Legend */}
        <div className={styles.legend}>
          {legendItems.map(({ zone, label }) => (
            <span key={label} className={styles.legendItem}>
              <span className={styles.legendBar} data-zone={zone} />
              {label}
            </span>
          ))}
        </div>
      </div>

      {/* ── Past seasons ── */}
      {history && history.length > 0 && (
        <div className={styles.historySection}>
          <div className={styles.historySectionHeading}>
            <span className={styles.historySectionTitle}>Past Seasons</span>
            <span className={styles.historySectionRule} />
          </div>

          <div className={styles.historyList}>
            {[...history].reverse().map((snap, si) => (
              <div key={si} className={styles.historySeason}>
                <div className={styles.historySeasonHeader}>
                  <span>Season {history.length - si}</span>
                  <span className={styles.historyTopLabel}>
                    {snap.endedOnDay} matchdays
                    {snap.clubs.length > 5 && ' · top 5 shown'}
                  </span>
                </div>
                <div className={styles.historyRows}>
                  {snap.clubs.slice(0, 5).map((c, ci) => (
                    <div key={c.id} className={styles.historyRow} data-winner={String(ci === 0)}>
                      <span className={styles.historyRank} data-winner={String(ci === 0)}>
                        {ci === 0 ? <Trophy size={14} /> : ci + 1}
                      </span>
                      <span className={styles.historyClubName}>{c.name}</span>
                      <span className={styles.historyRecord}>{c.wins}W {c.draws}D {c.losses}L</span>
                      <span className={styles.historyPoints} data-winner={String(ci === 0)}>
                        {c.points} pts
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
