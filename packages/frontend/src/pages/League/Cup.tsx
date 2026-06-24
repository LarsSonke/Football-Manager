import { useEffect, useState } from 'react'
import { api } from '../../api/client'
import type { LeagueData } from './types'

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

  if (loading) return <div style={{ color: 'var(--text-2)', textAlign: 'center', padding: 40 }}>Loading bracket...</div>
  if (!bracket) return <div style={{ textAlign: 'center', padding: '64px 0', color: 'var(--text-2)' }}><div style={{ fontSize: 36, marginBottom: 10 }}>🏆</div><p>Cup bracket not available yet.</p></div>

  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', minWidth: 'max-content', padding: '8px 4px' }}>
        {bracket.rounds.map((round, ri) => (
          <div key={ri} style={{ minWidth: 180 }}>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-2)', marginBottom: 10, textAlign: 'center' }}>
              {round.name}
              <span style={{ display: 'block', fontSize: 9, color: 'var(--text-3)', fontWeight: 500 }}>MD {round.matchday}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, justifyContent: 'space-around', minHeight: bracket.rounds[0].matches.length * 60 }}>
              {round.matches.map((m, mi) => {
                if (m.isBye && m.winnerId) {
                  return (
                    <div key={mi} style={{ padding: '8px 12px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 12, color: 'var(--text-2)', textAlign: 'center', opacity: 0.6 }}>
                      {clubMap[m.winnerId] ?? '—'} <span style={{ color: 'var(--text-3)' }}>(bye)</span>
                    </div>
                  )
                }
                const homeName = m.homeClubId ? (clubMap[m.homeClubId] ?? m.homeClubId.slice(0, 8)) : '?'
                const awayName = m.awayClubId ? (clubMap[m.awayClubId] ?? m.awayClubId.slice(0, 8)) : '?'
                const winnerHome = m.winnerId === m.homeClubId
                const winnerAway = m.winnerId === m.awayClubId
                const played = !!m.winnerId
                return (
                  <div key={mi} style={{ padding: '8px 12px', background: 'var(--bg-card)', border: `1px solid ${played ? 'rgba(54,226,126,0.2)' : 'var(--border)'}`, borderRadius: 'var(--radius-sm)', fontSize: 12 }}>
                    <div style={{ marginBottom: 4, color: winnerHome ? 'var(--green)' : played ? 'var(--text-3)' : 'var(--text-1)', fontWeight: winnerHome ? 700 : 500 }}>
                      {homeName}
                    </div>
                    <div style={{ fontSize: 9, color: 'var(--text-3)', marginBottom: 4 }}>vs</div>
                    <div style={{ color: winnerAway ? 'var(--green)' : played ? 'var(--text-3)' : 'var(--text-1)', fontWeight: winnerAway ? 700 : 500 }}>
                      {awayName}
                    </div>
                    {!played && !m.homeClubId && <div style={{ fontSize: 10, color: 'var(--text-3)', fontStyle: 'italic' }}>TBD</div>}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
