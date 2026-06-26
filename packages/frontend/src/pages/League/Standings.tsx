import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ClubBadge } from '../../components/ClubBadge'
import { posClass } from '../../utils/helpers'
import type { ClubData, MatchData, SeasonSnapshot } from './types'
import styles from './Standings.module.css'

export default function Standings({ clubs, myClubId, leagueId, prevPositions = {}, matches = [], history }: { clubs: ClubData[]; myClubId: string | undefined; leagueId: string; prevPositions?: Record<string, number>; matches?: MatchData[]; history?: SeasonSnapshot[] | null }) {
  const navigate = useNavigate()
  const [selectedClub, setSelectedClub] = useState<ClubData | null>(null)
  const sorted = [...clubs].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points
    return (b.goalsFor - b.goalsAgainst) - (a.goalsFor - a.goalsAgainst)
  })

  const legendItems: Array<{ color: string; label: string }> = [
    { color: 'var(--gold)',  label: 'Champion' },
    { color: 'var(--green)', label: 'Top 4' },
    { color: 'var(--red)',   label: 'Bottom 3' },
  ]

  return (
    <>
    {selectedClub && (
      <div
        className={styles.modalOverlay}
        onClick={e => { if (e.target === e.currentTarget) setSelectedClub(null) }}
      >
        <div className={styles.modalPanel}>
          {/* Modal header */}
          <div className={styles.modalHeader}>
            <ClubBadge name={selectedClub.name} size={42} logoConfig={selectedClub.logoConfig} />
            <div className={styles.modalHeaderInfo}>
              <div className={styles.modalClubName}>{selectedClub.name}</div>
              <div className={styles.modalClubType}>{selectedClub.isAI ? 'AI' : selectedClub.user?.username}</div>
            </div>
            <button onClick={() => setSelectedClub(null)} className={styles.modalCloseBtn}>✕</button>
          </div>
          {/* W/D/L + points */}
          <div className={styles.wdlBar}>
            <div className={styles.wdlItem}>
              <div className={styles.wdlValue} data-type="W">{selectedClub.wins}</div>
              <div className={styles.wdlLabel}>W</div>
            </div>
            <div className={styles.wdlItem}>
              <div className={styles.wdlValue} data-type="D">{selectedClub.draws}</div>
              <div className={styles.wdlLabel}>D</div>
            </div>
            <div className={styles.wdlItem}>
              <div className={styles.wdlValue} data-type="L">{selectedClub.losses}</div>
              <div className={styles.wdlLabel}>L</div>
            </div>
            <div className={styles.ptsItem}>
              <div className={styles.ptsValue}>{selectedClub.points}</div>
              <div className={styles.ptsLabel}>PTS</div>
            </div>
          </div>
          {/* Top 11 players */}
          <div className={styles.playerListBody}>
            <div className={styles.playerListTitle}>Top Players</div>
            {[...selectedClub.squad].sort((a, b) => b.player.overall - a.player.overall).slice(0, 11).map(p => {
              const tier = p.player.overall >= 85 ? 'gold' : p.player.overall >= 75 ? 'green' : 'dim'
              return (
                <div key={p.id} className={styles.playerRow}>
                  <span className={posClass(p.player.position)} style={{ fontSize: 9 }}>{p.player.position}</span>
                  <div className={styles.playerName}>{p.player.name}</div>
                  <span className={styles.playerOvr} data-tier={tier}>{p.player.overall}</span>
                </div>
              )
            })}
            {selectedClub.squad.length === 0 && <div className={styles.emptySquad}>No players yet</div>}
          </div>
        </div>
      </div>
    )}
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead className={styles.thead}>
          <tr>
            {['#','Club','P','W','D','L','GF','GA','GD','Pts','Form'].map(h => (
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
            const isMe = club.id === myClubId
            const gd = club.goalsFor - club.goalsAgainst
            const played = club.wins + club.draws + club.losses
            const posColor = i === 0 ? 'var(--gold)' : i < 4 ? 'var(--green)' : i >= sorted.length - 3 ? 'var(--red)' : 'var(--text-2)'
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
                data-mine={String(isMe)}
                onClick={() => navigate(`/league/${leagueId}/club/${club.id}`)}
              >
                <td className={styles.tdPos}>
                  <span className={styles.posNumber} style={{ color: posColor }}>{i + 1}</span>
                  {delta !== 0 && (
                    <div className={styles.posDelta} data-up={String(delta > 0)}>
                      {delta > 0 ? `▲${delta}` : `▼${Math.abs(delta)}`}
                    </div>
                  )}
                </td>
                <td className={styles.tdClub}>
                  <div className={styles.clubCellInner}>
                    <ClubBadge name={club.name} size={26} logoConfig={club.logoConfig} />
                    <div>
                      <div className={styles.clubNameText} data-mine={String(isMe)}>{club.name}</div>
                      <div className={styles.clubUserText}>{club.isAI ? 'AI' : club.user?.username}</div>
                    </div>
                  </div>
                </td>
                <td className={styles.tdStat}>{played}</td>
                <td className={styles.tdWins}>{club.wins}</td>
                <td className={styles.tdStat}>{club.draws}</td>
                <td className={styles.tdLosses}>{club.losses}</td>
                <td className={`${styles.tdStat} ${styles.tdHideMobile}`}>{club.goalsFor}</td>
                <td className={`${styles.tdStat} ${styles.tdHideMobile}`}>{club.goalsAgainst}</td>
                <td className={styles.tdGd} data-pos={String(gd > 0)} data-neg={String(gd < 0)}>
                  {gd > 0 ? `+${gd}` : gd}
                </td>
                <td className={styles.tdPts}>
                  <span className={styles.ptsDisplay} data-mine={String(isMe)}>{club.points}</span>
                </td>
                <td className={styles.tdForm}>
                  <div className={styles.formDots}>
                    {form.map((r, fi) => (
                      <div key={fi} className={styles.formDot} title={r} data-result={r}>{r}</div>
                    ))}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <div className={styles.legend}>
        {legendItems.map(({ color, label }) => (
          <span key={label} className={styles.legendItem}>
            <span className={styles.legendDot} style={{ background: color }} /> {label}
          </span>
        ))}
      </div>
    </div>
    {history && history.length > 0 && (
      <div className={styles.historySection}>
        <div className={styles.historyTitle}>Past Seasons</div>
        <div className={styles.historyList}>
          {[...history].reverse().map((snap, si) => (
            <div key={si}>
              <div className={styles.historySeasonHeader}>
                <span>Season {history.length - si} · {snap.endedOnDay} matchdays</span>
                {snap.clubs.length > 5 && <span className={styles.historyTopLabel}>top 5 shown</span>}
              </div>
              <div className={styles.historyRows}>
                {snap.clubs.slice(0, 5).map((c, ci) => (
                  <div key={c.id} className={styles.historyRow} data-winner={String(ci === 0)}>
                    <span className={styles.historyRank} data-winner={String(ci === 0)}>{ci === 0 ? '🏆' : ci + 1}</span>
                    <span className={styles.historyClubName}>{c.name}</span>
                    <span className={styles.historyRecord}>{c.wins}W {c.draws}D {c.losses}L</span>
                    <span className={styles.historyPoints} data-winner={String(ci === 0)}>{c.points} pts</span>
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
