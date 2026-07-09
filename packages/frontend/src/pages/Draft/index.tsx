import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { io, type Socket } from 'socket.io-client'
import { useAuth } from '../../stores/auth.store'
import { api } from '../../api/client'
import { posClass } from '../../utils/helpers'
import { Navbar } from '../../components/Navbar'
import type { AuctionSummary, BudgetStats, MarketPageData } from './types'
import { PlayerDetailModal } from './PlayerDetailModal'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCountdown(endsAt: string): string {
  const diff = new Date(endsAt).getTime() - Date.now()
  if (diff <= 0) return 'Ended'
  const h = Math.floor(diff / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`
  if (h > 0) return `${h}h ${m}m`
  const s = Math.floor((diff % 60000) / 1000)
  return `${m}m ${s}s`
}

function formatEur(n: number): string {
  if (n >= 1_000_000) return `€${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 2)}M`
  if (n >= 1_000) return `€${(n / 1_000).toFixed(0)}k`
  return `€${n}`
}

function statusColor(a: AuctionSummary): string {
  if (a.status === 'WON' && a.isLeading) return 'var(--green)'
  if (a.status === 'WON') return 'var(--text-3)'
  if (a.isLeading) return 'var(--green)'
  if (a.myBid !== null && !a.isLeading) return '#f59e0b'
  return 'var(--text-2)'
}

function statusLabel(a: AuctionSummary): string {
  if (a.status === 'WON' && a.isLeading) return 'WON'
  if (a.status === 'WON') return 'SOLD'
  if (a.status === 'UNSOLD') return 'UNSOLD'
  if (a.status === 'SCHEDULED') return 'COMING SOON'
  if (a.isLeading) return 'LEADING'
  if (a.myBid !== null) return 'OUTBID'
  return 'BID'
}

const MARKET_PAGE = 40

const POS_GROUPS: Record<string, string[]> = {
  GK: ['GK'],
  DEF: ['CB', 'LB', 'RB'],
  MID: ['CDM', 'CM', 'CAM', 'LM', 'RM'],
  ATT: ['LW', 'RW', 'CF', 'ST'],
}

// ─── AuctionCard ──────────────────────────────────────────────────────────────

interface CardProps {
  auction: AuctionSummary
  onBid: (a: AuctionSummary) => void
  onWatch: (a: AuctionSummary) => void
  onDetail: (a: AuctionSummary) => void
}

function AuctionCard({ auction: a, onBid, onWatch, onDetail }: CardProps) {
  const [countdown, setCountdown] = useState(() => formatCountdown(a.endsAt))
  useEffect(() => {
    const t = setInterval(() => setCountdown(formatCountdown(a.endsAt)), 1000)
    return () => clearInterval(t)
  }, [a.endsAt])

  const isActive = a.status === 'OPEN'
  const isScheduled = a.status === 'SCHEDULED'

  return (
    <div
      style={{
        background: 'var(--bg-card)',
        border: `1px solid ${a.isLeading ? 'rgba(54,226,126,0.35)' : a.myBid !== null && !a.isLeading && isActive ? 'rgba(245,158,11,0.35)' : 'var(--border)'}`,
        borderRadius: 'var(--radius)',
        padding: '14px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        cursor: 'pointer',
        transition: 'border-color 0.15s',
      }}
      onClick={() => onDetail(a)}
    >
      {/* Player header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className={posClass(a.player.position)} style={{ fontSize: 9 }}>{a.player.position}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {a.player.name}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-2)' }}>
            {a.player.nationality ?? ' - '} · {a.player.age}y
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 800, color: 'var(--text-1)', lineHeight: 1 }}>
            {a.player.overall}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-3)' }}>OVR</div>
        </div>
      </div>

      {/* Stat mini-bar */}
      <div style={{ display: 'flex', gap: 4, fontSize: 10, color: 'var(--text-3)' }}>
        {[
          ['PAC', a.player.pace],
          ['SHO', a.player.shooting],
          ['PAS', a.player.passing],
          ['DRI', a.player.dribbling],
          ['DEF', a.player.defending],
          ['PHY', a.player.physical],
        ].map(([label, val]) => (
          <div key={label as string} style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontWeight: 700, color: 'var(--text-2)', fontSize: 11 }}>{val}</div>
            <div>{label}</div>
          </div>
        ))}
      </div>

      {/* Wage estimate */}
      <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
        Wage: <span style={{ color: 'var(--text-2)', fontWeight: 600 }}>€{(a.player.overall * 200 / 1000).toFixed(0)}k/md</span>
        <span style={{ marginLeft: 6, color: 'var(--text-3)' }}>· MV {formatEur(a.player.baseValue)}</span>
      </div>

      {/* Bid info */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          {isScheduled ? (
            <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
              Releases {formatCountdown(a.releasedAt)}
            </div>
          ) : (
            <>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>
                {a.bidCount > 0 ? formatEur(a.currentBid) : `Opening: ${formatEur(a.openingBid)}`}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-2)' }}>
                {a.bidCount} bid{a.bidCount !== 1 ? 's' : ''} · ⏱ {countdown}
              </div>
            </>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
          <button
            onClick={() => onWatch(a)}
            style={{
              background: a.isWatching ? 'rgba(54,226,126,0.15)' : 'var(--bg-card-2)',
              border: `1px solid ${a.isWatching ? 'rgba(54,226,126,0.4)' : 'var(--border)'}`,
              color: a.isWatching ? 'var(--green)' : 'var(--text-3)',
              borderRadius: 'var(--radius-sm)',
              padding: '5px 8px',
              cursor: 'pointer',
              fontSize: 12,
            }}
            title={a.isWatching ? 'Watching' : 'Watch'}
          >
            {a.isWatching ? '★' : '☆'}
          </button>
          {isActive && !a.isLeading && (
            <button
              className="btn btn-green"
              style={{ padding: '5px 14px', fontSize: 12, fontWeight: 700 }}
              onClick={() => onBid(a)}
            >
              BID
            </button>
          )}
          {isActive && a.isLeading && (
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--green)', padding: '5px 8px', border: '1px solid rgba(54,226,126,0.3)', borderRadius: 'var(--radius-sm)' }}>
              LEADING
            </span>
          )}
          {!isActive && a.status !== 'SCHEDULED' && (
            <span style={{ fontSize: 11, fontWeight: 700, color: statusColor(a), padding: '5px 8px', border: `1px solid ${statusColor(a)}40`, borderRadius: 'var(--radius-sm)' }}>
              {statusLabel(a)}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── BidModal ─────────────────────────────────────────────────────────────────

interface BidModalProps {
  auction: AuctionSummary
  availableBudget: number
  onClose: () => void
  onSubmit: (auctionId: string, amount: number, maxBid?: number) => Promise<void>
}

function BidModal({ auction: a, availableBudget, onClose, onSubmit }: BidModalProps) {
  const minBid = a.bidCount > 0 ? a.currentBid + 50_000 : a.openingBid
  const [amount, setAmount] = useState('')
  const [useProxy, setUseProxy] = useState(false)
  const [maxBid, setMaxBid] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [countdown, setCountdown] = useState(() => formatCountdown(a.endsAt))

  useEffect(() => {
    const t = setInterval(() => setCountdown(formatCountdown(a.endsAt)), 1000)
    return () => clearInterval(t)
  }, [a.endsAt])

  async function handleSubmit() {
    const amountNum = parseInt(amount.replace(/[^0-9]/g, ''))
    if (!amountNum || amountNum < minBid) {
      setError(`Minimum bid is ${formatEur(minBid)}`)
      return
    }
    if (amountNum > availableBudget) {
      setError(`Exceeds available budget of ${formatEur(availableBudget)}`)
      return
    }
    const maxBidNum = useProxy ? parseInt(maxBid.replace(/[^0-9]/g, '')) || undefined : undefined
    if (useProxy && maxBidNum && maxBidNum < amountNum) {
      setError('Max bid must be ≥ your stated bid')
      return
    }
    setError('')
    setLoading(true)
    try {
      await onSubmit(a.id, amountNum, maxBidNum)
      onClose()
    } catch (err: any) {
      setError(err.response?.data?.error ?? err.message ?? 'Bid failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-md)', borderRadius: 'var(--radius)', padding: 24, width: 400, maxWidth: '90vw' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 800 }}>
              BID ON {a.player.name.toUpperCase()}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>
              <span className={posClass(a.player.position)} style={{ fontSize: 9, marginRight: 6 }}>{a.player.position}</span>
              OVR {a.player.overall} · {a.player.age}y · ⏱ {countdown}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', fontSize: 18, padding: 0 }}>×</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Current bid info */}
          <div style={{ padding: '10px 14px', background: 'var(--bg-card-2)', borderRadius: 'var(--radius-sm)', display: 'flex', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Current bid</div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{a.bidCount > 0 ? formatEur(a.currentBid) : formatEur(a.openingBid)}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Minimum next bid</div>
              <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--green)' }}>{formatEur(minBid)}</div>
            </div>
          </div>

          {/* Bid amount */}
          <div>
            <label style={{ fontSize: 11, color: 'var(--text-2)', display: 'block', marginBottom: 4 }}>Your bid</label>
            <input
              type="number"
              placeholder={`Min ${formatEur(minBid)}`}
              value={amount}
              onChange={e => setAmount(e.target.value)}
              style={{ width: '100%' }}
              autoFocus
            />
          </div>

          {/* Proxy toggle */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '8px 12px', background: useProxy ? 'rgba(54,226,126,0.06)' : 'var(--bg-card-2)', border: `1px solid ${useProxy ? 'rgba(54,226,126,0.25)' : 'var(--border)'}`, borderRadius: 'var(--radius-sm)' }}>
            <input
              type="checkbox"
              checked={useProxy}
              onChange={e => setUseProxy(e.target.checked)}
              style={{ accentColor: 'var(--green)' }}
            />
            <div>
              <div style={{ fontSize: 12, fontWeight: 600 }}>Proxy bidding</div>
              <div style={{ fontSize: 11, color: 'var(--text-2)' }}>System auto-bids up to your max  -  stay competitive without watching</div>
            </div>
          </label>

          {useProxy && (
            <div>
              <label style={{ fontSize: 11, color: 'var(--text-2)', display: 'block', marginBottom: 4 }}>Maximum bid (proxy limit)</label>
              <input
                type="number"
                placeholder="e.g. 5000000"
                value={maxBid}
                onChange={e => setMaxBid(e.target.value)}
                style={{ width: '100%' }}
              />
            </div>
          )}

          {/* Budget + wage */}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-2)' }}>
            <span>Wage commitment: <span style={{ fontWeight: 700, color: 'var(--text-1)' }}>€{(a.player.overall * 200 / 1000).toFixed(0)}k/md</span></span>
            <span>Available: <span style={{ fontWeight: 700, color: 'var(--text-1)' }}>{formatEur(availableBudget)}</span></span>
          </div>

          {error && <p style={{ color: 'var(--red)', fontSize: 12, margin: 0 }}>{error}</p>}

          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button className="btn btn-outline" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
            <button className="btn btn-green" style={{ flex: 1, fontWeight: 800 }} onClick={handleSubmit} disabled={loading}>
              {loading ? 'Placing...' : 'Place Bid'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── BudgetBar ────────────────────────────────────────────────────────────────

function BudgetBar({ stats }: { stats: BudgetStats }) {
  const pctReserved = stats.totalBudget > 0 ? (stats.reservedBudget / stats.totalBudget) * 100 : 0
  const pctAvail = stats.totalBudget > 0 ? (stats.availableBudget / stats.totalBudget) * 100 : 0
  const wageCapEnabled = stats.wageCap > 0
  const wagePct = wageCapEnabled ? Math.min(100, (stats.wageBill / stats.wageCap) * 100) : 0

  return (
    <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center' }}>
      <div style={{ flex: 1, minWidth: 260 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-2)', marginBottom: 4 }}>
          <span>Transfer Budget</span>
          <span><span style={{ color: 'var(--green)', fontWeight: 700 }}>{formatEur(stats.availableBudget)} free</span> · {formatEur(stats.reservedBudget)} reserved</span>
        </div>
        <div style={{ height: 6, background: 'var(--bg-card-2)', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ height: '100%', background: 'var(--green)', width: `${pctAvail}%`, float: 'left', opacity: 0.8 }} />
          <div style={{ height: '100%', background: '#f59e0b', width: `${pctReserved}%`, float: 'left', opacity: 0.8 }} />
        </div>
      </div>
      {wageCapEnabled && (
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-2)', marginBottom: 4 }}>
            <span>Wage Cap</span>
            <span style={{ color: wagePct > 90 ? 'var(--red)' : 'var(--text-2)' }}>
              {formatEur(stats.wageBill)}/md of {formatEur(stats.wageCap)}
            </span>
          </div>
          <div style={{ height: 6, background: 'var(--bg-card-2)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ height: '100%', background: wagePct > 90 ? 'var(--red)' : '#818cf8', width: `${wagePct}%` }} />
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Transfer Market Page ─────────────────────────────────────────────────────

type Tab = 'market' | 'my-bids' | 'watchlist'

export default function TransferMarket() {
  const { id: leagueId } = useParams<{ id: string }>()
  useAuth()
  const navigate = useNavigate()

  const [pageData, setPageData] = useState<MarketPageData | null>(null)
  const [auctions, setAuctions] = useState<AuctionSummary[]>([])
  const [tab, setTab] = useState<Tab>('market')
  const [loading, setLoading] = useState(false)

  // Filters
  const [search, setSearch] = useState('')
  const [posFilter, setPosFilter] = useState('ALL')
  const [minOvr, setMinOvr] = useState('')
  const [maxOvr, setMaxOvr] = useState('')

  // Bid modal
  const [bidAuction, setBidAuction] = useState<AuctionSummary | null>(null)
  const [detailAuction, setDetailAuction] = useState<AuctionSummary | null>(null)

  // Creator
  const [finalizing, setFinalizing] = useState(false)
  const [finError, setFinError] = useState('')

  // My bids / watchlist counts
  const [myBidCount, setMyBidCount] = useState(0)
  const [watchlistCount, setWatchlistCount] = useState(0)

  // Pagination
  const [marketSkip, setMarketSkip] = useState(0)
  const [marketHasMore, setMarketHasMore] = useState(false)
  const [visibleCount, setVisibleCount] = useState(20)  // client-side limit for my-bids/watchlist

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchPage = useCallback(async () => {
    if (!leagueId) return
    try {
      const r = await api.get(`/draft/${leagueId}`)
      setPageData(r.data)
    } catch {}
  }, [leagueId])

  const fetchAuctions = useCallback(async (currentTab: Tab, filters: {
    q: string; pos: string; minOvr: string; maxOvr: string
  }, skip = 0, append = false) => {
    if (!leagueId) return
    setLoading(true)
    try {
      if (currentTab === 'market') {
        const params = new URLSearchParams()
        if (filters.q) params.set('q', filters.q)
        if (filters.pos !== 'ALL') {
          const positions = POS_GROUPS[filters.pos]
          if (positions) positions.forEach(p => params.append('pos', p))
        }
        if (filters.minOvr) params.set('minOvr', filters.minOvr)
        if (filters.maxOvr) params.set('maxOvr', filters.maxOvr)
        params.set('take', String(MARKET_PAGE + 1))  // fetch one extra to detect more
        params.set('skip', String(skip))
        const r = await api.get(`/draft/${leagueId}/market?${params}`)
        const data: AuctionSummary[] = r.data
        const hasMore = data.length > MARKET_PAGE
        setMarketHasMore(hasMore)
        setMarketSkip(skip)
        setAuctions(prev => append ? [...prev, ...data.slice(0, MARKET_PAGE)] : data.slice(0, MARKET_PAGE))
      } else if (currentTab === 'my-bids') {
        const r = await api.get(`/draft/${leagueId}/my-bids`)
        setAuctions(r.data)
        setMyBidCount(r.data.length)
        setVisibleCount(20)
      } else {
        const r = await api.get(`/draft/${leagueId}/watchlist`)
        setAuctions(r.data)
        setWatchlistCount(r.data.length)
        setVisibleCount(20)
      }
    } finally {
      setLoading(false)
    }
  }, [leagueId])

  const doFetch = useCallback((t: Tab, skip = 0, append = false) => {
    fetchAuctions(t, { q: search, pos: posFilter, minOvr, maxOvr }, skip, append)
  }, [fetchAuctions, search, posFilter, minOvr, maxOvr])

  useEffect(() => {
    fetchPage()
    doFetch(tab)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueId])

  // Re-fetch when tab changes
  useEffect(() => { doFetch(tab) }, [tab]) // eslint-disable-line react-hooks/exhaustive-deps

  // Debounce filter changes (market tab only) - reset to page 0
  useEffect(() => {
    if (tab !== 'market') return
    setMarketSkip(0)
    setMarketHasMore(false)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => doFetch('market', 0, false), search ? 300 : 0)
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, posFilter, minOvr, maxOvr])

  // Poll every 30s to update countdown/statuses
  useEffect(() => {
    const t = setInterval(() => doFetch(tab), 30_000)
    return () => clearInterval(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  // Socket  -  live bid updates
  useEffect(() => {
    if (!leagueId) return
    const socket: Socket = io()
    socket.emit('join:draft', leagueId)
    socket.on('auction:bid', (data: { auctionId: string; currentBid: number; endsAt: string }) => {
      setAuctions(prev => prev.map(a =>
        a.id === data.auctionId
          ? { ...a, currentBid: data.currentBid, endsAt: data.endsAt, bidCount: a.bidCount + 1 }
          : a,
      ))
    })
    socket.on('window:finalized', () => navigate(`/league/${leagueId}`))
    return () => { socket.disconnect() }
  }, [leagueId, navigate])

  async function handleBidSubmit(auctionId: string, amount: number, maxBid?: number) {
    await api.post(`/draft/${leagueId}/bid`, { auctionId, amount, maxBid })
    // Refresh budget and auction list
    await Promise.all([fetchPage(), doFetch(tab)])
  }

  async function handleWatch(a: AuctionSummary) {
    await api.post(`/draft/${leagueId}/watchlist/${a.id}`)
    setAuctions(prev => prev.map(x => x.id === a.id ? { ...x, isWatching: !x.isWatching } : x))
  }

  async function handleFinalize() {
    setFinError('')
    setFinalizing(true)
    try {
      await api.post(`/draft/${leagueId}/finalize`)
      navigate(`/league/${leagueId}`)
    } catch (err: any) {
      setFinError(err.response?.data?.error ?? 'Failed to finalize')
      setFinalizing(false)
    }
  }

  if (!pageData) {
    return (
      <div>
        <Navbar backTo={`/league/${leagueId}`} backLabel="League" />
        <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--text-2)' }}>Loading...</div>
      </div>
    )
  }

  const { window: win, budgetStats } = pageData
  const windowClosed = win.status === 'CLOSED'

  const openCount = win.open
  const scheduledCount = win.scheduled
  const wonCount = win.won

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)' }}>
      <Navbar backTo={`/league/${leagueId}`} backLabel="League">
        {budgetStats && (
          <span style={{ fontSize: 12, color: 'var(--green)', fontWeight: 700 }}>
            {formatEur(budgetStats.availableBudget)} available
          </span>
        )}
      </Navbar>

      {/* Header */}
      <div style={{ background: 'linear-gradient(110deg, rgba(54,226,126,0.1) 0%, var(--bg-card) 60%)', borderBottom: '1px solid var(--border)', padding: '20px 24px' }}>
        <div style={{ maxWidth: 1400, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 800, letterSpacing: 0.5 }}>
                TRANSFER WINDOW
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 4 }}>
                {openCount} auctions live · {scheduledCount} upcoming · {wonCount} completed
              </div>
            </div>
            {budgetStats && (
              <div style={{ flex: '1 1 300px', maxWidth: 500 }}>
                <BudgetBar stats={budgetStats} />
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '20px 24px', display: 'grid', gridTemplateColumns: '1fr 280px', gap: 24, alignItems: 'start' }}>

        {/* ── Main column ────────────────────────────────────────────────────── */}
        <div>
          {/* Tabs */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
            {(['market', 'my-bids', 'watchlist'] as Tab[]).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  padding: '7px 14px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid',
                  borderColor: tab === t ? 'var(--green)' : 'var(--border)',
                  background: tab === t ? 'rgba(54,226,126,0.1)' : 'transparent',
                  color: tab === t ? 'var(--green)' : 'var(--text-2)',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                }}
              >
                {t === 'market' ? 'Market' : t === 'my-bids' ? `My Bids${myBidCount > 0 ? ` (${myBidCount})` : ''}` : `Watchlist${watchlistCount > 0 ? ` (${watchlistCount})` : ''}`}
              </button>
            ))}
          </div>

          {/* Filters (market only) */}
          {tab === 'market' && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
              <input
                placeholder="Search player..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ flex: '1 1 180px', minWidth: 120 }}
              />
              <select
                value={posFilter}
                onChange={e => setPosFilter(e.target.value)}
                style={{ flex: '0 0 auto' }}
              >
                <option value="ALL">All positions</option>
                <option value="GK">GK</option>
                <option value="DEF">DEF</option>
                <option value="MID">MID</option>
                <option value="ATT">ATT</option>
              </select>
              <input
                type="number"
                placeholder="Min OVR"
                value={minOvr}
                onChange={e => setMinOvr(e.target.value)}
                style={{ width: 80 }}
              />
              <input
                type="number"
                placeholder="Max OVR"
                value={maxOvr}
                onChange={e => setMaxOvr(e.target.value)}
                style={{ width: 80 }}
              />
              {(search || posFilter !== 'ALL' || minOvr || maxOvr) && (
                <button
                  className="btn btn-outline"
                  style={{ fontSize: 11 }}
                  onClick={() => { setSearch(''); setPosFilter('ALL'); setMinOvr(''); setMaxOvr('') }}
                >
                  Clear
                </button>
              )}
            </div>
          )}

          {/* Auction grid */}
          {loading && auctions.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-2)' }}>Loading auctions...</div>
          ) : auctions.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-2)' }}>
              {tab === 'my-bids' ? 'No active bids' : tab === 'watchlist' ? 'Nothing on your watchlist' : 'No auctions found'}
            </div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
                {(tab === 'market' ? auctions : auctions.slice(0, visibleCount)).map(a => (
                  <AuctionCard
                    key={a.id}
                    auction={a}
                    onBid={setBidAuction}
                    onWatch={handleWatch}
                    onDetail={a => setDetailAuction(a)}
                  />
                ))}
              </div>
              {/* Load more - market: server-side; others: client-side */}
              {tab === 'market' && marketHasMore && (
                <button
                  className="btn btn-outline"
                  style={{ width: '100%', marginTop: 12, fontSize: 12 }}
                  disabled={loading}
                  onClick={() => doFetch('market', marketSkip + MARKET_PAGE, true)}
                >
                  {loading ? 'Loading...' : `Load more`}
                </button>
              )}
              {tab !== 'market' && auctions.length > visibleCount && (
                <button
                  className="btn btn-outline"
                  style={{ width: '100%', marginTop: 12, fontSize: 12 }}
                  onClick={() => setVisibleCount(c => c + 20)}
                >
                  Show more ({auctions.length - visibleCount} remaining)
                </button>
              )}
            </>
          )}
        </div>

        {/* ── Sidebar ──────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, position: 'sticky', top: 76 }}>

          {/* Window status card */}
          <div className="card" style={{ padding: 0 }}>
            <div className="card-header">
              <span className="accent-bar" />
              <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Window Status</span>
            </div>
            <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { label: 'Live auctions', value: openCount, color: 'var(--green)' },
                { label: 'Coming soon', value: scheduledCount, color: 'var(--text-2)' },
                { label: 'Completed', value: wonCount, color: 'var(--text-3)' },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: 'var(--text-2)' }}>{label}</span>
                  <span style={{ fontWeight: 700, color }}>{value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* How it works */}
          <div className="card" style={{ padding: 0 }}>
            <div className="card-header">
              <span className="accent-bar" />
              <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' }}>How it works</span>
            </div>
            <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                ['Open auctions', 'Bid on any live player'],
                ['Proxy bidding', 'Set a max  -  system auto-bids for you'],
                ['Anti-snipe', 'Late bids extend the auction by 5 min'],
                ['Budget reserve', 'Winning bids are locked until resolved'],
                ['Auto-fill', 'Remaining slots filled after window closes'],
              ].map(([title, desc]) => (
                <div key={title}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)' }}>{title}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-2)' }}>{desc}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Creator finalize panel */}
          {!windowClosed && (
            <div className="card" style={{ padding: 16 }}>
              <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 12 }}>
                When you're ready, finalize the window. All open auctions will close, and remaining squad slots will be auto-filled.
              </div>
              {finError && <p style={{ color: 'var(--red)', fontSize: 12, marginBottom: 8 }}>{finError}</p>}
              <button
                className="btn btn-green"
                style={{ width: '100%', fontWeight: 800 }}
                disabled={finalizing}
                onClick={handleFinalize}
              >
                {finalizing ? 'Finalizing...' : 'Finalize Window'}
              </button>
              <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 6, textAlign: 'center' }}>
                Only the league creator can do this
              </p>
            </div>
          )}

          {windowClosed && (
            <div style={{ padding: '12px 16px', background: 'rgba(54,226,126,0.08)', border: '1px solid rgba(54,226,126,0.25)', borderRadius: 'var(--radius)', textAlign: 'center' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--green)', marginBottom: 4 }}>Window Closed</div>
              <div style={{ fontSize: 12, color: 'var(--text-2)' }}>Season is starting...</div>
            </div>
          )}
        </div>
      </div>

      {/* Bid modal */}
      {bidAuction && budgetStats && (
        <BidModal
          auction={bidAuction}
          availableBudget={budgetStats.availableBudget}
          onClose={() => setBidAuction(null)}
          onSubmit={handleBidSubmit}
        />
      )}

      {/* Detail modal  -  reuse PlayerDetailModal with adapted props */}
      {detailAuction && (
        <PlayerDetailModal
          p={detailAuction.player as any}
          isMyTurn={detailAuction.status === 'OPEN' && !detailAuction.isLeading}
          canAfford={budgetStats ? detailAuction.openingBid + 50_000 <= budgetStats.availableBudget : true}
          onPick={() => { setBidAuction(detailAuction); setDetailAuction(null) }}
          onClose={() => setDetailAuction(null)}
          onToggleCompare={() => {}}
          inCompare={false}
          pickingId={null}
        />
      )}
    </div>
  )
}
