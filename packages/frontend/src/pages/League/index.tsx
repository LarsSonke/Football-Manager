import { useEffect, useState, useCallback, useRef } from 'react'
import type { ReactNode } from 'react'
import { useParams, useNavigate, Link, useSearchParams } from 'react-router-dom'
import { io, type Socket } from 'socket.io-client'
import { Trophy, BarChart2, Clock, Calendar } from 'lucide-react'
import { useAuth } from '../../stores/auth.store'
import { api } from '../../api/client'
import { ClubBadge, LogoMaker } from '../../components/ClubBadge'
import { type KitConfig } from '../../components/KitSvg'
import { KitDesigner } from '../../components/KitDesigner'
import { posClass } from '../../utils/helpers'
import { BallIcon, CardIcon, SubIcon } from '../../components/icons'
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
import styles from './index.module.css'

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
    <div className={styles.seasonEndOverlay}>
      <div className={styles.seasonEndPanel}>
        {/* Champion banner */}
        <div className={styles.seasonEndBanner}>
          <div className={styles.seasonEndTrophy}><Trophy size={48} /></div>
          <div className={styles.seasonEndEyebrow}>
            Season Complete · {league.name}
          </div>
          <div className={styles.seasonEndChampion}>
            {champion?.name}
          </div>
          <div className={styles.seasonEndChampionStats}>
            {champion?.points} pts · {champion?.goalsFor} scored · {champion?.goalsAgainst} conceded
          </div>
        </div>

        {/* Final standings */}
        <div className={styles.seasonEndStandings}>
          <div className={styles.seasonEndStandingsLabel}>Final Standings</div>
          <div className={styles.seasonEndTableList}>
            {sorted.map((club, i) => {
              const gd = club.goalsFor - club.goalsAgainst
              const isChamp = i === 0
              return (
                <div key={club.id} className={styles.seasonEndRow} data-champ={isChamp ? 'true' : 'false'}>
                  <span className={styles.seasonEndPos}>
                    {isChamp ? <Trophy size={14} /> : i + 1}
                  </span>
                  <span className={styles.seasonEndClubName}>{club.name}</span>
                  <span className={styles.seasonEndStat}>{club.wins}W</span>
                  <span className={styles.seasonEndStat}>{club.draws}D</span>
                  <span className={styles.seasonEndStat}>{club.losses}L</span>
                  <span
                    className={styles.seasonEndGd}
                    style={{ color: gd > 0 ? 'var(--green)' : gd < 0 ? 'var(--red)' : 'var(--text-2)' }}
                  >
                    {gd > 0 ? '+' : ''}{gd}
                  </span>
                  <span className={styles.seasonEndPts}>{club.points}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Development outlook */}
        {(prospects.length > 0 || veterans.length > 0) && (
          <div className={styles.seasonEndOutlook}>
            <div className={styles.seasonEndOutlookLabel}>Development Outlook</div>
            {prospects.length > 0 && (
              <div>
                <div className={styles.seasonEndRisingLabel}>Rising Talent</div>
                <div className={styles.seasonEndProspectList}>
                  {prospects.map(p => (
                    <div key={p.id} className={styles.seasonEndPlayerRow}>
                      <span className={`${posClass(p.player.position)} ${styles.seasonEndPosIcon}`}>{p.player.position}</span>
                      <span className={styles.seasonEndPlayerName}>{p.player.name}</span>
                      <span className={styles.seasonEndPlayerAge}>Age {p.player.age}</span>
                      <span className={styles.seasonEndPlayerOvr}>{p.player.overall} OVR</span>
                      <span className={styles.seasonEndPlayerPot}>→ {p.player.potential} POT</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {veterans.length > 0 && (
              <div>
                <div className={styles.seasonEndAgingLabel}>Aging Players</div>
                <div className={styles.seasonEndVeteranList}>
                  {veterans.map(p => (
                    <div key={p.id} className={styles.seasonEndPlayerRow}>
                      <span className={`${posClass(p.player.position)} ${styles.seasonEndPosIcon}`}>{p.player.position}</span>
                      <span className={styles.seasonEndPlayerName}>{p.player.name}</span>
                      <span className={styles.seasonEndPlayerAgeGold}>Age {p.player.age}</span>
                      <span className={styles.seasonEndPlayerOvr}>{p.player.overall} OVR</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Player development note */}
        {isCreator && (
          <div className={styles.seasonEndDevNote}>
            Starting a new season will age all players by 1 year — young players with high potential will grow, veterans may begin to decline.
          </div>
        )}

        {/* Actions */}
        {!isCreator && (
          <div className={styles.seasonEndWaitingNote}>
            Waiting for the league creator to start the next season…
          </div>
        )}
        <div className={styles.seasonEndActions}>
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

const NAV: { key: Tab; label: string; icon: ReactNode }[] = [
  { key: 'overview',   label: 'Overview',   icon: '◈' },
  { key: 'squad',      label: 'Squad',      icon: '◉' },
  { key: 'fixtures',   label: 'Fixtures',   icon: '▦' },
  { key: 'standings',  label: 'Standings',  icon: '≡' },
  { key: 'stats',      label: 'Stats',      icon: <BarChart2 size={14} /> },
]

// ─── Live Ticker Overlay ──────────────────────────────────────────────────────

function LiveTicker({ matches, myClubId, onDismiss }: { matches: Map<string, LiveMatchState>; myClubId: string | undefined; onDismiss: () => void }) {
  const matchList = [...matches.values()]
  const myMatch = myClubId
    ? matchList.find(m => m.homeClub.id === myClubId || m.awayClub.id === myClubId)
    : null
  const otherMatches = matchList.filter(m => m !== myMatch)
  const allEnded = matchList.every(m => m.status === 'ended')

  const EVENT_ICON: Record<string, ReactNode> = {
    GOAL: <BallIcon size={12} />, OWN_GOAL: <BallIcon size={12} />,
    YELLOW_CARD: <CardIcon color="yellow" size={12} />, RED_CARD: <CardIcon color="red" size={12} />,
    SUBSTITUTION: <SubIcon size={12} />, PENALTY_MISS: '✗',
  }

  const renderEvent = (evt: LiveMatchState['events'][number], m: LiveMatchState) => {
    const d = evt.detail as any
    const isHome = d?.team === 'home'
    const name = evt.eventType === 'SUBSTITUTION'
      ? (d?.outName ?? '?')
      : (d?.playerName ?? d?.name ?? '?')
    return (
      <div key={`${evt.minute}-${evt.eventType}`} className={styles.liveTickerEvent}>
        <span className={styles.liveTickerEventMinute}>{evt.minute}'</span>
        <span>{EVENT_ICON[evt.eventType] ?? '•'}</span>
        <span className={
          evt.eventType === 'GOAL' ? styles.liveTickerEventNameGoal
          : evt.eventType === 'RED_CARD' ? styles.liveTickerEventNameRed
          : styles.liveTickerEventName
        }>{name}</span>
        <span className={styles.liveTickerEventClub}>({isHome ? m.homeClub.name : m.awayClub.name})</span>
      </div>
    )
  }

  return (
    <div className={styles.liveTickerWrap}>
      {/* My match — prominent */}
      {myMatch && (
        <div className={`${styles.liveTickerCard} ${myMatch.status === 'live' ? styles.liveTickerCardLive : ''}`}>
          <div className={`${styles.liveTickerHeader} ${myMatch.status === 'live' ? styles.liveTickerHeaderLive : ''}`}>
            <span className={`${styles.liveTickerStatus} ${myMatch.status === 'live' ? styles.liveTickerStatusLive : ''}`}>
              {myMatch.status === 'live' ? '● LIVE' : '✓ FT'}
            </span>
            <span className={styles.liveTickerHeaderSpacer} />
            <button onClick={onDismiss} className={styles.liveTickerCloseBtn}>×</button>
          </div>
          <div className={styles.liveTickerBody}>
            <div className={styles.liveTickerScore}>
              <div className={styles.liveTickerHomeClub}>{myMatch.homeClub.name}</div>
              <div className={styles.liveTickerScoreDisplay}>
                {myMatch.homeScore} – {myMatch.awayScore}
              </div>
              <div className={styles.liveTickerAwayClub}>{myMatch.awayClub.name}</div>
            </div>
            {myMatch.events.length > 0 && (
              <div className={styles.liveTickerEvents}>
                {[...myMatch.events].reverse().slice(0, 8).reverse().map(evt => renderEvent(evt, myMatch))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Other matches — compact */}
      {otherMatches.length > 0 && (
        <div className={styles.liveTickerCard}>
          <div className={styles.liveTickerOtherHeader}>Other Matches</div>
          <div className={styles.liveTickerOtherList}>
            {otherMatches.map(m => (
              <div key={m.matchId} className={styles.liveTickerOtherRow}>
                <div className={styles.liveTickerOtherHome}>{m.homeClub.name}</div>
                <div className={styles.liveTickerOtherScore}>{m.homeScore}–{m.awayScore}</div>
                <div className={styles.liveTickerOtherAway}>{m.awayClub.name}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {allEnded && (
        <button className={`btn btn-ghost ${styles.liveTickerDismissBtn}`} onClick={onDismiss}>
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
  const [searchParams, setSearchParams] = useSearchParams()

  const [league, setLeague] = useState<LeagueData | null>(null)
  const [matches, setMatches] = useState<MatchData[]>([])
  const [awards, setAwards] = useState<MatchdayAwards | null>(null)
  const validTabs: Tab[] = ['overview','squad','fixtures','standings','stats','tactics','transfers','messages','manage','management','cup']
  const rawTab = searchParams.get('tab') as Tab | null
  const tab: Tab = rawTab && validTabs.includes(rawTab) ? rawTab : 'overview'
  const setTab = (t: Tab) => setSearchParams(p => { const n = new URLSearchParams(p); n.set('tab', t); return n }, { replace: true })
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
      <div className={styles.loadingWrap}>
        <div className={styles.loadingText}>Loading...</div>
      </div>
    )
  }

  const myClub = league.clubs.find(c => c.user?.id === user?.id)
  myClubIdRef.current = myClub?.id
  myClubWagesRef.current = myClub?.squad.reduce((s, p) => s + p.wage, 0) ?? 0
  const isCreator = league.clubs.filter(c => !c.isAI)[0]?.user?.id === user?.id
  const creatorName = league.clubs.filter(c => !c.isAI)[0]?.user?.username ?? 'the league creator'
  const starterIds = new Set(myClub?.tactic?.lineup?.map(s => s.instanceId) ?? [])
  const nextMatchday = league.currentDay + 1
  const injuredStarters = myClub?.squad.filter(p => starterIds.has(p.id) && p.injured) ?? []
  const suspendedStarters = myClub?.squad.filter(p => starterIds.has(p.id) && p.suspendedMatchday === nextMatchday) ?? []
  const lowFitnessStarters = myClub?.squad.filter(p => starterIds.has(p.id) && !p.injured && p.suspendedMatchday !== nextMatchday && p.fitness < 35) ?? []
  const hasLineupWarnings = (injuredStarters.length + suspendedStarters.length + lowFitnessStarters.length) > 0
  const navItems: { key: Tab; label: string; icon: ReactNode }[] = [
    ...NAV,
    ...(myClub ? [{ key: 'tactics' as Tab, label: 'Tactics', icon: '⊞' }] : []),
    ...(myClub && league.status === 'ACTIVE' ? [{ key: 'transfers' as Tab, label: 'Transfers', icon: '⇄' }] : []),
    ...(myClub && league.status === 'ACTIVE' ? [{ key: 'messages' as Tab, label: 'Messages', icon: '✉' }] : []),
    ...(isCreator ? [{ key: 'manage' as Tab, label: 'Manage', icon: '⊛' }] : []),
    ...(myClub && league.status === 'ACTIVE' ? [{ key: 'management' as Tab, label: 'Club', icon: '⬆' }] : []),
    ...(league.hasCup ? [{ key: 'cup' as Tab, label: 'Cup', icon: <Trophy size={14} /> }] : []),
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
    <div className={styles.pageRoot}>

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
        <div className={styles.growthOverlay}>
          <div className={styles.growthPanel}>
            <div className={styles.growthHeader}>
              <div className={styles.growthTitle}>Player Development</div>
              <div className={styles.growthSubtitle}>Changes after the off-season</div>
            </div>
            <div className={styles.growthList}>
              {[...growthChanges].sort((a, b) => (b.overallNow - b.overallWas) - (a.overallNow - a.overallWas)).map(c => {
                const delta = c.overallNow - c.overallWas
                const color = delta > 0 ? 'var(--green)' : delta < 0 ? 'var(--red)' : 'var(--text-3)'
                return (
                  <div key={c.playerId} className={styles.growthRow}>
                    <span className={`${posClass(c.position)} ${styles.posIconSm}`}>{c.position}</span>
                    <span className={styles.growthPlayerName}>{c.playerName}</span>
                    <span className={styles.growthPlayerAge}>Age {c.ageWas + 1}</span>
                    <span className={styles.growthDelta} style={{ color }}>
                      {delta > 0 ? `+${delta}` : delta === 0 ? '±0' : delta} ({c.overallNow})
                    </span>
                  </div>
                )
              })}
            </div>
            <div className={styles.growthFooter}>
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
      <aside className={styles.sidebar}>
        {/* Logo */}
        <div className={styles.sidebarLogo}>
          <Link to="/" className="nav-logo">
            <img src="/tactixlogo.png" alt="Tactix" className={styles.sidebarLogoImg} />
          </Link>
        </div>

        {/* Club identity */}
        <div className={styles.clubIdentity}>
          {myClub ? (
            <>
              <div className={styles.clubIdentityRow}>
                <ClubBadge name={myClub.name} size={44} logoConfig={myClub.logoConfig} />
                <div className={styles.clubActions}>
                  <button
                    onClick={() => setShowLogoMaker(true)}
                    title="Customize club logo"
                    className={styles.clubActionBtn}
                  >
                    ✎ Logo
                  </button>
                  <button
                    onClick={() => setShowKitDesigner(true)}
                    title="Design club kit"
                    className={styles.clubActionBtn}
                  >
                    ✎ Kit
                  </button>
                </div>
              </div>
              <div className={styles.clubName}>{myClub.name}</div>
              <div className={styles.clubLeagueName}>{league.name}</div>
              <div className={styles.clubStatusRow}>
                <span className={`badge badge-${league.status.toLowerCase()} ${styles.clubStatusBadge}`}>{league.status}</span>
                {(league.status === 'ACTIVE' || league.status === 'FINISHED') && (
                  <span className={styles.clubMatchday}>MD {league.currentDay}/{league.seasonLength}</span>
                )}
              </div>
            </>
          ) : (
            <>
              <div className={styles.spectatorName}>{league.name}</div>
              <div className={styles.spectatorLabel}>Spectating</div>
            </>
          )}
        </div>

        {/* Nav */}
        <nav className={styles.sidebarNav}>
          {navItems.map(item => {
            const active = tab === item.key
            return (
              <button
                key={item.key}
                onClick={() => setTab(item.key)}
                className={styles.navItem}
                data-active={active ? 'true' : 'false'}
              >
                <span className={styles.navIcon}>{item.icon}</span>
                {item.label}
                {item.key === 'tactics' && hasLineupWarnings && (
                  <span className={styles.navDot} />
                )}
              </button>
            )
          })}
        </nav>

        {/* Budget */}
        {myClub && (
          <div className={styles.budgetSection}>
            <div className={styles.budgetLabel}>Budget</div>
            <div className={styles.budgetValue}>€{(myClub.budget / 1_000).toFixed(1)}M</div>
          </div>
        )}

        {/* User + back */}
        <div className={styles.sidebarFooter}>
          <button className={`btn btn-ghost ${styles.backBtn}`} onClick={() => navigate('/')}>← Back</button>
          <span className={styles.sidebarFooterSpacer} />
          <span className={styles.sidebarUsername}>{user?.username}</span>
        </div>
      </aside>

      {/* ── Mobile bottom nav ────────────────────────────────────────────── */}
      <nav className={styles.mobileBottomNav}>
        {navItems.map(item => {
          const active = tab === item.key
          const showDot = item.key === 'tactics' && hasLineupWarnings
          return (
            <button
              key={item.key}
              onClick={() => setTab(item.key)}
              className={styles.mobileNavItem}
              data-active={active ? 'true' : 'false'}
            >
              <span className={styles.mobileNavIcon}>{item.icon}</span>
              <span className={styles.mobileNavLabel}>{item.label}</span>
              {showDot && <span className={styles.mobileNavDot} />}
              {active && <span className={styles.mobileNavUnderline} />}
            </button>
          )
        })}
      </nav>

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <main className={styles.mainContent}>

        {/* Top bar */}
        <div className={styles.topBar}>
          <h1 className={styles.topBarTitle}>
            {PAGE_TITLES[tab]}
          </h1>
          {isMobile && myClub && (
            <span className={styles.topBarClubName}>{myClub.name}</span>
          )}
          <div className={styles.topBarSpacer} />

          {error && <span className={`error-text ${styles.topBarErrorText}`}>{error}</span>}

          {notification && (
            <div className={styles.notifBanner}>
              {notification}
              <button onClick={() => setNotification(null)} className={styles.notifCloseBtn}>×</button>
            </div>
          )}

          {league.status === 'SETUP' && !isCreator && (
            <div className={styles.setupWaiting}>
              <span className={styles.setupWaitingAccent}><Clock size={14} /></span>
              Waiting for <strong className={styles.setupWaitingStrong}>&nbsp;{creatorName}&nbsp;</strong> to start the draft
            </div>
          )}
          {league.status === 'SETUP' && isCreator && (
            <div>
              <div className={styles.draftTypeRow}>
                {(['SNAKE', 'AUCTION'] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => setDraftType(t)}
                    className={styles.draftTypeBtn}
                    data-active={draftType === t ? 'true' : 'false'}
                  >
                    {t === 'SNAKE' ? 'Snake' : 'Auction'}
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
            <button className={`btn btn-ghost ${styles.inviteBtn}`} onClick={() => navigator.clipboard.writeText(window.location.origin + '/?join=' + league.id)} title="Copy invite link">
              Copy invite link
            </button>
          )}
        </div>

        {/* Injury/fitness banner */}
        {league.status === 'ACTIVE' && !bannerDismissed && (injuredStarters.length > 0 || lowFitnessStarters.length > 0) && (
          <div className={styles.injuryBanner}>
            <span className={styles.injuryBannerLabel}>⚠ Lineup alert:</span>
            {injuredStarters.map(p => <span key={p.id} className={styles.injuryPlayerRed}>{p.player.name} (injured)</span>)}
            {suspendedStarters.map(p => <span key={p.id} className={styles.injuryPlayerRed}>{p.player.name} (suspended)</span>)}
            {lowFitnessStarters.map(p => <span key={p.id} className={styles.injuryPlayerGold}>{p.player.name} (low fitness)</span>)}
            <button onClick={() => setBannerDismissed(true)} className={styles.injuryDismissBtn}>✕</button>
          </div>
        )}

        {/* Page content */}
        <div className={styles.pageBody}>
          {tab === 'overview'  && <Overview league={league} matches={matches} myClub={myClub} awards={awards} onPhysioUpgrade={handlePhysioUpgrade} onRefresh={refresh} onSwitchTab={setTab} />}
          {tab === 'squad'     && (myClub ? <Squad squad={myClub.squad} physioLevel={myClub.physioLevel} budget={myClub.budget} nextMatchday={nextMatchday} onHeal={handleHeal} onTrain={handleTrain} /> : <p className={styles.noClubText}>You don't have a club in this league.</p>)}
          {tab === 'fixtures'  && (matches.length === 0
            ? <div className={styles.emptyStateWrap}><div className={styles.emptyStateIcon}><Calendar size={40} /></div><p>Fixtures will appear after the draft.</p></div>
            : <Fixtures matches={matches} clubs={league.clubs} myClubId={myClub?.id} currentDay={league.currentDay} leagueId={league.id} />)}
          {tab === 'standings' && <Standings clubs={league.clubs} myClubId={myClub?.id} leagueId={league.id} prevPositions={prevPositions} matches={matches} history={league.history} />}
          {tab === 'stats'     && <Stats leagueId={league.id} status={league.status} />}
          {tab === 'tactics'   && myClub && (
            myClub.squad.length === 0
              ? <div className={styles.emptyStateWrap}><div className={styles.emptyStateIcon}>⊞</div><p>Set your tactics after the draft.</p></div>
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
