import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ClubBadge } from '../../components/ClubBadge'
import type { MatchData, ClubData, LeagueData } from './types'

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
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, alignItems: 'center' }}>
        <button className="btn btn-outline" style={{ fontSize: 12, padding: '6px 12px' }} onClick={() => setVisibleFrom(v => Math.max(1, v - WINDOW))} disabled={visibleFrom <= 1}>← Earlier</button>
        <span style={{ fontSize: 13, color: 'var(--text-2)', flex: 1, textAlign: 'center' }}>Matchdays {visibleFrom} – {Math.min(visibleFrom + WINDOW - 1, days[days.length - 1] ?? 1)}</span>
        <button className="btn btn-outline" style={{ fontSize: 12, padding: '6px 12px' }} onClick={() => setVisibleFrom(v => v + WINDOW)} disabled={visibleFrom + WINDOW > (days[days.length - 1] ?? 1)}>Later →</button>
      </div>

      {visibleDays.map(day => (
        <div key={day} style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, color: 'var(--text-2)', letterSpacing: 0.5, textTransform: 'uppercase' }}>Matchday {day}</span>
            {day === currentDay && <span className="badge badge-active">Latest</span>}
            {day === currentDay + 1 && <span className="badge badge-drafting">Next</span>}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
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
              const resultColors: Record<string, string> = { W: 'var(--green)', D: 'var(--gold)', L: 'var(--red)' }

              const rowContent = (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
                    <div style={{ textAlign: 'right', fontSize: 13, fontWeight: match.homeClubId === myClubId ? 700 : homeWin ? 600 : 400, color: simulated && !homeWin && !isDraw ? 'var(--text-2)' : 'var(--text-1)' }}>{clubMap[match.homeClubId]?.name ?? match.homeClub.name}</div>
                    <ClubBadge name={match.homeClub.name} size={22} logoConfig={clubMap[match.homeClubId]?.logoConfig} />
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    {simulated ? (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                        {myResult && <span style={{ fontSize: 10, fontWeight: 800, color: resultColors[myResult], width: 16, textAlign: 'center' }}>{myResult}</span>}
                        <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 800, letterSpacing: 1, color: 'var(--text-1)' }}>{h} – {a}</span>
                        {myResult && <span style={{ width: 16 }} />}
                      </div>
                    ) : (
                      <span style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 600 }}>vs</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <ClubBadge name={match.awayClub.name} size={22} logoConfig={clubMap[match.awayClubId]?.logoConfig} />
                    <div style={{ fontSize: 13, fontWeight: match.awayClubId === myClubId ? 700 : awayWin ? 600 : 400, color: simulated && !awayWin && !isDraw ? 'var(--text-2)' : 'var(--text-1)' }}>{clubMap[match.awayClubId]?.name ?? match.awayClub.name}</div>
                  </div>
                </>
              )
              const rowStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 90px 1fr', alignItems: 'center', padding: '10px 14px', background: isMyMatch ? 'rgba(54,226,126,0.05)' : 'var(--bg-card)', border: `1px solid ${isMyMatch ? 'rgba(54,226,126,0.2)' : 'var(--border)'}`, borderRadius: 'var(--radius-sm)', gap: 8 }
              return simulated ? (
                <Link key={match.id} to={`/league/${leagueId}/match/${match.id}`} state={{ tab: 'fixtures' }} style={{ ...rowStyle, textDecoration: 'none', cursor: 'pointer' }}>
                  {rowContent}
                </Link>
              ) : (
                <div key={match.id} style={rowStyle}>
                  {rowContent}
                </div>
              )
            })}
          </div>
        </div>
      ))}
      {visibleDays.length === 0 && <p style={{ color: 'var(--text-2)', textAlign: 'center', padding: '32px 0' }}>No fixtures in this range.</p>}
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
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.88)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', maxWidth: 760, width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ padding: '28px 32px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--text-2)', marginBottom: 4 }}>Draft Complete · {league.name}</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 900, color: 'var(--green)' }}>Every Club Has Its Squad</div>
          </div>
          <button onClick={onDismiss} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--radius-xs)', cursor: 'pointer', color: 'var(--text-2)', padding: '6px 12px', fontSize: 12 }}>Close</button>
        </div>
        <div style={{ padding: '20px 32px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
          {clubs.map(club => {
            const topPicks = [...club.squad]
              .sort((a, b) => b.player.overall - a.player.overall)
              .slice(0, 4)
            return (
              <div key={club.id} style={{ background: 'var(--bg-card-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '14px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <ClubBadge name={club.name} size={28} logoConfig={club.logoConfig} />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-1)', lineHeight: 1.2 }}>{club.name}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-3)' }}>{club.isAI ? 'AI' : club.user?.username}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {topPicks.map(p => (
                    <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span className={`pos pos-${p.player.position === 'GK' ? 'gk' : ['CB','LB','RB'].includes(p.player.position) ? 'def' : ['CDM','CM','CAM','LM','RM'].includes(p.player.position) ? 'mid' : 'att'}`} style={{ fontSize: 9 }}>{p.player.position}</span>
                      <span style={{ fontSize: 12, color: 'var(--text-1)', flex: 1 }}>{p.player.name}</span>
                      <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 13, color: p.player.overall >= 85 ? 'var(--gold)' : p.player.overall >= 75 ? 'var(--green)' : 'var(--text-2)' }}>{p.player.overall}</span>
                    </div>
                  ))}
                  {club.squad.length > 4 && (
                    <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>+{club.squad.length - 4} more</div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
        <div style={{ padding: '16px 32px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn btn-green" onClick={onDismiss}>Let's Play →</button>
        </div>
      </div>
    </div>
  )
}
