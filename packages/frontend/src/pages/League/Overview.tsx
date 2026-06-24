import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../api/client'
import { ClubBadge } from '../../components/ClubBadge'
import { KitSvg, type KitConfig } from '../../components/KitSvg'
import {
  useIsMobile, getBadgeColor, posClass, utcTimeToLocal, squadAvgOvr,
  type LeagueData, type MatchData, type ClubData, type AwardEntry, type MatchdayAwards,
  type AvailableDeal, type ActiveDeal,
} from './types'

// ─── Countdown ring ───────────────────────────────────────────────────────────

function CountdownRing({ matchTime }: { matchTime: string }) {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 60_000)
    return () => clearInterval(t)
  }, [])

  const [hh, mm] = matchTime.split(':').map(Number)
  const now  = new Date()
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hh, mm, 0))
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1)
  const diffMs    = next.getTime() - now.getTime()
  const totalMins = Math.floor(diffMs / 60_000)
  const h         = Math.floor(totalMins / 60)
  const m         = totalMins % 60
  const label     = h > 0 ? `${h}h ${m}m` : `${m}m`
  const fraction  = diffMs / (24 * 60 * 60 * 1000)

  const isUrgent  = fraction < 1 / 24   // < 1 h
  const isSoon    = fraction < 4 / 24   // < 4 h
  const color     = isUrgent ? 'var(--red)' : isSoon ? 'var(--gold)' : 'var(--green)'

  const R    = 30
  const circ = 2 * Math.PI * R
  const dash = circ * fraction           // filled arc length
  const gap  = circ - dash              // empty arc length

  // suppress unused tick warning — it's only read to force re-render
  void tick

  const pulseStyle: React.CSSProperties = isUrgent
    ? { animation: 'countdown-pulse 1.2s ease-in-out infinite' }
    : isSoon
    ? { animation: 'countdown-glow 2.5s ease-in-out infinite' }
    : {}

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ position: 'relative', width: 70, height: 70, flexShrink: 0 }}>
        {/* Track */}
        <svg width="70" height="70" style={{ position: 'absolute', top: 0, left: 0, transform: 'rotate(-90deg)' }}>
          <circle cx="35" cy="35" r={R} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="5" />
        </svg>
        {/* Arc */}
        <svg width="70" height="70" style={{ position: 'absolute', top: 0, left: 0, transform: 'rotate(-90deg)', ...pulseStyle }}>
          <circle
            cx="35" cy="35" r={R}
            fill="none"
            stroke={color}
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={`${dash} ${gap}`}
            style={{ transition: 'stroke-dasharray 1.2s ease, stroke 0.8s ease', filter: `drop-shadow(0 0 4px ${color})` }}
          />
        </svg>
        {/* Label */}
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 1,
        }}>
          <span style={{
            fontFamily: 'var(--font-display)', fontSize: h > 9 ? 11 : 13,
            fontWeight: 800, color, lineHeight: 1, letterSpacing: 0.3,
            ...pulseStyle,
          }}>{label}</span>
          <span style={{ fontSize: 8, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>left</span>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 11, color: 'var(--text-2)' }}>Simulates at</span>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 800, color: 'var(--text-1)' }}>{utcTimeToLocal(matchTime)}</span>
      </div>
    </div>
  )
}

// ─── CircleGauge ─────────────────────────────────────────────────────────────

function CircleGauge({ value, label, color }: { value: number; label: string; color: string }) {
  const r = 28, circ = 2 * Math.PI * r
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ position: 'relative', width: 70, height: 70, display: 'inline-block' }}>
        <svg width="70" height="70" style={{ transform: 'rotate(-90deg)' }}>
          <circle cx="35" cy="35" r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="5" />
          <circle cx="35" cy="35" r={r} fill="none" stroke={color} strokeWidth="5"
            strokeDasharray={`${circ}`}
            strokeDashoffset={`${circ - (value / 100) * circ}`}
            strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 0.8s ease' }}
          />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 800, color: 'var(--text-1)' }}>{value}</div>
      </div>
      <div style={{ fontSize: 10, color: 'var(--text-2)', marginTop: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
    </div>
  )
}


// ─── TOTWPitch (mini version used in awards) ──────────────────────────────────

function TOTWPitch({ players }: { players: AwardEntry[] }) {
  const posY: Record<string, number> = {
    GK: 82, CB: 65, LB: 65, RB: 65, LWB: 65, RWB: 65,
    CDM: 52, CM: 42, LM: 42, RM: 42,
    CAM: 30, LW: 20, RW: 20, CF: 20, SS: 20, ST: 14,
  }
  const getY = (pos: string) => posY[pos] ?? 42

  const rowMap: Record<number, AwardEntry[]> = {}
  for (const p of players) {
    const y = getY(p.position)
    if (!rowMap[y]) rowMap[y] = []
    rowMap[y].push(p)
  }

  const positionedPlayers: Array<{ player: AwardEntry; x: number; y: number }> = []
  for (const [yStr, row] of Object.entries(rowMap)) {
    const y = Number(yStr)
    const count = row.length
    row.forEach((p, i) => {
      const x = count === 1 ? 50 : 10 + (i / (count - 1)) * 80
      positionedPlayers.push({ player: p, x, y })
    })
  }

  return (
    <div style={{ position: 'relative', width: '100%', paddingBottom: '62%', borderRadius: 10, overflow: 'hidden', background: '#1a5c28' }}>
      <svg viewBox="0 0 100 62" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
        {[0,1,2,3,4,5].map(i => <rect key={i} x="0" y={i*10.3} width="100" height="5.2" fill="rgba(0,0,0,0.06)" />)}
        <rect x="2" y="2" width="96" height="58" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="0.5" />
        <line x1="2" y1="31" x2="98" y2="31" stroke="rgba(255,255,255,0.3)" strokeWidth="0.5" />
        <circle cx="50" cy="31" r="8" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="0.5" />
        <circle cx="50" cy="31" r="0.7" fill="rgba(255,255,255,0.4)" />
        <rect x="28" y="2" width="44" height="14" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="0.5" />
        <rect x="38" y="2" width="24" height="6" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="0.5" />
        <circle cx="50" cy="10" r="0.7" fill="rgba(255,255,255,0.3)" />
        <rect x="28" y="46" width="44" height="14" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="0.5" />
        <rect x="38" y="56" width="24" height="6" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="0.5" />
        <circle cx="50" cy="52" r="0.7" fill="rgba(255,255,255,0.3)" />
      </svg>

      {positionedPlayers.map(({ player: p, x, y }) => (
        <div key={p.instanceId} style={{
          position: 'absolute',
          left: `${x}%`, top: `${y}%`,
          transform: 'translate(-50%, -50%)',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          gap: 2, width: 72,
        }}>
          {p.photoUrl ? (
            <img src={p.photoUrl} alt="" style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover', border: '2.5px solid rgba(255,255,255,0.9)', flexShrink: 0, filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.7))' }} />
          ) : (
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: getBadgeColor(p.playerName), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 900, color: '#000', border: '2.5px solid rgba(255,255,255,0.9)', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.7))' }}>
              {p.playerName.split(' ').map(w => w[0]).slice(0, 2).join('')}
            </div>
          )}
          <KitSvg config={p.clubKitConfig as KitConfig | null} size={36} uid={`totw-${p.instanceId}`} />
          <div style={{ background: 'rgba(0,0,0,0.72)', borderRadius: 4, padding: '2px 6px', textAlign: 'center', backdropFilter: 'blur(4px)' }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', lineHeight: 1.3, maxWidth: 68, overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {p.playerName.split(' ').slice(-1)[0]}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
              <span className={posClass(p.position)} style={{ fontSize: 7, padding: '1px 3px' }}>{p.position}</span>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 900, color: 'var(--gold)', lineHeight: 1 }}>{p.rating.toFixed(1)}</span>
            </div>
            {(p.goals > 0 || p.assists > 0) && (
              <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.8)', lineHeight: 1.2 }}>
                {p.goals > 0 && <span style={{ color: '#7effa0' }}>⚽{p.goals} </span>}
                {p.assists > 0 && <span style={{ color: '#7dd3fc' }}>🅰{p.assists}</span>}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Overview ─────────────────────────────────────────────────────────────────

export default function Overview({ league, matches, myClub, awards, onPhysioUpgrade, onRefresh }: { league: LeagueData; matches: MatchData[]; myClub: ClubData | undefined; awards: MatchdayAwards | null; onPhysioUpgrade: () => void; onRefresh: () => void }) {
  const isMobile = useIsMobile()
  const clubMap = Object.fromEntries(league.clubs.map(c => [c.id, c]))
  const logoMap = Object.fromEntries(league.clubs.map(c => [c.id, c.logoConfig ?? null]))

  const [sponsorData, setSponsorData] = useState<{ available: AvailableDeal[]; active: ActiveDeal[]; history: ActiveDeal[] } | null>(null)
  const [signingDeal, setSigningDeal] = useState<number | null>(null)
  const [sponsorMsg, setSponsorMsg] = useState('')

  useEffect(() => {
    if (!myClub || league.status !== 'ACTIVE') return
    api.get(`/leagues/${league.id}/sponsors`).then(r => setSponsorData(r.data)).catch(() => {})
  }, [league.id, league.status, myClub?.id])

  async function handleSignDeal(index: number) {
    setSigningDeal(index)
    setSponsorMsg('')
    try {
      await api.post(`/leagues/${league.id}/sponsors/sign`, { dealIndex: index })
      const r = await api.get(`/leagues/${league.id}/sponsors`)
      setSponsorData(r.data)
      setSponsorMsg('Deal signed!')
      onRefresh()  // updates club budget in the header
    } catch (err: any) {
      setSponsorMsg(err.response?.data?.error ?? 'Failed to sign deal')
    } finally {
      setSigningDeal(null)
    }
  }

  // Next match
  const nextMatch = myClub ? matches
    .filter(m => (m.homeClubId === myClub.id || m.awayClubId === myClub.id) && m.status === 'SCHEDULED')
    .sort((a, b) => a.matchday - b.matchday)[0] : null

  // Last 5 results
  const last5 = myClub ? matches
    .filter(m => (m.homeClubId === myClub.id || m.awayClubId === myClub.id) && m.status === 'SIMULATED')
    .sort((a, b) => b.matchday - a.matchday)
    .slice(0, 5)
    .reverse() : []

  // Squad averages
  const squad = myClub?.squad ?? []
  const avgFitness = squad.length ? Math.round(squad.reduce((s, p) => s + p.fitness, 0) / squad.length) : 0
  const avgMorale  = squad.length ? Math.round(squad.reduce((s, p) => s + p.morale, 0) / squad.length) : 0
  const avgForm    = squad.length ? Math.round(squad.reduce((s, p) => s + p.form, 0) / squad.length) : 0

  // Standings
  const sorted = [...league.clubs].sort((a, b) => b.points !== a.points ? b.points - a.points : (b.goalsFor - b.goalsAgainst) - (a.goalsFor - a.goalsAgainst))

  const cardStyle = { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' as const }
  const cardBody = { padding: 20 }
  const secLabel = { fontSize: 11, fontWeight: 800 as const, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: 'var(--text-2)', marginBottom: 8 }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 340px', gap: 16, alignItems: 'start' }}>
      {/* Left column */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Next match */}
        <div style={cardStyle}>
          <div className="card-header">
            <span className="accent-bar" />
            <span style={secLabel}>Next Match{nextMatch ? ` · Matchday ${nextMatch.matchday}` : ''}</span>
          </div>
          <div style={cardBody}>
          {nextMatch && myClub ? (() => {
            const isHome = nextMatch.homeClubId === myClub.id
            const homeClub = clubMap[nextMatch.homeClubId]
            const awayClub = clubMap[nextMatch.awayClubId]
            const homeOvr = homeClub ? squadAvgOvr(homeClub) : null
            const awayOvr = awayClub ? squadAvgOvr(awayClub) : null

            const myOvr = isHome ? homeOvr : awayOvr
            const oppOvr = isHome ? awayOvr : homeOvr
            const diff = (myOvr ?? 70) - (oppOvr ?? 70)
            const winP = Math.round(Math.max(15, Math.min(85, 50 + diff * 2.2)))
            const loseP = Math.max(5, Math.round((100 - winP) * 0.55))
            const drawP = 100 - winP - loseP

            return (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 60px 1fr' : '1fr 80px 1fr', alignItems: 'center', gap: 16, marginBottom: 16 }}>
                  {/* Home */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8 }}>
                    <ClubBadge name={homeClub?.name ?? ''} size={52} logoConfig={logoMap[nextMatch.homeClubId]} />
                    <div style={{ fontWeight: 700, fontSize: 14, color: isHome ? 'var(--green)' : 'var(--text-1)' }}>{homeClub?.name}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-2)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Home</div>
                    {homeOvr !== null && <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 800, color: homeOvr >= 82 ? 'var(--gold)' : homeOvr >= 75 ? 'var(--blue)' : 'var(--text-1)' }}>{homeOvr} <span style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 400 }}>OVR</span></div>}
                  </div>
                  <div style={{ textAlign: 'center', fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 800, color: 'var(--text-2)' }}>VS</div>
                  {/* Away */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
                    <ClubBadge name={awayClub?.name ?? ''} size={52} logoConfig={logoMap[nextMatch.awayClubId]} />
                    <div style={{ fontWeight: 700, fontSize: 14, color: !isHome ? 'var(--green)' : 'var(--text-1)', textAlign: 'right' }}>{awayClub?.name}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-2)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Away</div>
                    {awayOvr !== null && <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 800, color: awayOvr >= 82 ? 'var(--gold)' : awayOvr >= 75 ? 'var(--blue)' : 'var(--text-1)', textAlign: 'right' }}>{awayOvr} <span style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 400 }}>OVR</span></div>}
                  </div>
                </div>
                {/* Win probability */}
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Win Probability</div>
                  <div style={{ display: 'flex', height: 18, borderRadius: 4, overflow: 'hidden', gap: 1 }}>
                    <div style={{ width: `${winP}%`, background: 'var(--green)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontSize: 9, fontWeight: 800, color: '#000' }}>W {winP}%</span>
                    </div>
                    <div style={{ width: `${drawP}%`, background: 'var(--gold)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontSize: 9, fontWeight: 800, color: '#000' }}>D {drawP}%</span>
                    </div>
                    <div style={{ width: `${loseP}%`, background: 'var(--red)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontSize: 9, fontWeight: 800, color: '#fff' }}>L {loseP}%</span>
                    </div>
                  </div>
                </div>
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
                  <CountdownRing matchTime={league.matchTime} />
                </div>
              </div>
            )
          })() : (
            <div style={{ padding: '20px 0', textAlign: 'center' }}>
              {league.status === 'SETUP' ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                  <div style={{ fontSize: 13, color: 'var(--text-2)' }}>
                    Waiting for the draft to start
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                    <span style={{ color: league.clubs.length >= league.maxClubs ? 'var(--green)' : 'var(--gold)', fontWeight: 700 }}>{league.clubs.length}</span>
                    <span style={{ color: 'var(--text-3)' }}> / {league.maxClubs} clubs joined</span>
                  </div>
                </div>
              ) : league.status === 'DRAFTING' ? (
                <div style={{ fontSize: 13, color: 'var(--text-2)' }}>Season starts after the draft completes.</div>
              ) : (
                <div style={{ fontSize: 13, color: 'var(--text-2)' }}>No more fixtures this season.</div>
              )}
            </div>
          )}
          </div>
        </div>

        {/* Team form */}
        {myClub && (
          <div style={cardStyle}>
            <div className="card-header">
              <span className="accent-bar" />
              <span style={secLabel}>Team Form</span>
            </div>
            <div style={cardBody}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div />
              {last5.length > 0 && (
                <div style={{ fontSize: 11, color: 'var(--text-2)' }}>
                  Last {last5.length} · {last5.reduce((s, m) => {
                    const ih = m.homeClubId === myClub.id
                    const ms = ih ? m.homeScore! : m.awayScore!
                    const os = ih ? m.awayScore! : m.homeScore!
                    return s + (ms > os ? 3 : ms === os ? 1 : 0)
                  }, 0)} pts
                </div>
              )}
            </div>
            {last5.length === 0 ? (
              <div style={{ color: 'var(--text-2)', fontSize: 12 }}>No results yet — season hasn't started.</div>
            ) : (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {last5.map(m => {
                  const isHome = m.homeClubId === myClub.id
                  const ms = isHome ? m.homeScore! : m.awayScore!
                  const os = isHome ? m.awayScore! : m.homeScore!
                  const r = ms > os ? 'W' : ms === os ? 'D' : 'L'
                  const opp = clubMap[isHome ? m.awayClubId : m.homeClubId]
                  const colors: Record<string, string> = { W: 'var(--green)', D: 'var(--gold)', L: 'var(--red)' }
                  return (
                    <Link key={m.id} to={`/league/${league.id}/match/${m.id}`} state={{ tab: 'overview' }} title={`MD${m.matchday}: vs ${opp?.name} ${ms}–${os}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, textDecoration: 'none' }}>
                      <div style={{ width: 36, height: 36, borderRadius: '50%', background: colors[r], display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 14, color: '#000', transition: 'opacity 0.15s' }} onMouseEnter={e => (e.currentTarget.style.opacity = '0.8')} onMouseLeave={e => (e.currentTarget.style.opacity = '1')}>{r}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-2)' }}>{ms}–{os}</div>
                    </Link>
                  )
                })}
              </div>
            )}
            </div>
          </div>
        )}

        {/* Matchday awards */}
        {awards && (
          <div style={cardStyle}>
            <div className="card-header">
              <span className="accent-bar-gold" />
              <span style={secLabel}>Matchday {awards.matchday} Awards</span>
            </div>
            <div style={cardBody}>
              {/* MOTM + top scorer + top assister row */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
                {[
                  { label: '⭐ MOTM', entry: awards.motm, value: awards.motm?.rating.toFixed(1), unit: 'rating' },
                  { label: '⚽ Top Scorer', entry: awards.topScorer ? { ...awards.topScorer, rating: 0, goals: awards.topScorer.goals, assists: 0, position: '', clubKitConfig: null, photoUrl: null } as AwardEntry : null, value: awards.topScorer ? String(awards.topScorer.goals) : null, unit: 'goals' },
                  { label: '🎯 Top Assist', entry: awards.topAssist ? { ...awards.topAssist, rating: 0, goals: 0, assists: awards.topAssist.assists, position: '', clubKitConfig: null, photoUrl: null } as AwardEntry : null, value: awards.topAssist ? String(awards.topAssist.assists) : null, unit: 'assists' },
                ].map(item => item.entry ? (
                  <div key={item.label} style={{ background: 'var(--bg-base)', borderRadius: 'var(--radius-sm)', padding: '10px 12px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' }}>
                    <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{item.label}</div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      {item.entry.photoUrl ? (
                        <img src={item.entry.photoUrl} alt="" style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--border)', flexShrink: 0 }} />
                      ) : (
                        <div style={{ width: 36, height: 36, borderRadius: '50%', background: getBadgeColor(item.entry.playerName), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 900, color: '#000', flexShrink: 0 }}>
                          {item.entry.playerName.split(' ').map(w => w[0]).slice(0, 2).join('')}
                        </div>
                      )}
                      <KitSvg config={item.entry.clubKitConfig as KitConfig | null} size={32} uid={`award-${item.label}-kit`} />
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)', lineHeight: 1.3 }}>{item.entry.playerName}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <ClubBadge name={item.entry.clubName} size={16} logoConfig={item.entry.clubLogoConfig} />
                      <span style={{ fontSize: 10, color: 'var(--text-2)' }}>{item.entry.clubName}</span>
                    </div>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 800, color: 'var(--gold)' }}>{item.value}</div>
                  </div>
                ) : null)}
              </div>
              {/* Team of the week — full pitch view */}
              {awards.teamOfTheWeek.length > 0 && (
                <>
                  <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>Team of the Week</div>
                  <TOTWPitch players={awards.teamOfTheWeek} />
                </>
              )}
            </div>
          </div>
        )}

        {/* Mini standings */}
        <div style={cardStyle}>
          <div className="card-header">
            <span className="accent-bar" />
            <span style={secLabel}>League Table</span>
          </div>
          <div style={cardBody}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {sorted.slice(0, 5).map((club, i) => {
              const isMe = club.id === myClub?.id
              const gd = club.goalsFor - club.goalsAgainst
              const posColor = i === 0 ? 'var(--gold)' : i < 4 ? 'var(--green)' : 'var(--text-2)'
              return (
                <Link key={club.id} to={`/league/${league.id}/club/${club.id}`} style={{ textDecoration: 'none', display: 'grid', gridTemplateColumns: '28px auto 1fr auto 36px',
                  alignItems: 'center', gap: 10, padding: '8px 10px',
                  background: isMe ? 'rgba(54,226,126,0.06)' : 'transparent',
                  borderRadius: 'var(--radius-sm)',
                  borderLeft: isMe ? '2px solid var(--green)' : '2px solid transparent',
                  transition: 'background 0.12s',
                }}
                  onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.background = isMe ? 'rgba(54,226,126,0.1)' : 'rgba(255,255,255,0.03)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.background = isMe ? 'rgba(54,226,126,0.06)' : 'transparent' }}
                >
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 800, color: posColor, textAlign: 'center' }}>{i + 1}</div>
                  <ClubBadge name={club.name} size={22} logoConfig={club.logoConfig} />
                  <div style={{ fontSize: 13, fontWeight: isMe ? 700 : 500, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{club.name}</div>
                  <div style={{ fontSize: 11, color: gd >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>{gd > 0 ? `+${gd}` : gd}</div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 800, color: isMe ? 'var(--green)' : 'var(--text-1)', textAlign: 'right' }}>{club.points}</div>
                </Link>
              )
            })}
          </div>
          {sorted.length > 5 && (
            <div style={{ fontSize: 11, color: 'var(--text-2)', textAlign: 'center', marginTop: 10 }}>+{sorted.length - 5} more clubs</div>
          )}
          </div>
        </div>
      </div>

      {/* Right column */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Budget */}
        {myClub && (
          <div style={cardStyle}>
            <div className="card-header">
              <span className="accent-bar-gold" />
              <span style={secLabel}>Budget</span>
            </div>
            <div style={cardBody}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 800, color: 'var(--green)', lineHeight: 1, marginBottom: 4 }}>
              €{(myClub.budget / 1_000).toFixed(1)}M
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-2)', marginBottom: 12 }}>Available funds</div>
            <div className="stat-bar-wrap">
              <div className="stat-bar-fill" style={{ width: `${Math.min(100, (myClub.budget / league.startingBudget) * 100)}%`, background: myClub.budget < league.startingBudget * 0.2 ? 'var(--red)' : 'var(--green)' }} />
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 5 }}>Started at €{(league.startingBudget / 1_000).toFixed(0)}M</div>
            {(() => {
              const wages = myClub.squad.reduce((s, p) => s + p.wage, 0)
              const mdRunway = wages > 0 ? Math.floor(myClub.budget / wages) : null
              const remaining = league.seasonLength - league.currentDay
              const isLow = mdRunway !== null && mdRunway < remaining
              const runwayColor = mdRunway === null ? 'var(--text-2)' : mdRunway < 5 ? 'var(--red)' : isLow ? 'var(--gold)' : 'var(--green)'
              const netSpend = league.startingBudget - myClub.budget
              const topEarners = [...myClub.squad].filter(p => p.wage > 0).sort((a, b) => b.wage - a.wage).slice(0, 5)
              return (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: 11, color: 'var(--text-2)' }}>
                      Wage bill: <span style={{ color: 'var(--text-1)', fontWeight: 600 }}>€{(wages / 1000).toFixed(1)}k/md</span>
                    </div>
                    <div style={{ fontSize: 11, color: netSpend >= 0 ? 'var(--red)' : 'var(--green)', fontWeight: 600 }}>
                      Net: {netSpend >= 0 ? '-' : '+'}€{(Math.abs(netSpend) / 1000).toFixed(0)}k
                    </div>
                  </div>
                  {mdRunway !== null && (
                    <div style={{ fontSize: 11, marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ color: 'var(--text-2)' }}>Funds last</span>
                      <span style={{ color: runwayColor, fontWeight: 700 }}>{mdRunway} matchday{mdRunway !== 1 ? 's' : ''}</span>
                      {isLow && <span style={{ fontSize: 10, background: 'rgba(232,128,106,0.15)', color: 'var(--red)', padding: '1px 6px', borderRadius: 4, fontWeight: 700 }}>LOW</span>}
                    </div>
                  )}
                  {topEarners.length > 0 && (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Top Earners</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {topEarners.map(p => (
                          <div key={p.id} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', alignItems: 'center', gap: 8 }}>
                            <span className={posClass(p.player.position)} style={{ fontSize: 9 }}>{p.player.position}</span>
                            <div style={{ fontSize: 12, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.player.name}</div>
                            <div style={{ fontSize: 11, color: 'var(--gold)', fontWeight: 700, whiteSpace: 'nowrap' }}>€{(p.wage / 1000).toFixed(1)}k</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })()}
            </div>
          </div>
        )}

        {/* Squad condition */}
        {myClub && squad.length > 0 && (
          <div style={cardStyle}>
            <div className="card-header">
              <span className="accent-bar" />
              <span style={secLabel}>Squad Condition</span>
            </div>
            <div style={cardBody}>
            <div style={{ display: 'flex', justifyContent: 'space-around', marginBottom: 20 }}>
              <CircleGauge value={avgFitness} label="Fitness" color={avgFitness >= 75 ? 'var(--green)' : avgFitness >= 55 ? 'var(--gold)' : 'var(--red)'} />
              <CircleGauge value={avgMorale}  label="Morale"  color={avgMorale  >= 75 ? 'var(--blue)'  : avgMorale  >= 55 ? 'var(--gold)' : 'var(--red)'} />
              <CircleGauge value={avgForm}    label="Form"    color={avgForm    >= 75 ? 'var(--green)' : avgForm    >= 55 ? 'var(--gold)' : 'var(--red)'} />
            </div>
            {/* Top players by overall with fitness bar */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[...squad]
                .sort((a, b) => b.player.overall - a.player.overall)
                .slice(0, 8)
                .map(p => (
                  <div key={p.id} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr 80px auto', alignItems: 'center', gap: 8 }}>
                    <span className={posClass(p.player.position)} style={{ fontSize: 9 }}>{p.player.position}</span>
                    <div style={{ fontSize: 12, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.player.name.split(' ').slice(-1)[0]}</div>
                    <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ width: `${p.fitness}%`, height: '100%', background: p.fitness >= 70 ? 'var(--green)' : p.fitness >= 50 ? 'var(--gold)' : 'var(--red)', borderRadius: 2 }} />
                    </div>
                    {p.injured && <span style={{ fontSize: 9, color: 'var(--red)', fontWeight: 700 }}>INJ</span>}
                    {!p.injured && <span style={{ fontSize: 11, color: 'var(--text-2)', width: 18, textAlign: 'right' }}>{p.fitness}</span>}
                  </div>
                ))
              }
            </div>
            </div>
          </div>
        )}

        {myClub && squad.length === 0 && (
          <div style={{ ...cardStyle, textAlign: 'center', padding: 28, color: 'var(--text-2)', fontSize: 12 }}>
            Your squad will appear here after the draft.
          </div>
        )}

        {/* Starting XI health */}
        {myClub && squad.length > 0 && (
          <div style={cardStyle}>
            <div className="card-header">
              <span className="accent-bar" />
              <span style={secLabel}>Starting XI</span>
            </div>
            <div style={cardBody}>
            {myClub.tactic?.lineup && myClub.tactic.lineup.length > 0 ? (() => {
              const instanceMap = Object.fromEntries(myClub.squad.map(p => [p.id, p]))
              const POS_ORDER_LOCAL = ['GK','CB','LB','RB','CDM','CM','CAM','LM','RM','LW','RW','CF','ST']
              const startingSlots = [...myClub.tactic.lineup].sort((a, b) => {
                const posA = POS_ORDER_LOCAL.indexOf(a.position)
                const posB = POS_ORDER_LOCAL.indexOf(b.position)
                return posA !== posB ? posA - posB : 0
              })
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {startingSlots.map((slot, i) => {
                    const p = instanceMap[slot.instanceId]
                    if (!p) return null
                    return (
                      <div key={i} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr 80px auto', alignItems: 'center', gap: 8 }}>
                        <span className={posClass(slot.position)} style={{ fontSize: 9 }}>{slot.position}</span>
                        <div style={{ fontSize: 12, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.player.name.split(' ').slice(-1)[0]}</div>
                        <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
                          <div style={{ width: `${p.fitness}%`, height: '100%', background: p.fitness >= 70 ? 'var(--green)' : p.fitness >= 50 ? 'var(--gold)' : 'var(--red)', borderRadius: 2 }} />
                        </div>
                        {p.injured
                          ? <span style={{ fontSize: 9, color: 'var(--red)', fontWeight: 700 }}>INJ</span>
                          : <span style={{ fontSize: 11, color: 'var(--text-2)', width: 18, textAlign: 'right' }}>{p.fitness}</span>
                        }
                      </div>
                    )
                  })}
                </div>
              )
            })() : (
              <div style={{ fontSize: 12, color: 'var(--text-2)', textAlign: 'center', padding: '10px 0' }}>Set your lineup in Tactics</div>
            )}
            </div>
          </div>
        )}

        {/* Sponsors */}
        {myClub && league.status === 'ACTIVE' && (
          <div style={cardStyle}>
            <div className="card-header">
              <span className="accent-bar" />
              <span style={secLabel}>Sponsors</span>
            </div>
            <div style={cardBody}>
              {/* Active deals */}
              {sponsorData && sponsorData.active.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Active Missions</div>
                  {sponsorData.active.map(deal => (
                    <div key={deal.id} style={{ background: 'rgba(54,226,126,0.07)', border: '1px solid rgba(54,226,126,0.25)', borderRadius: 8, padding: '10px 14px', marginBottom: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span style={{ fontSize: 18 }}>{deal.sponsorEmoji}</span>
                        <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-1)' }}>{deal.sponsorName}</span>
                        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--green)', fontWeight: 700 }}>+€{(deal.reward / 1000).toFixed(1)}k</span>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-2)' }}>{deal.mission}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>Matchday {deal.targetMatchday}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Available deals */}
              {sponsorData && sponsorData.active.length < 3 && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Available Deals</div>
                  {sponsorData.available.map((deal, i) => (
                    <div key={i} style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', marginBottom: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span style={{ fontSize: 18 }}>{deal.sponsorEmoji}</span>
                        <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-1)' }}>{deal.sponsorName}</span>
                        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-2)' }}>Cost: €{(deal.cost / 1000).toFixed(1)}k</span>
                        <span style={{ fontSize: 11, color: 'var(--green)', fontWeight: 700 }}>→ +€{(deal.reward / 1000).toFixed(1)}k</span>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 8 }}>{deal.mission}</div>
                      <button
                        className="btn btn-outline"
                        style={{ width: '100%', fontSize: 11 }}
                        disabled={signingDeal !== null || (myClub.budget < deal.cost)}
                        title={myClub.budget < deal.cost ? 'Insufficient budget' : undefined}
                        onClick={() => handleSignDeal(i)}
                      >
                        {signingDeal === i ? 'Signing...' : `Sign Deal · -€${(deal.cost / 1000).toFixed(1)}k`}
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {sponsorData && sponsorData.active.length >= 3 && (
                <div style={{ fontSize: 12, color: 'var(--text-2)', textAlign: 'center', padding: '8px 0' }}>Max 3 active deals. Complete missions to unlock more.</div>
              )}

              {!sponsorData && (
                <div style={{ fontSize: 12, color: 'var(--text-2)', textAlign: 'center', padding: '8px 0' }}>Loading...</div>
              )}

              {sponsorMsg && (
                <div style={{ fontSize: 12, marginTop: 8, textAlign: 'center', color: sponsorMsg.includes('signed') ? 'var(--green)' : 'var(--red)' }}>{sponsorMsg}</div>
              )}

              {/* History */}
              {sponsorData && sponsorData.history.length > 0 && (
                <div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Recent Results</div>
                  {sponsorData.history.slice(0, 4).map(deal => (
                    <div key={deal.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, fontSize: 12 }}>
                      <span>{deal.sponsorEmoji}</span>
                      <span style={{ color: 'var(--text-2)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{deal.sponsorName}</span>
                      <span style={{ fontWeight: 700, color: deal.status === 'COMPLETED' ? 'var(--green)' : 'var(--red)', flexShrink: 0 }}>
                        {deal.status === 'COMPLETED' ? `+€${(deal.reward / 1000).toFixed(1)}k` : 'Failed'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Physio */}
        {myClub && (
          <div style={cardStyle}>
            <div className="card-header">
              <span className="accent-bar" />
              <span style={secLabel}>Physio Facility</span>
            </div>
            <div style={cardBody}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 800, color: 'var(--text-1)' }}>Level {myClub.physioLevel} <span style={{ fontSize: 13, fontWeight: 400, color: myClub.physioLevel === 0 ? 'var(--text-3)' : myClub.physioLevel === 1 ? 'var(--gold)' : 'var(--green)' }}>{['None', 'Basic', 'Advanced'][myClub.physioLevel]}</span></div>
                  <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 4 }}>
                    {myClub.physioLevel === 0 && '1 day recovery/day · full heal cost'}
                    {myClub.physioLevel === 1 && '1 day recovery/day · 40% heal discount'}
                    {myClub.physioLevel >= 2 && '2 days recovery/day · 70% heal discount'}
                  </div>
                </div>
              </div>
              {myClub.physioLevel < 2 ? (
                <button
                  className="btn btn-outline"
                  style={{ width: '100%', fontSize: 12 }}
                  onClick={onPhysioUpgrade}
                  disabled={myClub.budget < [15_000, 30_000][myClub.physioLevel]}
                  title={myClub.budget < [15_000, 30_000][myClub.physioLevel] ? 'Insufficient budget' : undefined}
                >
                  Upgrade to Level {myClub.physioLevel + 1} · €{[15, 30][myClub.physioLevel]}k
                </button>
              ) : (
                <div style={{ fontSize: 11, color: 'var(--green)', textAlign: 'center', padding: '6px 0', fontWeight: 700 }}>Max level reached</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
