import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useNavigate, Link, useLocation } from 'react-router-dom'
import { io, type Socket } from 'socket.io-client'
import { useAuth } from '../../stores/auth.store'
import { api } from '../../api/client'
import { ClubBadge, LogoMaker } from '../../components/ClubBadge'
import { type KitConfig } from '../../components/KitSvg'
import { KitDesigner } from '../../components/KitDesigner'
import { posClass } from '../../utils/helpers'
import Overview from './Overview'
import Squad from './Squad'
import Fixtures, { DraftSummaryOverlay } from './Fixtures'
import Standings from './Standings'
import Stats from './Stats'
import Tactics from './Tactics'
import Transfers from './Transfers'
import Messages from './Messages'
import Manage from './Manage'
import Management from './Management'
import Cup from './Cup'
import {
  useIsMobile,
  type LeagueData,
  type ClubData,
  type MatchData,
  type MatchdayAwards,
  type GrowthChange,
  type LiveMatchState,
  type Tab,
} from './types'

// ─── Season End Overlay ───────────────────────────────────────────────────────

function SeasonEndOverlay({ league, myClub, isCreator, startingNewSeason, onNewSeason, onDismiss }: {
  league: LeagueData
  myClub?: ClubData
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
  const prospects = myClub
    ? [...myClub.squad]
        .filter(p => p.player.age <= 24 && p.player.potential - p.player.overall >= 5)
        .sort((a, b) => (b.player.potential - b.player.overall) - (a.player.potential - a.player.overall))
        .slice(0, 4)
    : []
  const veterans = myClub
    ? [...myClub.squad]
        .filter(p => p.player.age >= 31)
        .sort((a, b) => b.player.age - a.player.age)
        .slice(0, 3)
    : []

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

        {/* Development outlook */}
        {(prospects.length > 0 || veterans.length > 0) && (
          <div style={{ padding: '12px 32px', borderTop: '1px solid var(--border)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--text-2)', marginBottom: 10 }}>
              Development Outlook
            </div>
            {prospects.length > 0 && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 10, color: 'var(--green)', fontWeight: 700, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Rising Talent</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {prospects.map(p => (
                    <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                      <span className={posClass(p.player.position)} style={{ fontSize: 9 }}>{p.player.position}</span>
                      <span style={{ flex: 1, color: 'var(--text-1)' }}>{p.player.name}</span>
                      <span style={{ color: 'var(--text-3)' }}>Age {p.player.age}</span>
                      <span style={{ color: 'var(--text-2)' }}>{p.player.overall} OVR</span>
                      <span style={{ color: 'var(--green)', fontWeight: 700 }}>→ {p.player.potential} POT</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {veterans.length > 0 && (
              <div>
                <div style={{ fontSize: 10, color: 'var(--gold)', fontWeight: 700, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Aging Players</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {veterans.map(p => (
                    <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                      <span className={posClass(p.player.position)} style={{ fontSize: 9 }}>{p.player.position}</span>
                      <span style={{ flex: 1, color: 'var(--text-1)' }}>{p.player.name}</span>
                      <span style={{ color: 'var(--gold)' }}>Age {p.player.age}</span>
                      <span style={{ color: 'var(--text-2)' }}>{p.player.overall} OVR</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

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

// ─── Nav items ────────────────────────────────────────────────────────────────

const NAV: { key: Tab; label: string; icon: string }[] = [
  { key: 'overview',   label: 'Overview',   icon: '◈' },
  { key: 'squad',      label: 'Squad',      icon: '◉' },
  { key: 'fixtures',   label: 'Fixtures',   icon: '▦' },
  { key: 'standings',  label: 'Standings',  icon: '≡' },
  { key: 'stats',      label: 'Stats',      icon: '📊' },
]

// ─── Live Ticker Overlay ──────────────────────────────────────────────────────

function LiveTicker({ matches, myClubId, onDismiss }: { matches: Map<string, LiveMatchState>; myClubId: string | undefined; onDismiss: () => void }) {
  const matchList = [...matches.values()]
  const myMatch = myClubId
    ? matchList.find(m => m.homeClub.id === myClubId || m.awayClub.id === myClubId)
    : null
  const otherMatches = matchList.filter(m => m !== myMatch)
  const allEnded = matchList.every(m => m.status === 'ended')

  const EVENT_ICON: Record<string, string> = {
    GOAL: '⚽', OWN_GOAL: '⚽', YELLOW_CARD: '🟨', RED_CARD: '🟥', SUBSTITUTION: '🔄', PENALTY_MISS: '❌',
  }

  const renderEvent = (evt: LiveMatchState['events'][number], m: LiveMatchState) => {
    const d = evt.detail as any
    const isHome = d?.team === 'home'
    const name = evt.eventType === 'SUBSTITUTION'
      ? (d?.outName ?? '?')
      : (d?.playerName ?? d?.name ?? '?')
    return (
      <div key={`${evt.minute}-${evt.eventType}`} style={{ fontSize: 11, color: 'var(--text-2)', display: 'flex', gap: 6, alignItems: 'center' }}>
        <span style={{ color: 'var(--text-3)', minWidth: 28 }}>{evt.minute}'</span>
        <span>{EVENT_ICON[evt.eventType] ?? '•'}</span>
        <span style={{ color: evt.eventType === 'GOAL' ? 'var(--green)' : evt.eventType === 'RED_CARD' ? 'var(--red)' : 'var(--text-1)' }}>{name}</span>
        <span style={{ color: 'var(--text-3)' }}>({isHome ? m.homeClub.name : m.awayClub.name})</span>
      </div>
    )
  }

  return (
    <div style={{
      position: 'fixed', bottom: 16, right: 16, zIndex: 300,
      display: 'flex', flexDirection: 'column', gap: 8,
      maxWidth: 360, width: '100%',
    }}>
      {/* My match — prominent */}
      {myMatch && (
        <div style={{ background: 'var(--bg-card)', border: `1px solid ${myMatch.status === 'live' ? 'rgba(232,128,106,0.5)' : 'var(--border)'}`, borderRadius: 'var(--radius)', overflow: 'hidden', boxShadow: '0 4px 24px rgba(0,0,0,0.4)' }}>
          <div style={{ padding: '8px 14px', background: myMatch.status === 'live' ? 'rgba(232,128,106,0.1)' : 'rgba(54,226,126,0.08)', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, color: myMatch.status === 'live' ? 'var(--red)' : 'var(--green)' }}>
              {myMatch.status === 'live' ? '● LIVE' : '✓ FT'}
            </span>
            <span style={{ flex: 1 }} />
            <button onClick={onDismiss} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: 16, lineHeight: 1, padding: 0 }}>×</button>
          </div>
          <div style={{ padding: '12px 14px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 12, marginBottom: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)' }}>{myMatch.homeClub.name}</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 900, color: 'var(--text-1)', textAlign: 'center', minWidth: 60 }}>
                {myMatch.homeScore} – {myMatch.awayScore}
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)', textAlign: 'right' }}>{myMatch.awayClub.name}</div>
            </div>
            {myMatch.events.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 120, overflowY: 'auto' }}>
                {[...myMatch.events].reverse().slice(0, 8).reverse().map(evt => renderEvent(evt, myMatch))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Other matches — compact */}
      {otherMatches.length > 0 && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden', boxShadow: '0 4px 24px rgba(0,0,0,0.4)' }}>
          <div style={{ padding: '6px 14px', borderBottom: '1px solid var(--border)', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-3)' }}>Other Matches</div>
          <div style={{ padding: '6px 0' }}>
            {otherMatches.map(m => (
              <div key={m.matchId} style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 8, padding: '4px 14px' }}>
                <div style={{ fontSize: 11, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.homeClub.name}</div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 800, color: 'var(--text-1)', minWidth: 40, textAlign: 'center' }}>{m.homeScore}–{m.awayScore}</div>
                <div style={{ fontSize: 11, color: 'var(--text-2)', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.awayClub.name}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {allEnded && (
        <button className="btn btn-ghost" style={{ fontSize: 11, padding: '6px 12px', alignSelf: 'flex-end' }} onClick={onDismiss}>
          Dismiss
        </button>
      )}
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function League() {
  const isMobile = useIsMobile()
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [league, setLeague] = useState<LeagueData | null>(null)
  const [matches, setMatches] = useState<MatchData[]>([])
  const [awards, setAwards] = useState<MatchdayAwards | null>(null)
  const [tab, setTab] = useState<Tab>(() => {
    const t = (location.state as any)?.tab as Tab | undefined
    const valid: Tab[] = ['overview','squad','fixtures','standings','stats','tactics','transfers','messages','manage','management','cup']
    return t && valid.includes(t) ? t : 'overview'
  })
  const [notification, setNotification] = useState<string | null>(null)
  const [startingDraft, setStartingDraft] = useState(false)
  const [draftType, setDraftType] = useState<'SNAKE' | 'AUCTION'>('SNAKE')
  const [error, setError] = useState('')
  const [showSeasonEnd, setShowSeasonEnd] = useState(false)
  const [startingNewSeason, setStartingNewSeason] = useState(false)
  const [growthChanges, setGrowthChanges] = useState<GrowthChange[]>([])
  const [showGrowthReport, setShowGrowthReport] = useState(false)
  const [liveMatches, setLiveMatches] = useState<Map<string, LiveMatchState>>(new Map())
  const [showLiveTicker, setShowLiveTicker] = useState(false)
  const [prevPositions] = useState<Record<string, number>>(() => {
    try { return JSON.parse(localStorage.getItem(`standings-pos-prev-${id ?? ''}`) ?? '{}') } catch { return {} }
  })
  const [bannerDismissed, setBannerDismissed] = useState(false)
  const [showLogoMaker, setShowLogoMaker] = useState(false)
  const [showKitDesigner, setShowKitDesigner] = useState(false)
  const [showDraftSummary, setShowDraftSummary] = useState(false)
  const myClubIdRef = useRef<string | undefined>(undefined)
  const myClubWagesRef = useRef<number>(0)
  const prevStatusRef = useRef<string | undefined>(undefined)

  const refresh = useCallback(() => {
    if (!id) return
    Promise.all([
      api.get(`/leagues/${id}`),
      api.get(`/leagues/${id}/matches`),
      api.get(`/leagues/${id}/awards`),
    ]).then(([lr, mr, ar]) => {
      setLeague(lr.data)
      setMatches(mr.data)
      setAwards(ar.data)
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
    socket.on('matchday:complete', (data: { matchday: number; results: Array<{ matchId: string; homeClubId: string; awayClubId: string; homeScore: number; awayScore: number }>; awards?: MatchdayAwards | null }) => {
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
      if (data.awards?.motm) msg += ` · MOTM: ${data.awards.motm.playerName}`
      setNotification(msg)
      setTimeout(() => setNotification(null), 10000)
      if (data.awards) setAwards(data.awards)
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
    socket.on('match:live', (data: { type: string; matchId: string; homeClub?: { id: string; name: string }; awayClub?: { id: string; name: string }; homeScore?: number; awayScore?: number; minute?: number; eventType?: string; detail?: unknown }) => {
      if (data.type === 'start') {
        setLiveMatches(prev => {
          const next = new Map(prev)
          next.set(data.matchId, {
            matchId: data.matchId,
            homeClub: data.homeClub!,
            awayClub: data.awayClub!,
            homeScore: 0, awayScore: 0,
            events: [], status: 'live',
          })
          return next
        })
        setShowLiveTicker(true)
      } else if (data.type === 'event') {
        setLiveMatches(prev => {
          const next = new Map(prev)
          const m = next.get(data.matchId)
          if (m) {
            next.set(data.matchId, {
              ...m,
              homeScore: data.homeScore ?? m.homeScore,
              awayScore: data.awayScore ?? m.awayScore,
              events: [...m.events, { minute: data.minute!, eventType: data.eventType!, detail: data.detail, homeScore: data.homeScore ?? m.homeScore, awayScore: data.awayScore ?? m.awayScore }],
            })
          }
          return next
        })
      } else if (data.type === 'end') {
        setLiveMatches(prev => {
          const next = new Map(prev)
          const m = next.get(data.matchId)
          if (m) next.set(data.matchId, { ...m, homeScore: data.homeScore ?? m.homeScore, awayScore: data.awayScore ?? m.awayScore, status: 'ended' })
          return next
        })
      }
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
      const r = await api.post(`/leagues/${id}/new-season`)
      const changes: GrowthChange[] = r.data.growthChanges ?? []
      const myClubId = myClubIdRef.current
      const myChanges = myClubId ? changes.filter(c => c.clubId === myClubId) : []
      if (myChanges.length > 0) {
        setGrowthChanges(myChanges)
        setShowGrowthReport(true)
      }
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
      await api.post(`/leagues/${id}/draft/start`, { type: draftType })
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
  const nextMatchday = league.currentDay + 1
  const injuredStarters = myClub?.squad.filter(p => starterIds.has(p.id) && p.injured) ?? []
  const suspendedStarters = myClub?.squad.filter(p => starterIds.has(p.id) && p.suspendedMatchday === nextMatchday) ?? []
  const lowFitnessStarters = myClub?.squad.filter(p => starterIds.has(p.id) && !p.injured && p.suspendedMatchday !== nextMatchday && p.fitness < 35) ?? []
  const hasLineupWarnings = (injuredStarters.length + suspendedStarters.length + lowFitnessStarters.length) > 0
  const navItems = [
    ...NAV,
    ...(myClub ? [{ key: 'tactics' as Tab, label: 'Tactics', icon: '⊞' }] : []),
    ...(myClub && league.status === 'ACTIVE' ? [{ key: 'transfers' as Tab, label: 'Transfers', icon: '⇄' }] : []),
    ...(myClub && league.status === 'ACTIVE' ? [{ key: 'messages' as Tab, label: 'Messages', icon: '✉' }] : []),
    ...(isCreator ? [{ key: 'manage' as Tab, label: 'Manage', icon: '⊛' }] : []),
    ...(myClub && league.status === 'ACTIVE' ? [{ key: 'management' as Tab, label: 'Club', icon: '⬆' }] : []),
    ...(league.hasCup ? [{ key: 'cup' as Tab, label: 'Cup', icon: '🏆' }] : []),
  ]

  const PAGE_TITLES: Record<Tab, string> = {
    overview: 'Overview',
    squad: 'My Squad',
    fixtures: 'Fixtures',
    standings: 'League Table',
    stats: 'Season Stats',
    tactics: 'Tactics & Lineup',
    transfers: 'Transfer Market',
    messages: 'Messages',
    manage: 'Manage League',
    management: 'Club Management',
    cup: 'Cup Bracket',
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

      {/* ── Kit designer modal ───────────────────────────────────────────── */}
      {showKitDesigner && myClub && (
        <KitDesigner
          leagueId={league.id}
          clubName={myClub.name}
          initialConfig={myClub.kitConfig as KitConfig | null}
          onSaved={config => {
            setLeague(prev => prev ? {
              ...prev,
              clubs: prev.clubs.map(c => c.id === myClub.id ? { ...c, kitConfig: config } : c),
            } : prev)
            setShowKitDesigner(false)
          }}
          onClose={() => setShowKitDesigner(false)}
        />
      )}

      {/* ── Draft Summary Overlay ────────────────────────────────────────── */}
      {showDraftSummary && league.status === 'ACTIVE' && (
        <DraftSummaryOverlay league={league} onDismiss={() => setShowDraftSummary(false)} />
      )}

      {/* ── Live Ticker ──────────────────────────────────────────────────── */}
      {showLiveTicker && liveMatches.size > 0 && (
        <LiveTicker
          matches={liveMatches}
          myClubId={myClub?.id}
          onDismiss={() => { setShowLiveTicker(false); setLiveMatches(new Map()) }}
        />
      )}

      {/* ── Growth Report Modal ──────────────────────────────────────────── */}
      {showGrowthReport && growthChanges.length > 0 && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 210, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', maxWidth: 500, width: '100%', maxHeight: '80vh', overflowY: 'auto' }}>
            <div style={{ padding: '24px 28px 16px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 800, color: 'var(--text-1)', marginBottom: 4 }}>Player Development</div>
              <div style={{ fontSize: 12, color: 'var(--text-2)' }}>Changes after the off-season</div>
            </div>
            <div style={{ padding: '16px 28px', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {[...growthChanges].sort((a, b) => (b.overallNow - b.overallWas) - (a.overallNow - a.overallWas)).map(c => {
                const delta = c.overallNow - c.overallWas
                const color = delta > 0 ? 'var(--green)' : delta < 0 ? 'var(--red)' : 'var(--text-3)'
                return (
                  <div key={c.playerId} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto auto', alignItems: 'center', gap: 8, padding: '7px 10px', background: 'var(--bg-card-2)', borderRadius: 'var(--radius-xs)' }}>
                    <span className={posClass(c.position)} style={{ fontSize: 9 }}>{c.position}</span>
                    <span style={{ fontSize: 13, color: 'var(--text-1)' }}>{c.playerName}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Age {c.ageWas + 1}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color, minWidth: 48, textAlign: 'right' }}>
                      {delta > 0 ? `+${delta}` : delta === 0 ? '±0' : delta} ({c.overallNow})
                    </span>
                  </div>
                )
              })}
            </div>
            <div style={{ padding: '14px 28px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-primary" onClick={() => setShowGrowthReport(false)}>Got It</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Season End Overlay ───────────────────────────────────────────── */}
      {showSeasonEnd && league.status === 'FINISHED' && (
        <SeasonEndOverlay
          league={league}
          myClub={myClub}
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
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                  <button
                    onClick={() => setShowLogoMaker(true)}
                    title="Customize club logo"
                    style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', padding: '3px 7px', fontSize: 11, color: 'var(--text-2)', lineHeight: 1.4 }}
                  >
                    ✎ Logo
                  </button>
                  <button
                    onClick={() => setShowKitDesigner(true)}
                    title="Design club kit"
                    style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', padding: '3px 7px', fontSize: 11, color: 'var(--text-2)', lineHeight: 1.4 }}
                  >
                    ✎ Kit
                  </button>
                </div>
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
            <div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                {(['SNAKE', 'AUCTION'] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => setDraftType(t)}
                    style={{
                      padding: '6px 16px', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 700,
                      background: draftType === t ? 'rgba(54,226,126,0.15)' : 'transparent',
                      border: `1px solid ${draftType === t ? 'rgba(54,226,126,0.4)' : 'var(--border)'}`,
                      color: draftType === t ? 'var(--green)' : 'var(--text-2)',
                    }}
                  >
                    {t === 'SNAKE' ? '🐍 Snake' : '🏷️ Auction'}
                  </button>
                ))}
              </div>
              <button className="btn btn-green" onClick={handleStartDraft} disabled={startingDraft}>
                {startingDraft ? 'Starting...' : 'Start Draft'}
              </button>
            </div>
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
            {suspendedStarters.map(p => <span key={p.id} style={{ color: 'var(--red)' }}>{p.player.name} (suspended)</span>)}
            {lowFitnessStarters.map(p => <span key={p.id} style={{ color: 'var(--gold)' }}>{p.player.name} (low fitness)</span>)}
            <button onClick={() => setBannerDismissed(true)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-2)', fontSize: 16 }}>✕</button>
          </div>
        )}

        {/* Page content */}
        <div style={{ padding: isMobile ? '16px 12px' : '24px 28px', flex: 1 }}>
          {tab === 'overview'  && <Overview league={league} matches={matches} myClub={myClub} awards={awards} onPhysioUpgrade={handlePhysioUpgrade} onRefresh={refresh} onSwitchTab={setTab} />}
          {tab === 'squad'     && (myClub ? <Squad squad={myClub.squad} physioLevel={myClub.physioLevel} budget={myClub.budget} nextMatchday={nextMatchday} onHeal={handleHeal} onTrain={handleTrain} /> : <p style={{ color: 'var(--text-2)' }}>You don't have a club in this league.</p>)}
          {tab === 'fixtures'  && (matches.length === 0 ? <div style={{ textAlign: 'center', padding: '64px 0', color: 'var(--text-2)' }}><div style={{ fontSize: 36, marginBottom: 10 }}>📅</div><p>Fixtures will appear after the draft.</p></div> : <Fixtures matches={matches} clubs={league.clubs} myClubId={myClub?.id} currentDay={league.currentDay} leagueId={league.id} />)}
          {tab === 'standings' && <Standings clubs={league.clubs} myClubId={myClub?.id} leagueId={league.id} prevPositions={prevPositions} matches={matches} history={league.history} />}
          {tab === 'stats'     && <Stats leagueId={league.id} status={league.status} />}
          {tab === 'tactics'   && myClub && (
            myClub.squad.length === 0
              ? <div style={{ textAlign: 'center', padding: '64px 0', color: 'var(--text-2)' }}><div style={{ fontSize: 36, marginBottom: 10 }}>⊞</div><p>Set your tactics after the draft.</p></div>
              : <Tactics leagueId={id!} myClub={myClub} nextMatchday={league.currentDay + 1} onSaved={tactic => setLeague(prev => {
                  if (!prev) return prev
                  return { ...prev, clubs: prev.clubs.map(c => c.id === myClub.id ? { ...c, tactic } : c) }
                })} />
          )}
          {tab === 'transfers' && myClub && <Transfers leagueId={league.id} myClub={myClub} squadSize={league.squadSize} transferWindowOpen={league.transferWindowOpen} onRefresh={refresh} />}
          {tab === 'messages'  && myClub && <Messages leagueId={league.id} myClub={myClub} league={league} currentUserId={user!.id} onRefresh={refresh} />}
          {tab === 'manage'    && isCreator && <Manage league={league} onUpdate={updated => setLeague(prev => prev ? { ...prev, ...updated } : prev)} onDelete={() => navigate('/')} />}
          {tab === 'management' && myClub && league.status === 'ACTIVE' && (
            <Management league={league} myClub={myClub} isCreator={isCreator} onRefresh={refresh} />
          )}
          {tab === 'cup' && league.hasCup && (
            <Cup leagueId={league.id} league={league} />
          )}
        </div>
      </main>
    </div>
  )
}
