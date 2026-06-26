import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { api } from '../api/client'
import { ClubBadge, type LogoConfig } from '../components/ClubBadge'
import { posClass } from '../utils/helpers'
import { Navbar } from '../components/Navbar'

// ─── Types ────────────────────────────────────────────────────────────────────

interface SquadMember {
  id: string; playerId: string; name: string; nationality: string | null
  position: string; age: number; overall: number; potential: number
  morale: number; form: number; fitness: number
  injured: boolean; injuryDaysLeft: number; wage: number
}

interface RecentMatch {
  id: string; matchday: number
  homeClub: { id: string; name: string; logoConfig: LogoConfig | null }
  awayClub: { id: string; name: string; logoConfig: LogoConfig | null }
  homeScore: number | null; awayScore: number | null
}

interface TopPerformer {
  instanceId: string; name: string; position: string
  goals: number; assists: number; appearances: number; avgRating: number
}

interface ClubProfileData {
  club: {
    id: string; name: string; logoConfig: LogoConfig | null
    budget: number; wins: number; draws: number; losses: number
    goalsFor: number; goalsAgainst: number; points: number
    isAI: boolean; user: { id: string; username: string } | null
  }
  squad: SquadMember[]
  recentMatches: RecentMatch[]
  topPerformers: TopPerformer[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const POS_ORDER = ['GK', 'CB', 'LB', 'RB', 'CDM', 'CM', 'CAM', 'LM', 'RM', 'LW', 'RW', 'CF', 'ST']
const POS_GROUP: Record<string, string> = {
  GK: 'Goalkeeper', CB: 'Defenders', LB: 'Defenders', RB: 'Defenders',
  CDM: 'Midfielders', CM: 'Midfielders', CAM: 'Midfielders', LM: 'Midfielders', RM: 'Midfielders',
  LW: 'Attackers', RW: 'Attackers', CF: 'Attackers', ST: 'Attackers',
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ClubProfile() {
  const { id: leagueId, clubId } = useParams<{ id: string; clubId: string }>()
  const navigate = useNavigate()
  const [data, setData] = useState<ClubProfileData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!leagueId || !clubId) return
    api.get(`/leagues/${leagueId}/clubs/${clubId}/profile`)
      .then(r => setData(r.data))
      .catch(() => setError('Could not load club profile'))
      .finally(() => setLoading(false))
  }, [leagueId, clubId])

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <div style={{ color: 'var(--text-2)', fontSize: 14 }}>Loading…</div>
    </div>
  )

  if (error || !data) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: 12 }}>
      <div style={{ color: 'var(--text-2)' }}>{error || 'Club not found'}</div>
      <button className="btn btn-outline" onClick={() => navigate(-1)}>Go back</button>
    </div>
  )

  const { club, squad, recentMatches, topPerformers } = data

  const gd = club.goalsFor - club.goalsAgainst
  const played = club.wins + club.draws + club.losses
  const avgOvr = squad.length ? Math.round(squad.reduce((s, p) => s + p.overall, 0) / squad.length) : 0

  // Group squad by position group
  const grouped: Record<string, SquadMember[]> = {}
  for (const p of [...squad].sort((a, b) => POS_ORDER.indexOf(a.position) - POS_ORDER.indexOf(b.position))) {
    const grp = POS_GROUP[p.position] ?? 'Other'
    if (!grouped[grp]) grouped[grp] = []
    grouped[grp].push(p)
  }
  const groupOrder = ['Goalkeeper', 'Defenders', 'Midfielders', 'Attackers', 'Other']

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)' }}>
      {/* Nav */}
      <Navbar backTo={`/league/${leagueId}`} backLabel="← League" />

      <div className="page" style={{ maxWidth: 720 }}>

        {/* Hero */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 28 }}>
          <ClubBadge name={club.name} size={72} logoConfig={club.logoConfig} />
          <div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 800, letterSpacing: 0.5, marginBottom: 4 }}>
              {club.name}
            </h1>
            <div style={{ fontSize: 13, color: 'var(--text-2)' }}>
              {club.isAI ? 'AI Club' : club.user ? `Manager: ${club.user.username}` : '—'}
            </div>
            <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 800, color: 'var(--accent)' }}>{club.points}</div>
                <div style={{ fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Pts</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 800 }}>{club.wins}</div>
                <div style={{ fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.5 }}>W</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 800 }}>{club.draws}</div>
                <div style={{ fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.5 }}>D</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 800 }}>{club.losses}</div>
                <div style={{ fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.5 }}>L</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 800, color: gd >= 0 ? 'var(--paper)' : 'var(--accent)' }}>
                  {gd > 0 ? '+' : ''}{gd}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.5 }}>GD</div>
              </div>
              {avgOvr > 0 && (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 800, color: 'var(--gold)' }}>{avgOvr}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.5 }}>OVR</div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 16, alignItems: 'start' }}>

          {/* Left: Squad */}
          <div>
            <div className="card" style={{ padding: 0 }}>
              <div className="card-header">
                <span className="accent-bar" />
                <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-2)' }}>
                  Squad · {squad.length} players
                </span>
              </div>
              {groupOrder.filter(g => grouped[g]?.length).map(grp => (
                <div key={grp}>
                  <div style={{ padding: '8px 16px 4px', fontSize: 10, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.5, background: 'rgba(255,255,255,0.02)' }}>
                    {grp}
                  </div>
                  {grouped[grp].map((p, i) => (
                    <div key={p.id} style={{
                      display: 'grid', gridTemplateColumns: 'auto 1fr auto auto',
                      alignItems: 'center', gap: 10, padding: '9px 16px',
                      borderBottom: i < grouped[grp].length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                    }}>
                      <span className={posClass(p.position)} style={{ fontSize: 9 }}>{p.position}</span>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: p.injured ? 'var(--red)' : 'var(--text-1)', lineHeight: 1.2 }}>
                          {p.name}
                          {p.injured && <span style={{ fontSize: 9, color: 'var(--red)', fontWeight: 700, marginLeft: 6 }}>INJ {p.injuryDaysLeft}d</span>}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Age {p.age}</div>
                      </div>
                      {/* Condition dots */}
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        {[
                          { val: p.fitness, label: 'Fit' },
                          { val: p.morale, label: 'Mor' },
                          { val: p.form, label: 'Form' },
                        ].map(({ val, label }) => {
                          const color = val >= 75 ? '#2f6b46' : val >= 55 ? 'var(--gold)' : 'var(--accent)'
                          return (
                            <div key={label} title={`${label}: ${val}`} style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
                          )
                        })}
                      </div>
                      <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 800, color: p.overall >= 85 ? '#2f6b46' : p.overall >= 78 ? '#6a8a2f' : p.overall >= 70 ? '#cf9438' : 'var(--accent)', textAlign: 'right', minWidth: 28 }}>
                        {p.overall}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
              {squad.length === 0 && (
                <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>No squad data</div>
              )}
            </div>
          </div>

          {/* Right column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* Recent form */}
            <div className="card" style={{ padding: 0 }}>
              <div className="card-header">
                <span className="accent-bar" />
                <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-2)' }}>Recent Form</span>
              </div>
              <div style={{ padding: '14px 16px' }}>
                {recentMatches.length === 0 ? (
                  <div style={{ fontSize: 12, color: 'var(--text-3)', textAlign: 'center', padding: '8px 0' }}>No matches played yet</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {[...recentMatches].reverse().map(m => {
                      const isHome = m.homeClub.id === clubId
                      const myScore = isHome ? m.homeScore! : m.awayScore!
                      const oppScore = isHome ? m.awayScore! : m.homeScore!
                      const opp = isHome ? m.awayClub : m.homeClub
                      const result = myScore > oppScore ? 'W' : myScore === oppScore ? 'D' : 'L'
                      const colors: Record<string, string> = { W: 'var(--green)', D: 'var(--gold)', L: 'var(--red)' }
                      return (
                        <Link key={m.id} to={`/league/${leagueId}/match/${m.id}`} style={{ textDecoration: 'none' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '24px 1fr auto', alignItems: 'center', gap: 10, padding: '6px 8px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-base)', transition: 'background 0.12s' }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-card-2)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'var(--bg-base)')}
                          >
                            <div style={{ width: 24, height: 24, borderRadius: '50%', background: colors[result], display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 11, color: result === 'L' ? '#fff' : '#000', flexShrink: 0 }}>
                              {result}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                              <ClubBadge name={opp.name} size={18} logoConfig={opp.logoConfig} />
                              <span style={{ fontSize: 12, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {isHome ? 'vs' : '@'} {opp.name}
                              </span>
                            </div>
                            <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 800, color: 'var(--text-1)', whiteSpace: 'nowrap' }}>
                              {isHome ? `${myScore}–${oppScore}` : `${myScore}–${oppScore}`}
                            </div>
                          </div>
                        </Link>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Top performers */}
            {topPerformers.length > 0 && (
              <div className="card" style={{ padding: 0 }}>
                <div className="card-header">
                  <span className="accent-bar-gold" />
                  <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-2)' }}>Top Performers</span>
                </div>
                <div style={{ padding: '8px 0' }}>
                  {topPerformers.map((p, i) => (
                    <div key={p.instanceId} style={{ display: 'grid', gridTemplateColumns: '28px auto 1fr auto', alignItems: 'center', gap: 8, padding: '8px 16px', borderBottom: i < topPerformers.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                      <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 800, color: i === 0 ? 'var(--gold)' : 'var(--text-3)', textAlign: 'center' }}>{i + 1}</div>
                      <span className={posClass(p.position)} style={{ fontSize: 9 }}>{p.position}</span>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', lineHeight: 1.2 }}>{p.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{p.appearances} apps · ⭐{p.avgRating.toFixed(1)}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        {p.goals > 0 && <div style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 700 }}>⚽ {p.goals}</div>}
                        {p.assists > 0 && <div style={{ fontSize: 11, color: 'var(--ash)', fontWeight: 600 }}>🎯 {p.assists}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Budget */}
            <div className="card" style={{ padding: 0 }}>
              <div className="card-header">
                <span className="accent-bar-gold" />
                <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-2)' }}>Finances</span>
              </div>
              <div style={{ padding: 16 }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 400, color: 'var(--accent)', marginBottom: 4 }}>
                  €{(club.budget / 1_000).toFixed(1)}M
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-2)' }}>Available budget</div>
                {played > 0 && (
                  <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-2)' }}>
                    {club.goalsFor} scored · {club.goalsAgainst} conceded
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  )
}
