import { useEffect, useState, useCallback } from 'react'
import { api } from '../../api/client'
import { posClass, getBadgeColor, ovrColor } from '../../utils/helpers'
import { useIsMobile } from './types'
import type { ClubData, SquadPlayer, FreeAgent, TransferListing } from './types'

export default function Transfers({ leagueId, myClub, squadSize, transferWindowOpen, onRefresh }: {
  leagueId: string
  myClub: ClubData
  squadSize: number
  transferWindowOpen?: boolean
  onRefresh: () => void
}) {
  const [freeAgents, setFreeAgents] = useState<FreeAgent[]>([])
  const [listings, setListings] = useState<TransferListing[]>([])
  const [loading, setLoading] = useState(true)
  const [posFilter, setPosFilter] = useState('ALL')
  const [search, setSearch] = useState('')
  const [actionId, setActionId] = useState<string | null>(null)
  const [msg, setMsg] = useState('')
  const [confirmRelease, setConfirmRelease] = useState<SquadPlayer | null>(null)
  const [listFor, setListFor] = useState<SquadPlayer | null>(null)
  const [listPrice, setListPrice] = useState('')
  const isMobile = useIsMobile()

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([
      api.get(`/leagues/${leagueId}/free-agents`),
      api.get(`/leagues/${leagueId}/market`),
    ])
      .then(([fa, market]) => { setFreeAgents(fa.data); setListings(market.data) })
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

  async function handleList(instanceId: string, price: number) {
    setActionId(instanceId)
    setMsg('')
    setListFor(null)
    try {
      await api.post(`/leagues/${leagueId}/list`, { instanceId, askingPrice: price })
      setMsg('Player listed for sale!')
      load()
    } catch (err: any) {
      setMsg(err.response?.data?.error ?? 'Failed to list player')
    } finally { setActionId(null) }
  }

  async function handleDelist(instanceId: string) {
    setActionId(instanceId)
    setMsg('')
    try {
      await api.delete(`/leagues/${leagueId}/list/${instanceId}`)
      setMsg('Listing removed.')
      load()
    } catch (err: any) {
      setMsg(err.response?.data?.error ?? 'Failed to remove listing')
    } finally { setActionId(null) }
  }

  async function handleBuy(instanceId: string) {
    setActionId(instanceId)
    setMsg('')
    try {
      await api.post(`/leagues/${leagueId}/buy/${instanceId}`)
      setMsg('Transfer complete!')
      load()
      onRefresh()
    } catch (err: any) {
      setMsg(err.response?.data?.error ?? 'Failed to complete transfer')
    } finally { setActionId(null) }
  }

  const positions = ['ALL', 'GK', 'CB', 'LB', 'RB', 'CDM', 'CM', 'CAM', 'LM', 'RM', 'LW', 'RW', 'ST']

  const filtered = freeAgents.filter(p =>
    (posFilter === 'ALL' || p.player.position === posFilter) &&
    (!search || p.player.name.toLowerCase().includes(search.toLowerCase()))
  )

  const squadFull = myClub.squad.length >= squadSize
  const squadTooSmall = myClub.squad.length <= 11
  const listedIds = new Set(listings.filter(l => l.sellerClub.id === myClub.id).map(l => l.instanceId))
  const otherListings = listings.filter(l => l.sellerClub.id !== myClub.id)

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

      {transferWindowOpen === false && (
        <div style={{ gridColumn: '1 / -1', padding: '10px 14px', background: 'rgba(245,166,35,0.08)', border: '1px solid rgba(245,166,35,0.3)', borderRadius: 'var(--radius-sm)', marginBottom: 16, fontSize: 12, color: 'var(--gold)', fontWeight: 600 }}>
          Transfer window is currently closed. No transfers can be made.
        </div>
      )}

      {/* Transfer Market */}
      {otherListings.length > 0 && (
        <div style={{ gridColumn: '1 / -1', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-1)' }}>Transfer Market</div>
            <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{otherListings.length} listed</span>
          </div>
          {!isMobile && (
            <div style={{ display: 'grid', gridTemplateColumns: '28px 1fr 80px 36px 36px 36px 36px auto', gap: 8, padding: '6px 14px', borderBottom: '1px solid var(--border)' }}>
              {['', 'Player', 'Club', 'OVR', 'FIT', 'MOR', 'FRM', ''].map((h, i) => (
                <span key={i} style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</span>
              ))}
            </div>
          )}
          {otherListings.map(l => {
            const pl = l.instance.player
            const inst = l.instance
            return (
              <div key={l.id} style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? '28px 1fr auto' : '28px 1fr 80px 36px 36px 36px 36px auto',
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
                    {inst.injured && <span style={{ fontSize: 10, color: 'var(--red)', fontWeight: 700 }}>INJ</span>}
                  </div>
                </div>
                {!isMobile && <span style={{ fontSize: 11, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.sellerClub.name}</span>}
                <span style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 800, color: ovrColor(pl.overall), textAlign: 'center' }}>{pl.overall}</span>
                {!isMobile && <>
                  <span style={{ fontSize: 11, color: inst.fitness >= 75 ? 'var(--green)' : inst.fitness >= 50 ? 'var(--gold)' : 'var(--red)', textAlign: 'center' }}>{inst.fitness}</span>
                  <span style={{ fontSize: 11, color: inst.morale >= 70 ? 'var(--green)' : inst.morale >= 50 ? 'var(--gold)' : 'var(--red)', textAlign: 'center' }}>{inst.morale}</span>
                  <span style={{ fontSize: 11, color: inst.form >= 70 ? 'var(--green)' : inst.form >= 50 ? 'var(--gold)' : 'var(--red)', textAlign: 'center' }}>{inst.form}</span>
                </>}
                <button
                  onClick={() => handleBuy(l.instanceId)}
                  disabled={!!actionId || squadFull || myClub.budget < l.askingPrice}
                  style={{
                    padding: '4px 10px', borderRadius: 5, fontSize: 11, fontWeight: 700,
                    border: 'none', cursor: (squadFull || myClub.budget < l.askingPrice) ? 'not-allowed' : 'pointer',
                    background: (squadFull || myClub.budget < l.askingPrice) ? 'rgba(255,255,255,0.06)' : 'var(--green)',
                    color: (squadFull || myClub.budget < l.askingPrice) ? 'var(--text-3)' : '#000',
                    opacity: actionId === l.instanceId ? 0.5 : 1,
                    whiteSpace: 'nowrap',
                  }}
                  title={myClub.budget < l.askingPrice ? `Need €${(l.askingPrice / 1_000_000).toFixed(1)}M` : ''}
                >
                  {actionId === l.instanceId ? '…' : `€${l.askingPrice >= 1_000_000 ? (l.askingPrice / 1_000_000).toFixed(1) + 'M' : (l.askingPrice / 1_000).toFixed(0) + 'k'}`}
                </button>
              </div>
            )
          })}
        </div>
      )}

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
            <div style={{ display: 'flex', gap: 4 }}>
              {listedIds.has(p.id) ? (
                <button
                  onClick={() => handleDelist(p.id)}
                  disabled={!!actionId}
                  style={{ padding: '4px 8px', borderRadius: 5, fontSize: 11, fontWeight: 700, border: '1px solid var(--gold)', cursor: 'pointer', background: 'transparent', color: 'var(--gold)', opacity: actionId === p.id ? 0.5 : 1, whiteSpace: 'nowrap' }}
                >{actionId === p.id ? '…' : 'Delist'}</button>
              ) : (
                <button
                  onClick={() => { setListFor(p); setListPrice(String(p.player.baseValue)) }}
                  disabled={!!actionId || squadTooSmall}
                  style={{ padding: '4px 8px', borderRadius: 5, fontSize: 11, fontWeight: 700, border: '1px solid var(--text-3)', cursor: squadTooSmall ? 'not-allowed' : 'pointer', background: 'transparent', color: squadTooSmall ? 'var(--text-3)' : 'var(--text-2)', whiteSpace: 'nowrap' }}
                >List</button>
              )}
              <button
                onClick={() => setConfirmRelease(p)}
                disabled={!!actionId || squadTooSmall || listedIds.has(p.id)}
                style={{ padding: '4px 8px', borderRadius: 5, fontSize: 11, fontWeight: 700, border: '1px solid var(--red)', cursor: (squadTooSmall || listedIds.has(p.id)) ? 'not-allowed' : 'pointer', background: 'transparent', color: (squadTooSmall || listedIds.has(p.id)) ? 'var(--text-3)' : 'var(--red)', opacity: actionId === p.id ? 0.5 : 1, whiteSpace: 'nowrap' }}
              >{actionId === p.id ? '…' : 'Release'}</button>
            </div>
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

      {/* List for sale dialog */}
      {listFor && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '24px 28px', maxWidth: 360, width: '100%' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', marginBottom: 4 }}>List {listFor.player.name} for sale</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 16 }}>OVR {listFor.player.overall} · {listFor.player.position} · Age {listFor.player.age}</div>
            <label style={{ fontSize: 12, color: 'var(--text-2)', display: 'block', marginBottom: 6 }}>Asking price (€)</label>
            <input
              type="number" min={1000} step={50000}
              value={listPrice}
              onChange={e => setListPrice(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-1)', fontSize: 14, marginBottom: 6 }}
            />
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 20 }}>
              Market value: €{(listFor.player.baseValue / 1_000_000).toFixed(1)}M
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setListFor(null)}>Cancel</button>
              <button
                onClick={() => { const p = parseInt(listPrice); if (p >= 1000) handleList(listFor.id, p) }}
                disabled={!listPrice || parseInt(listPrice) < 1000}
                style={{ padding: '7px 18px', borderRadius: 7, background: 'var(--green)', border: 'none', color: '#000', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}
              >List for €{parseInt(listPrice) >= 1_000_000 ? (parseInt(listPrice) / 1_000_000).toFixed(1) + 'M' : (parseInt(listPrice) / 1_000).toFixed(0) + 'k'}</button>
            </div>
          </div>
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
