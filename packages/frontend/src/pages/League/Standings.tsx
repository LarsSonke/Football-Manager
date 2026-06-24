import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ClubBadge } from '../../components/ClubBadge'
import { posClass } from '../../utils/helpers'
import type { ClubData, MatchData, SeasonSnapshot } from './types'
import { useIsMobile } from './types'

export default function Standings({ clubs, myClubId, leagueId, prevPositions = {}, matches = [], history }: { clubs: ClubData[]; myClubId: string | undefined; leagueId: string; prevPositions?: Record<string, number>; matches?: MatchData[]; history?: SeasonSnapshot[] | null }) {
  const isMobile = useIsMobile()
  const navigate = useNavigate()
  const [selectedClub, setSelectedClub] = useState<ClubData | null>(null)
  const sorted = [...clubs].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points
    return (b.goalsFor - b.goalsAgainst) - (a.goalsFor - a.goalsAgainst)
  })

  return (
    <>
    {selectedClub && (
      <div
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 500, display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center', padding: isMobile ? 0 : 16 }}
        onClick={e => { if (e.target === e.currentTarget) setSelectedClub(null) }}
      >
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: isMobile ? 0 : 'var(--radius)', width: isMobile ? '100%' : '90%', maxWidth: isMobile ? '100%' : 520, maxHeight: isMobile ? '100%' : '85vh', height: isMobile ? '100%' : 'auto', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {/* Modal header */}
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
            <ClubBadge name={selectedClub.name} size={42} logoConfig={selectedClub.logoConfig} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--text-1)' }}>{selectedClub.name}</div>
              <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 2 }}>{selectedClub.isAI ? 'AI' : selectedClub.user?.username}</div>
            </div>
            <button onClick={() => setSelectedClub(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-2)', fontSize: 20, padding: 4, lineHeight: 1 }}>✕</button>
          </div>
          {/* W/D/L + points */}
          <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 24, alignItems: 'center' }}>
            <div style={{ textAlign: 'center' }}><div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 800, color: 'var(--green)' }}>{selectedClub.wins}</div><div style={{ fontSize: 10, color: 'var(--text-2)', fontWeight: 700 }}>W</div></div>
            <div style={{ textAlign: 'center' }}><div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 800, color: 'var(--text-2)' }}>{selectedClub.draws}</div><div style={{ fontSize: 10, color: 'var(--text-2)', fontWeight: 700 }}>D</div></div>
            <div style={{ textAlign: 'center' }}><div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 800, color: 'var(--red)' }}>{selectedClub.losses}</div><div style={{ fontSize: 10, color: 'var(--text-2)', fontWeight: 700 }}>L</div></div>
            <div style={{ marginLeft: 'auto', textAlign: 'center' }}><div style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 900, color: 'var(--text-1)' }}>{selectedClub.points}</div><div style={{ fontSize: 10, color: 'var(--text-2)', fontWeight: 700 }}>PTS</div></div>
          </div>
          {/* Top 11 players */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px' }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Top Players</div>
            {[...selectedClub.squad].sort((a, b) => b.player.overall - a.player.overall).slice(0, 11).map(p => (
              <div key={p.id} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', alignItems: 'center', gap: 8, marginBottom: 7 }}>
                <span className={posClass(p.player.position)} style={{ fontSize: 9 }}>{p.player.position}</span>
                <div style={{ fontSize: 12, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.player.name}</div>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 800, color: p.player.overall >= 85 ? 'var(--gold)' : p.player.overall >= 75 ? 'var(--green)' : 'var(--text-2)' }}>{p.player.overall}</span>
              </div>
            ))}
            {selectedClub.squad.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-2)', textAlign: 'center', padding: '16px 0' }}>No players yet</div>}
          </div>
        </div>
      </div>
    )}
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            {['#','Club','P','W','D','L','GF','GA','GD','Pts','Form'].map(h => (
              <th key={h} style={{ padding: '10px 12px', textAlign: h === 'Club' ? 'left' : 'center', fontSize: 11, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 0.5, display: isMobile && (h === 'GF' || h === 'GA' || h === 'Form') ? 'none' : undefined }}>{h}</th>
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
              <tr key={club.id} onClick={() => navigate(`/league/${leagueId}/club/${club.id}`)} style={{ borderBottom: '1px solid var(--border)', background: isMe ? 'rgba(54,226,126,0.05)' : 'transparent', borderLeft: isMe ? '3px solid var(--green)' : '3px solid transparent', cursor: 'pointer' }}
                onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.background = isMe ? 'rgba(54,226,126,0.08)' : 'rgba(255,255,255,0.03)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = isMe ? 'rgba(54,226,126,0.05)' : 'transparent' }}
              >
                <td style={{ padding: '12px', textAlign: 'center' }}>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 800, color: posColor }}>{i + 1}</span>
                  {delta !== 0 && (
                    <div style={{ fontSize: 9, fontWeight: 700, color: delta > 0 ? 'var(--green)' : 'var(--red)', lineHeight: 1, marginTop: 1 }}>
                      {delta > 0 ? `▲${delta}` : `▼${Math.abs(delta)}`}
                    </div>
                  )}
                </td>
                <td style={{ padding: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <ClubBadge name={club.name} size={26} logoConfig={club.logoConfig} />
                    <div>
                      <div style={{ fontWeight: isMe ? 700 : 500, fontSize: 14, color: 'var(--text-1)' }}>{club.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 1 }}>{club.isAI ? 'AI' : club.user?.username}</div>
                    </div>
                  </div>
                </td>
                <td style={{ padding: '12px', textAlign: 'center', color: 'var(--text-2)', fontSize: 13 }}>{played}</td>
                <td style={{ padding: '12px', textAlign: 'center', color: 'var(--green)', fontWeight: 700, fontFamily: 'var(--font-display)', fontSize: 15 }}>{club.wins}</td>
                <td style={{ padding: '12px', textAlign: 'center', color: 'var(--text-2)', fontSize: 13 }}>{club.draws}</td>
                <td style={{ padding: '12px', textAlign: 'center', color: 'var(--red)', fontSize: 13 }}>{club.losses}</td>
                <td style={{ padding: '12px', textAlign: 'center', fontSize: 13, display: isMobile ? 'none' : undefined }}>{club.goalsFor}</td>
                <td style={{ padding: '12px', textAlign: 'center', fontSize: 13, display: isMobile ? 'none' : undefined }}>{club.goalsAgainst}</td>
                <td style={{ padding: '12px', textAlign: 'center', fontSize: 13, color: gd > 0 ? 'var(--green)' : gd < 0 ? 'var(--red)' : 'var(--text-2)' }}>{gd > 0 ? `+${gd}` : gd}</td>
                <td style={{ padding: '12px', textAlign: 'center' }}>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 800, color: isMe ? 'var(--green)' : 'var(--text-1)' }}>{club.points}</span>
                </td>
                <td style={{ padding: '10px 12px', display: isMobile ? 'none' : undefined }}>
                  <div style={{ display: 'flex', gap: 3, justifyContent: 'center' }}>
                    {form.map((r, fi) => (
                      <div key={fi} title={r} style={{ width: 16, height: 16, borderRadius: '50%', background: r === 'W' ? 'var(--green)' : r === 'D' ? 'var(--gold)' : 'var(--red)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 800, color: '#000' }}>{r}</div>
                    ))}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <div style={{ display: 'flex', gap: 20, marginTop: 16, fontSize: 11, color: 'var(--text-2)', paddingLeft: 4 }}>
        {[['var(--gold)','Champion'],['var(--green)','Top 4'],['var(--red)','Bottom 3']].map(([c, l]) => (
          <span key={l} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 8, height: 8, background: c, borderRadius: '50%', display: 'inline-block' }} /> {l}
          </span>
        ))}
      </div>
    </div>
    {history && history.length > 0 && (
      <div style={{ marginTop: 36 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: 'var(--text-2)', marginBottom: 16 }}>Past Seasons</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {[...history].reverse().map((snap, si) => (
            <div key={si}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>Season {history.length - si} · {snap.endedOnDay} matchdays</span>
                {snap.clubs.length > 5 && <span style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 400 }}>top 5 shown</span>}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {snap.clubs.slice(0, 5).map((c, ci) => (
                  <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: ci === 0 ? 'rgba(54,226,126,0.06)' : 'var(--bg-card-2)', borderRadius: 'var(--radius-xs)', border: `1px solid ${ci === 0 ? 'rgba(54,226,126,0.2)' : 'var(--border)'}` }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: ci === 0 ? 'var(--gold)' : 'var(--text-3)', width: 20, textAlign: 'center' }}>{ci === 0 ? '🏆' : ci + 1}</span>
                    <span style={{ fontSize: 13, color: 'var(--text-1)', flex: 1 }}>{c.name}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-2)' }}>{c.wins}W {c.draws}D {c.losses}L</span>
                    <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 14, color: ci === 0 ? 'var(--green)' : 'var(--text-1)' }}>{c.points} pts</span>
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
