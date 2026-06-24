import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { io, type Socket } from 'socket.io-client'
import { useAuth } from '../../stores/auth.store'
import { api } from '../../api/client'
import type { DraftPickEvent } from '@football/shared'
import { posClass } from '../../utils/helpers'
import { Navbar } from '../../components/Navbar'
import type {
  PlayerData, AvailablePlayer, PickRecord, PickedPlayer,
  DraftState, ClubInfo,
} from './types'
import { PlayerDetailModal } from './PlayerDetailModal'
import { CompareModal } from './CompareModal'
import { PlayerPool } from './PlayerPool'
import { AuctionPanel } from './AuctionPanel'
import { SquadPanel } from './SquadPanel'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const POS_GROUPS: Record<string, string[]> = {
  GK: ['GK'],
  DEF: ['CB', 'LB', 'RB'],
  MID: ['CDM', 'CM', 'CAM', 'LM', 'RM'],
  ATT: ['LW', 'RW', 'CF', 'ST'],
}

const IDEAL_FORMATION: Record<string, number> = {
  GK: 1, CB: 2, LB: 1, RB: 1, CDM: 1, CM: 2, CAM: 1, LW: 1, RW: 1, ST: 2,
}

function getRecommendedPositions(myPicksArg: PickRecord[], pickedMapArg: Record<string, PickedPlayer>): string[] {
  const counts: Record<string, number> = {}
  myPicksArg.forEach(p => {
    const pl = pickedMapArg[p.playerId]
    if (pl) counts[pl.position] = (counts[pl.position] ?? 0) + 1
  })
  return Object.entries(IDEAL_FORMATION)
    .filter(([pos, needed]) => (counts[pos] ?? 0) < needed)
    .map(([pos]) => pos)
}

// ─── Draft Page ───────────────────────────────────────────────────────────────

export default function Draft() {
  const { id: leagueId } = useParams<{ id: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()

  const TAKE = 60

  const [draft, setDraft] = useState<DraftState | null>(null)
  const [clubs, setClubs] = useState<ClubInfo[]>([])
  const [players, setPlayers] = useState<AvailablePlayer[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [page, setPage] = useState(0)
  const [playersLoading, setPlayersLoading] = useState(false)
  const [posFilter, setPosFilter] = useState('ALL')
  const [search, setSearch] = useState('')
  const [minOvr, setMinOvr] = useState('')
  const [maxOvr, setMaxOvr] = useState('')
  const [canAfford, setCanAfford] = useState(false)
  const [picking, setPicking] = useState<string | null>(null)
  const [timeLeft, setTimeLeft] = useState(90)
  const [error, setError] = useState('')
  const [detailPlayer, setDetailPlayer] = useState<PlayerData | null>(null)
  const [compareList, setCompareList] = useState<PlayerData[]>([])
  const [auctionCountdown, setAuctionCountdown] = useState<number>(0)
  const [bidAmount, setBidAmount] = useState('')
  const [nominateMode, setNominateMode] = useState(false)
  const [auctionMsg, setAuctionMsg] = useState('')
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showCompare = compareList.length === 2
  const clubMap = Object.fromEntries(clubs.map(c => [c.id, c]))

  // Refs so refresh() can read current filter state without stale closures
  const searchRef    = useRef(search)
  const posFilterRef = useRef(posFilter)
  const minOvrRef    = useRef(minOvr)
  const maxOvrRef    = useRef(maxOvr)
  const canAffordRef = useRef(canAfford)
  useEffect(() => { searchRef.current    = search    }, [search])
  useEffect(() => { posFilterRef.current = posFilter }, [posFilter])
  useEffect(() => { minOvrRef.current    = minOvr    }, [minOvr])
  useEffect(() => { maxOvrRef.current    = maxOvr    }, [maxOvr])
  useEffect(() => { canAffordRef.current = canAfford }, [canAfford])

  const fetchPlayers = useCallback(async (opts: {
    q: string; pos: string; minOvr: string; maxOvr: string
    canAfford: boolean; pageNum: number; append: boolean
    myBudget: number | null
    myPicksForRecommend: PickRecord[]
    pickedMapForRecommend: Record<string, PickedPlayer>
  }) => {
    if (!leagueId) return
    if (!opts.append) setPlayersLoading(true)
    try {
      const params = new URLSearchParams()
      if (opts.q) params.set('q', opts.q)

      if (opts.pos === 'RECOMMEND') {
        const needed = getRecommendedPositions(opts.myPicksForRecommend, opts.pickedMapForRecommend)
        if (needed.length > 0) needed.forEach(p => params.append('pos', p))
        // RECOMMEND auto-enables can-afford
        if (opts.myBudget !== null) params.set('maxPrice', String(opts.myBudget))
      } else {
        if (opts.pos !== 'ALL') {
          const positions = POS_GROUPS[opts.pos]
          if (positions) positions.forEach(p => params.append('pos', p))
        }
        if (opts.canAfford && opts.myBudget !== null) params.set('maxPrice', String(opts.myBudget))
      }

      if (opts.minOvr) params.set('minOvr', opts.minOvr)
      if (opts.maxOvr) params.set('maxOvr', opts.maxOvr)
      params.set('take', String(TAKE + 1))
      params.set('skip', String(opts.pageNum * TAKE))

      const res = await api.get(`/draft/${leagueId}/players?${params}`)
      const data = res.data as AvailablePlayer[]
      const more = data.length > TAKE
      if (more) data.pop()

      setHasMore(more)
      setPlayers(prev => opts.append ? [...prev, ...data] : data)
    } finally {
      if (!opts.append) setPlayersLoading(false)
    }
  }, [leagueId])

  const fetchPlayersRef    = useRef(fetchPlayers)
  const myBudgetRef        = useRef<number | null>(null)
  const myPicksRef         = useRef<PickRecord[]>([])
  const pickedMapRef       = useRef<Record<string, PickedPlayer>>({})
  useEffect(() => { fetchPlayersRef.current = fetchPlayers }, [fetchPlayers])

  function doFetch(pageNum: number, append: boolean) {
    fetchPlayersRef.current({
      q: searchRef.current, pos: posFilterRef.current,
      minOvr: minOvrRef.current, maxOvr: maxOvrRef.current,
      canAfford: canAffordRef.current, pageNum, append,
      myBudget: myBudgetRef.current,
      myPicksForRecommend: myPicksRef.current,
      pickedMapForRecommend: pickedMapRef.current,
    })
  }

  const refresh = useCallback(async () => {
    if (!leagueId) return
    const [draftRes, leagueRes] = await Promise.all([
      api.get(`/draft/${leagueId}`),
      api.get(`/leagues/${leagueId}`),
    ])
    const draftData: DraftState = draftRes.data
    const clubsData: ClubInfo[] = leagueRes.data.clubs
    setDraft(draftData)
    setClubs(clubsData)
    setTimeLeft(draftData.session.pickTimeLimit ?? 90)
    setPage(0)
    // Update refs before fetching
    const myClubFresh = clubsData.find(c => c.user?.id === user?.id)
    myBudgetRef.current  = myClubFresh?.budget ?? null
    myPicksRef.current   = draftData.session.picks
    pickedMapRef.current = draftData.pickedPlayerMap
    doFetch(0, false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueId, user?.id])

  useEffect(() => { refresh() }, [refresh])

  // Debounced re-fetch when any filter changes (reset to page 0)
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(() => {
      setPage(0)
      doFetch(0, false)
    }, search ? 300 : 0)
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, posFilter, minOvr, maxOvr, canAfford])

  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (!draft || draft.session.status !== 'ACTIVE') return
    timerRef.current = setInterval(() => {
      setTimeLeft(t => Math.max(0, t - 1))
    }, 1000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [draft?.session.currentPick, draft?.session.currentRound, draft?.session.status])

  useEffect(() => {
    const auction = draft?.session.auctionState
    if (!auction?.endsAt) { setAuctionCountdown(0); return }
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((new Date(auction.endsAt!).getTime() - Date.now()) / 1000))
      setAuctionCountdown(remaining)
    }
    tick()
    const t = setInterval(tick, 500)
    return () => clearInterval(t)
  }, [draft?.session.auctionState?.endsAt])

  useEffect(() => {
    if (!leagueId) return
    const socket: Socket = io()
    socket.emit('join:draft', leagueId)
    socket.on('draft:pick', (_event: DraftPickEvent) => { refresh() })
    socket.on('season:started', () => { navigate(`/league/${leagueId}`) })
    socket.on('auction:nomination', () => { refresh() })
    socket.on('auction:bid', () => { refresh() })
    socket.on('auction:awarded', () => { refresh() })
    socket.on('draft:complete', () => { refresh() })
    return () => { socket.disconnect() }
  }, [leagueId, refresh, navigate])

  async function handlePick(playerId: string) {
    if (!leagueId) return
    setError('')
    setPicking(playerId)
    try {
      await api.post(`/draft/${leagueId}/pick`, { playerId })
      setDetailPlayer(null)
      setCompareList([])
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Pick failed')
    } finally {
      setPicking(null)
    }
  }

  function toggleCompare(p: PlayerData) {
    setCompareList(prev => {
      if (prev.some(x => x.id === p.id)) return prev.filter(x => x.id !== p.id)
      if (prev.length >= 2) return [prev[1], p]
      return [...prev, p]
    })
  }

  async function handleNominate(instanceId: string) {
    if (!leagueId) return
    setAuctionMsg('')
    try {
      await api.post(`/draft/${leagueId}/nominate`, { instanceId })
      setNominateMode(false)
      refresh()
    } catch (err: any) {
      setAuctionMsg(err.response?.data?.error ?? 'Failed to nominate')
    }
  }

  async function handleBid() {
    if (!leagueId) return
    const amount = parseInt(bidAmount, 10)
    if (isNaN(amount) || amount <= 0) return
    setAuctionMsg('')
    try {
      await api.post(`/draft/${leagueId}/bid`, { amount })
      setBidAmount('')
      refresh()
    } catch (err: any) {
      setAuctionMsg(err.response?.data?.error ?? 'Failed to bid')
    }
  }

  if (!draft) {
    return (
      <div>
        <nav className="nav"><Link to="/" className="nav-logo"><img src="/logo.png" alt="Football Manager" style={{ height: 32, display: 'block' }} /></Link></nav>
        <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--text-2)' }}>Loading draft...</div>
      </div>
    )
  }

  const { session, currentClubId, pickedPlayerMap } = draft
  const myClub = clubs.find(c => c.user?.id === user?.id)
  const isMyTurn = !!myClub && currentClubId === myClub.id
  const draftComplete = session.status === 'COMPLETED'
  const isAuction = session.type === 'AUCTION'
  const auction = session.auctionState ?? null
  const isMyNominatorTurn = !!(myClub && auction && session.pickOrder[auction.nominatorIdx % session.pickOrder.length] === myClub.id)

  const totalPicks = session.pickOrder.length
  const overallPickNumber = (session.currentRound - 1) * totalPicks + session.currentPick + 1
  const totalPicksInDraft = session.roundsTotal * totalPicks
  const timerPct = (timeLeft / (session.pickTimeLimit || 90)) * 100

  const recentPicks = [...session.picks].reverse().slice(0, 8)
  const nextPicks: string[] = []
  for (let i = 0; i < Math.min(5, totalPicks); i++) {
    nextPicks.push(session.pickOrder[(session.currentPick + i) % totalPicks])
  }
  const myPicks = session.picks.filter(p => p.club.id === myClub?.id)

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)' }}>
      {/* Nav */}
      <Navbar backTo={`/league/${leagueId}`} backLabel="← League">
        {myClub && <span style={{ fontSize: 12, color: 'var(--text-2)' }}>💰 €{(myClub.budget / 1000).toFixed(0)}M</span>}
      </Navbar>

      {/* Header bar */}
      <div style={{ background: 'linear-gradient(110deg, rgba(54,226,126,0.12) 0%, var(--bg-card) 60%)', border: '1px solid rgba(54,226,126,0.3)', borderTop: 'none', borderLeft: 'none', borderRight: 'none', padding: '12px 24px' }}>
        <div style={{ maxWidth: 1400, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 30, fontWeight: 800, letterSpacing: 0.5, lineHeight: 1 }}>
              ROUND {session.currentRound}
              <span style={{ color: 'var(--text-2)', fontWeight: 400, fontSize: 20 }}> / {session.roundsTotal}</span>
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 4 }}>Pick {overallPickNumber} of {totalPicksInDraft}</div>
          </div>

          <div style={{ flex: 1, maxWidth: 340 }}>
            <div className="stat-bar-wrap" style={{ height: 6 }}>
              <div className="stat-bar-fill" style={{ width: `${(overallPickNumber / totalPicksInDraft) * 100}%`, background: 'var(--green)' }} />
            </div>
          </div>

          {!draftComplete && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ position: 'relative', width: 54, height: 54 }}>
                <svg width="54" height="54" style={{ transform: 'rotate(-90deg)' }}>
                  <circle cx="27" cy="27" r="22" fill="none" stroke="var(--border)" strokeWidth="3.5" />
                  <circle cx="27" cy="27" r="22" fill="none"
                    stroke={timeLeft <= 10 ? 'var(--red)' : timeLeft <= 20 ? 'var(--gold)' : 'var(--green)'}
                    strokeWidth="3.5"
                    strokeDasharray={`${2 * Math.PI * 22}`}
                    strokeDashoffset={`${2 * Math.PI * 22 * (1 - timerPct / 100)}`}
                    strokeLinecap="round"
                    style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.3s' }}
                  />
                </svg>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 800, color: timeLeft <= 10 ? 'var(--red)' : 'var(--text-1)' }}>{timeLeft}</div>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-2)' }}>{isMyTurn ? 'Your time' : 'Per pick'}</div>
            </div>
          )}

          {!draftComplete && currentClubId && (
            <div style={{ padding: '8px 16px', background: isMyTurn ? 'var(--green-glow)' : 'var(--bg-card-2)', border: `1px solid ${isMyTurn ? 'var(--green)' : 'var(--border)'}`, borderRadius: 'var(--radius-sm)' }}>
              <div style={{ fontSize: 10, color: isMyTurn ? 'var(--green)' : 'var(--text-2)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>{isMyTurn ? '🎯 Your pick' : 'Now picking'}</div>
              <div style={{ fontSize: 13, fontWeight: 700, marginTop: 2, color: 'var(--text-1)' }}>{clubMap[currentClubId]?.name ?? '...'}</div>
            </div>
          )}

          {draftComplete && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ padding: '8px 16px', background: 'var(--green-glow)', border: '1px solid var(--green)', borderRadius: 'var(--radius-sm)' }}>
                <span style={{ color: 'var(--green)', fontWeight: 700, fontSize: 13 }}>Draft Complete!</span>
              </div>
              <button className="btn btn-green" onClick={() => navigate(`/league/${leagueId}`)}>
                Go to League →
              </button>
            </div>
          )}
        </div>
      </div>

      {isMyTurn && !isAuction && (
        <div style={{ background: 'linear-gradient(90deg, rgba(54,226,126,0.18) 0%, transparent 100%)', borderBottom: '1px solid rgba(54,226,126,0.35)', padding: '13px 24px', textAlign: 'center' }}>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 800, color: 'var(--green)', letterSpacing: 1 }}>⚡ YOUR TURN TO PICK — Select a player below</span>
        </div>
      )}

      {isAuction && nominateMode && isMyNominatorTurn && !auction?.instanceId && (
        <div style={{ background: 'linear-gradient(90deg, rgba(54,226,126,0.18) 0%, transparent 100%)', borderBottom: '1px solid rgba(54,226,126,0.35)', padding: '13px 24px', display: 'flex', alignItems: 'center', gap: 16, justifyContent: 'center' }}>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 800, color: 'var(--green)', letterSpacing: 1 }}>Click a player below to nominate them for auction</span>
          <button className="btn btn-outline" style={{ fontSize: 12 }} onClick={() => setNominateMode(false)}>Cancel</button>
        </div>
      )}

      {/* Compare hint bar */}
      {compareList.length === 1 && !showCompare && (
        <div style={{ background: 'rgba(245,166,35,0.08)', borderBottom: '1px solid rgba(245,166,35,0.2)', padding: '10px 24px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 13, color: 'var(--gold)' }}>⇄ Comparing: <strong>{compareList[0].name}</strong> — click ⇄ on another player to compare</span>
          <button className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 10px', marginLeft: 'auto' }} onClick={() => setCompareList([])}>Clear</button>
        </div>
      )}

      {/* Main layout */}
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '20px 24px', display: 'grid', gridTemplateColumns: '1fr 320px', gap: 22, alignItems: 'start' }}>

        {/* ── Player list ─────────────────────────────────────── */}
        <PlayerPool
          players={players}
          playersLoading={playersLoading}
          hasMore={hasMore}
          page={page}
          posFilter={posFilter}
          search={search}
          minOvr={minOvr}
          maxOvr={maxOvr}
          canAfford={canAfford}
          myClub={myClub}
          isMyTurn={isMyTurn}
          isAuction={isAuction}
          nominateMode={nominateMode}
          isMyNominatorTurn={isMyNominatorTurn}
          auctionInstanceId={auction?.instanceId}
          picking={picking}
          compareList={compareList}
          error={error}
          onPosFilterChange={setPosFilter}
          onSearchChange={setSearch}
          onMinOvrChange={setMinOvr}
          onMaxOvrChange={setMaxOvr}
          onCanAffordToggle={() => setCanAfford(v => !v)}
          onClearFilters={() => { setMinOvr(''); setMaxOvr(''); setCanAfford(false); setPosFilter('ALL'); setSearch('') }}
          onPlayerClick={inst => {
            if (isAuction && nominateMode) {
              handleNominate(inst.id)
            } else {
              setDetailPlayer(inst.player)
            }
          }}
          onToggleCompare={toggleCompare}
          onPick={handlePick}
          onNominate={handleNominate}
          onLoadMore={() => {
            const nextPage = page + 1
            setPage(nextPage)
            doFetch(nextPage, true)
          }}
          onCancelNominate={() => setNominateMode(false)}
        />

        {/* ── Right sidebar ──────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, position: 'sticky', top: 76 }}>

          {/* Auction panel */}
          {isAuction && (
            <AuctionPanel
              auction={auction}
              session={session}
              clubs={clubs}
              availablePlayers={draft.availablePlayers}
              myClub={myClub}
              isMyNominatorTurn={isMyNominatorTurn}
              auctionCountdown={auctionCountdown}
              bidAmount={bidAmount}
              auctionMsg={auctionMsg}
              onBidAmountChange={setBidAmount}
              onBid={handleBid}
              onNominateMode={() => setNominateMode(true)}
            />
          )}

          {/* Pick order */}
          <div className="card" style={{ padding: 0 }}>
            <div className="card-header">
              <span className="accent-bar" />
              <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Pick Order</span>
            </div>
            <div style={{ padding: 16 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {nextPicks.map((cId, i) => {
                  const club = clubMap[cId]
                  const isNow = i === 0
                  const isMe = club?.user?.id === user?.id
                  return (
                    <div key={`${cId}-${i}`} style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                      background: isNow ? (isMe ? 'var(--green-glow)' : 'var(--bg-card-2)') : 'transparent',
                      border: `1px solid ${isNow ? (isMe ? 'rgba(54,226,126,0.3)' : 'var(--border-md)') : 'transparent'}`,
                      borderRadius: 'var(--radius-sm)',
                    }}>
                      <div style={{ width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: isNow ? (isMe ? 'var(--green)' : 'var(--bg-hover)') : 'var(--bg-card-2)', fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 800, color: isNow && isMe ? '#000' : 'var(--text-2)', flexShrink: 0 }}>{i + 1}</div>
                      <div style={{ fontSize: 13, fontWeight: isNow ? 700 : 400, color: isMe ? 'var(--green)' : 'var(--text-1)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{club?.name ?? '...'}</div>
                      {isNow && <span style={{ fontSize: 10, color: isMe ? 'var(--green)' : 'var(--text-2)', fontWeight: 700 }}>NOW</span>}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Squad analysis */}
          {myClub && (
            <SquadPanel
              myClub={myClub}
              myPicks={myPicks}
              pickedPlayerMap={pickedPlayerMap as Record<string, PickedPlayer & Partial<PlayerData>>}
              session={session}
            />
          )}

          {/* Recent picks */}
          <div className="card" style={{ padding: 0 }}>
            <div className="card-header">
              <span className="accent-bar" />
              <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Recent Picks</span>
            </div>
            <div style={{ padding: 16 }}>
              {recentPicks.length === 0 ? (
                <p style={{ color: 'var(--text-2)', fontSize: 12 }}>No picks yet</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {recentPicks.map((pick, i) => {
                    const pp = pickedPlayerMap[pick.playerId]
                    const isMyPick = pick.club.id === myClub?.id
                    return (
                      <div key={pick.id} style={{ padding: '7px 10px', background: isMyPick ? 'rgba(54,226,126,0.05)' : 'transparent', borderRadius: 'var(--radius-sm)', borderLeft: isMyPick ? '2px solid var(--green)' : '2px solid transparent', opacity: i === 0 ? 1 : Math.max(0.4, 1 - i * 0.1) }}>
                        <div style={{ fontSize: 11, color: isMyPick ? 'var(--green)' : 'var(--text-2)', fontWeight: 600, marginBottom: 2 }}>{pick.club.name} · R{pick.round}P{pick.pickNumber + 1}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          {pp?.photoUrl && (
                            <div style={{ width: 24, height: 28, borderRadius: 4, overflow: 'hidden', background: 'var(--bg-base)', flexShrink: 0 }}>
                              <img src={pp.photoUrl} alt="" referrerPolicy="no-referrer" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }} onError={e => { const el = e.currentTarget as HTMLImageElement; el.style.display = 'none'; const p = el.parentElement; if (p) p.setAttribute('data-failed', '1') }} />
                            </div>
                          )}
                          {pp && <span className={posClass(pp.position)} style={{ fontSize: 9 }}>{pp.position}</span>}
                          <span style={{ fontSize: 12, color: 'var(--text-1)', fontWeight: 600 }}>{pp?.name ?? '...'}</span>
                          {pp && <span style={{ fontSize: 11, color: 'var(--text-2)' }}>{pp.overall}</span>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Detail modal */}
      {detailPlayer && (
        <PlayerDetailModal
          p={detailPlayer}
          isMyTurn={isMyTurn}
          canAfford={!myClub || myClub.budget >= detailPlayer.baseValue}
          onPick={() => handlePick(detailPlayer.id)}
          onClose={() => setDetailPlayer(null)}
          onToggleCompare={() => { toggleCompare(detailPlayer); setDetailPlayer(null) }}
          inCompare={compareList.some(c => c.id === detailPlayer.id)}
          pickingId={picking}
        />
      )}

      {/* Compare modal */}
      {showCompare && (
        <CompareModal
          a={compareList[0]}
          b={compareList[1]}
          isMyTurn={isMyTurn}
          myBudget={myClub?.budget ?? 0}
          onPick={id => { handlePick(id); setCompareList([]) }}
          onClose={() => setCompareList([])}
          pickingId={picking}
        />
      )}
    </div>
  )
}
