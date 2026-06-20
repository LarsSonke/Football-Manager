import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { api } from '../api/client'

// ─── Types ────────────────────────────────────────────────────────────────────

interface TeamStats {
  shots: number
  shotsOnTarget: number
  xG: number
  possession: number
  yellowCards: number
  redCards: number
}

interface MatchEvent {
  id: string
  minute: number
  type: string
  team: 'home' | 'away' | null
  playerName: string | null
  assistName: string | null
  xg: number | null
}

interface PlayerPerf {
  instanceId: string
  playerName: string
  position: string
  rating: number
  goals: number
  assists: number
  minutesPlayed: number
}

interface MatchDetail {
  id: string
  matchday: number
  status: string
  simulatedAt: string | null
  homeClub: { id: string; name: string }
  awayClub: { id: string; name: string }
  homeScore: number | null
  awayScore: number | null
  stats: { home: TeamStats; away: TeamStats } | null
  events: MatchEvent[]
  performances: { home: PlayerPerf[]; away: PlayerPerf[] }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ratingColor(r: number): string {
  if (r >= 8.0) return '#36e27e'
  if (r >= 7.0) return '#a8e36b'
  if (r >= 6.5) return '#e9c46a'
  if (r >= 6.0) return '#f0a26a'
  return '#e8806a'
}

function posClass(pos: string): string {
  if (pos === 'GK') return 'pos pos-gk'
  if (['CB', 'LB', 'RB'].includes(pos)) return 'pos pos-def'
  if (['CDM', 'CM', 'CAM', 'LM', 'RM'].includes(pos)) return 'pos pos-mid'
  return 'pos pos-att'
}

function StatBar({ label, home, away }: { label: string; home: number; away: number }) {
  const total = home + away || 1
  const homePct = (home / total) * 100
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-2)', marginBottom: 4 }}>
        <span style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text-1)', fontWeight: 600 }}>{typeof home === 'number' && !Number.isInteger(home) ? home.toFixed(2) : home}</span>
        <span style={{ color: 'var(--text-2)' }}>{label}</span>
        <span style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text-1)', fontWeight: 600 }}>{typeof away === 'number' && !Number.isInteger(away) ? away.toFixed(2) : away}</span>
      </div>
      <div style={{ height: 6, borderRadius: 3, background: 'var(--border)', overflow: 'hidden', display: 'flex' }}>
        <div style={{ width: `${homePct}%`, background: 'var(--green)', transition: 'width 0.4s' }} />
        <div style={{ flex: 1, background: '#e8806a' }} />
      </div>
    </div>
  )
}

// Possession bar: both sides use their own color
function PossBar({ home, away }: { home: number; away: number }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-2)', marginBottom: 4 }}>
        <span style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text-1)', fontWeight: 600 }}>{home}%</span>
        <span style={{ color: 'var(--text-2)' }}>Possession</span>
        <span style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text-1)', fontWeight: 600 }}>{away}%</span>
      </div>
      <div style={{ height: 6, borderRadius: 3, background: 'var(--border)', overflow: 'hidden', display: 'flex' }}>
        <div style={{ width: `${home}%`, background: 'var(--green)', transition: 'width 0.4s' }} />
        <div style={{ flex: 1, background: '#7b68ee' }} />
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function MatchReport() {
  const { id: leagueId, matchId } = useParams<{ id: string; matchId: string }>()
  const [match, setMatch] = useState<MatchDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!leagueId || !matchId) return
    api.get(`/leagues/${leagueId}/matches/${matchId}`)
      .then((r: { data: MatchDetail }) => setMatch(r.data))
      .catch(() => setError('Match not found'))
      .finally(() => setLoading(false))
  }, [leagueId, matchId])

  const cardStyle: React.CSSProperties = { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px 24px' }

  if (loading) return <div style={{ padding: 40, color: 'var(--text-2)', textAlign: 'center' }}>Loading…</div>
  if (error || !match) return <div style={{ padding: 40, color: 'var(--red)', textAlign: 'center' }}>{error || 'Match not found'}</div>

  const goals = match.events.filter(e => e.type === 'GOAL')
  const yellows = match.events.filter(e => e.type === 'YELLOW_CARD')
  const reds = match.events.filter(e => e.type === 'RED_CARD')

  // Build timeline: goals + cards in minute order
  const timeline = [...goals, ...yellows, ...reds].sort((a, b) => a.minute - b.minute)

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', padding: '24px 16px' }}>
      <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Back link */}
        <div>
          <Link
            to={`/league/${leagueId}`}
            style={{ color: 'var(--text-2)', fontSize: 13, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            ← Back to league
          </Link>
        </div>

        {/* Score header */}
        <div style={{ ...cardStyle, textAlign: 'center' }}>
          <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 12, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase' }}>
            Matchday {match.matchday}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 24 }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 800 }}>{match.homeClub.name}</div>
              <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 4 }}>Home</div>
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 48, fontWeight: 900, letterSpacing: 4, color: 'var(--text-1)', lineHeight: 1 }}>
              {match.homeScore ?? '–'} <span style={{ color: 'var(--text-3)' }}>–</span> {match.awayScore ?? '–'}
            </div>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 800 }}>{match.awayClub.name}</div>
              <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 4 }}>Away</div>
            </div>
          </div>
          {match.simulatedAt && (
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 14 }}>
              {new Date(match.simulatedAt).toLocaleString()}
            </div>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

          {/* Timeline */}
          <div style={cardStyle}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--text-2)', marginBottom: 16 }}>Timeline</div>
            {timeline.length === 0 ? (
              <div style={{ color: 'var(--text-2)', fontSize: 13 }}>No events recorded.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {timeline.map(e => {
                  const isHome = e.team === 'home'
                  let icon = '⚽'
                  if (e.type === 'YELLOW_CARD') icon = '🟨'
                  if (e.type === 'RED_CARD') icon = '🟥'
                  return (
                    <div key={e.id} style={{ display: 'grid', gridTemplateColumns: '1fr 56px 1fr', alignItems: 'center', gap: 4 }}>
                      {isHome ? (
                        <div style={{ textAlign: 'right', fontSize: 13 }}>
                          <span style={{ fontWeight: 600 }}>{e.playerName ?? '?'}</span>
                          {e.assistName && <span style={{ fontSize: 11, color: 'var(--text-2)' }}> ({e.assistName})</span>}
                        </div>
                      ) : <div />}
                      <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-2)', fontWeight: 700 }}>
                        {icon} {e.minute}'
                      </div>
                      {!isHome ? (
                        <div style={{ textAlign: 'left', fontSize: 13 }}>
                          <span style={{ fontWeight: 600 }}>{e.playerName ?? '?'}</span>
                          {e.assistName && <span style={{ fontSize: 11, color: 'var(--text-2)' }}> ({e.assistName})</span>}
                        </div>
                      ) : <div />}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Stats */}
          {match.stats && (
            <div style={cardStyle}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--text-2)', marginBottom: 16 }}>Match Stats</div>
              <PossBar home={match.stats.home.possession} away={match.stats.away.possession} />
              <StatBar label="Shots" home={match.stats.home.shots} away={match.stats.away.shots} />
              <StatBar label="Shots on Target" home={match.stats.home.shotsOnTarget} away={match.stats.away.shotsOnTarget} />
              <StatBar label="xG" home={match.stats.home.xG} away={match.stats.away.xG} />
              <StatBar label="Yellow Cards" home={match.stats.home.yellowCards} away={match.stats.away.yellowCards} />
              <StatBar label="Red Cards" home={match.stats.home.redCards} away={match.stats.away.redCards} />
            </div>
          )}
        </div>

        {/* Player ratings */}
        {(match.performances.home.length > 0 || match.performances.away.length > 0) && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            {[
              { label: match.homeClub.name, perfs: match.performances.home },
              { label: match.awayClub.name, perfs: match.performances.away },
            ].map(({ label, perfs }) => (
              <div key={label} style={cardStyle}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--text-2)', marginBottom: 14 }}>{label}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {perfs.map(p => (
                    <div key={p.instanceId} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span className={posClass(p.position)} style={{ fontSize: 9, minWidth: 32 }}>{p.position}</span>
                      <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{p.playerName}</span>
                      {p.goals > 0 && <span style={{ fontSize: 11, color: 'var(--text-2)' }}>⚽{p.goals}</span>}
                      {p.assists > 0 && <span style={{ fontSize: 11, color: 'var(--text-2)' }}>🅰️{p.assists}</span>}
                      <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 14, color: ratingColor(p.rating), minWidth: 32, textAlign: 'right' }}>
                        {p.rating.toFixed(1)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  )
}
