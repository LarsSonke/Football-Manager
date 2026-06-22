import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useNavigate, Link, useLocation } from 'react-router-dom'
import { io, type Socket } from 'socket.io-client'
import { effectiveRating, tacticFitScore } from '@football/shared'
import { useAuth } from '../stores/auth.store'
import { api } from '../api/client'
import { flagUrl } from '../utils/flagCodes'
import { ClubBadge, LogoMaker, type LogoConfig } from '../components/ClubBadge'

// ─── Types ────────────────────────────────────────────────────────────────────

interface PlayerData {
  id: string; name: string; nationality: string | null; position: string
  age: number; overall: number; potential: number
  pace: number; shooting: number; passing: number
  dribbling: number; defending: number; physical: number
  // Detailed sub-stats
  atkCrossing: number; atkFinishing: number; atkHeadAccuracy: number
  atkShortPassing: number; atkVolleys: number
  sklDribbling: number; sklCurve: number; sklFkAccuracy: number
  sklLongPassing: number; sklBallControl: number
  movAcceleration: number; movSprintSpeed: number; movAgility: number
  movReactions: number; movBalance: number
  powShotPower: number; powJumping: number; powStamina: number
  powStrength: number; powLongShots: number
  menAggression: number; menInterceptions: number; menPositioning: number
  menVision: number; menPenalties: number; menComposure: number
  defMarkingAware: number; defStandingTackle: number; defSlidingTackle: number
  gkDiving: number; gkHandling: number; gkKicking: number
  gkPositioning: number; gkReflexes: number; gkSpeed: number
  weakFoot: number; skillMoves: number; heightCm: number
  positions: string[]
  preferredRoles: string[]; baseValue: number
  photoUrl: string | null
}

interface SquadPlayer {
  id: string; playerId: string; player: PlayerData
  morale: number; form: number; fitness: number; injured: boolean; injuryDaysLeft: number
  trainedPosition: string | null; wage: number
}

interface LineupSlot { instanceId: string; position: string; role?: string }
interface SubSlot {
  outInstanceId: string
  inInstanceId: string
  condition: { type: 'minute' | 'fitness'; value: number }
}
interface TacticData {
  formation: string
  style: 'possession' | 'counter' | 'pressing' | 'lowblock'
  pressingIntensity: number
  defensiveLine: number
  width: number
  lineup: LineupSlot[]
  subs?: SubSlot[]
  customSlots?: { position: string; x: number; y: number }[]
}

type CustomSlot = { id: string; position: string; x: number; y: number }

interface ClubData {
  id: string; name: string; budget: number; isAI: boolean
  wins: number; draws: number; losses: number
  goalsFor: number; goalsAgainst: number; points: number
  physioLevel: number
  logoConfig: LogoConfig | null
  user: { id: string; username: string } | null
  squad: SquadPlayer[]
  tactic: TacticData | null
}

interface LeagueData {
  id: string; name: string; status: string
  currentDay: number; seasonLength: number; startingBudget: number
  maxClubs: number; matchTime: string; squadSize: number
  clubs: ClubData[]
  draftSession: { id: string; status: string; currentRound: number; roundsTotal: number; pickOrder: string[]; currentPick: number } | null
  history?: SeasonSnapshot[] | null
}

interface MatchData {
  id: string; matchday: number; status: string
  homeClubId: string; awayClubId: string
  homeScore: number | null; awayScore: number | null
  homeClub: { id: string; name: string }
  awayClub: { id: string; name: string }
}

interface SeasonSnapshot {
  endedOnDay: number
  clubs: Array<{
    id: string; name: string; isAI: boolean
    wins: number; draws: number; losses: number
    goalsFor: number; goalsAgainst: number; points: number
  }>
}

type Tab = 'overview' | 'squad' | 'fixtures' | 'standings' | 'stats' | 'tactics' | 'transfers' | 'manage'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function utcTimeToLocal(utcTime: string): string {
  const [hh, mm] = utcTime.split(':').map(Number)
  const now = new Date()
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hh, mm, 0))
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function getBadgeColor(name: string): string {
  const palette = ['#27cdff','#36e27e','#e9c46a','#e8806a','#f97316','#a78bfa','#34d399','#fbbf24']
  let h = 0
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  return palette[Math.abs(h) % palette.length]
}

// ─── Mobile hook ─────────────────────────────────────────────────────────────

function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(() => window.innerWidth < 768)
  useEffect(() => {
    const fn = () => setMobile(window.innerWidth < 768)
    window.addEventListener('resize', fn)
    return () => window.removeEventListener('resize', fn)
  }, [])
  return mobile
}

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function posClass(pos: string): string {
  if (pos === 'GK') return 'pos pos-gk'
  if (['CB','LB','RB'].includes(pos)) return 'pos pos-def'
  if (['CDM','CM','CAM','LM','RM'].includes(pos)) return 'pos pos-mid'
  return 'pos pos-att'
}

const POS_ORDER = ['GK','CB','LB','RB','CDM','CM','CAM','LM','RM','LW','RW','CF','ST']

function squadAvgOvr(club: ClubData): number | null {
  if (!club.squad?.length) return null
  const top = [...club.squad].sort((a, b) => b.player.overall - a.player.overall).slice(0, 11)
  return Math.round(top.reduce((s, p) => s + p.player.overall, 0) / top.length)
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

// ─── OvrBadge ────────────────────────────────────────────────────────────────

function OvrBadge({ value, label }: { value: number; label: string }) {
  const color = value >= 85 ? 'var(--gold)' : value >= 75 ? 'var(--green)' : value >= 65 ? 'var(--text-2)' : 'var(--text-3)'
  return (
    <div style={{ textAlign: 'center', lineHeight: 1 }}>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 800, color }}>{Math.round(value)}</div>
      <div style={{ fontSize: 10, color: 'var(--text-2)', marginTop: 3, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
    </div>
  )
}

// ─── StatBar (for squad cards) ────────────────────────────────────────────────

function StatBar({ label, value }: { label: string; value: number }) {
  const barColor = value >= 75 ? 'var(--green)' : value >= 50 ? 'var(--gold)' : 'var(--red)'
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
        <span style={{ color: 'var(--text-2)' }}>{label}</span>
        <span style={{ color: 'var(--text-1)', fontWeight: 600 }}>{value}</span>
      </div>
      <div className="stat-bar-wrap">
        <div className="stat-bar-fill" style={{ width: `${value}%`, background: barColor }} />
      </div>
    </div>
  )
}

// ─── Sponsor types ────────────────────────────────────────────────────────────

interface AvailableDeal {
  type: string; sponsorName: string; sponsorEmoji: string
  mission: string; params: object; cost: number; reward: number
}
interface ActiveDeal {
  id: string; sponsorName: string; sponsorEmoji: string
  mission: string; type: string; cost: number; reward: number
  status: string; targetMatchday: number
}

// ─── Overview ─────────────────────────────────────────────────────────────────

function Overview({ league, matches, myClub, onPhysioUpgrade, onRefresh }: { league: LeagueData; matches: MatchData[]; myClub: ClubData | undefined; onPhysioUpgrade: () => void; onRefresh: () => void }) {
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
                <div key={club.id} style={{
                  display: 'grid', gridTemplateColumns: '28px auto 1fr auto 36px',
                  alignItems: 'center', gap: 10, padding: '8px 10px',
                  background: isMe ? 'rgba(54,226,126,0.06)' : 'transparent',
                  borderRadius: 'var(--radius-sm)',
                  borderLeft: isMe ? '2px solid var(--green)' : '2px solid transparent',
                }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 800, color: posColor, textAlign: 'center' }}>{i + 1}</div>
                  <ClubBadge name={club.name} size={22} logoConfig={club.logoConfig} />
                  <div style={{ fontSize: 13, fontWeight: isMe ? 700 : 500, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{club.name}</div>
                  <div style={{ fontSize: 11, color: gd >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>{gd > 0 ? `+${gd}` : gd}</div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 800, color: isMe ? 'var(--green)' : 'var(--text-1)', textAlign: 'right' }}>{club.points}</div>
                </div>
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
              return (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-2)' }}>
                    Wages: <span style={{ color: 'var(--text-1)', fontWeight: 600 }}>€{(wages / 1000).toFixed(1)}k/md</span>
                  </div>
                  {mdRunway !== null && (
                    <div style={{ fontSize: 11, marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ color: 'var(--text-2)' }}>Funds last</span>
                      <span style={{ color: runwayColor, fontWeight: 700 }}>{mdRunway} matchday{mdRunway !== 1 ? 's' : ''}</span>
                      {isLow && <span style={{ fontSize: 10, background: 'rgba(232,128,106,0.15)', color: 'var(--red)', padding: '1px 6px', borderRadius: 4, fontWeight: 700 }}>LOW</span>}
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
              const startingSlots = [...myClub.tactic.lineup].sort((a, b) => {
                const posA = POS_ORDER.indexOf(a.position)
                const posB = POS_ORDER.indexOf(b.position)
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

// ─── Standings ────────────────────────────────────────────────────────────────

function Standings({ clubs, myClubId, prevPositions = {}, matches = [], history }: { clubs: ClubData[]; myClubId: string | undefined; prevPositions?: Record<string, number>; matches?: MatchData[]; history?: SeasonSnapshot[] | null }) {
  const isMobile = useIsMobile()
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
              <tr key={club.id} onClick={() => setSelectedClub(club)} style={{ borderBottom: '1px solid var(--border)', background: isMe ? 'rgba(54,226,126,0.05)' : 'transparent', borderLeft: isMe ? '3px solid var(--green)' : '3px solid transparent', cursor: 'pointer' }}
                onMouseEnter={e => { if (!isMe) (e.currentTarget as HTMLTableRowElement).style.background = 'rgba(255,255,255,0.03)' }}
                onMouseLeave={e => { if (!isMe) (e.currentTarget as HTMLTableRowElement).style.background = 'transparent' }}
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

// ─── Stats ────────────────────────────────────────────────────────────────────

interface StatEntry {
  instanceId: string
  playerName: string
  position: string
  clubId: string | null
  clubName: string
  clubLogoConfig: LogoConfig | null
  goals: number
  assists: number
  appearances: number
  avgRating: number
}

type StatCategory = 'goals' | 'assists' | 'rating' | 'appearances'

function Stats({ leagueId, status }: { leagueId: string; status: string }) {
  const [entries, setEntries] = useState<StatEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [cat, setCat] = useState<StatCategory>('goals')

  useEffect(() => {
    api.get(`/leagues/${leagueId}/stats`)
      .then(r => setEntries(r.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [leagueId])

  const categories: { key: StatCategory; label: string; icon: string }[] = [
    { key: 'goals',       label: 'Top Scorers',     icon: '⚽' },
    { key: 'assists',     label: 'Top Assists',      icon: '🎯' },
    { key: 'rating',      label: 'Best Rated',       icon: '⭐' },
    { key: 'appearances', label: 'Most Appearances', icon: '🎽' },
  ]

  const sorted = [...entries].sort((a, b) => {
    if (cat === 'goals')       return b.goals       - a.goals       || b.assists - a.assists
    if (cat === 'assists')     return b.assists      - a.assists     || b.goals   - a.goals
    if (cat === 'rating')      return b.avgRating    - a.avgRating   || b.appearances - a.appearances
    return b.appearances - a.appearances || b.goals - a.goals
  }).filter(e => {
    if (cat === 'rating') return e.appearances >= 3
    return true
  }).slice(0, 20)

  function statValue(e: StatEntry): string {
    if (cat === 'goals')       return String(e.goals)
    if (cat === 'assists')     return String(e.assists)
    if (cat === 'rating')      return e.avgRating.toFixed(1)
    return String(e.appearances)
  }

  function statLabel(): string {
    if (cat === 'goals')       return 'G'
    if (cat === 'assists')     return 'A'
    if (cat === 'rating')      return 'Avg'
    return 'Apps'
  }

  if (loading) return <div style={{ padding: '64px 0', textAlign: 'center', color: 'var(--text-2)' }}>Loading…</div>

  if (status === 'SETUP' || status === 'DRAFTING') return (
    <div style={{ textAlign: 'center', padding: '64px 0', color: 'var(--text-2)' }}>
      <div style={{ fontSize: 36, marginBottom: 10 }}>📊</div>
      <p style={{ fontWeight: 600, marginBottom: 6 }}>No stats yet</p>
      <p style={{ fontSize: 13, color: 'var(--text-3)' }}>Top scorers, ratings and assists will appear here after the first matchday.</p>
    </div>
  )

  return (
    <div style={{ maxWidth: 680 }}>

      {/* Category tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {categories.map(c => (
          <button
            key={c.key}
            onClick={() => setCat(c.key)}
            style={{
              padding: '8px 14px', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
              fontSize: 13, fontWeight: cat === c.key ? 700 : 500,
              background: cat === c.key ? 'rgba(54,226,126,0.12)' : 'var(--bg-card)',
              border: `1.5px solid ${cat === c.key ? 'var(--green)' : 'var(--border)'}`,
              color: cat === c.key ? 'var(--green)' : 'var(--text-2)',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <span>{c.icon}</span>{c.label}
          </button>
        ))}
      </div>

      {/* Table */}
      {entries.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-2)' }}>No match data yet.</div>
      ) : (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
          {/* Header */}
          <div style={{
            display: 'grid', gridTemplateColumns: '36px 1fr auto',
            padding: '10px 16px', borderBottom: '1px solid var(--border)',
            fontSize: 10, fontWeight: 800, color: 'var(--text-3)',
            textTransform: 'uppercase', letterSpacing: '0.1em',
          }}>
            <span>#</span>
            <span>Player</span>
            <span style={{ textAlign: 'right' }}>{statLabel()}{cat === 'rating' ? ' (min 3 apps)' : ''}</span>
          </div>

          {sorted.map((e, i) => {
            const isTop = i === 0
            return (
              <div
                key={e.instanceId}
                style={{
                  display: 'grid', gridTemplateColumns: '36px 1fr auto',
                  alignItems: 'center', padding: '10px 16px',
                  borderBottom: i < sorted.length - 1 ? '1px solid var(--border)' : 'none',
                  background: isTop ? 'rgba(54,226,126,0.04)' : 'transparent',
                }}
              >
                {/* Rank */}
                <div style={{
                  fontFamily: 'var(--font-display)', fontSize: isTop ? 18 : 14,
                  fontWeight: 800, color: isTop ? 'var(--gold)' : 'var(--text-3)',
                }}>
                  {isTop ? '1' : i + 1}
                </div>

                {/* Player info */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <ClubBadge name={e.clubName} size={28} logoConfig={e.clubLogoConfig} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: isTop ? 700 : 600, fontSize: 14, color: 'var(--text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {e.playerName}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                      <span className={posClass(e.position)} style={{ fontSize: 9 }}>{e.position}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.clubName}</span>
                    </div>
                  </div>
                </div>

                {/* Stat value */}
                <div style={{ textAlign: 'right' }}>
                  <div style={{
                    fontFamily: 'var(--font-display)', fontSize: isTop ? 24 : 18,
                    fontWeight: 800, color: isTop ? 'var(--green)' : 'var(--text-1)',
                  }}>
                    {statValue(e)}
                  </div>
                  {cat === 'goals' && e.assists > 0 && (
                    <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 600 }}>{e.assists} ast</div>
                  )}
                  {cat === 'assists' && e.goals > 0 && (
                    <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 600 }}>{e.goals} goals</div>
                  )}
                  {cat === 'rating' && (
                    <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 600 }}>{e.appearances} apps</div>
                  )}
                  {cat === 'appearances' && (
                    <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 600 }}>{e.goals}G {e.assists}A</div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Squad helpers ────────────────────────────────────────────────────────────

const ALL_POSITIONS = ['GK','CB','LB','RB','CDM','CM','CAM','LM','RM','LW','RW','CF','ST']

function posGroup(pos: string): number {
  if (pos === 'GK') return 0
  if (['CB','LB','RB'].includes(pos)) return 1
  if (['CDM','CM','CAM','LM','RM'].includes(pos)) return 2
  return 3
}

function calcTrainCost(from: string, to: string): number | null {
  const fg = posGroup(from), tg = posGroup(to)
  if (fg === 0 || tg === 0) return null
  if (fg === tg) return 3_000
  if (Math.abs(fg - tg) === 1) return 7_000
  return 12_000
}

function calcHealCost(daysLeft: number, physioLevel: number): number {
  const discount = physioLevel >= 2 ? 0.3 : physioLevel >= 1 ? 0.6 : 1.0
  return Math.round(daysLeft * 1_000 * discount)
}

// ─── Squad ────────────────────────────────────────────────────────────────────

function Squad({ squad, physioLevel, budget, onHeal, onTrain }: {
  squad: SquadPlayer[]
  physioLevel: number
  budget: number
  onHeal: (instanceId: string) => void
  onTrain: (instanceId: string, position: string) => void
}) {
  const [trainingFor, setTrainingFor] = useState<string | null>(null)
  const [detailPlayer, setDetailPlayer] = useState<SquadPlayer | null>(null)

  if (squad.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '64px 0', color: 'var(--text-2)' }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>👕</div>
        <p>No players drafted yet</p>
      </div>
    )
  }

  const sorted = [...squad].sort((a, b) => {
    const ai = POS_ORDER.indexOf(a.player.position)
    const bi = POS_ORDER.indexOf(b.player.position)
    return ai !== bi ? ai - bi : b.player.overall - a.player.overall
  })

  return (
    <>
    {detailPlayer && (
      <PlayerDetailModal
        player={detailPlayer}
        slotPos={detailPlayer.player.position}
        onClose={() => setDetailPlayer(null)}
      />
    )}
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
      {sorted.map(inst => {
        const effRating = effectiveRating(
          { overall: inst.player.overall, morale: inst.morale, form: inst.form, fitness: inst.fitness, injured: inst.injured },
          0.8,
        )
        const delta = Math.round(effRating - inst.player.overall)
        const cardBorderColor = inst.injured ? 'rgba(232,128,106,0.45)' : inst.player.overall >= 85 ? 'rgba(233,196,106,0.35)' : inst.player.overall >= 75 ? 'rgba(54,226,126,0.15)' : 'rgba(255,255,255,0.06)'
        const flagSrc = flagUrl(inst.player.nationality)
        const healCost = calcHealCost(inst.injuryDaysLeft, physioLevel)
        const isTraining = trainingFor === inst.id

        return (
          <div key={inst.id} style={{ background: 'linear-gradient(160deg, var(--bg-card-2) 0%, var(--bg-card) 100%)', border: `1px solid ${cardBorderColor}`, borderRadius: 'var(--radius)', padding: '14px 16px', position: 'relative', overflow: 'hidden' }}>
            {inst.player.overall >= 85 && !inst.injured && <div style={{ position: 'absolute', top: -20, right: -20, width: 80, height: 80, background: 'radial-gradient(circle, rgba(245,166,35,0.08) 0%, transparent 70%)', pointerEvents: 'none' }} />}

            <div
              role="button"
              tabIndex={0}
              onClick={() => setDetailPlayer(inst)}
              onKeyDown={e => e.key === 'Enter' && setDetailPlayer(inst)}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, cursor: 'pointer', borderRadius: 6 }}
              title="Click to view full stats"
            >
              <div style={{ display: 'flex', gap: 10, flex: 1, minWidth: 0 }}>
                <div style={{ width: 52, height: 60, borderRadius: 6, overflow: 'hidden', background: 'var(--bg-base)', flexShrink: 0 }}>
                  {inst.player.photoUrl
                    ? <img src={inst.player.photoUrl} alt="" referrerPolicy="no-referrer" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }} onError={e => { const el = e.currentTarget as HTMLImageElement; el.style.display = 'none'; const p = el.parentElement; if (p) p.setAttribute('data-failed', '1') }} />
                    : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)', fontSize: 24 }}>👤</div>
                  }
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 5, flexWrap: 'wrap' }}>
                    <span className={posClass(inst.player.position)}>{inst.player.position}</span>
                    {inst.trainedPosition && (
                      <span style={{ fontSize: 9, padding: '2px 5px', background: 'rgba(39,205,255,0.12)', color: 'var(--cyan)', borderRadius: 4, fontWeight: 700, border: '1px solid rgba(39,205,255,0.25)' }}>
                        +{inst.trainedPosition}
                      </span>
                    )}
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{inst.player.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 2 }}>{flagSrc && <img src={flagSrc} alt="" style={{ width: 16, height: 12, verticalAlign: 'middle', borderRadius: 1, marginRight: 3 }} />}{inst.player.nationality} · {inst.player.age}y</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, flexShrink: 0, marginLeft: 8 }}>
                <OvrBadge value={inst.player.overall} label="OVR" />
                <div style={{ width: 1, background: 'var(--border)' }} />
                <div style={{ textAlign: 'center', lineHeight: 1 }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 800, color: 'var(--text-3)', lineHeight: 1 }}>{inst.player.potential}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 3, fontWeight: 700 }}>POT</div>
                </div>
                <div style={{ width: 1, background: 'var(--border)' }} />
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 800, color: delta >= 0 ? 'var(--green)' : 'var(--red)', lineHeight: 1 }}>{Math.round(effRating)}</div>
                  <div style={{ fontSize: 10, color: delta >= 0 ? 'var(--green)' : 'var(--red)', marginTop: 3, fontWeight: 700 }}>{delta > 0 ? `+${delta}` : delta === 0 ? '±0' : delta} EFF</div>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
              <StatBar label="Morale"   value={inst.morale} />
              <StatBar label="Form"     value={inst.form} />
              <StatBar label="Fitness"  value={inst.fitness} />
            </div>

            {/* Injury row */}
            {inst.injured && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 10px', background: 'rgba(232,128,106,0.1)', border: '1px solid rgba(232,128,106,0.3)', borderRadius: 'var(--radius-xs)', marginBottom: 8 }}>
                <div>
                  <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--red)' }}>INJURED</span>
                  <span style={{ fontSize: 11, color: 'var(--text-2)', marginLeft: 6 }}>{inst.injuryDaysLeft} day{inst.injuryDaysLeft !== 1 ? 's' : ''} left</span>
                </div>
                <button
                  className="btn"
                  style={{ fontSize: 11, padding: '4px 10px', background: budget >= healCost ? 'var(--red)' : 'rgba(232,128,106,0.15)', color: '#fff', border: 'none', opacity: budget >= healCost ? 1 : 0.5 }}
                  disabled={budget < healCost}
                  onClick={() => onHeal(inst.id)}
                  title={`Heal for €${(healCost / 1000).toFixed(1)}k`}
                >
                  Heal €{(healCost / 1000).toFixed(1)}k
                </button>
              </div>
            )}

            {/* Train position */}
            {!isTraining ? (
              <button
                className="btn btn-ghost"
                style={{ width: '100%', fontSize: 11, padding: '5px 0' }}
                onClick={() => setTrainingFor(inst.id)}
              >
                {inst.trainedPosition ? `Retrain (${inst.trainedPosition})` : 'Train position'}
              </button>
            ) : (
              <div style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xs)', padding: 10 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Train to position</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                  {ALL_POSITIONS.filter(p => p !== inst.player.position).map(p => {
                    const cost = calcTrainCost(inst.player.position, p)
                    const canAfford = cost !== null && budget >= cost
                    return (
                      <button
                        key={p}
                        disabled={cost === null || !canAfford}
                        onClick={() => { onTrain(inst.id, p); setTrainingFor(null) }}
                        style={{
                          padding: '4px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700, cursor: cost !== null && canAfford ? 'pointer' : 'not-allowed',
                          background: inst.trainedPosition === p ? 'rgba(39,205,255,0.2)' : 'var(--bg-card)',
                          color: cost === null ? 'var(--text-3)' : !canAfford ? 'var(--text-3)' : inst.trainedPosition === p ? 'var(--cyan)' : 'var(--text-1)',
                          border: `1px solid ${inst.trainedPosition === p ? 'rgba(39,205,255,0.4)' : 'var(--border)'}`,
                          opacity: cost === null ? 0.4 : 1,
                        }}
                        title={cost === null ? 'GK restriction' : `€${(cost / 1000).toFixed(0)}k`}
                      >
                        {p}{cost !== null ? ` €${(cost / 1000).toFixed(0)}k` : ' —'}
                      </button>
                    )
                  })}
                </div>
                <button className="btn btn-ghost" style={{ width: '100%', fontSize: 11, padding: '4px 0' }} onClick={() => setTrainingFor(null)}>Cancel</button>
              </div>
            )}
          </div>
        )
      })}
    </div>
    </>
  )
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function Fixtures({ matches, clubs, myClubId, currentDay, leagueId }: { matches: MatchData[]; clubs: ClubData[]; myClubId: string | undefined; currentDay: number; leagueId: string }) {
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

function DraftSummaryOverlay({ league, onDismiss }: { league: LeagueData; onDismiss: () => void }) {
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

// ─── Season End Overlay ───────────────────────────────────────────────────────

function SeasonEndOverlay({ league, isCreator, startingNewSeason, onNewSeason, onDismiss }: {
  league: LeagueData
  isCreator: boolean
  startingNewSeason: boolean
  onNewSeason: () => void
  onDismiss: () => void
}) {
  // Sort clubs: points desc, then goal difference, then goals for
  const sorted = [...league.clubs].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points
    const gdA = a.goalsFor - a.goalsAgainst, gdB = b.goalsFor - b.goalsAgainst
    if (gdB !== gdA) return gdB - gdA
    return b.goalsFor - a.goalsFor
  })
  const champion = sorted[0]

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(0,0,0,0.88)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24,
    }}>
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius)', maxWidth: 560, width: '100%',
        maxHeight: '90vh', overflowY: 'auto',
        display: 'flex', flexDirection: 'column', gap: 0,
      }}>
        {/* Champion banner */}
        <div style={{ padding: '36px 32px 28px', textAlign: 'center', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🏆</div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--text-2)', marginBottom: 8 }}>
            Season Complete · {league.name}
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 900, color: 'var(--green)', lineHeight: 1.1, marginBottom: 4 }}>
            {champion?.name}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-2)' }}>
            {champion?.points} pts · {champion?.goalsFor} scored · {champion?.goalsAgainst} conceded
          </div>
        </div>

        {/* Final standings */}
        <div style={{ padding: '20px 32px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--text-2)', marginBottom: 12 }}>
            Final Standings
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {sorted.map((club, i) => {
              const gd = club.goalsFor - club.goalsAgainst
              const isChamp = i === 0
              return (
                <div key={club.id} style={{
                  display: 'grid', gridTemplateColumns: '28px 1fr 32px 32px 32px 32px 40px',
                  alignItems: 'center', gap: 6, padding: '7px 10px',
                  background: isChamp ? 'rgba(54,226,126,0.08)' : 'transparent',
                  border: `1px solid ${isChamp ? 'rgba(54,226,126,0.25)' : 'var(--border)'}`,
                  borderRadius: 'var(--radius-sm)',
                }}>
                  <span style={{ fontSize: 11, color: isChamp ? 'var(--green)' : 'var(--text-3)', fontWeight: 700, textAlign: 'center' }}>
                    {isChamp ? '🏆' : i + 1}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: isChamp ? 700 : 400 }}>{club.name}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-2)', textAlign: 'center' }}>{club.wins}W</span>
                  <span style={{ fontSize: 11, color: 'var(--text-2)', textAlign: 'center' }}>{club.draws}D</span>
                  <span style={{ fontSize: 11, color: 'var(--text-2)', textAlign: 'center' }}>{club.losses}L</span>
                  <span style={{ fontSize: 11, color: gd > 0 ? 'var(--green)' : gd < 0 ? 'var(--red)' : 'var(--text-2)', textAlign: 'center' }}>
                    {gd > 0 ? '+' : ''}{gd}
                  </span>
                  <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 14, color: isChamp ? 'var(--green)' : 'var(--text-1)', textAlign: 'right' }}>
                    {club.points}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Player development note */}
        {isCreator && (
          <div style={{ padding: '12px 32px', background: 'rgba(54,226,126,0.05)', borderTop: '1px solid var(--border)', fontSize: 12, color: 'var(--text-2)' }}>
            Starting a new season will age all players by 1 year — young players with high potential will grow, veterans may begin to decline.
          </div>
        )}

        {/* Actions */}
        {!isCreator && (
          <div style={{ padding: '10px 32px', background: 'rgba(39,205,255,0.06)', borderTop: '1px solid var(--border)', fontSize: 12, color: 'var(--cyan)', textAlign: 'center' }}>
            Waiting for the league creator to start the next season…
          </div>
        )}
        <div style={{ padding: '16px 32px 28px', display: 'flex', gap: 12, justifyContent: 'flex-end', borderTop: '1px solid var(--border)' }}>
          <button className="btn btn-ghost" onClick={onDismiss}>View Final Table</button>
          {isCreator && (
            <button className="btn btn-primary" onClick={onNewSeason} disabled={startingNewSeason}>
              {startingNewSeason ? 'Starting...' : 'Start New Season'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Transfers ────────────────────────────────────────────────────────────────

interface FreeAgent {
  id: string; playerId: string; player: PlayerData
  morale: number; form: number; fitness: number
  injured: boolean; injuryDaysLeft: number
  trainedPosition: string | null; wage: number
}

function Transfers({ leagueId, myClub, squadSize, onRefresh }: {
  leagueId: string
  myClub: ClubData
  squadSize: number
  onRefresh: () => void
}) {
  const [freeAgents, setFreeAgents] = useState<FreeAgent[]>([])
  const [loading, setLoading] = useState(true)
  const [posFilter, setPosFilter] = useState('ALL')
  const [search, setSearch] = useState('')
  const [actionId, setActionId] = useState<string | null>(null)
  const [msg, setMsg] = useState('')
  const [confirmRelease, setConfirmRelease] = useState<SquadPlayer | null>(null)
  const isMobile = useIsMobile()

  const load = useCallback(() => {
    setLoading(true)
    api.get(`/leagues/${leagueId}/free-agents`)
      .then(r => setFreeAgents(r.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [leagueId])

  useEffect(() => { load() }, [load])

  async function handlePickup(instanceId: string) {
    setActionId(instanceId)
    setMsg('')
    try {
      await api.post(`/leagues/${leagueId}/pickup`, { instanceId })
      setMsg('Player signed!')
      load()
      onRefresh()
    } catch (err: any) {
      setMsg(err.response?.data?.error ?? 'Failed to sign player')
    } finally { setActionId(null) }
  }

  async function handleRelease(instanceId: string) {
    setActionId(instanceId)
    setMsg('')
    setConfirmRelease(null)
    try {
      await api.post(`/leagues/${leagueId}/release`, { instanceId })
      setMsg('Player released.')
      onRefresh()
    } catch (err: any) {
      setMsg(err.response?.data?.error ?? 'Failed to release player')
    } finally { setActionId(null) }
  }

  const positions = ['ALL', 'GK', 'CB', 'LB', 'RB', 'CDM', 'CM', 'CAM', 'LM', 'RM', 'LW', 'RW', 'ST']
  const ovrColor = (v: number) => v >= 85 ? 'var(--gold)' : v >= 75 ? 'var(--green)' : v >= 65 ? 'var(--text-2)' : 'var(--text-3)'

  const filtered = freeAgents.filter(p =>
    (posFilter === 'ALL' || p.player.position === posFilter) &&
    (!search || p.player.name.toLowerCase().includes(search.toLowerCase()))
  )

  const squadFull = myClub.squad.length >= squadSize
  const squadTooSmall = myClub.squad.length <= 11

  function PlayerRow({ p, action }: { p: FreeAgent | SquadPlayer; action: React.ReactNode }) {
    const pl = p.player
    return (
      <div style={{
        display: 'grid', gridTemplateColumns: isMobile ? '28px 1fr 36px auto' : '28px 1fr 36px 36px 36px 36px auto',
        alignItems: 'center', gap: 8,
        padding: '9px 14px', borderBottom: '1px solid var(--border)',
      }}>
        {pl.photoUrl
          ? <img src={pl.photoUrl} alt="" style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }} />
          : <div style={{ width: 28, height: 28, borderRadius: '50%', background: getBadgeColor(pl.name), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 900, color: '#000' }}>
              {pl.name.split(' ').map((w: string) => w[0]).slice(0, 2).join('')}
            </div>
        }
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pl.name}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span className={posClass(pl.position)} style={{ fontSize: 9 }}>{pl.position}</span>
            <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Age {pl.age}</span>
            {p.injured && <span style={{ fontSize: 10, color: 'var(--red)', fontWeight: 700 }}>INJ</span>}
          </div>
        </div>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 800, color: ovrColor(pl.overall), textAlign: 'center' }}>{pl.overall}</span>
        {!isMobile && <>
          <span style={{ fontSize: 11, color: p.fitness >= 75 ? 'var(--green)' : p.fitness >= 50 ? 'var(--gold)' : 'var(--red)', textAlign: 'center' }}>{p.fitness}</span>
          <span style={{ fontSize: 11, color: p.morale >= 70 ? 'var(--green)' : p.morale >= 50 ? 'var(--gold)' : 'var(--red)', textAlign: 'center' }}>{p.morale}</span>
          <span style={{ fontSize: 11, color: p.form >= 70 ? 'var(--green)' : p.form >= 50 ? 'var(--gold)' : 'var(--red)', textAlign: 'center' }}>{p.form}</span>
        </>}
        {action}
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 20, alignItems: 'start' }}>

      {/* Free agents */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-1)' }}>Free Agents</div>
            <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{freeAgents.length} available</span>
            {squadFull && <span style={{ fontSize: 11, color: 'var(--red)', marginLeft: 'auto' }}>Squad full</span>}
          </div>
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by name…"
            style={{ width: '100%', padding: '6px 10px', background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-1)', fontSize: 12, marginBottom: 8 }}
          />
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {positions.map(p => (
              <button key={p} onClick={() => setPosFilter(p)} style={{
                padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 700,
                border: 'none', cursor: 'pointer',
                background: posFilter === p ? 'var(--green)' : 'rgba(255,255,255,0.07)',
                color: posFilter === p ? '#000' : 'var(--text-2)',
              }}>{p}</button>
            ))}
          </div>
        </div>
        {!isMobile && (
          <div style={{ display: 'grid', gridTemplateColumns: '28px 1fr 36px 36px 36px 36px auto', gap: 8, padding: '6px 14px', borderBottom: '1px solid var(--border)' }}>
            {['', 'Player', 'OVR', 'FIT', 'MOR', 'FRM', ''].map((h, i) => (
              <span key={i} style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.5, textAlign: i >= 2 ? 'center' : 'left' }}>{h}</span>
            ))}
          </div>
        )}
        {loading ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>No free agents match your filter.</div>
        ) : (
          filtered.map(p => (
            <PlayerRow key={p.id} p={p} action={
              <button
                onClick={() => handlePickup(p.id)}
                disabled={!!actionId || squadFull}
                style={{
                  padding: '4px 12px', borderRadius: 5, fontSize: 11, fontWeight: 700,
                  border: 'none', cursor: squadFull ? 'not-allowed' : 'pointer',
                  background: squadFull ? 'rgba(255,255,255,0.06)' : 'var(--green)',
                  color: squadFull ? 'var(--text-3)' : '#000',
                  opacity: actionId === p.id ? 0.5 : 1,
                  whiteSpace: 'nowrap',
                }}
              >{actionId === p.id ? '…' : 'Sign'}</button>
            } />
          ))
        )}
      </div>

      {/* Your squad — release panel */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-1)' }}>Your Squad</div>
          <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{myClub.squad.length}/{squadSize}</span>
          {squadTooSmall && <span style={{ fontSize: 11, color: 'var(--red)', marginLeft: 'auto' }}>Min 11 — can't release</span>}
        </div>
        {!isMobile && (
          <div style={{ display: 'grid', gridTemplateColumns: '28px 1fr 36px 36px 36px 36px auto', gap: 8, padding: '6px 14px', borderBottom: '1px solid var(--border)' }}>
            {['', 'Player', 'OVR', 'FIT', 'MOR', 'FRM', ''].map((h, i) => (
              <span key={i} style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.5, textAlign: i >= 2 ? 'center' : 'left' }}>{h}</span>
            ))}
          </div>
        )}
        {[...myClub.squad].sort((a, b) => b.player.overall - a.player.overall).map(p => (
          <PlayerRow key={p.id} p={p} action={
            <button
              onClick={() => setConfirmRelease(p)}
              disabled={!!actionId || squadTooSmall}
              style={{
                padding: '4px 10px', borderRadius: 5, fontSize: 11, fontWeight: 700,
                border: '1px solid var(--red)', cursor: squadTooSmall ? 'not-allowed' : 'pointer',
                background: 'transparent', color: squadTooSmall ? 'var(--text-3)' : 'var(--red)',
                opacity: actionId === p.id ? 0.5 : 1,
                whiteSpace: 'nowrap',
              }}
            >{actionId === p.id ? '…' : 'Release'}</button>
          } />
        ))}
      </div>

      {/* Feedback banner */}
      {msg && (
        <div style={{
          gridColumn: '1 / -1', padding: '10px 16px', borderRadius: 8,
          background: msg.includes('!') ? 'rgba(54,226,126,0.1)' : 'rgba(255,60,60,0.1)',
          border: `1px solid ${msg.includes('!') ? 'var(--green)' : 'var(--red)'}`,
          color: msg.includes('!') ? 'var(--green)' : 'var(--red)',
          fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          {msg}
          <button onClick={() => setMsg('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: 16 }}>×</button>
        </div>
      )}

      {/* Release confirmation dialog */}
      {confirmRelease && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '24px 28px', maxWidth: 360, width: '100%' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', marginBottom: 8 }}>Release {confirmRelease.player.name}?</div>
            <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 20, lineHeight: 1.6 }}>
              They will become a free agent and any other club in the league can sign them. This cannot be undone.
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setConfirmRelease(null)}>Cancel</button>
              <button
                onClick={() => handleRelease(confirmRelease.id)}
                style={{ padding: '7px 18px', borderRadius: 7, background: 'var(--red)', border: 'none', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}
              >Release</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Manage ───────────────────────────────────────────────────────────────────

function Manage({ league, onUpdate, onDelete }: { league: LeagueData; onUpdate: (data: Partial<LeagueData>) => void; onDelete: () => void }) {
  const canEdit = league.status === 'SETUP'
  const canDelete = league.status === 'SETUP' || league.status === 'DRAFTING'
  const [name, setName] = useState(league.name)
  const [budget, setBudget] = useState(String(league.startingBudget))
  const [maxClubs, setMaxClubs] = useState(String(league.maxClubs ?? 18))
  const [seasonLength, setSeasonLength] = useState(String(league.seasonLength))
  const [matchTime, setMatchTime] = useState(league.matchTime ?? '20:00')
  const [squadSize, setSquadSize] = useState(String(league.squadSize ?? 25))
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const [kickingId, setKickingId] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [formError, setFormError] = useState('')

  async function handleSave() {
    setFormError('')
    setSaving(true)
    try {
      const res = await api.patch(`/leagues/${league.id}`, { name: name.trim(), startingBudget: parseInt(budget), maxClubs: parseInt(maxClubs), seasonLength: parseInt(seasonLength), matchTime, squadSize: parseInt(squadSize) })
      onUpdate(res.data)
      setSaveMsg('Saved!')
      setTimeout(() => setSaveMsg(''), 2500)
    } catch (err: any) {
      setFormError(err.response?.data?.error ?? 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function handleKick(clubId: string) {
    setKickingId(clubId)
    try {
      await api.delete(`/leagues/${league.id}/clubs/${clubId}`)
      onUpdate({ clubs: league.clubs.filter(c => c.id !== clubId) } as any)
    } catch (err: any) {
      setFormError(err.response?.data?.error ?? 'Failed to remove club')
    } finally {
      setKickingId(null)
    }
  }

  async function handleDelete() {
    setDeleting(true)
    try {
      await api.delete(`/leagues/${league.id}`)
      onDelete()
    } catch (err: any) {
      setFormError(err.response?.data?.error ?? 'Failed to delete league')
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  const field: React.CSSProperties = { width: '100%', padding: '9px 12px', background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-1)', fontSize: 13 }
  const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 5, display: 'block' }

  return (
    <div style={{ maxWidth: 600 }}>
      {formError && <p className="error-text" style={{ marginBottom: 14 }}>{formError}</p>}

      <div className="card" style={{ marginBottom: 16, padding: 0 }}>
        <div className="card-header">
          <span className="accent-bar" />
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' }}>League Settings</span>
        </div>
        <div style={{ padding: 20 }}>
        {!canEdit && <div style={{ padding: '10px 14px', background: 'rgba(245,166,35,0.08)', border: '1px solid rgba(245,166,35,0.2)', borderRadius: 'var(--radius-sm)', marginBottom: 16, fontSize: 12, color: 'var(--gold)' }}>Settings are locked once the draft has started.</div>}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
          <div style={{ gridColumn: '1 / -1' }}><label style={lbl}>League Name</label><input style={field} value={name} onChange={e => setName(e.target.value)} disabled={!canEdit} /></div>
          <div><label style={lbl}>Starting Budget (€)</label><input style={field} type="number" value={budget} onChange={e => setBudget(e.target.value)} disabled={!canEdit} /></div>
          <div><label style={lbl}>Max Clubs</label><input style={field} type="number" min={2} max={18} value={maxClubs} onChange={e => setMaxClubs(e.target.value)} disabled={!canEdit} /></div>
          <div><label style={lbl}>Season Length</label><input style={field} type="number" min={10} max={40} value={seasonLength} onChange={e => setSeasonLength(e.target.value)} disabled={!canEdit} /></div>
          <div><label style={lbl}>Match Time (UTC)</label><input style={field} type="time" value={matchTime} onChange={e => setMatchTime(e.target.value)} disabled={!canEdit} /></div>
          <div><label style={lbl}>Squad Size (players per club)</label><input style={field} type="number" min={11} max={30} value={squadSize} onChange={e => setSquadSize(e.target.value)} disabled={!canEdit} /></div>
        </div>
        {canEdit && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button className="btn btn-green" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</button>
            {saveMsg && <span style={{ fontSize: 12, color: 'var(--green)' }}>✓ {saveMsg}</span>}
          </div>
        )}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16, padding: 0 }}>
        <div className="card-header">
          <span className="accent-bar" />
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Members ({league.clubs.filter(c => !c.isAI).length} / {league.maxClubs ?? 18})</span>
        </div>
        <div style={{ padding: 20 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {league.clubs.filter(c => !c.isAI).map((club, i) => (
            <div key={club.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'var(--bg-card-2)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
              <ClubBadge name={club.name} size={32} logoConfig={club.logoConfig} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-1)' }}>{club.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 2 }}>{club.user?.username}{i === 0 ? <span style={{ color: 'var(--gold)', fontWeight: 700, marginLeft: 6 }}>★ Creator</span> : null}</div>
              </div>
              {canEdit && i !== 0 && (
                <button className="btn btn-ghost" style={{ fontSize: 11, padding: '5px 10px', color: 'var(--red)', borderColor: 'rgba(232,128,106,0.3)' }} disabled={kickingId === club.id} onClick={() => handleKick(club.id)}>
                  {kickingId === club.id ? '...' : 'Kick'}
                </button>
              )}
            </div>
          ))}
        </div>
        </div>
      </div>

      {canDelete && (
        <div className="card" style={{ padding: 0, border: '1px solid rgba(232,128,106,0.25)', background: 'rgba(232,128,106,0.04)', overflow: 'hidden' }}>
          <div className="card-header" style={{ background: 'rgba(232,128,106,0.06)', borderRadius: '16px 16px 0 0', borderColor: 'rgba(232,128,106,0.15)' }}>
            <span className="accent-bar" style={{ background: 'var(--red)' }} />
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--red)' }}>Danger Zone</span>
          </div>
          <div style={{ padding: 20 }}>
          {!confirmDelete ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>Delete this league</div>
                <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 2 }}>Permanently removes all data. Cannot be undone.</div>
              </div>
              <button className="btn" style={{ background: 'rgba(232,128,106,0.15)', color: 'var(--red)', border: '1px solid rgba(232,128,106,0.4)', whiteSpace: 'nowrap', flexShrink: 0 }} onClick={() => setConfirmDelete(true)}>Delete League</button>
            </div>
          ) : (
            <div style={{ padding: 14, background: 'rgba(232,128,106,0.1)', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(232,128,106,0.3)' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--red)', marginBottom: 12 }}>Delete <strong>{league.name}</strong>? This cannot be undone.</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn" style={{ background: 'var(--red)', color: '#fff', border: 'none' }} onClick={handleDelete} disabled={deleting}>{deleting ? 'Deleting...' : 'Yes, Delete Forever'}</button>
                <button className="btn btn-ghost" onClick={() => setConfirmDelete(false)}>Cancel</button>
              </div>
            </div>
          )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Tactics ──────────────────────────────────────────────────────────────────

const FORMATION_SLOTS: Record<string, { position: string; x: number; y: number }[]> = {
  '4-4-2': [
    { position: 'GK', x: 50, y: 92 },
    { position: 'LB', x: 14, y: 73 }, { position: 'CB', x: 36, y: 77 }, { position: 'CB', x: 64, y: 77 }, { position: 'RB', x: 86, y: 73 },
    { position: 'LM', x: 14, y: 48 }, { position: 'CM', x: 38, y: 50 }, { position: 'CM', x: 62, y: 50 }, { position: 'RM', x: 86, y: 48 },
    { position: 'ST', x: 36, y: 23 }, { position: 'ST', x: 64, y: 23 },
  ],
  '4-3-3': [
    { position: 'GK', x: 50, y: 92 },
    { position: 'LB', x: 14, y: 73 }, { position: 'CB', x: 36, y: 77 }, { position: 'CB', x: 64, y: 77 }, { position: 'RB', x: 86, y: 73 },
    { position: 'CM', x: 25, y: 48 }, { position: 'CM', x: 50, y: 50 }, { position: 'CM', x: 75, y: 48 },
    { position: 'LW', x: 14, y: 24 }, { position: 'ST', x: 50, y: 18 }, { position: 'RW', x: 86, y: 24 },
  ],
  '4-3-3 (DM)': [
    { position: 'GK', x: 50, y: 92 },
    { position: 'LB', x: 14, y: 73 }, { position: 'CB', x: 36, y: 77 }, { position: 'CB', x: 64, y: 77 }, { position: 'RB', x: 86, y: 73 },
    { position: 'CDM', x: 50, y: 60 }, { position: 'CM', x: 28, y: 47 }, { position: 'CM', x: 72, y: 47 },
    { position: 'LW', x: 14, y: 24 }, { position: 'ST', x: 50, y: 18 }, { position: 'RW', x: 86, y: 24 },
  ],
  '4-2-3-1': [
    { position: 'GK', x: 50, y: 92 },
    { position: 'LB', x: 14, y: 73 }, { position: 'CB', x: 36, y: 77 }, { position: 'CB', x: 64, y: 77 }, { position: 'RB', x: 86, y: 73 },
    { position: 'CDM', x: 36, y: 56 }, { position: 'CDM', x: 64, y: 56 },
    { position: 'LW', x: 14, y: 35 }, { position: 'CAM', x: 50, y: 33 }, { position: 'RW', x: 86, y: 35 },
    { position: 'ST', x: 50, y: 16 },
  ],
  '4-1-4-1': [
    { position: 'GK', x: 50, y: 92 },
    { position: 'LB', x: 14, y: 73 }, { position: 'CB', x: 36, y: 77 }, { position: 'CB', x: 64, y: 77 }, { position: 'RB', x: 86, y: 73 },
    { position: 'CDM', x: 50, y: 58 },
    { position: 'LM', x: 14, y: 40 }, { position: 'CM', x: 36, y: 42 }, { position: 'CM', x: 64, y: 42 }, { position: 'RM', x: 86, y: 40 },
    { position: 'ST', x: 50, y: 18 },
  ],
  '4-3-2-1': [
    { position: 'GK', x: 50, y: 92 },
    { position: 'LB', x: 14, y: 73 }, { position: 'CB', x: 36, y: 77 }, { position: 'CB', x: 64, y: 77 }, { position: 'RB', x: 86, y: 73 },
    { position: 'CM', x: 25, y: 54 }, { position: 'CDM', x: 50, y: 58 }, { position: 'CM', x: 75, y: 54 },
    { position: 'CAM', x: 33, y: 38 }, { position: 'CAM', x: 67, y: 38 },
    { position: 'ST', x: 50, y: 18 },
  ],
  '4-2-4': [
    { position: 'GK', x: 50, y: 92 },
    { position: 'LB', x: 14, y: 73 }, { position: 'CB', x: 36, y: 77 }, { position: 'CB', x: 64, y: 77 }, { position: 'RB', x: 86, y: 73 },
    { position: 'CDM', x: 36, y: 58 }, { position: 'CDM', x: 64, y: 58 },
    { position: 'LW', x: 12, y: 24 }, { position: 'ST', x: 38, y: 20 }, { position: 'ST', x: 62, y: 20 }, { position: 'RW', x: 88, y: 24 },
  ],
  '3-5-2': [
    { position: 'GK', x: 50, y: 92 },
    { position: 'CB', x: 24, y: 76 }, { position: 'CB', x: 50, y: 79 }, { position: 'CB', x: 76, y: 76 },
    { position: 'LM', x: 10, y: 50 }, { position: 'CM', x: 32, y: 50 }, { position: 'CDM', x: 50, y: 53 }, { position: 'CM', x: 68, y: 50 }, { position: 'RM', x: 90, y: 50 },
    { position: 'ST', x: 36, y: 23 }, { position: 'ST', x: 64, y: 23 },
  ],
  '3-4-3': [
    { position: 'GK', x: 50, y: 92 },
    { position: 'CB', x: 25, y: 78 }, { position: 'CB', x: 50, y: 80 }, { position: 'CB', x: 75, y: 78 },
    { position: 'LM', x: 12, y: 50 }, { position: 'CM', x: 38, y: 50 }, { position: 'CM', x: 62, y: 50 }, { position: 'RM', x: 88, y: 50 },
    { position: 'LW', x: 18, y: 24 }, { position: 'ST', x: 50, y: 18 }, { position: 'RW', x: 82, y: 24 },
  ],
  '5-3-2': [
    { position: 'GK', x: 50, y: 92 },
    { position: 'LB', x: 10, y: 70 }, { position: 'CB', x: 28, y: 76 }, { position: 'CB', x: 50, y: 79 }, { position: 'CB', x: 72, y: 76 }, { position: 'RB', x: 90, y: 70 },
    { position: 'CM', x: 25, y: 45 }, { position: 'CM', x: 50, y: 48 }, { position: 'CM', x: 75, y: 45 },
    { position: 'ST', x: 36, y: 22 }, { position: 'ST', x: 64, y: 22 },
  ],
  '5-4-1': [
    { position: 'GK', x: 50, y: 92 },
    { position: 'LB', x: 10, y: 70 }, { position: 'CB', x: 27, y: 76 }, { position: 'CB', x: 50, y: 79 }, { position: 'CB', x: 73, y: 76 }, { position: 'RB', x: 90, y: 70 },
    { position: 'LM', x: 14, y: 48 }, { position: 'CM', x: 38, y: 50 }, { position: 'CM', x: 62, y: 50 }, { position: 'RM', x: 86, y: 48 },
    { position: 'ST', x: 50, y: 18 },
  ],
}

const FORMATION_DESC: Record<string, string> = {
  '4-4-2':     'Balanced classic — strong in midfield width and dual strikers',
  '4-3-3':     'Possession-based three-man midfield with wide attackers pressing high',
  '4-3-3 (DM)':'Deep-lying playmaker shields defense while CMs push forward to feed wings',
  '4-2-3-1':   'Double pivot shields a creative CAM, ideal for controlling tempo',
  '4-1-4-1':   'Holding midfielder anchors a compact midfield rectangle',
  '4-3-2-1':   'Christmas tree — narrow and layered with two shadow strikers behind the target',
  '4-2-4':     'Ultra-attacking double pivot feeding four forwards — high risk, high reward',
  '3-5-2':     'Wingback-driven system with central midfield overload and direct strikers',
  '3-4-3':     'Aggressive three-back with wide midfielders stretching play and wing trio pressing high',
  '5-3-2':     'Wingbacks provide width while three central mids control the tempo',
  '5-4-1':     'Defensive fortress — five-man backline absorbs pressure, counter on transitions',
}

const STYLE_LABELS: Record<string, string> = {
  possession: 'Possession',
  counter:    'Counter',
  pressing:   'Pressing',
  lowblock:   'Low Block',
}
const STYLE_DESC: Record<string, string> = {
  possession: 'Short passing, hold the ball, dominate territory and wait for gaps.',
  counter:    'Sit deep, win the ball, and exploit space behind their defence at pace.',
  pressing:   'Aggressive press high up the pitch to force turnovers in dangerous areas.',
  lowblock:   'Compact 10-man block absorbs waves of pressure, hits hard on transitions.',
}
const STYLE_TRAITS: Record<string, { bonuses: string[]; cost: string }> = {
  possession: { bonuses: ['Midfield control +8%',  'Attack +2%',         'Ball retention'], cost: 'Exposed to fast counter attacks' },
  counter:    { bonuses: ['Attack +6%',             'Low stamina drain',  'Fast transitions'], cost: 'Midfield control −8%' },
  pressing:   { bonuses: ['Press strength +18%',    'Defense +3%',       'High turnover rate'], cost: 'Stamina drain +22% — very tiring' },
  lowblock:   { bonuses: ['Defense +10%',           'Stamina drain −22%','Hard to break down'], cost: 'Press −35%, limited buildup' },
}

// Positions that may only appear once in a formation
const UNIQUE_POSITIONS = new Set(['GK', 'LB', 'RB', 'LM', 'RM', 'LW', 'RW'])

// These pairs must both be present or both absent
const FLANK_PAIRS: [string, string][] = [['LB', 'RB'], ['LM', 'RM'], ['LW', 'RW']]

// Mirror partner for each flank position
const MIRROR_POSITION: Record<string, string> = { LB:'RB', RB:'LB', LM:'RM', RM:'LM', LW:'RW', RW:'LW' }

// Positions that count as defenders (min 3, max 5)
const DEFENDER_POSITIONS = new Set(['CB', 'LB', 'RB'])

// Positions that make tactical sense as alternatives for each role
const RELATABLE_POSITIONS: Record<string, string[]> = {
  GK:  ['GK'],
  CB:  ['CB', 'CDM', 'LB', 'RB'],
  LB:  ['LB', 'CB', 'LM'],
  RB:  ['RB', 'CB', 'RM'],
  CDM: ['CDM', 'CM', 'CB'],
  CM:  ['CM', 'CDM', 'CAM', 'LM', 'RM'],
  CAM: ['CAM', 'CM', 'LW', 'RW', 'ST'],
  LM:  ['LM', 'LB', 'CM', 'LW'],
  RM:  ['RM', 'RB', 'CM', 'RW'],
  LW:  ['LW', 'LM', 'CAM', 'ST'],
  RW:  ['RW', 'RM', 'CAM', 'ST'],
  ST:  ['ST', 'LW', 'RW', 'CAM'],
}

function autoDetectPosition(x: number, y: number): string {
  const left  = x < 28
  const right = x > 72
  if (y >= 83) return 'GK'
  if (y >= 65) return left ? 'LB'  : right ? 'RB'  : 'CB'
  if (y >= 50) return left ? 'LM'  : right ? 'RM'  : 'CDM'
  if (y >= 35) return left ? 'LM'  : right ? 'RM'  : 'CM'
  if (y >= 22) return left ? 'LW'  : right ? 'RW'  : 'CAM'
  return               left ? 'LW'  : right ? 'RW'  : 'ST'
}

// Returns auto-detected position, falling back when a unique slot is taken or defender cap is hit
function resolvePosition(x: number, y: number, slots: { position: string }[], excludeIdx = -1): string {
  const others   = slots.filter((_, i) => i !== excludeIdx)
  const usedUnique = new Set(others.filter(s => UNIQUE_POSITIONS.has(s.position)).map(s => s.position))
  const defCount   = others.filter(s => DEFENDER_POSITIONS.has(s.position)).length

  function isAvailable(pos: string): boolean {
    if (UNIQUE_POSITIONS.has(pos) && usedUnique.has(pos)) return false
    if (DEFENDER_POSITIONS.has(pos) && defCount >= 5) return false
    return true
  }

  const primary = autoDetectPosition(x, y)
  if (isAvailable(primary)) return primary

  for (const alt of RELATABLE_POSITIONS[primary] ?? []) {
    if (alt !== primary && isAvailable(alt)) return alt
  }

  // Generic zone fallback, avoiding defenders if cap is hit
  if (defCount >= 5) return y >= 50 ? 'CDM' : y >= 35 ? 'CM' : 'ST'
  return y >= 65 ? 'CB' : y >= 35 ? 'CM' : 'ST'
}

function autoAssign(
  formation: string,
  squad: SquadPlayer[],
): LineupSlot[] {
  const slots = FORMATION_SLOTS[formation]
  if (!slots) return []
  const healthy = [...squad.filter(p => !p.injured)].sort(
    (a, b) => b.player.overall - a.player.overall,
  )
  const used = new Set<string>()
  const lineup: (string | null)[] = new Array(slots.length).fill(null)

  // Pass 1: exact position match
  for (let i = 0; i < slots.length; i++) {
    const match = healthy.find(p => !used.has(p.id) && p.player.position === slots[i].position)
    if (match) { lineup[i] = match.id; used.add(match.id) }
  }
  // Pass 2: adjacent position (fit ≥ 0.7)
  for (let i = 0; i < slots.length; i++) {
    if (lineup[i]) continue
    const match = healthy.find(p => !used.has(p.id) && tacticFitScore(p.player.position, slots[i].position) >= 0.7)
    if (match) { lineup[i] = match.id; used.add(match.id) }
  }
  // Pass 3: fill remaining with best available
  for (let i = 0; i < slots.length; i++) {
    if (lineup[i]) continue
    const match = healthy.find(p => !used.has(p.id))
    if (match) { lineup[i] = match.id; used.add(match.id) }
  }

  return lineup.map((instanceId, i) => ({
    instanceId: instanceId ?? '',
    position: slots[i].position,
  }))
}

// ─── Tactic stage definitions ─────────────────────────────────────────────────

const PRESSING_STAGES = [
  { label: 'Off',    value: 15, desc: 'Sit back and hold shape — save energy for attack' },
  { label: 'Low',   value: 35, desc: 'Light press only when opponents make mistakes' },
  { label: 'Medium',value: 55, desc: 'Balanced press when out of possession' },
  { label: 'High',  value: 75, desc: 'Aggressive press to win the ball high up the pitch' },
  { label: 'Max',   value: 95, desc: 'Full-court press — very high intensity, very tiring' },
]
const DEFLINE_STAGES = [
  { label: 'Very Deep', value: 10, desc: 'Deep block — protects space in behind, invites pressure' },
  { label: 'Deep',      value: 35, desc: 'Solid defensive shape, comfortable with a low block' },
  { label: 'Standard',  value: 55, desc: 'Balanced line — reasonable cover, reasonable compactness' },
  { label: 'High',      value: 75, desc: 'Push up to compress midfield and spring the offside trap' },
  { label: 'Max',       value: 92, desc: 'Extreme high line — maximises offside trap, very risky' },
]
const WIDTH_STAGES = [
  { label: 'Very Narrow', value: 10, desc: 'Overload the middle channels — cuts off wide areas' },
  { label: 'Narrow',      value: 30, desc: 'Central focus with cover wide' },
  { label: 'Normal',      value: 55, desc: 'Balanced width — reasonable crossing and central play' },
  { label: 'Wide',        value: 75, desc: 'Stretch opposition defence with wide runs and crosses' },
  { label: 'Very Wide',   value: 95, desc: 'Maximum width — byline crosses, central gaps open' },
]

// Impact values per setting level (1–5 scale for visual pips)
const PRESSING_IMPACTS: Record<number, { recovery: number; stamina: number }> = {
  15: { recovery: 1, stamina: 1 },
  35: { recovery: 2, stamina: 2 },
  55: { recovery: 3, stamina: 3 },
  75: { recovery: 4, stamina: 4 },
  95: { recovery: 5, stamina: 5 },
}
const DEFLINE_IMPACTS: Record<number, { compact: number; counterRisk: number }> = {
  10: { compact: 1, counterRisk: 1 },
  35: { compact: 2, counterRisk: 2 },
  55: { compact: 3, counterRisk: 3 },
  75: { compact: 4, counterRisk: 4 },
  92: { compact: 5, counterRisk: 5 },
}
const WIDTH_IMPACTS: Record<number, { wing: number; central: number }> = {
  10: { wing: 1, central: 5 },
  30: { wing: 2, central: 4 },
  55: { wing: 3, central: 3 },
  75: { wing: 4, central: 2 },
  95: { wing: 5, central: 1 },
}

function PipBar({ value, color = 'var(--green)' }: { value: number; color?: string }) {
  return (
    <div style={{ display: 'flex', gap: 3 }}>
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: i < value ? color : 'rgba(255,255,255,0.1)', flexShrink: 0 }} />
      ))}
    </div>
  )
}

function snapToStage(value: number, stages: { value: number }[]): number {
  return stages.reduce((a, b) => Math.abs(b.value - value) < Math.abs(a.value - value) ? b : a).value
}

function calcLineupRating(lineup: LineupSlot[], instanceMap: Record<string, SquadPlayer>): number | null {
  const filled = lineup.filter(s => s.instanceId && instanceMap[s.instanceId])
  if (!filled.length) return null
  const sum = filled.reduce((acc, slot) => {
    const sq = instanceMap[slot.instanceId]!
    const fit = tacticFitScore(sq.player.position, slot.position, sq.trainedPosition ?? undefined)
    return acc + sq.player.overall * Math.max(0, fit)
  }, 0)
  return Math.round(sum / filled.length)
}

const ROLE_DESCRIPTIONS: Record<string, string> = {
  'shot-stopper':       'Command the box, dominate aerial balls, block shots',
  'sweeper-keeper':     'Actively sweep outside the box to cut out through balls',
  'stopper':            'Aggressive, win the ball first in defensive duels',
  'ball-playing-cb':    'Initiate build-up from the back with precise passing',
  'attacking-fullback': 'Overlap frequently, support wide attacks',
  'fullback':           'Disciplined defensively, provide solid cover',
  'holding':            'Sit deep, screen the defense, simple distribution',
  'defensive-mid':      'Break up play, win back possession quickly',
  'box-to-box':         'High energy, contribute both offensively and defensively',
  'deep-lying':         'Orchestrate from deep with precise long passes',
  'playmaker':          'Create chances with key passes and incisive vision',
  'shadow-striker':     'Arrive late into the box, score from second positions',
  'winger':             'Hug the touchline, cross and set up wide attacks',
  'inside-forward':     'Cut inside and shoot from wide positions',
  'false-9':            'Drop deep to link play, pull defenders out of position',
  'complete':           'Versatile all-round player, contributes to all aspects',
  'target-forward':     'Hold up the ball, win aerials, bring others into play',
}

function Stars({ value, max = 5 }: { value: number; max?: number }) {
  return (
    <span style={{ color: 'var(--gold)', letterSpacing: 1, fontSize: 13 }}>
      {'★'.repeat(Math.max(0, Math.min(max, value)))}
      <span style={{ color: 'rgba(255,255,255,0.15)' }}>{'★'.repeat(Math.max(0, max - Math.min(max, value)))}</span>
    </span>
  )
}

function ModalStatBar({ label, value }: { label: string; value: number }) {
  const pct = Math.min(100, Math.max(0, value))
  const color = pct >= 80 ? 'var(--green)' : pct >= 65 ? 'var(--gold)' : pct >= 45 ? 'var(--text-2)' : 'var(--red)'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
      <span style={{ fontSize: 10, color: 'var(--text-2)', width: 110, textAlign: 'right', flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, height: 5, background: 'rgba(255,255,255,0.07)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.3s' }} />
      </div>
      <span style={{ fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 800, color, width: 24, textAlign: 'right', flexShrink: 0 }}>{value}</span>
    </div>
  )
}

function PlayerDetailModal({
  player, slotPos, slotIndex, lineup,
  onClose, onRoleChange,
}: {
  player: SquadPlayer
  slotPos: string
  slotIndex?: number | null
  lineup?: LineupSlot[]
  onClose: () => void
  onRoleChange?: (slotIndex: number, role: string) => void
}) {
  const isMobile = useIsMobile()
  const hasSlot = slotIndex != null && lineup != null
  const [tab, setTab] = useState<'stats' | 'roles'>('stats')
  const p = player.player
  const currentRole = hasSlot ? (lineup![slotIndex!]?.role ?? '') : ''
  const mainStats = [
    { label: 'Pace', value: p.pace },
    { label: 'Shooting', value: p.shooting },
    { label: 'Passing', value: p.passing },
    { label: 'Dribbling', value: p.dribbling },
    { label: 'Defending', value: p.defending },
    { label: 'Physical', value: p.physical },
  ]
  const subStatGroups = [
    { title: 'Attacking', stats: [
      { label: 'Crossing', value: p.atkCrossing },
      { label: 'Finishing', value: p.atkFinishing },
      { label: 'Heading', value: p.atkHeadAccuracy },
      { label: 'Short Passing', value: p.atkShortPassing },
      { label: 'Volleys', value: p.atkVolleys },
    ]},
    { title: 'Skill', stats: [
      { label: 'Dribbling', value: p.sklDribbling },
      { label: 'Curve', value: p.sklCurve },
      { label: 'FK Accuracy', value: p.sklFkAccuracy },
      { label: 'Long Passing', value: p.sklLongPassing },
      { label: 'Ball Control', value: p.sklBallControl },
    ]},
    { title: 'Movement', stats: [
      { label: 'Acceleration', value: p.movAcceleration },
      { label: 'Sprint Speed', value: p.movSprintSpeed },
      { label: 'Agility', value: p.movAgility },
      { label: 'Reactions', value: p.movReactions },
      { label: 'Balance', value: p.movBalance },
    ]},
    { title: 'Power', stats: [
      { label: 'Shot Power', value: p.powShotPower },
      { label: 'Jumping', value: p.powJumping },
      { label: 'Stamina', value: p.powStamina },
      { label: 'Strength', value: p.powStrength },
      { label: 'Long Shots', value: p.powLongShots },
    ]},
    { title: 'Mentality', stats: [
      { label: 'Aggression', value: p.menAggression },
      { label: 'Interceptions', value: p.menInterceptions },
      { label: 'Positioning', value: p.menPositioning },
      { label: 'Vision', value: p.menVision },
      { label: 'Penalties', value: p.menPenalties },
      { label: 'Composure', value: p.menComposure },
    ]},
    { title: 'Defending', stats: [
      { label: 'Marking', value: p.defMarkingAware },
      { label: 'Stand. Tackle', value: p.defStandingTackle },
      { label: 'Slid. Tackle', value: p.defSlidingTackle },
    ]},
    ...(p.position === 'GK' ? [{ title: 'Goalkeeping', stats: [
      { label: 'Diving', value: p.gkDiving },
      { label: 'Handling', value: p.gkHandling },
      { label: 'Kicking', value: p.gkKicking },
      { label: 'Positioning', value: p.gkPositioning },
      { label: 'Reflexes', value: p.gkReflexes },
      { label: 'Speed', value: p.gkSpeed },
    ]}] : []),
  ]

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1000, display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center', padding: isMobile ? 0 : 16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: isMobile ? 0 : 'var(--radius)', width: '100%', maxWidth: isMobile ? '100%' : 680, height: isMobile ? '100%' : '82vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 16 }}>
          {p.photoUrl ? (
            <img src={p.photoUrl} alt={p.name} style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--border)' }} />
          ) : (
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: getBadgeColor(p.name), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 900, color: '#000', flexShrink: 0 }}>
              {p.name.split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('')}
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-1)' }}>{p.name}</span>
              {p.nationality && <span style={{ fontSize: 16 }} title={p.nationality}>{flagUrl(p.nationality) ? '' : ''}</span>}
              <span className={posClass(slotPos)} style={{ fontSize: 10 }}>{slotPos}</span>
            </div>
            <div style={{ display: 'flex', gap: 16, marginTop: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: 'var(--text-2)' }}>Age {p.age}</span>
              {p.heightCm > 0 && <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{p.heightCm} cm</span>}
              {p.nationality && <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{p.nationality}</span>}
            </div>
            <div style={{ display: 'flex', gap: 20, marginTop: 8 }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 900, color: 'var(--text-1)' }}>{p.overall}</div>
                <div style={{ fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.5 }}>OVR</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 900, color: 'var(--green)' }}>{p.potential}</div>
                <div style={{ fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.5 }}>POT</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <Stars value={p.skillMoves} />
                <div style={{ fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 }}>Skill</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <Stars value={p.weakFoot} />
                <div style={{ fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 }}>Weak Foot</div>
              </div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-2)', fontSize: 20, padding: 4, lineHeight: 1, flexShrink: 0 }}>✕</button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', padding: '0 20px' }}>
          {(['stats', ...(hasSlot ? ['roles'] : [])] as ('stats' | 'roles')[]).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: '10px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
              background: 'none', border: 'none', borderBottom: `2px solid ${tab === t ? 'var(--green)' : 'transparent'}`,
              color: tab === t ? 'var(--green)' : 'var(--text-2)', textTransform: 'capitalize',
              transition: 'all 0.15s', marginBottom: -1,
            }}>{t === 'stats' ? 'Stats' : 'Player Roles'}</button>
          ))}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
          {tab === 'stats' && (
            <>
              {/* Main stat bars */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>Main Stats</div>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '0 24px' }}>
                  {mainStats.map(s => <ModalStatBar key={s.label} label={s.label} value={s.value} />)}
                </div>
              </div>
              {/* Sub-stat groups */}
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '0 24px' }}>
                {subStatGroups.map(group => (
                  <div key={group.title} style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>{group.title}</div>
                    {group.stats.map(s => <ModalStatBar key={s.label} label={s.label} value={s.value} />)}
                  </div>
                ))}
              </div>
            </>
          )}

          {tab === 'roles' && (
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 16, lineHeight: 1.6 }}>
                Select a role for <strong style={{ color: 'var(--text-1)' }}>{p.name}</strong> in the <strong style={{ color: 'var(--text-1)' }}>{slotPos}</strong> position. The role shapes how they behave during matches.
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {p.preferredRoles.map(role => {
                  const active = currentRole === role
                  return (
                    <button key={role} onClick={() => onRoleChange?.(slotIndex!, role)} style={{
                      display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 14px',
                      background: active ? 'rgba(54,226,126,0.08)' : 'var(--bg-base)',
                      border: `1.5px solid ${active ? 'var(--green)' : 'var(--border)'}`,
                      borderRadius: 8, cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s',
                    }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: active ? 'var(--green)' : 'var(--border)', marginTop: 4, flexShrink: 0, transition: 'background 0.15s' }} />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: active ? 'var(--green)' : 'var(--text-1)', textTransform: 'capitalize', marginBottom: 3 }}>
                          {role.replace(/-/g, ' ')}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-2)', lineHeight: 1.5 }}>
                          {ROLE_DESCRIPTIONS[role] ?? 'Standard role for this position'}
                        </div>
                      </div>
                    </button>
                  )
                })}
                {p.preferredRoles.length === 0 && (
                  <div style={{ fontSize: 12, color: 'var(--text-2)', padding: 16, textAlign: 'center' }}>No preferred roles defined for this player.</div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

type TacticStyle = 'possession' | 'counter' | 'pressing' | 'lowblock'

interface TacticPreset {
  name: string
  tactic: { formation: string; style: string; pressing: number; defLine: number; width: number; lineup: LineupSlot[] }
}

function Tactics({ leagueId, myClub, onSaved }: {
  leagueId: string
  myClub: ClubData
  onSaved: (tactic: TacticData) => void
}) {
  const isMobile = useIsMobile()
  const saved = myClub.tactic
  const [formation, setFormation] = useState(saved?.formation ?? '4-3-3')
  const [style, setStyle] = useState<TacticStyle>(saved?.style ?? 'possession')
  const [pressing, setPressing] = useState(snapToStage(saved?.pressingIntensity ?? 55, PRESSING_STAGES))
  const [defLine, setDefLine] = useState(snapToStage(saved?.defensiveLine ?? 55, DEFLINE_STAGES))
  const [width, setWidth] = useState(snapToStage(saved?.width ?? 55, WIDTH_STAGES))
  const [lineup, setLineup] = useState<LineupSlot[]>(() =>
    saved?.lineup?.length === 11 ? saved.lineup : autoAssign(saved?.formation ?? '4-3-3', myClub.squad)
  )
  const [subs, setSubs] = useState<SubSlot[]>(saved?.subs ?? [])
  const [customSlots, setCustomSlots] = useState<CustomSlot[]>(() => {
    if (saved?.customSlots?.length) return saved.customSlots.map((s, i) => ({ ...s, id: String(i) }))
    if ((saved?.formation ?? '4-3-3') === 'custom') return (FORMATION_SLOTS['4-3-3'] ?? []).map((s, i) => ({ ...s, id: String(i) }))
    return []
  })
  const [customPickerFor, setCustomPickerFor] = useState<null | number>(null)
  const customDragRef = useRef<number | null>(null)
  const customDragMovedRef = useRef(false)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const [isDirty, setIsDirty] = useState(false)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useRef(false)
  const [detailInfo, setDetailInfo] = useState<{ player: SquadPlayer; slotPos: string; slotIndex: number } | null>(null)
  const pitchScale = isMobile ? 92 : 78
  const [dragSrc, setDragSrc] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)
  const dragMovedRef = useRef(false)
  // Touch long-press drag
  const pitchRef        = useRef<HTMLDivElement | null>(null)
  const longPressRef    = useRef<ReturnType<typeof setTimeout> | null>(null)
  const touchSrcRef     = useRef<number | null>(null)
  const touchTargetRef  = useRef<number | null>(null)
  const touchStartXY    = useRef<{ x: number; y: number } | null>(null)
  const [touchSrc,    setTouchSrc]    = useState<number | null>(null)
  const [touchPos,    setTouchPos]    = useState<{ x: number; y: number } | null>(null)
  const [touchTarget, setTouchTarget] = useState<number | null>(null)
  const [presets, setPresets] = useState<TacticPreset[]>(() => {
    try { return JSON.parse(localStorage.getItem(`tactic-presets-${leagueId}`) ?? '[]') } catch { return [] }
  })

  // Mark dirty after mount whenever tactic state changes
  useEffect(() => {
    if (!mountedRef.current) { mountedRef.current = true; return }
    setIsDirty(true)
  }, [formation, style, pressing, defLine, width, lineup, subs])

  // Debounced auto-save
  useEffect(() => {
    if (!isDirty) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => { handleSave() }, 2000)
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDirty, formation, style, pressing, defLine, width, lineup, subs])

  // Clear timer on unmount
  useEffect(() => {
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }
  }, [])

  // Non-passive touchmove on pitch so we can call preventDefault once drag activates
  useEffect(() => {
    const el = pitchRef.current
    if (!el) return
    function onTouchMove(e: TouchEvent) {
      const touch = e.touches[0]
      if (touchSrcRef.current === null) {
        // Drag not yet active — cancel long press if finger moved > 8 px
        if (longPressRef.current !== null && touchStartXY.current) {
          const dx = touch.clientX - touchStartXY.current.x
          const dy = touch.clientY - touchStartXY.current.y
          if (dx * dx + dy * dy > 64) {
            clearTimeout(longPressRef.current)
            longPressRef.current = null
          }
        }
        return
      }
      e.preventDefault() // Block scroll / zoom while drag is live
      setTouchPos({ x: touch.clientX, y: touch.clientY })
      const hit    = document.elementFromPoint(touch.clientX, touch.clientY)
      const slotEl = hit?.closest('[data-si]')
      const si     = slotEl ? parseInt((slotEl as HTMLElement).dataset.si ?? '') : NaN
      const next   = isNaN(si) ? null : si
      touchTargetRef.current = next
      setTouchTarget(next)
    }
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    return () => el.removeEventListener('touchmove', onTouchMove)
  }, []) // pitchRef is stable; all reads use refs

  function changeFormation(f: string) {
    if (f === 'custom') {
      // Bootstrap custom slots from current formation so user has something to start with
      const base = FORMATION_SLOTS[formation] ?? FORMATION_SLOTS['4-3-3'] ?? []
      setCustomSlots(base.map((s, i) => ({ ...s, id: String(Date.now() + i) })))
      setFormation('custom')
      return
    }
    setFormation(f)
    setLineup(autoAssign(f, myClub.squad))
  }

  function addCustomSlotAt(position: string, x: number, y: number) {
    if (customSlots.length >= 11) return
    const id = String(Date.now())
    setCustomSlots(prev => [...prev, { id, position, x, y }])
    setLineup(prev => [...prev, { instanceId: '', position }])
  }

  function removeCustomSlot(i: number) {
    setCustomSlots(prev => prev.filter((_, ci) => ci !== i))
    setLineup(prev => prev.filter((_, ci) => ci !== i))
  }

  function editCustomSlotPosition(i: number, position: string) {
    setCustomSlots(prev => prev.map((s, ci) => ci === i ? { ...s, position } : s))
    setLineup(prev => prev.map((s, ci) => ci === i ? { ...s, position } : s))
    setCustomPickerFor(null)
  }

  function swapSlots(a: number, b: number) {
    if (a === b) return
    setLineup(prev => {
      const next = [...prev]
      const tmpId = next[a].instanceId
      const tmpRole = next[a].role
      next[a] = { ...next[a], instanceId: next[b].instanceId, role: next[b].role }
      next[b] = { ...next[b], instanceId: tmpId, role: tmpRole }
      return next
    })
  }

  function handleDragStart(i: number) {
    setDragSrc(i)
    dragMovedRef.current = false
  }

  function handleDragOver(e: React.DragEvent, i: number) {
    e.preventDefault()
    dragMovedRef.current = true
    setDragOver(i)
  }

  function handleDrop(e: React.DragEvent, i: number) {
    e.preventDefault()
    if (dragSrc !== null) swapSlots(dragSrc, i)
    setDragSrc(null)
    setDragOver(null)
  }

  function handleDragEnd() {
    setDragSrc(null)
    setDragOver(null)
    dragMovedRef.current = false
  }

  function handleTouchStart(e: React.TouchEvent, i: number, hasPlayer: boolean) {
    if (!hasPlayer) return
    const touch = e.touches[0]
    touchStartXY.current = { x: touch.clientX, y: touch.clientY }
    longPressRef.current = setTimeout(() => {
      longPressRef.current = null
      touchSrcRef.current  = i
      setTouchSrc(i)
      setTouchPos({ x: touch.clientX, y: touch.clientY })
      touchTargetRef.current = null
      setTouchTarget(null)
      if (navigator.vibrate) navigator.vibrate(40)
    }, 400)
  }

  function handlePitchTouchEnd(e: React.TouchEvent) {
    if (longPressRef.current !== null) {
      clearTimeout(longPressRef.current)
      longPressRef.current = null
    }
    if (touchSrcRef.current !== null) {
      e.preventDefault() // Suppress synthetic click so modal doesn't open
      if (touchTargetRef.current !== null && touchSrcRef.current !== touchTargetRef.current) {
        swapSlots(touchSrcRef.current, touchTargetRef.current)
      }
    }
    touchSrcRef.current    = null
    touchTargetRef.current = null
    touchStartXY.current   = null
    setTouchSrc(null)
    setTouchPos(null)
    setTouchTarget(null)
  }

  function handleSlotClick(i: number, player: SquadPlayer | null, slotPos: string) {
    if (dragMovedRef.current) return
    if (!player) return
    setDetailInfo({ player, slotPos, slotIndex: i })
  }

  function handleRoleChange(slotIndex: number, role: string) {
    setLineup(prev => prev.map((s, i) => i === slotIndex ? { ...s, role } : s))
  }

  async function handleSave() {
    if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null }
    setSaving(true)
    try {
      const payload: TacticData = { formation, style, pressingIntensity: pressing, defensiveLine: defLine, width, lineup, subs, customSlots: formation === 'custom' ? customSlots.map(({ id: _id, ...s }) => s) : undefined }
      await api.patch(`/leagues/${leagueId}/tactic`, payload)
      onSaved(payload)
      setIsDirty(false)
      setSaveMsg('Saved!')
      setTimeout(() => setSaveMsg(''), 2500)
    } catch {
      setSaveMsg('Save failed')
    } finally {
      setSaving(false)
    }
  }

  function savePreset() {
    const name = window.prompt('Preset name:', `Preset ${presets.length + 1}`)
    if (!name) return
    const newPresets: TacticPreset[] = [...presets.slice(0, 3), { name: name.trim(), tactic: { formation, style, pressing, defLine, width, lineup } }]
    setPresets(newPresets)
    localStorage.setItem(`tactic-presets-${leagueId}`, JSON.stringify(newPresets))
  }

  function deletePreset(i: number) {
    const newPresets = presets.filter((_, idx) => idx !== i)
    setPresets(newPresets)
    localStorage.setItem(`tactic-presets-${leagueId}`, JSON.stringify(newPresets))
  }

  function loadPreset(preset: TacticPreset) {
    setFormation(preset.tactic.formation)
    setStyle(preset.tactic.style as TacticStyle)
    setPressing(preset.tactic.pressing)
    setDefLine(preset.tactic.defLine)
    setWidth(preset.tactic.width)
    setLineup(preset.tactic.lineup)
  }

  const slots = formation === 'custom' ? customSlots : (FORMATION_SLOTS[formation] ?? [])
  const instanceMap = Object.fromEntries(myClub.squad.map(p => [p.id, p]))
  const startingIds = new Set(lineup.map(s => s.instanceId))
  const bench = myClub.squad.filter(p => !startingIds.has(p.id)).sort((a, b) => b.player.overall - a.player.overall)

  // Team rating + live drag/touch preview
  const currentRating = calcLineupRating(lineup, instanceMap)
  const activeSrc  = dragSrc !== null ? dragSrc  : touchSrc
  const activeOver = dragSrc !== null ? dragOver : touchTarget
  const previewLineup = (activeSrc !== null && activeOver !== null && activeSrc !== activeOver)
    ? lineup.map((s, i) =>
        i === activeSrc  ? { ...s, instanceId: lineup[activeOver].instanceId, role: lineup[activeOver].role } :
        i === activeOver ? { ...s, instanceId: lineup[activeSrc].instanceId,  role: lineup[activeSrc].role  } : s
      )
    : null
  const previewRating = previewLineup ? calcLineupRating(previewLineup, instanceMap) : null

  // Card dimensions — mobile uses tighter multipliers so 3 midfielders don't overlap
  const cardW   = isMobile ? Math.max(40, Math.round(pitchScale * 0.64)) : Math.max(52,  Math.round(pitchScale * 1.55))
  const photoSz = isMobile ? Math.max(16, Math.round(pitchScale * 0.20)) : Math.max(20,  Math.round(pitchScale * 0.60))
  const nameFz  = isMobile ? Math.max(6,  Math.round(pitchScale * 0.085)) : Math.max(7,   Math.round(pitchScale * 0.195))
  const ovrFz   = isMobile ? Math.max(9,  Math.round(pitchScale * 0.125)) : Math.max(9,   Math.round(pitchScale * 0.27))
  const posFz   = isMobile ? Math.max(5,  Math.round(pitchScale * 0.065)) : Math.max(6,   Math.round(pitchScale * 0.155))
  const roleFz  = isMobile ? 0 : Math.max(5, Math.round(pitchScale * 0.125))

  return (
    <>
    {detailInfo && (
      <PlayerDetailModal
        player={detailInfo.player}
        slotPos={detailInfo.slotPos}
        slotIndex={detailInfo.slotIndex}
        lineup={lineup}
        onClose={() => setDetailInfo(null)}
        onRoleChange={handleRoleChange}
      />
    )}

    {/* Floating player clone during touch drag */}
    {touchSrc !== null && touchPos !== null && (() => {
      const entry  = lineup[touchSrc]
      const player = entry?.instanceId ? instanceMap[entry.instanceId] : null
      if (!player) return null
      const fitColor = 'var(--green)'
      return (
        <div style={{
          position: 'fixed',
          left: touchPos.x - Math.round(cardW * 0.55),
          top:  touchPos.y - Math.round(cardW * 1.1),
          width: Math.round(cardW * 1.15),
          pointerEvents: 'none',
          zIndex: 9999,
          transform: 'rotate(3deg)',
          filter: 'drop-shadow(0 8px 20px rgba(0,0,0,0.8))',
        }}>
          <div style={{
            background: 'rgba(0,0,0,0.95)',
            border: `2.5px solid ${fitColor}`,
            borderRadius: 10,
            padding: '4px 5px',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
          }}>
            {player.player.photoUrl ? (
              <img src={player.player.photoUrl} alt="" style={{ width: photoSz, height: photoSz, borderRadius: '50%', objectFit: 'cover', border: `2px solid ${fitColor}` }} />
            ) : (
              <div style={{ width: photoSz, height: photoSz, borderRadius: '50%', background: getBadgeColor(player.player.name), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: Math.round(photoSz * 0.35), fontWeight: 900, color: '#000', flexShrink: 0, border: `2px solid ${fitColor}` }}>
                {player.player.name.split(' ').map(w => w[0]).slice(0, 2).join('')}
              </div>
            )}
            <span style={{ fontSize: nameFz, fontWeight: 700, color: '#fff', textAlign: 'center', lineHeight: 1.2, width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {player.player.name.split(' ').slice(-1)[0]}
            </span>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: ovrFz, fontWeight: 900, color: fitColor, lineHeight: 1 }}>
              {player.player.overall}
            </span>
          </div>
        </div>
      )
    })()}

    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1fr) 300px', gap: 20, alignItems: 'start' }}>

      {/* Left: pitch */}
      <div>
        {/* Formation picker */}
        <div style={{ display: 'flex', gap: 5, marginBottom: 8, flexWrap: 'wrap' }}>
          {Object.keys(FORMATION_SLOTS).map(f => (
            <button key={f} onClick={() => changeFormation(f)} style={{
              padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700,
              cursor: 'pointer', border: 'none', fontFamily: 'var(--font-display)',
              background: formation === f ? 'var(--green)' : 'var(--bg-card)',
              color: formation === f ? '#000' : 'var(--text-2)',
              transition: 'all 0.15s',
            }}>{f}</button>
          ))}
          <button onClick={() => changeFormation('custom')} style={{
            padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700,
            cursor: 'pointer', border: `1.5px solid ${formation === 'custom' ? 'var(--green)' : 'var(--border)'}`,
            fontFamily: 'var(--font-display)',
            background: formation === 'custom' ? 'rgba(54,226,126,0.12)' : 'transparent',
            color: formation === 'custom' ? 'var(--green)' : 'var(--text-2)',
            transition: 'all 0.15s',
          }}>✏ Custom</button>
          <button onClick={() => setLineup(autoAssign(formation === 'custom' ? '4-3-3' : formation, myClub.squad))} style={{ padding: '5px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700, cursor: 'pointer', border: '1.5px solid var(--green)', background: 'rgba(54,226,126,0.08)', color: 'var(--green)', marginLeft: 'auto' }}>↺ Best XI</button>
        </div>
        {formation === 'custom' ? (
          <div style={{ fontSize: 11, color: 'var(--text-2)', marginBottom: 12, padding: '8px 10px', background: 'rgba(255,255,255,0.04)', borderRadius: 6, lineHeight: 1.6 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ display: 'flex', flexWrap: 'wrap', gap: '0 10px' }}>
                <span style={{ fontWeight: 700, color: customSlots.length === 11 ? 'var(--green)' : 'var(--gold)' }}>{customSlots.length}/11 slots</span>
                {customSlots.length > 0 && !customSlots.some(s => s.position === 'GK') && (
                  <span style={{ color: 'var(--red)' }}>needs a GK</span>
                )}
                {(() => {
                  const defCount = customSlots.filter(s => DEFENDER_POSITIONS.has(s.position)).length
                  if (customSlots.length > 0 && defCount < 3) return <span key="def-min" style={{ color: 'var(--red)' }}>min 3 defenders ({defCount})</span>
                  if (defCount > 5) return <span key="def-max" style={{ color: 'var(--red)' }}>max 5 defenders ({defCount})</span>
                  return null
                })()}
                {FLANK_PAIRS.flatMap(([l, r]) => {
                  const hasL = customSlots.some(s => s.position === l)
                  const hasR = customSlots.some(s => s.position === r)
                  if (hasL && !hasR) return [`${l} needs ${r}`]
                  if (hasR && !hasL) return [`${r} needs ${l}`]
                  return []
                }).map(msg => (
                  <span key={msg} style={{ color: 'var(--red)' }}>{msg}</span>
                ))}
              </span>
              <button onClick={() => { setCustomSlots([]); setLineup([]) }} style={{ fontSize: 10, color: 'var(--red)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, flexShrink: 0, marginLeft: 8 }}>Clear all</button>
            </div>
            <span style={{ fontSize: 10, color: 'var(--text-3)' }}>Click pitch to add — position auto-detected from location · drag to reposition · click badge to override</span>
          </div>
        ) : FORMATION_DESC[formation] ? (
          <div style={{ fontSize: 11, color: 'var(--text-2)', marginBottom: 12, padding: '7px 10px', background: 'rgba(255,255,255,0.04)', borderRadius: 6, lineHeight: 1.5 }}>
            <span style={{ fontWeight: 700, color: 'var(--text-1)' }}>{formation}</span>
            {' — '}{FORMATION_DESC[formation]}
          </div>
        ) : null}

        {/* Pitch */}
        <div style={{ width: `${pitchScale}%`, margin: '0 auto' }}>
        <div
          ref={pitchRef}
          style={{
            position: 'relative', width: '100%', aspectRatio: '68 / 58',
            borderRadius: 14, overflow: 'hidden',
            border: '2px solid rgba(255,255,255,0.12)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          }}
          onDragOver={e => e.preventDefault()}
          onTouchEnd={handlePitchTouchEnd}
          onClick={e => {
            if (formation !== 'custom') return
            if (customDragMovedRef.current) { customDragMovedRef.current = false; return }
            if (customSlots.length >= 11) return
            const rect = pitchRef.current?.getBoundingClientRect()
            if (!rect) return
            const x = Math.max(5, Math.min(95, Math.round(((e.clientX - rect.left) / rect.width) * 100)))
            const y = Math.max(5, Math.min(95, Math.round(((e.clientY - rect.top) / rect.height) * 100)))
            addCustomSlotAt(resolvePosition(x, y, customSlots), x, y)
          }}
          onMouseMove={e => {
            if (customDragRef.current === null) return
            const rect = pitchRef.current?.getBoundingClientRect()
            if (!rect) return
            customDragMovedRef.current = true
            const x = Math.max(5, Math.min(95, Math.round(((e.clientX - rect.left) / rect.width) * 100)))
            const y = Math.max(5, Math.min(95, Math.round(((e.clientY - rect.top) / rect.height) * 100)))
            setCustomSlots(prev => prev.map((s, ci) => ci === customDragRef.current ? { ...s, x, y } : s))
          }}
          onMouseUp={e => {
            if (customDragRef.current !== null && customDragMovedRef.current) {
              const idx = customDragRef.current
              const rect = pitchRef.current?.getBoundingClientRect()
              if (rect) {
                const x = Math.max(5, Math.min(95, Math.round(((e.clientX - rect.left) / rect.width) * 100)))
                const y = Math.max(5, Math.min(95, Math.round(((e.clientY - rect.top) / rect.height) * 100)))
                const detected = resolvePosition(x, y, customSlots, idx)
                setCustomSlots(prev => prev.map((s, ci) => ci === idx ? { ...s, position: detected, x, y } : s))
                setLineup(prev => prev.map((s, ci) => ci === idx ? { ...s, position: detected } : s))
              }
            }
            customDragRef.current = null
          }}
          onMouseLeave={() => { customDragRef.current = null }}
        >
          {/* Grass stripes — % based so they scale with the container */}
          <div style={{ position: 'absolute', inset: 0, background: 'repeating-linear-gradient(to bottom, #1e5c1e 0%, #1e5c1e 10%, #1a4a1a 10%, #1a4a1a 20%)' }} />

          {/* Half-pitch SVG markings (y=0 = halfway line, y=100 = our goal line) */}
          <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} viewBox="0 0 100 100" preserveAspectRatio="none">
            {/* Outer border */}
            <rect x="2" y="2" width="96" height="96" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="0.6" />
            {/* Halfway line at top */}
            <line x1="2" y1="2" x2="98" y2="2" stroke="rgba(255,255,255,0.35)" strokeWidth="0.7" />
            {/* Center circle arc peeking over halfway line */}
            <ellipse cx="50" cy="2" rx="16" ry="13" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="0.5" clipPath="url(#bottomHalf)" />
            <clipPath id="bottomHalf"><rect x="0" y="2" width="100" height="100" /></clipPath>
            {/* Center spot (on halfway line) */}
            <circle cx="50" cy="2" r="0.6" fill="rgba(255,255,255,0.4)" />
            {/* Penalty box */}
            <rect x="20" y="64" width="60" height="34" fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="0.5" />
            {/* 6-yard box */}
            <rect x="35" y="88" width="30" height="10" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="0.4" />
            {/* Penalty spot */}
            <circle cx="50" cy="76" r="0.6" fill="rgba(255,255,255,0.4)" />
            {/* Penalty arc (D) — drawn outside the penalty box */}
            <path d="M 23 64 A 17 17 0 0 0 77 64" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="0.4" />
            {/* Corner arcs (bottom corners — our goal end) */}
            <path d="M 2 94 A 3 3 0 0 0 5 98" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="0.4" />
            <path d="M 98 94 A 3 3 0 0 1 95 98" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="0.4" />
          </svg>

          {/* Player slots */}
          {slots.map((slot, i) => {
            const entry = lineup[i]
            const player = entry?.instanceId ? instanceMap[entry.instanceId] : null
            const fit = player ? tacticFitScore(player.player.position, slot.position, player.trainedPosition) : 0
            const fitColor = fit >= 1 ? 'var(--green)' : fit >= 0.7 ? 'var(--gold)' : 'var(--red)'
            const isDragSrc    = dragSrc === i
            const isDragTarget = dragOver === i && dragSrc !== null && dragSrc !== i
            const isTouchSrc   = touchSrc === i
            const isTouchTarget = touchTarget === i && touchSrc !== null && touchSrc !== i
            const isActiveSrc  = isDragSrc || isTouchSrc
            const isActiveTarget = isDragTarget || isTouchTarget
            const role = entry?.role

            const isCustomMode = formation === 'custom'
            const isCustomDragging = isCustomMode && customDragRef.current === i
            const flankMirror = MIRROR_POSITION[slot.position]
            const hasFlankWarning = isCustomMode && !!flankMirror && !slots.some((s, si) => si !== i && s.position === flankMirror)

            return (
              <div
                key={isCustomMode ? (slot as CustomSlot).id : i}
                data-si={i}
                draggable={!isCustomMode && !!player}
                onDragStart={() => { if (!isCustomMode) handleDragStart(i) }}
                onDragOver={e => { if (!isCustomMode) handleDragOver(e, i) }}
                onDrop={e => { if (!isCustomMode) handleDrop(e, i) }}
                onDragEnd={() => { if (!isCustomMode) handleDragEnd() }}
                onTouchStart={e => { if (!isCustomMode) handleTouchStart(e, i, !!player) }}
                onMouseDown={e => {
                  if (!isCustomMode) return
                  e.stopPropagation()
                  customDragMovedRef.current = false
                  customDragRef.current = i
                }}
                onClick={e => {
                  if (!isCustomMode) { handleSlotClick(i, player, slot.position); return }
                  e.stopPropagation()
                  if (!customDragMovedRef.current) {
                    handleSlotClick(i, player, slot.position)
                  }
                  customDragMovedRef.current = false
                }}
                style={{
                  position: 'absolute',
                  left: `${slot.x}%`, top: `${slot.y}%`,
                  transform: 'translate(-50%, -50%)',
                  width: cardW,
                  background: isCustomDragging
                    ? 'rgba(255,255,255,0.12)'
                    : isActiveTarget
                    ? 'rgba(54,226,126,0.2)'
                    : isActiveSrc
                    ? 'rgba(255,255,255,0.05)'
                    : player ? 'rgba(0,0,0,0.82)' : 'rgba(0,0,0,0.4)',
                  border: `2px solid ${isCustomDragging ? 'rgba(255,255,255,0.6)' : isActiveTarget ? 'var(--green)' : isActiveSrc ? 'rgba(255,255,255,0.4)' : player?.injured ? 'var(--red)' : player ? fitColor : 'rgba(255,255,255,0.2)'}`,
                  borderRadius: 10,
                  cursor: isCustomMode ? 'move' : player ? 'grab' : 'default',
                  padding: isMobile ? '3px 4px' : `${Math.round(pitchScale * 0.07)}px ${Math.round(pitchScale * 0.08)}px`,
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  gap: Math.round(pitchScale * 0.04),
                  zIndex: isCustomDragging ? 30 : isActiveSrc ? 20 : 10,
                  transition: isCustomDragging ? 'none' : 'border-color 0.12s, background 0.12s, opacity 0.12s',
                  backdropFilter: 'blur(6px)',
                  opacity: isActiveSrc && !isCustomMode ? 0.3 : 1,
                  boxShadow: player ? '0 3px 12px rgba(0,0,0,0.6)' : 'none',
                  userSelect: 'none',
                }}
              >
                {/* Flank-pair warning pill — floats above the card */}
                {hasFlankWarning && (
                  <div style={{
                    position: 'absolute',
                    bottom: '100%', left: '50%', transform: 'translateX(-50%)',
                    marginBottom: 4,
                    background: 'var(--gold)', color: '#000',
                    fontSize: Math.max(7, posFz), fontWeight: 900,
                    padding: '2px 6px', borderRadius: 4,
                    whiteSpace: 'nowrap', zIndex: 15, lineHeight: 1.4,
                    pointerEvents: 'none',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.5)',
                  }}>
                    ⚠ add {flankMirror}
                  </div>
                )}
                {/* In custom mode: × delete button top-right */}
                {isCustomMode && (
                  <button
                    onMouseDown={e => e.stopPropagation()}
                    onClick={e => { e.stopPropagation(); removeCustomSlot(i) }}
                    style={{
                      position: 'absolute', top: -6, right: -6,
                      width: 16, height: 16, borderRadius: '50%',
                      background: 'var(--red)', border: 'none',
                      color: '#fff', fontSize: 9, fontWeight: 900,
                      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      lineHeight: 1, padding: 0, zIndex: 5,
                    }}
                  >×</button>
                )}
                {/* Position badge — in custom mode, click to edit position */}
                <div
                  onMouseDown={e => { if (isCustomMode) e.stopPropagation() }}
                  onClick={e => {
                    if (!isCustomMode) return
                    e.stopPropagation()
                    if (!customDragMovedRef.current) {
                      setCustomPickerFor(i)
                    }
                  }}
                  style={{
                    background: player ? fitColor : isCustomMode ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.15)',
                    color: player ? '#000' : isCustomMode ? '#fff' : 'rgba(255,255,255,0.5)',
                    fontSize: posFz, fontWeight: 900,
                    textTransform: 'uppercase', letterSpacing: 0.5,
                    padding: `1px ${Math.round(posFz * 0.5)}px`, borderRadius: 3,
                    cursor: isCustomMode ? 'pointer' : 'default',
                    outline: isCustomMode && customPickerFor === i ? '1.5px solid #fff' : 'none',
                  }}
                >
                  {slot.position}
                </div>

                {player ? (
                  <>
                    {/* Photo with injury badge */}
                    <div style={{ position: 'relative', flexShrink: 0 }}>
                      {player.player.photoUrl ? (
                        <img src={player.player.photoUrl} alt="" style={{ width: photoSz, height: photoSz, borderRadius: '50%', objectFit: 'cover', border: `2px solid ${player.injured ? 'var(--red)' : fitColor}`, opacity: player.injured ? 0.65 : 1 }} />
                      ) : (
                        <div style={{ width: photoSz, height: photoSz, borderRadius: '50%', background: getBadgeColor(player.player.name), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: Math.round(photoSz * 0.35), fontWeight: 900, color: '#000', flexShrink: 0, border: `2px solid ${player.injured ? 'var(--red)' : fitColor}`, opacity: player.injured ? 0.65 : 1 }}>
                          {player.player.name.split(' ').map(w => w[0]).slice(0, 2).join('')}
                        </div>
                      )}
                      {player.injured && (
                        <div style={{
                          position: 'absolute', bottom: -2, right: -2, zIndex: 2,
                          width: Math.max(9, Math.round(photoSz * 0.42)), height: Math.max(9, Math.round(photoSz * 0.42)),
                          borderRadius: '50%', background: 'var(--red)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: Math.max(5, Math.round(photoSz * 0.24)), fontWeight: 900, color: '#fff', lineHeight: 1,
                          border: '1.5px solid rgba(0,0,0,0.9)',
                        }}>✚</div>
                      )}
                    </div>
                    <span style={{ fontSize: nameFz, fontWeight: 700, color: player.injured ? 'rgba(255,255,255,0.55)' : '#fff', textAlign: 'center', lineHeight: 1.2, width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {player.player.name.split(' ').slice(-1)[0]}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                      <span style={{ fontFamily: 'var(--font-display)', fontSize: ovrFz, fontWeight: 900, color: player.injured ? 'var(--red)' : fitColor, lineHeight: 1 }}>{player.player.overall}</span>
                      {!player.injured && fit < 1 && <span style={{ fontSize: Math.max(6, posFz - 1), color: fitColor, fontWeight: 800 }}>{fit >= 0.7 ? '~' : '!'}</span>}
                      {player.injured && <span style={{ fontSize: Math.max(6, posFz - 1), color: 'var(--red)', fontWeight: 800 }}>!</span>}
                    </div>
                    {/* Fitness / Morale / Form dots */}
                    <div style={{ display: 'flex', gap: Math.max(2, Math.round(pitchScale * 0.025)), alignItems: 'center' }}>
                      {([
                        { v: player.fitness, label: 'F' },
                        { v: player.morale,  label: 'M' },
                        { v: player.form,    label: 'C' },
                      ] as const).map(({ v, label }) => {
                        const dotColor = v >= 75 ? 'var(--green)' : v >= 50 ? 'var(--gold)' : 'var(--red)'
                        const dotSz = Math.max(4, Math.round(pitchScale * 0.05))
                        return (
                          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <div style={{ width: dotSz, height: dotSz, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
                            {roleFz > 0 && <span style={{ fontSize: Math.max(5, Math.round(dotSz * 0.9)), color: 'rgba(255,255,255,0.38)', fontWeight: 700, lineHeight: 1 }}>{label}</span>}
                          </div>
                        )
                      })}
                    </div>
                    {role && roleFz > 0 && (
                      <span style={{ fontSize: roleFz, color: 'rgba(255,255,255,0.5)', width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'center', textTransform: 'capitalize' }}>
                        {role.replace(/-/g, ' ')}
                      </span>
                    )}
                  </>
                ) : (
                  <span style={{ fontSize: posFz, color: 'rgba(255,255,255,0.2)', padding: `${Math.round(pitchScale * 0.05)}px 0` }}>Empty</span>
                )}
              </div>
            )
          })}
        </div>
        </div>{/* end pitch scale wrapper */}

        {/* Custom formation position override picker — fixed viewport overlay */}
        {customPickerFor !== null && (() => {
          const rect = pitchRef.current?.getBoundingClientRect()
          const s = customSlots[customPickerFor]
          if (!s || !rect) return null
          const vx = rect.left + (s.x / 100) * rect.width
          const vy = rect.top  + (s.y / 100) * rect.height
          const PICKER_W = 200
          const PICKER_H = 190
          const left = Math.max(8, Math.min(vx - PICKER_W / 2, window.innerWidth - PICKER_W - 8))
          const top  = vy + 14 + PICKER_H > window.innerHeight ? vy - PICKER_H - 14 : vy + 14
          return (
            <>
              <div onMouseDown={() => setCustomPickerFor(null)} style={{ position: 'fixed', inset: 0, zIndex: 999 }} />
              <div style={{
                position: 'fixed', left, top, zIndex: 1000,
                background: 'var(--bg-card)', border: '1px solid var(--border)',
                borderRadius: 10, padding: '10px 12px',
                boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
                minWidth: PICKER_W,
              }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
                  Change position
                </div>
                {(() => {
                  const relatable = RELATABLE_POSITIONS[s.position] ?? [s.position]
                  const otherSlots  = customSlots.filter((_, ci) => ci !== customPickerFor)
                  const usedUnique  = new Set(otherSlots.filter(cs => UNIQUE_POSITIONS.has(cs.position)).map(cs => cs.position))
                  const usedAll     = new Set(otherSlots.map(cs => cs.position))
                  const otherDefCount = otherSlots.filter(cs => DEFENDER_POSITIONS.has(cs.position)).length
                  return (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                      {relatable.map(pos => {
                        const isCurrent   = s.position === pos
                        const isTaken     = (UNIQUE_POSITIONS.has(pos) && usedUnique.has(pos))
                                         || (DEFENDER_POSITIONS.has(pos) && otherDefCount >= 5)
                        const mirror      = MIRROR_POSITION[pos]
                        const needsMirror = !isTaken && !isCurrent && mirror && !usedAll.has(mirror)
                        return (
                          <button
                            key={pos}
                            disabled={isTaken}
                            onMouseDown={e => e.stopPropagation()}
                            onClick={e => { e.stopPropagation(); if (!isTaken) editCustomSlotPosition(customPickerFor, pos) }}
                            title={
                              isTaken
                                ? DEFENDER_POSITIONS.has(pos) && otherDefCount >= 5
                                  ? 'Max 5 defenders reached'
                                  : `${pos} already used`
                                : needsMirror ? `Remember to also add ${mirror}` : undefined
                            }
                            style={{
                              padding: '5px 12px', borderRadius: 5, fontSize: 12, fontWeight: 800,
                              border: `1px solid ${isCurrent ? 'var(--green)' : needsMirror ? 'var(--gold)' : 'var(--border)'}`,
                              cursor: isTaken ? 'not-allowed' : 'pointer',
                              background: isCurrent ? 'rgba(54,226,126,0.15)' : needsMirror ? 'rgba(233,196,106,0.08)' : 'rgba(255,255,255,0.06)',
                              color: isCurrent ? 'var(--green)' : isTaken ? 'rgba(255,255,255,0.2)' : needsMirror ? 'var(--gold)' : 'var(--text-1)',
                              textTransform: 'uppercase', letterSpacing: 0.4,
                              opacity: isTaken ? 0.45 : 1,
                              position: 'relative',
                            }}
                          >
                            {pos}
                            {needsMirror && <span style={{ fontSize: 8, position: 'absolute', top: 1, right: 2, lineHeight: 1 }}>⚠</span>}
                          </button>
                        )
                      })}
                    </div>
                  )
                })()}
              </div>
            </>
          )
        })()}

        {/* Bench */}
        {bench.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Bench · {bench.length} players</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 6 }}>
              {bench.map(p => (
                <div
                  key={p.id}
                  draggable
                  onDragStart={() => { /* bench-to-pitch DnD could be added */ }}
                  style={{ padding: '6px 8px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 7, display: 'flex', alignItems: 'center', gap: 6, cursor: 'default' }}
                >
                  {p.player.photoUrl ? (
                    <img src={p.player.photoUrl} alt="" style={{ width: 24, height: 24, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                  ) : (
                    <div style={{ width: 24, height: 24, borderRadius: '50%', background: getBadgeColor(p.player.name), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 900, color: '#000', flexShrink: 0 }}>
                      {p.player.name.split(' ').map(w => w[0]).slice(0, 2).join('')}
                    </div>
                  )}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.player.name.split(' ').slice(-1)[0]}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span className={posClass(p.player.position)} style={{ fontSize: 8 }}>{p.player.position}</span>
                      <span style={{ fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 800, color: 'var(--text-2)' }}>{p.player.overall}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-3)' }}>
          {isMobile ? 'Hold a player (400 ms) to drag · tap to view stats' : 'Drag players between slots to rearrange · Click a player to view stats & set role'}
        </div>
      </div>

      {/* Right: settings */}
      <div style={{ display: isMobile ? 'grid' : 'flex', gridTemplateColumns: isMobile ? '1fr 1fr' : undefined, flexDirection: isMobile ? undefined : 'column', gap: 14, alignItems: isMobile ? 'start' : undefined }}>

        {/* Team rating */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '14px 16px' }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Team Rating</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 36, fontWeight: 900, color: 'var(--text-1)', lineHeight: 1 }}>
              {currentRating ?? '—'}
            </span>
            {previewRating !== null && currentRating !== null && (
              <>
                <span style={{ fontSize: 20, color: 'var(--text-3)' }}>→</span>
                <div>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 36, fontWeight: 900, lineHeight: 1,
                    color: previewRating > currentRating ? 'var(--green)' : previewRating < currentRating ? 'var(--red)' : 'var(--text-1)' }}>
                    {previewRating}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 700, marginLeft: 4,
                    color: previewRating > currentRating ? 'var(--green)' : previewRating < currentRating ? 'var(--red)' : 'var(--text-3)' }}>
                    {previewRating > currentRating ? `+${previewRating - currentRating}` :
                     previewRating < currentRating ? `${previewRating - currentRating}` : '='}
                  </span>
                </div>
              </>
            )}
          </div>
          {previewRating !== null && (
            <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 6 }}>Drop to apply · drag away to cancel</div>
          )}
        </div>

        {/* Tactical style */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
          <div className="card-header">
            <span className="accent-bar" />
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Tactical Style</span>
          </div>
          <div style={{ padding: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5, marginBottom: 10 }}>
              {(Object.keys(STYLE_LABELS) as TacticStyle[]).map(s => (
                <button key={s} onClick={() => setStyle(s)} style={{
                  padding: '8px 6px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  border: `1.5px solid ${style === s ? 'var(--green)' : 'var(--border)'}`,
                  background: style === s ? 'rgba(54,226,126,0.1)' : 'transparent',
                  color: style === s ? 'var(--green)' : 'var(--text-2)',
                  textAlign: 'center', transition: 'all 0.15s',
                }}>{STYLE_LABELS[s]}</button>
              ))}
            </div>
            <div style={{ background: 'var(--bg-base)', borderRadius: 8, padding: '10px 12px' }}>
              <div style={{ fontSize: 11, color: 'var(--text-2)', lineHeight: 1.5, marginBottom: 9 }}>{STYLE_DESC[style]}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {STYLE_TRAITS[style].bonuses.map(t => (
                  <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: 'var(--green)' }}>
                    <span style={{ fontWeight: 800, fontSize: 11 }}>+</span>{t}
                  </div>
                ))}
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: 'var(--red)', marginTop: 2 }}>
                  <span style={{ fontWeight: 800, fontSize: 11 }}>−</span>{STYLE_TRAITS[style].cost}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Settings — stage buttons */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
          <div className="card-header">
            <span className="accent-bar" />
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Settings</span>
          </div>
          <div style={{ padding: 14 }}>

            {/* Pressing */}
            {(() => {
              const active = PRESSING_STAGES.find(s => s.value === pressing)
              const imp = PRESSING_IMPACTS[pressing]
              return (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 7 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Pressing</span>
                    <span style={{ fontSize: 11, color: 'var(--green)', fontWeight: 700 }}>{active?.label ?? ''}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 3, marginBottom: 7 }}>
                    {PRESSING_STAGES.map(stage => (
                      <button key={stage.label} onClick={() => setPressing(stage.value)} title={stage.desc} style={{
                        flex: 1, padding: '6px 2px', fontSize: 10, fontWeight: 700, cursor: 'pointer',
                        borderRadius: 5, border: `1.5px solid ${pressing === stage.value ? 'var(--green)' : 'var(--border)'}`,
                        background: pressing === stage.value ? 'rgba(54,226,126,0.12)' : 'transparent',
                        color: pressing === stage.value ? 'var(--green)' : 'var(--text-3)',
                        transition: 'all 0.15s', whiteSpace: 'nowrap',
                      }}>{stage.label}</button>
                    ))}
                  </div>
                  {active && <div style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 8 }}>{active.desc}</div>}
                  {imp && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, background: 'var(--bg-base)', borderRadius: 6, padding: '8px 10px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <span style={{ fontSize: 9, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>Ball Recovery</span>
                        <PipBar value={imp.recovery} color="var(--green)" />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <span style={{ fontSize: 9, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>Stamina Cost</span>
                        <PipBar value={imp.stamina} color={imp.stamina >= 4 ? 'var(--red)' : imp.stamina >= 3 ? 'var(--gold)' : 'var(--green)'} />
                      </div>
                    </div>
                  )}
                </div>
              )
            })()}

            {/* Defensive Line */}
            {(() => {
              const active = DEFLINE_STAGES.find(s => s.value === defLine)
              const imp = DEFLINE_IMPACTS[defLine]
              return (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 7 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Defensive Line</span>
                    <span style={{ fontSize: 11, color: 'var(--green)', fontWeight: 700 }}>{active?.label ?? ''}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 3, marginBottom: 7 }}>
                    {DEFLINE_STAGES.map(stage => (
                      <button key={stage.label} onClick={() => setDefLine(stage.value)} title={stage.desc} style={{
                        flex: 1, padding: '6px 2px', fontSize: 10, fontWeight: 700, cursor: 'pointer',
                        borderRadius: 5, border: `1.5px solid ${defLine === stage.value ? 'var(--green)' : 'var(--border)'}`,
                        background: defLine === stage.value ? 'rgba(54,226,126,0.12)' : 'transparent',
                        color: defLine === stage.value ? 'var(--green)' : 'var(--text-3)',
                        transition: 'all 0.15s', whiteSpace: 'nowrap',
                      }}>{stage.label}</button>
                    ))}
                  </div>
                  {active && <div style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 8 }}>{active.desc}</div>}
                  {imp && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, background: 'var(--bg-base)', borderRadius: 6, padding: '8px 10px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <span style={{ fontSize: 9, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>Compactness</span>
                        <PipBar value={imp.compact} color="var(--green)" />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <span style={{ fontSize: 9, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>Counter Risk</span>
                        <PipBar value={imp.counterRisk} color={imp.counterRisk >= 4 ? 'var(--red)' : imp.counterRisk >= 3 ? 'var(--gold)' : 'var(--green)'} />
                      </div>
                    </div>
                  )}
                </div>
              )
            })()}

            {/* Width */}
            {(() => {
              const active = WIDTH_STAGES.find(s => s.value === width)
              const imp = WIDTH_IMPACTS[width]
              return (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 7 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Width</span>
                    <span style={{ fontSize: 11, color: 'var(--green)', fontWeight: 700 }}>{active?.label ?? ''}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 3, marginBottom: 7 }}>
                    {WIDTH_STAGES.map(stage => (
                      <button key={stage.label} onClick={() => setWidth(stage.value)} title={stage.desc} style={{
                        flex: 1, padding: '6px 2px', fontSize: 10, fontWeight: 700, cursor: 'pointer',
                        borderRadius: 5, border: `1.5px solid ${width === stage.value ? 'var(--green)' : 'var(--border)'}`,
                        background: width === stage.value ? 'rgba(54,226,126,0.12)' : 'transparent',
                        color: width === stage.value ? 'var(--green)' : 'var(--text-3)',
                        transition: 'all 0.15s', whiteSpace: 'nowrap',
                      }}>{stage.label}</button>
                    ))}
                  </div>
                  {active && <div style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 8 }}>{active.desc}</div>}
                  {imp && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, background: 'var(--bg-base)', borderRadius: 6, padding: '8px 10px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <span style={{ fontSize: 9, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>Wing Threat</span>
                        <PipBar value={imp.wing} color="var(--green)" />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <span style={{ fontSize: 9, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>Central Strength</span>
                        <PipBar value={imp.central} color="var(--green)" />
                      </div>
                    </div>
                  )}
                </div>
              )
            })()}

          </div>
        </div>

        {/* Substitutions */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
          <div className="card-header">
            <span className="accent-bar" />
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Substitutions</span>
          </div>
          <div style={{ padding: 14 }}>
            <div style={{ fontSize: 11, color: 'var(--text-2)', marginBottom: 10 }}>
              Set up to 3 subs. Each triggers when the starter hits a fitness threshold or a match minute.
            </div>
            {subs.map((sub, i) => {
              const outPlayer = instanceMap[sub.outInstanceId]
              const inPlayer  = instanceMap[sub.inInstanceId]
              return (
                <div key={i} style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, flexWrap: 'wrap' as const }}>
                    {/* Out player */}
                    <select
                      value={sub.outInstanceId}
                      onChange={e => setSubs(prev => prev.map((s, j) => j === i ? { ...s, outInstanceId: e.target.value } : s))}
                      style={{ flex: 1, minWidth: 0, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-1)', fontSize: 11, padding: '4px 6px' }}
                    >
                      <option value="">— Off —</option>
                      {lineup.map(slot => {
                        const p = instanceMap[slot.instanceId]
                        return p ? <option key={slot.instanceId} value={slot.instanceId}>{p.player.name} ({slot.position})</option> : null
                      })}
                    </select>
                    <span style={{ fontSize: 10, color: 'var(--text-3)' }}>▶</span>
                    {/* In player */}
                    <select
                      value={sub.inInstanceId}
                      onChange={e => setSubs(prev => prev.map((s, j) => j === i ? { ...s, inInstanceId: e.target.value } : s))}
                      style={{ flex: 1, minWidth: 0, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-1)', fontSize: 11, padding: '4px 6px' }}
                    >
                      <option value="">— On —</option>
                      {bench.map(p => <option key={p.id} value={p.id}>{p.player.name} ({p.player.position})</option>)}
                    </select>
                    <button onClick={() => setSubs(prev => prev.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: 16, padding: '0 2px', lineHeight: 1 }}>✕</button>
                  </div>
                  {/* Condition */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 10, color: 'var(--text-2)', flexShrink: 0 }}>Trigger when</span>
                    <select
                      value={sub.condition.type}
                      onChange={e => setSubs(prev => prev.map((s, j) => j === i ? { ...s, condition: { ...s.condition, type: e.target.value as 'minute' | 'fitness' } } : s))}
                      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-1)', fontSize: 11, padding: '3px 5px' }}
                    >
                      <option value="fitness">fitness ≤</option>
                      <option value="minute">minute ≥</option>
                    </select>
                    <input
                      type="number"
                      min={sub.condition.type === 'fitness' ? 10 : 45}
                      max={sub.condition.type === 'fitness' ? 80 : 89}
                      value={sub.condition.value}
                      onChange={e => setSubs(prev => prev.map((s, j) => j === i ? { ...s, condition: { ...s.condition, value: Number(e.target.value) } } : s))}
                      style={{ width: 52, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-1)', fontSize: 11, padding: '3px 6px', textAlign: 'center' as const }}
                    />
                    <span style={{ fontSize: 10, color: 'var(--text-2)' }}>{sub.condition.type === 'fitness' ? '(stamina)' : '(match min)'}</span>
                  </div>
                  {outPlayer && inPlayer && (
                    <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 6 }}>
                      {outPlayer.player.name} → {inPlayer.player.name} · {sub.condition.type === 'fitness' ? `when stamina ≤ ${sub.condition.value}` : `at minute ${sub.condition.value}`}
                    </div>
                  )}
                </div>
              )
            })}
            {subs.length < 3 && (
              <button
                className="btn btn-outline"
                style={{ width: '100%', fontSize: 11, marginTop: 4 }}
                onClick={() => setSubs(prev => [...prev, { outInstanceId: '', inInstanceId: '', condition: { type: 'fitness', value: 40 } }])}
              >
                + Add Substitution
              </button>
            )}
          </div>
        </div>

        {/* Fit legend */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
          <div className="card-header">
            <span className="accent-bar" />
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Position Fit</span>
          </div>
          <div style={{ padding: 14 }}>
          {[['var(--green)', 'Natural position — full rating'], ['var(--gold)', '~ Adjacent position — slight penalty'], ['var(--red)', '! Wrong position — large penalty']].map(([c, l]) => (
            <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, fontSize: 11, color: 'var(--text-2)' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: c, flexShrink: 0, display: 'inline-block' }} />
              {l}
            </div>
          ))}
          </div>
        </div>

        {/* Presets */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
          <div className="card-header">
            <span className="accent-bar" />
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Presets</span>
          </div>
          <div style={{ padding: 12 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: presets.length > 0 ? 8 : 0 }}>
              {presets.map((p, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 0, background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 20, overflow: 'hidden' }}>
                  <button onClick={() => loadPreset(p)} style={{ padding: '4px 10px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600, color: 'var(--text-1)' }}>{p.name}</button>
                  <button onClick={() => deletePreset(i)} style={{ padding: '4px 6px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--text-3)', lineHeight: 1 }}>✕</button>
                </div>
              ))}
            </div>
            {presets.length < 4 && (
              <button className="btn btn-ghost" style={{ width: '100%', fontSize: 11 }} onClick={savePreset}>
                💾 Save current as preset
              </button>
            )}
            {presets.length >= 4 && (
              <div style={{ fontSize: 10, color: 'var(--text-3)', textAlign: 'center' }}>Max 4 presets — delete one to save a new preset</div>
            )}
          </div>
        </div>

        {/* Save */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {isDirty && !saving && (
            <span style={{ fontSize: 12, color: 'var(--gold)', fontWeight: 700, flexShrink: 0 }}>● Unsaved</span>
          )}
          <button className="btn btn-green" style={{ flex: 1 }} onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save Tactics'}
          </button>
          {saveMsg && !isDirty && <span style={{ fontSize: 12, color: saveMsg === 'Save failed' ? 'var(--red)' : 'var(--green)' }}>{saveMsg}</span>}
        </div>
      </div>
    </div>
    </>
  )
}

// ─── Nav items ────────────────────────────────────────────────────────────────

const NAV: { key: Tab; label: string; icon: string }[] = [
  { key: 'overview',   label: 'Overview',   icon: '◈' },
  { key: 'squad',      label: 'Squad',      icon: '◉' },
  { key: 'fixtures',   label: 'Fixtures',   icon: '▦' },
  { key: 'standings',  label: 'Standings',  icon: '≡' },
  { key: 'stats',      label: 'Stats',      icon: '📊' },
]

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function League() {
  const isMobile = useIsMobile()
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [league, setLeague] = useState<LeagueData | null>(null)
  const [matches, setMatches] = useState<MatchData[]>([])
  const [tab, setTab] = useState<Tab>(() => {
    const t = (location.state as any)?.tab as Tab | undefined
    const valid: Tab[] = ['overview','squad','fixtures','standings','stats','tactics','manage']
    return t && valid.includes(t) ? t : 'overview'
  })
  const [notification, setNotification] = useState<string | null>(null)
  const [startingDraft, setStartingDraft] = useState(false)
  const [error, setError] = useState('')
  const [showSeasonEnd, setShowSeasonEnd] = useState(false)
  const [startingNewSeason, setStartingNewSeason] = useState(false)
  const [prevPositions] = useState<Record<string, number>>(() => {
    try { return JSON.parse(localStorage.getItem(`standings-pos-prev-${id ?? ''}`) ?? '{}') } catch { return {} }
  })
  const [bannerDismissed, setBannerDismissed] = useState(false)
  const [showLogoMaker, setShowLogoMaker] = useState(false)
  const [showDraftSummary, setShowDraftSummary] = useState(false)
  const myClubIdRef = useRef<string | undefined>(undefined)
  const myClubWagesRef = useRef<number>(0)
  const prevStatusRef = useRef<string | undefined>(undefined)

  const refresh = useCallback(() => {
    if (!id) return
    Promise.all([api.get(`/leagues/${id}`), api.get(`/leagues/${id}/matches`)]).then(([lr, mr]) => {
      setLeague(lr.data)
      setMatches(mr.data)
    })
  }, [id])

  useEffect(() => { refresh() }, [refresh])

  // Show season-end overlay when arriving at an already-finished league
  useEffect(() => {
    if (league?.status === 'FINISHED') setShowSeasonEnd(true)
  }, [league?.status])

  // Show draft summary when draft completes
  useEffect(() => {
    if (prevStatusRef.current === 'DRAFTING' && league?.status === 'ACTIVE') {
      setShowDraftSummary(true)
    }
    prevStatusRef.current = league?.status
  }, [league?.status])

  // Save standings positions to localStorage on matchday change.
  // Two keys: "curr" = latest positions, "prev" = snapshot before last matchday (used for arrows).
  const isFirstStandingsRun = useRef(true)
  useEffect(() => {
    if (!league || !id) return
    const sorted = [...league.clubs].sort((a, b) => b.points !== a.points ? b.points - a.points : (b.goalsFor - b.goalsAgainst) - (a.goalsFor - a.goalsAgainst))
    const pos: Record<string, number> = {}
    sorted.forEach((c, i) => { pos[c.id] = i + 1 })
    if (!isFirstStandingsRun.current) {
      const curr = localStorage.getItem(`standings-pos-curr-${id}`)
      if (curr) localStorage.setItem(`standings-pos-prev-${id}`, curr)
    }
    isFirstStandingsRun.current = false
    localStorage.setItem(`standings-pos-curr-${id}`, JSON.stringify(pos))
  }, [league?.currentDay])

  // Reset banner dismissed state on each new matchday
  useEffect(() => {
    setBannerDismissed(false)
  }, [league?.currentDay])

  useEffect(() => {
    if (!id) return
    const socket: Socket = io()
    socket.emit('join:league', id)
    socket.on('matchday:complete', (data: { matchday: number; results: Array<{ matchId: string; homeClubId: string; awayClubId: string; homeScore: number; awayScore: number }> }) => {
      const cid = myClubIdRef.current
      const mine = cid ? data.results.find(r => r.homeClubId === cid || r.awayClubId === cid) : null
      let msg: string
      if (mine) {
        const isHome = mine.homeClubId === cid
        const myScore  = isHome ? mine.homeScore : mine.awayScore
        const oppScore = isHome ? mine.awayScore : mine.homeScore
        const result   = myScore > oppScore ? 'W' : myScore === oppScore ? 'D' : 'L'
        msg = `MD${data.matchday} · ${result} ${myScore}–${oppScore}`
        const wages = myClubWagesRef.current
        if (wages > 0) msg += ` · -€${(wages / 1_000).toFixed(1)}k wages`
      } else {
        msg = `Matchday ${data.matchday} results are in!`
      }
      setNotification(msg)
      setTimeout(() => setNotification(null), 10000)
      refresh()
    })
    socket.on('sponsor:resolved', (data: { resolutions: Array<{ clubId: string; sponsorName: string; sponsorEmoji: string; completed: boolean; reward: number }> }) => {
      const cid = myClubIdRef.current
      const mine = cid ? data.resolutions.filter(r => r.clubId === cid) : []
      if (mine.length === 0) return
      const sponsorMsg = mine.map(r =>
        r.completed ? `${r.sponsorEmoji} ${r.sponsorName} +€${(r.reward / 1_000).toFixed(1)}k` : `${r.sponsorEmoji} ${r.sponsorName} failed`
      ).join(' · ')
      setNotification(prev => prev ? `${prev} · ${sponsorMsg}` : sponsorMsg)
    })
    socket.on('season:finished', () => {
      refresh()
      setShowSeasonEnd(true)
    })
    return () => { socket.disconnect() }
  }, [id, refresh])

  async function handleNewSeason() {
    setStartingNewSeason(true)
    try {
      await api.post(`/leagues/${id}/new-season`)
      setShowSeasonEnd(false)
      setTab('overview')
      refresh()
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Failed to start new season')
    } finally {
      setStartingNewSeason(false)
    }
  }

  async function handleStartDraft() {
    setError('')
    setStartingDraft(true)
    try {
      await api.post(`/leagues/${id}/draft/start`)
      navigate(`/league/${id}/draft`)
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Failed to start draft')
      setStartingDraft(false)
    }
  }

  async function handlePhysioUpgrade() {
    setError('')
    try {
      const res = await api.post(`/leagues/${id}/physio/upgrade`)
      setLeague(prev => prev ? { ...prev, clubs: prev.clubs.map(c => c.id === res.data.id ? { ...c, physioLevel: res.data.physioLevel, budget: res.data.budget } : c) } : prev)
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Upgrade failed')
    }
  }

  async function handleHeal(instanceId: string) {
    setError('')
    try {
      await api.post(`/leagues/${id}/heal/${instanceId}`)
      refresh()
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Heal failed')
    }
  }

  async function handleTrain(instanceId: string, position: string) {
    setError('')
    try {
      await api.post(`/leagues/${id}/train/${instanceId}`, { position })
      refresh()
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Training failed')
    }
  }

  if (!league) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg-base)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: 'var(--text-2)' }}>Loading...</div>
      </div>
    )
  }

  const myClub = league.clubs.find(c => c.user?.id === user?.id)
  myClubIdRef.current = myClub?.id
  myClubWagesRef.current = myClub?.squad.reduce((s, p) => s + p.wage, 0) ?? 0
  const isCreator = league.clubs.filter(c => !c.isAI)[0]?.user?.id === user?.id
  const starterIds = new Set(myClub?.tactic?.lineup?.map(s => s.instanceId) ?? [])
  const injuredStarters = myClub?.squad.filter(p => starterIds.has(p.id) && p.injured) ?? []
  const lowFitnessStarters = myClub?.squad.filter(p => starterIds.has(p.id) && !p.injured && p.fitness < 35) ?? []
  const hasLineupWarnings = (injuredStarters.length + lowFitnessStarters.length) > 0
  const navItems = [
    ...NAV,
    ...(myClub ? [{ key: 'tactics' as Tab, label: 'Tactics', icon: '⊞' }] : []),
    ...(myClub && league.status === 'ACTIVE' ? [{ key: 'transfers' as Tab, label: 'Transfers', icon: '⇄' }] : []),
    ...(isCreator ? [{ key: 'manage' as Tab, label: 'Manage', icon: '⊛' }] : []),
  ]

  const PAGE_TITLES: Record<Tab, string> = {
    overview: 'Overview',
    squad: 'My Squad',
    fixtures: 'Fixtures',
    standings: 'League Table',
    stats: 'Season Stats',
    tactics: 'Tactics & Lineup',
    transfers: 'Transfer Market',
    manage: 'Manage League',
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-base)' }}>

      {/* ── Logo maker modal ─────────────────────────────────────────────── */}
      {showLogoMaker && myClub && (
        <LogoMaker
          leagueId={league.id}
          clubName={myClub.name}
          initialConfig={myClub.logoConfig}
          onSaved={config => {
            setLeague(prev => prev ? {
              ...prev,
              clubs: prev.clubs.map(c => c.id === myClub.id ? { ...c, logoConfig: config } : c),
            } : prev)
            setShowLogoMaker(false)
          }}
          onClose={() => setShowLogoMaker(false)}
        />
      )}

      {/* ── Draft Summary Overlay ────────────────────────────────────────── */}
      {showDraftSummary && league.status === 'ACTIVE' && (
        <DraftSummaryOverlay league={league} onDismiss={() => setShowDraftSummary(false)} />
      )}

      {/* ── Season End Overlay ───────────────────────────────────────────── */}
      {showSeasonEnd && league.status === 'FINISHED' && (
        <SeasonEndOverlay
          league={league}
          isCreator={isCreator}
          startingNewSeason={startingNewSeason}
          onNewSeason={handleNewSeason}
          onDismiss={() => { setShowSeasonEnd(false); setTab('standings') }}
        />
      )}

      {/* ── Sidebar ──────────────────────────────────────────────────────── */}
      <aside style={{
        width: 220, background: 'var(--bg-card)', borderRight: '1px solid var(--border)',
        position: 'fixed', top: 0, bottom: 0, left: 0,
        display: isMobile ? 'none' : 'flex', flexDirection: 'column', zIndex: 50,
      }}>
        {/* Logo */}
        <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border)' }}>
          <Link to="/" className="nav-logo"><img src="/logo.png" alt="Football Manager" style={{ height: 28, display: 'block' }} /></Link>
        </div>

        {/* Club identity */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          {myClub ? (
            <>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <ClubBadge name={myClub.name} size={44} logoConfig={myClub.logoConfig} />
                <button
                  onClick={() => setShowLogoMaker(true)}
                  title="Customize club logo"
                  style={{ marginLeft: 'auto', background: 'none', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', padding: '3px 7px', fontSize: 11, color: 'var(--text-2)', lineHeight: 1.4 }}
                >
                  ✎ Logo
                </button>
              </div>
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-1)', marginTop: 10, lineHeight: 1.3 }}>{myClub.name}</div>
              <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 3 }}>{league.name}</div>
              <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className={`badge badge-${league.status.toLowerCase()}`} style={{ fontSize: 9 }}>{league.status}</span>
                {(league.status === 'ACTIVE' || league.status === 'FINISHED') && (
                  <span style={{ fontSize: 10, color: 'var(--text-2)' }}>MD {league.currentDay}/{league.seasonLength}</span>
                )}
              </div>
            </>
          ) : (
            <>
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-1)', lineHeight: 1.3 }}>{league.name}</div>
              <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 4 }}>Spectating</div>
            </>
          )}
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '8px 12px', overflowY: 'auto' }}>
          {navItems.map(item => {
            const active = tab === item.key
            return (
              <button key={item.key} onClick={() => setTab(item.key)} style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 12px', marginBottom: 2,
                background: active ? 'rgba(54,226,126,0.1)' : 'transparent',
                border: 'none', borderRadius: 'var(--radius-sm)',
                borderLeft: `3px solid ${active ? 'var(--green)' : 'transparent'}`,
                color: active ? 'var(--green)' : 'var(--text-2)',
                cursor: 'pointer', textAlign: 'left', fontSize: 13, fontWeight: active ? 700 : 500,
                transition: 'all 0.15s',
              }}
                onMouseEnter={e => { if (!active) { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-1)'; (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.04)' } }}
                onMouseLeave={e => { if (!active) { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-2)'; (e.currentTarget as HTMLButtonElement).style.background = 'transparent' } }}
              >
                <span style={{ fontFamily: 'monospace', fontSize: 15, lineHeight: 1, opacity: active ? 1 : 0.6 }}>{item.icon}</span>
                {item.label}
                {item.key === 'tactics' && hasLineupWarnings && (
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--red)', marginLeft: 'auto', flexShrink: 0 }} />
                )}
              </button>
            )
          })}
        </nav>

        {/* Budget */}
        {myClub && (
          <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 }}>Budget</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 800, color: 'var(--green)' }}>€{(myClub.budget / 1_000).toFixed(1)}M</div>
          </div>
        )}

        {/* User + back */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <button className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 8px' }} onClick={() => navigate('/')}>← Back</button>
          <span style={{ flex: 1 }} />
          <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{user?.username}</span>
        </div>
      </aside>

      {/* ── Mobile bottom nav ────────────────────────────────────────────── */}
      {isMobile && (
        <nav style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, height: 56,
          background: 'var(--bg-card)', borderTop: '1px solid var(--border)',
          display: 'flex', zIndex: 200, paddingBottom: 'env(safe-area-inset-bottom)',
        }}>
          {navItems.map(item => {
            const active = tab === item.key
            const showDot = item.key === 'tactics' && hasLineupWarnings
            return (
              <button key={item.key} onClick={() => setTab(item.key)} style={{
                flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', gap: 2, background: 'none', border: 'none',
                cursor: 'pointer', color: active ? 'var(--green)' : 'var(--text-3)',
                position: 'relative', padding: '4px 0',
              }}>
                <span style={{ fontSize: 18, lineHeight: 1 }}>{item.icon}</span>
                <span style={{ fontSize: 9, fontWeight: active ? 700 : 500 }}>{item.label}</span>
                {showDot && <span style={{ position: 'absolute', top: 4, right: '20%', width: 6, height: 6, borderRadius: '50%', background: 'var(--red)' }} />}
                {active && <span style={{ position: 'absolute', bottom: 0, left: '25%', right: '25%', height: 2, background: 'var(--green)', borderRadius: 1 }} />}
              </button>
            )
          })}
        </nav>
      )}

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <main style={{ marginLeft: isMobile ? 0 : 220, flex: 1, paddingBottom: isMobile ? 56 : 0, display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>

        {/* Top bar */}
        <div style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border)', padding: isMobile ? '12px 16px' : '16px 28px', display: 'flex', alignItems: 'center', gap: 16, position: 'sticky', top: 0, zIndex: 40 }}>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 800, letterSpacing: 0.5, margin: 0, color: 'var(--text-1)' }}>
            {PAGE_TITLES[tab]}
          </h1>
          {isMobile && myClub && (
            <span style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 500 }}>{myClub.name}</span>
          )}
          <div style={{ flex: 1 }} />

          {error && <span className="error-text" style={{ fontSize: 12 }}>{error}</span>}

          {notification && (
            <div style={{ padding: '7px 14px', background: 'var(--green-glow)', border: '1px solid var(--green)', borderRadius: 'var(--radius-sm)', fontSize: 12, color: 'var(--green)', display: 'flex', alignItems: 'center', gap: 8 }}>
              {notification}
              <button onClick={() => setNotification(null)} style={{ background: 'none', border: 'none', color: 'var(--green)', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>×</button>
            </div>
          )}

          {league.status === 'SETUP' && isCreator && (
            <button className="btn btn-green" onClick={handleStartDraft} disabled={startingDraft}>
              {startingDraft ? 'Starting...' : 'Start Draft'}
            </button>
          )}
          {league.status === 'DRAFTING' && (
            <button className="btn btn-gold" onClick={() => navigate(`/league/${id}/draft`)}>
              Go to Draft →
            </button>
          )}
          {!isMobile && (
            <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => navigator.clipboard.writeText(window.location.origin + '/?join=' + league.id)} title="Copy invite link">
              Copy invite link
            </button>
          )}
        </div>

        {/* Injury/fitness banner */}
        {league.status === 'ACTIVE' && !bannerDismissed && (injuredStarters.length > 0 || lowFitnessStarters.length > 0) && (
          <div style={{ background: 'rgba(255,60,60,0.08)', borderBottom: '1px solid rgba(255,60,60,0.25)', padding: '10px 28px', display: 'flex', alignItems: 'center', gap: 12, fontSize: 12, flexWrap: 'wrap' }}>
            <span style={{ color: 'var(--red)', fontWeight: 700 }}>⚠ Lineup alert:</span>
            {injuredStarters.map(p => <span key={p.id} style={{ color: 'var(--red)' }}>{p.player.name} (injured)</span>)}
            {lowFitnessStarters.map(p => <span key={p.id} style={{ color: 'var(--gold)' }}>{p.player.name} (low fitness)</span>)}
            <button onClick={() => setBannerDismissed(true)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-2)', fontSize: 16 }}>✕</button>
          </div>
        )}

        {/* Page content */}
        <div style={{ padding: isMobile ? '16px 12px' : '24px 28px', flex: 1 }}>
          {tab === 'overview'  && <Overview league={league} matches={matches} myClub={myClub} onPhysioUpgrade={handlePhysioUpgrade} onRefresh={refresh} />}
          {tab === 'squad'     && (myClub ? <Squad squad={myClub.squad} physioLevel={myClub.physioLevel} budget={myClub.budget} onHeal={handleHeal} onTrain={handleTrain} /> : <p style={{ color: 'var(--text-2)' }}>You don't have a club in this league.</p>)}
          {tab === 'fixtures'  && (matches.length === 0 ? <div style={{ textAlign: 'center', padding: '64px 0', color: 'var(--text-2)' }}><div style={{ fontSize: 36, marginBottom: 10 }}>📅</div><p>Fixtures will appear after the draft.</p></div> : <Fixtures matches={matches} clubs={league.clubs} myClubId={myClub?.id} currentDay={league.currentDay} leagueId={league.id} />)}
          {tab === 'standings' && <Standings clubs={league.clubs} myClubId={myClub?.id} prevPositions={prevPositions} matches={matches} history={league.history} />}
          {tab === 'stats'     && <Stats leagueId={league.id} status={league.status} />}
          {tab === 'tactics'   && myClub && (
            myClub.squad.length === 0
              ? <div style={{ textAlign: 'center', padding: '64px 0', color: 'var(--text-2)' }}><div style={{ fontSize: 36, marginBottom: 10 }}>⊞</div><p>Set your tactics after the draft.</p></div>
              : <Tactics leagueId={id!} myClub={myClub} onSaved={tactic => setLeague(prev => {
                  if (!prev) return prev
                  return { ...prev, clubs: prev.clubs.map(c => c.id === myClub.id ? { ...c, tactic } : c) }
                })} />
          )}
          {tab === 'transfers' && myClub && <Transfers leagueId={league.id} myClub={myClub} squadSize={league.squadSize} onRefresh={refresh} />}
          {tab === 'manage'    && isCreator && <Manage league={league} onUpdate={updated => setLeague(prev => prev ? { ...prev, ...updated } : prev)} onDelete={() => navigate('/')} />}
        </div>
      </main>
    </div>
  )
}
