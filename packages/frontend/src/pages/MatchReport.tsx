import { useEffect, useRef, useState } from 'react'
import { useParams, Link, useLocation, useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { ClubBadge, type LogoConfig } from '../components/ClubBadge'

function getBadgeColor(name: string): string {
  const palette = ['#27cdff','#36e27e','#e9c46a','#e8806a','#f97316','#a78bfa','#34d399','#fbbf24']
  let h = 0
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  return palette[Math.abs(h) % palette.length]
}

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
  position: string          // natural position (Player.position)
  positionPlayed: string | null  // assigned position this match
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
  homeClub: { id: string; name: string; logoConfig?: LogoConfig | null }
  awayClub: { id: string; name: string; logoConfig?: LogoConfig | null }
  homeScore: number | null
  awayScore: number | null
  stats: { home: TeamStats; away: TeamStats } | null
  events: MatchEvent[]
  performances: { home: PlayerPerf[]; away: PlayerPerf[] }
}

// ─── Small helpers ────────────────────────────────────────────────────────────

function ratingColor(r: number): string {
  if (r >= 8.5) return '#36e27e'
  if (r >= 7.5) return '#a8e36b'
  if (r >= 6.5) return '#e9c46a'
  if (r >= 6.0) return '#f0a26a'
  return '#e8806a'
}

function posClass(pos: string): string {
  if (pos === 'GK')                               return 'pos pos-gk'
  if (['CB','LB','RB'].includes(pos))             return 'pos pos-def'
  if (['CDM','CM','CAM','LM','RM'].includes(pos)) return 'pos pos-mid'
  return 'pos pos-att'
}

// Two-sided bar comparing home vs away value
function StatRow({ label, home, away, format = (n: number) => String(n) }: {
  label: string; home: number; away: number; format?: (n: number) => string
}) {
  const total = home + away || 1
  const homePct = (home / total) * 100
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
        <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: 'var(--text-1)' }}>{format(home)}</span>
        <span style={{ color: 'var(--text-2)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</span>
        <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: 'var(--text-1)' }}>{format(away)}</span>
      </div>
      <div style={{ height: 5, borderRadius: 3, overflow: 'hidden', display: 'flex', background: 'rgba(232,128,106,0.5)' }}>
        <div style={{ width: `${homePct}%`, background: 'var(--green)', transition: 'width 0.6s ease' }} />
      </div>
    </div>
  )
}

// ─── Replay Ticker ────────────────────────────────────────────────────────────

const REPLAY_SPEEDS = [
  { label: '1×', ms: 1200 },
  { label: '2×', ms: 600 },
  { label: '4×', ms: 300 },
]

function ReplayTicker({ match, onClose }: { match: MatchDetail; onClose: () => void }) {
  const allEvents = [...match.events].sort((a, b) => a.minute - b.minute)
  const [shown, setShown] = useState<number>(0)  // index of next event to reveal
  const [running, setRunning] = useState(true)
  const [speedIdx, setSpeedIdx] = useState(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const visibleEvents = allEvents.slice(0, shown)
  const goals = visibleEvents.filter(e => e.type === 'GOAL')
  const homeScore = goals.filter(e => e.team === 'home').length
  const awayScore = goals.filter(e => e.team === 'away').length

  const currentMinute = shown === 0 ? 0 : shown >= allEvents.length ? 90 : allEvents[shown - 1]?.minute ?? 0

  useEffect(() => {
    if (!running || shown >= allEvents.length) return
    timerRef.current = setTimeout(() => setShown(n => n + 1), REPLAY_SPEEDS[speedIdx].ms)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [running, shown, speedIdx, allEvents.length])

  const done = shown >= allEvents.length

  function eventIcon(type: string) {
    if (type === 'GOAL') return '⚽'
    if (type === 'YELLOW_CARD') return '🟨'
    if (type === 'RED_CARD') return '🟥'
    if (type === 'SUBSTITUTION') return '↕'
    if (type === 'OWN_GOAL') return '⚽'
    if (type === 'PENALTY_MISS') return '✗'
    return '•'
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, width: '100%', maxWidth: 520, maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, background: 'var(--bg-base)' }}>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-2)', flex: 1 }}>Match Replay</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-2)', fontSize: 18, lineHeight: 1, padding: '2px 6px' }}>✕</button>
        </div>
        {/* Score */}
        <div style={{ padding: '20px 24px 16px', textAlign: 'center', flexShrink: 0, borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
            {done ? 'Full Time' : `${currentMinute}'`}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 16 }}>
            <div style={{ textAlign: 'right', fontWeight: 700, fontSize: 14, color: 'var(--text-1)' }}>{match.homeClub.name}</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 42, fontWeight: 900, color: 'var(--text-1)', letterSpacing: 4, lineHeight: 1 }}>
              {homeScore}<span style={{ color: 'var(--text-3)', margin: '0 4px' }}>–</span>{awayScore}
            </div>
            <div style={{ textAlign: 'left', fontWeight: 700, fontSize: 14, color: 'var(--text-1)' }}>{match.awayClub.name}</div>
          </div>
        </div>
        {/* Events feed */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {shown === 0 && (
            <div style={{ textAlign: 'center', color: 'var(--text-3)', fontSize: 13, padding: '24px 0' }}>
              Kick off!
            </div>
          )}
          {[...visibleEvents].reverse().map((e, i) => {
            const isHome = e.team === 'home'
            const isSub = e.type === 'SUBSTITUTION'
            const isGoal = e.type === 'GOAL' || e.type === 'OWN_GOAL'
            return (
              <div key={e.id} style={{
                display: 'grid', gridTemplateColumns: '1fr 48px 1fr',
                alignItems: 'center', gap: 8, fontSize: 12,
                padding: '6px 8px', borderRadius: 6,
                background: i === 0 ? (isGoal ? 'rgba(54,226,126,0.1)' : 'rgba(255,255,255,0.04)') : 'transparent',
                border: i === 0 ? `1px solid ${isGoal ? 'rgba(54,226,126,0.25)' : 'rgba(255,255,255,0.08)'}` : '1px solid transparent',
                transition: 'all 0.3s',
              }}>
                {isHome ? (
                  <div style={{ textAlign: 'right', fontWeight: isGoal ? 700 : 400, color: isGoal ? 'var(--text-1)' : 'var(--text-2)' }}>
                    <span>{e.playerName ?? '?'}</span>
                    {isSub && <span style={{ color: 'var(--text-3)', margin: '0 3px' }}>▶</span>}
                    {isSub && <span style={{ color: 'var(--green)', fontWeight: 600 }}>{e.assistName ?? '?'}</span>}
                  </div>
                ) : <div />}
                <div style={{ textAlign: 'center', fontWeight: 700, color: 'var(--text-3)', fontSize: 11, lineHeight: 1.3 }}>
                  <div>{eventIcon(e.type)}</div>
                  <div>{e.minute}'</div>
                </div>
                {!isHome ? (
                  <div style={{ textAlign: 'left', fontWeight: isGoal ? 700 : 400, color: isGoal ? 'var(--text-1)' : 'var(--text-2)' }}>
                    {isSub && <span style={{ color: 'var(--green)', fontWeight: 600 }}>{e.assistName ?? '?'}</span>}
                    {isSub && <span style={{ color: 'var(--text-3)', margin: '0 3px' }}>▶</span>}
                    <span>{e.playerName ?? '?'}</span>
                  </div>
                ) : <div />}
              </div>
            )
          })}
          {done && allEvents.length === 0 && (
            <div style={{ textAlign: 'center', color: 'var(--text-3)', fontSize: 13, padding: '16px 0' }}>No events recorded.</div>
          )}
        </div>
        {/* Controls */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {!done ? (
            <button
              onClick={() => setRunning(r => !r)}
              style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 700, color: 'var(--text-1)', minWidth: 48 }}
            >
              {running ? '⏸' : '▶'}
            </button>
          ) : (
            <button
              onClick={() => { setShown(0); setRunning(true) }}
              style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 700, color: 'var(--green)' }}
            >
              ↺ Replay
            </button>
          )}
          <div style={{ display: 'flex', gap: 4 }}>
            {REPLAY_SPEEDS.map((s, i) => (
              <button key={s.label} onClick={() => setSpeedIdx(i)} style={{
                background: speedIdx === i ? 'rgba(54,226,126,0.15)' : 'var(--bg-base)',
                border: `1px solid ${speedIdx === i ? 'rgba(54,226,126,0.4)' : 'var(--border)'}`,
                borderRadius: 6, padding: '4px 10px', cursor: 'pointer',
                fontSize: 11, fontWeight: 700,
                color: speedIdx === i ? 'var(--green)' : 'var(--text-2)',
              }}>{s.label}</button>
            ))}
          </div>
          <span style={{ flex: 1 }} />
          {done && <span style={{ fontSize: 11, color: 'var(--green)', fontWeight: 700 }}>Full Time</span>}
        </div>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function MatchReport() {
  const { id: leagueId, matchId } = useParams<{ id: string; matchId: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const backTab: string = (location.state as any)?.tab ?? 'fixtures'
  const [match, setMatch] = useState<MatchDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [siblingIds, setSiblingIds] = useState<string[]>([])
  const [showReplay, setShowReplay] = useState(false)

  useEffect(() => {
    if (!leagueId || !matchId) return
    api.get(`/leagues/${leagueId}/matches/${matchId}`)
      .then((r: { data: MatchDetail }) => setMatch(r.data))
      .catch(() => setError('Match not found'))
      .finally(() => setLoading(false))
  }, [leagueId, matchId])

  useEffect(() => {
    if (!leagueId) return
    api.get(`/leagues/${leagueId}/matches`)
      .then((r: { data: Array<{ id: string; matchday: number; status: string }> }) => {
        const ids = r.data
          .filter(m => m.status === 'SIMULATED')
          .sort((a, b) => a.matchday - b.matchday || a.id.localeCompare(b.id))
          .map(m => m.id)
        setSiblingIds(ids)
      })
      .catch(() => {})
  }, [leagueId])

  if (loading) return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-2)' }}>
      Loading match…
    </div>
  )
  if (error || !match) return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--red)' }}>
      {error || 'Match not found'}
    </div>
  )

  const h = match.homeScore ?? 0
  const a = match.awayScore ?? 0
  const homeWin = h > a, awayWin = a > h

  const goals    = match.events.filter(e => e.type === 'GOAL')
  const cards    = match.events.filter(e => e.type === 'YELLOW_CARD' || e.type === 'RED_CARD')
  const subs     = match.events.filter(e => e.type === 'SUBSTITUTION')
  const timeline = [...goals, ...cards, ...subs].sort((a, b) => a.minute - b.minute)

  const homeGoals = goals.filter(e => e.team === 'home')
  const awayGoals = goals.filter(e => e.team === 'away')

  // Group goals per scorer: "Messi 12' 34'"
  function goalLines(evts: MatchEvent[]) {
    const map: Record<string, number[]> = {}
    for (const e of evts) {
      const name = e.playerName ?? '?'
      ;(map[name] ??= []).push(e.minute)
    }
    return Object.entries(map).map(([name, mins]) => `${name} ${mins.map(m => `${m}'`).join(' ')}`)
  }

  // MOTM — highest rated player
  const allPerfs = [...match.performances.home, ...match.performances.away]
  const motm = allPerfs.length ? allPerfs.reduce((best, p) => p.rating > best.rating ? p : best) : null
  const motmTeam = motm && match.performances.home.find(p => p.instanceId === motm.instanceId)
    ? match.homeClub.name
    : match.awayClub.name

  const card: React.CSSProperties = {
    background: 'var(--bg-card)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius)', padding: '20px 24px',
  }
  const secLabel: React.CSSProperties = {
    fontSize: 10, fontWeight: 800, letterSpacing: '0.12em',
    textTransform: 'uppercase', color: 'var(--text-2)', marginBottom: 14,
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', padding: '24px 16px' }}>
      {showReplay && <ReplayTicker match={match} onClose={() => setShowReplay(false)} />}
      <div style={{ maxWidth: 860, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Back + prev/next */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Link to={`/league/${leagueId}`} state={{ tab: backTab }} style={{ color: 'var(--text-2)', fontSize: 13, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            ← Back to league
          </Link>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button
              onClick={() => setShowReplay(true)}
              style={{ background: 'rgba(54,226,126,0.1)', border: '1px solid rgba(54,226,126,0.3)', borderRadius: 'var(--radius-xs)', padding: '5px 12px', cursor: 'pointer', color: 'var(--green)', fontSize: 12, fontWeight: 700 }}
            >
              ▶ Replay
            </button>
            {siblingIds.length > 1 && (() => {
              const idx = siblingIds.indexOf(matchId ?? '')
              const prevId = idx > 0 ? siblingIds[idx - 1] : null
              const nextId = idx < siblingIds.length - 1 ? siblingIds[idx + 1] : null
              return (
                <>
                  <button onClick={() => prevId && navigate(`/league/${leagueId}/match/${prevId}`, { state: { tab: backTab } })} disabled={!prevId} style={{ background: 'var(--bg-card-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xs)', padding: '5px 10px', cursor: prevId ? 'pointer' : 'not-allowed', color: prevId ? 'var(--text-1)' : 'var(--text-3)', fontSize: 13 }}>‹ Prev</button>
                  <button onClick={() => nextId && navigate(`/league/${leagueId}/match/${nextId}`, { state: { tab: backTab } })} disabled={!nextId} style={{ background: 'var(--bg-card-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xs)', padding: '5px 10px', cursor: nextId ? 'pointer' : 'not-allowed', color: nextId ? 'var(--text-1)' : 'var(--text-3)', fontSize: 13 }}>Next ›</button>
                </>
              )
            })()}
          </div>
        </div>

        {/* ── Score header ──────────────────────────────── */}
        <div style={{ ...card, padding: '28px 32px' }}>
          <div style={{ fontSize: 11, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700, textAlign: 'center', marginBottom: 24 }}>
            Matchday {match.matchday} · Full Time
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 16 }}>

            {/* Home team */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
              <ClubBadge name={match.homeClub.name} size={56} logoConfig={match.homeClub.logoConfig} />
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 800, color: homeWin ? 'var(--text-1)' : 'var(--text-2)', textAlign: 'right' }}>
                {match.homeClub.name}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Home</div>
              <div style={{ textAlign: 'right', marginTop: 4 }}>
                {goalLines(homeGoals).map(line => (
                  <div key={line} style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.7 }}>⚽ {line}</div>
                ))}
              </div>
            </div>

            {/* Score */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 64, fontWeight: 900, letterSpacing: 6, lineHeight: 1, color: 'var(--text-1)' }}>
                {h}<span style={{ color: 'var(--text-3)', margin: '0 6px' }}>–</span>{a}
              </div>
              <div style={{
                fontSize: 12, fontWeight: 800, padding: '3px 12px', borderRadius: 20, letterSpacing: 0.5,
                background: homeWin ? 'rgba(54,226,126,0.12)' : awayWin ? 'rgba(232,128,106,0.12)' : 'rgba(255,255,255,0.06)',
                color: homeWin ? 'var(--green)' : awayWin ? 'var(--red)' : 'var(--text-3)',
                border: `1px solid ${homeWin ? 'rgba(54,226,126,0.3)' : awayWin ? 'rgba(232,128,106,0.3)' : 'var(--border)'}`,
              }}>
                {homeWin ? `${match.homeClub.name} Win` : awayWin ? `${match.awayClub.name} Win` : 'Draw'}
              </div>
              {match.simulatedAt && (
                <div style={{ fontSize: 10, color: 'var(--text-3)' }}>
                  {new Date(match.simulatedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                </div>
              )}
            </div>

            {/* Away team */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6 }}>
              <ClubBadge name={match.awayClub.name} size={56} logoConfig={match.awayClub.logoConfig} />
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 800, color: awayWin ? 'var(--text-1)' : 'var(--text-2)' }}>
                {match.awayClub.name}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Away</div>
              <div style={{ marginTop: 4 }}>
                {goalLines(awayGoals).map(line => (
                  <div key={line} style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.7 }}>⚽ {line}</div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── MOTM ──────────────────────────────────────── */}
        {motm && (
          <div style={{ ...card, background: 'linear-gradient(135deg, rgba(54,226,126,0.08) 0%, var(--bg-card) 60%)', border: '1px solid rgba(54,226,126,0.25)' }}>
            <div style={{ ...secLabel, color: 'var(--green)' }}>Man of the Match</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{
                width: 56, height: 56, borderRadius: '50%',
                background: getBadgeColor(motm.playerName),
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 18, fontWeight: 900, color: '#000', flexShrink: 0,
              }}>
                {motm.playerName.split(' ').map(w => w[0]).slice(0, 2).join('')}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--text-1)', marginBottom: 4 }}>{motm.playerName}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className={posClass(motm.positionPlayed ?? motm.position)} style={{ fontSize: 10 }}>{motm.positionPlayed ?? motm.position}</span>
                  {motm.positionPlayed && motm.positionPlayed !== motm.position && (
                    <span style={{ fontSize: 10, color: 'var(--text-3)', background: 'var(--bg-card-2)', border: '1px solid var(--border)', borderRadius: 3, padding: '0 4px' }} title="Natural position">{motm.position}</span>
                  )}
                  <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{motmTeam}</span>
                  {motm.goals > 0 && <span style={{ fontSize: 12, color: 'var(--text-2)' }}>⚽ {motm.goals}</span>}
                  {motm.assists > 0 && <span style={{ fontSize: 12, color: 'var(--text-2)' }}>🅰️ {motm.assists}</span>}
                  <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{motm.minutesPlayed}'</span>
                </div>
              </div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 44, fontWeight: 900, color: ratingColor(motm.rating), lineHeight: 1 }}>
                {motm.rating.toFixed(1)}
              </div>
            </div>
          </div>
        )}

        {/* ── Timeline + Stats side by side ─────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 16 }}>

          {/* Timeline */}
          <div style={card}>
            <div style={secLabel}>Timeline</div>
            {timeline.length === 0 ? (
              <div style={{ color: 'var(--text-2)', fontSize: 13 }}>No events recorded.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {timeline.map(e => {
                  const isHome = e.team === 'home'
                  const isSub = e.type === 'SUBSTITUTION'
                  const isYellow = e.type === 'YELLOW_CARD'
                  const isRed = e.type === 'RED_CARD'
                  const icon = isSub ? '↕' : isYellow ? '🟨' : isRed ? '🟥' : '⚽'

                  const nameBlock = isSub ? (
                    <span>
                      <span style={{ color: 'var(--red)', fontWeight: 600 }}>{e.playerName ?? '?'}</span>
                      <span style={{ color: 'var(--text-3)', margin: '0 3px' }}>▶</span>
                      <span style={{ color: 'var(--green)', fontWeight: 600 }}>{e.assistName ?? '?'}</span>
                    </span>
                  ) : (
                    <span>
                      <span style={{ fontWeight: 600 }}>{e.playerName ?? '?'}</span>
                      {e.assistName && <span style={{ fontSize: 11, color: 'var(--text-2)' }}> ({e.assistName})</span>}
                    </span>
                  )

                  return (
                    <div key={e.id} style={{ display: 'grid', gridTemplateColumns: '1fr 52px 1fr', alignItems: 'center', gap: 4, fontSize: 12 }}>
                      {isHome
                        ? <div style={{ textAlign: 'right' }}>{nameBlock}</div>
                        : <div />}
                      <div style={{ textAlign: 'center', color: 'var(--text-2)', fontWeight: 700, fontSize: 11 }}>
                        {icon} {e.minute}'
                      </div>
                      {!isHome
                        ? <div style={{ textAlign: 'left' }}>{nameBlock}</div>
                        : <div />}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Stats */}
          {match.stats ? (
            <div style={card}>
              <div style={{ ...secLabel, marginBottom: 10 }}>Match Stats</div>
              {/* Team name labels */}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 700, color: 'var(--text-2)', marginBottom: 12 }}>
                <span>{match.homeClub.name}</span>
                <span>{match.awayClub.name}</span>
              </div>
              <StatRow
                label="Possession"
                home={match.stats.home.possession}
                away={match.stats.away.possession}
                format={n => `${n}%`}
              />
              <StatRow label="Shots" home={match.stats.home.shots} away={match.stats.away.shots} />
              <StatRow label="On Target" home={match.stats.home.shotsOnTarget} away={match.stats.away.shotsOnTarget} />
              <StatRow
                label="xG"
                home={match.stats.home.xG}
                away={match.stats.away.xG}
                format={n => n.toFixed(2)}
              />
              <StatRow label="Yellow Cards" home={match.stats.home.yellowCards} away={match.stats.away.yellowCards} />
              {(match.stats.home.redCards > 0 || match.stats.away.redCards > 0) && (
                <StatRow label="Red Cards" home={match.stats.home.redCards} away={match.stats.away.redCards} />
              )}
            </div>
          ) : <div />}
        </div>

        {/* ── Player ratings ────────────────────────────── */}
        {allPerfs.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {([
              { club: match.homeClub, perfs: match.performances.home },
              { club: match.awayClub, perfs: match.performances.away },
            ] as const).map(({ club, perfs }) => (
              <div key={club.id} style={card}>
                <div style={{ ...secLabel, marginBottom: 6 }}>{club.name}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {perfs.map(p => {
                    const displayPos = p.positionPlayed ?? p.position
                    const isCrossRole = p.positionPlayed && p.positionPlayed !== p.position
                    return (
                    <div key={p.instanceId} style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px',
                      borderRadius: 6,
                      background: p === motm ? 'rgba(54,226,126,0.06)' : 'transparent',
                      border: `1px solid ${p === motm ? 'rgba(54,226,126,0.2)' : 'transparent'}`,
                    }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, minWidth: 30 }}>
                        <span className={posClass(displayPos)} style={{ fontSize: 9 }}>{displayPos}</span>
                        {isCrossRole && (
                          <span style={{ fontSize: 8, color: 'var(--text-3)', lineHeight: 1 }} title="Natural position">{p.position}</span>
                        )}
                      </div>
                      <span style={{ flex: 1, fontSize: 13, fontWeight: p.goals > 0 ? 700 : 500, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.playerName}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                        {p.goals > 0   && <span style={{ fontSize: 11 }}>⚽{p.goals}</span>}
                        {p.assists > 0 && <span style={{ fontSize: 11 }}>🅰️{p.assists}</span>}
                        {p.minutesPlayed < 90 && (
                          <span style={{ fontSize: 10, color: 'var(--text-3)' }}>{p.minutesPlayed}'</span>
                        )}
                        <span style={{
                          fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 15,
                          color: ratingColor(p.rating), minWidth: 34, textAlign: 'right',
                        }}>
                          {p.rating.toFixed(1)}
                        </span>
                      </div>
                    </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  )
}
