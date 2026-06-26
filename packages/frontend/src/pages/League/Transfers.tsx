import { useEffect, useState, useCallback } from 'react'
import { api } from '../../api/client'
import { posClass, ovrColor } from '../../utils/helpers'
import { PlayerPhoto } from '../../components/PlayerPhoto'
import { useIsMobile } from './types'
import type { ClubData, SquadPlayer, FreeAgent, TransferListing } from './types'
import styles from './Transfers.module.css'

function suggestedPrice(baseValue: number, form: number, morale: number, boosts = 0): number {
  const formFactor = 1 + (form - 60) * 0.005
  const moraleFactor = 1 + (morale - 60) * 0.002
  const boostFactor = 1 + boosts * 0.05
  const raw = baseValue * formFactor * moraleFactor * boostFactor
  return Math.max(100_000, Math.round(raw / 100_000) * 100_000)
}

function fmtPrice(n: number): string {
  return n >= 1_000_000 ? `€${(n / 1_000_000).toFixed(1)}M` : `€${Math.round(n / 1_000)}k`
}

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
      <div className={isMobile ? styles.playerRowFreeAgentMobile : styles.playerRowFreeAgent}>
        <PlayerPhoto url={pl.photoUrl} name={pl.name} size={28} className={styles.playerAvatar} />
        <div className={styles.playerInfo}>
          <div className={styles.playerName}>{pl.name}</div>
          <div className={styles.playerMeta}>
            <span className={posClass(pl.position)} style={{ fontSize: 9 }}>{pl.position}</span>
            <span className={styles.playerAge}>Age {pl.age}</span>
            {p.injured && <span className={styles.playerInjured}>INJ</span>}
            {!p.injured && p.form >= 76 && <span style={{ fontSize: 9, fontWeight: 800, color: '#cf9438', background: 'rgba(207,148,56,0.12)', padding: '1px 4px', borderRadius: 3, letterSpacing: '0.04em' }}>IF</span>}
          </div>
        </div>
        <span className={styles.playerOvr} style={{ color: ovrColor(pl.overall) }}>{pl.overall}</span>
        {!isMobile && <>
          <span className={styles.playerStat} data-level={p.fitness >= 75 ? 'high' : p.fitness >= 50 ? 'mid' : 'low'}>{p.fitness}</span>
          <span className={styles.playerStat} data-level={p.morale >= 70 ? 'high' : p.morale >= 50 ? 'mid' : 'low'}>{p.morale}</span>
          <span className={styles.playerStat} data-level={p.form >= 70 ? 'high' : p.form >= 50 ? 'mid' : 'low'}>{p.form}</span>
        </>}
        {action}
      </div>
    )
  }

  return (
    <div className={styles.root}>

      {transferWindowOpen === false && (
        <div className={styles.windowBanner}>
          Transfer window is currently closed. No transfers can be made.
        </div>
      )}

      {/* Transfer Market */}
      {otherListings.length > 0 && (
        <div className={styles.panelFullWidth}>
          <div className={styles.panelHeader}>
            <div className={styles.panelTitle}>Transfer Market</div>
            <span className={styles.panelCount}>{otherListings.length} listed</span>
          </div>
          {!isMobile && (
            <div className={styles.colHeadersMarket}>
              {['', 'Player', 'Club', 'OVR', 'FIT', 'MOR', 'FRM', ''].map((h, i) => (
                <span key={i} className={i >= 3 ? styles.colHeadCenter : styles.colHead}>{h}</span>
              ))}
            </div>
          )}
          {otherListings.map(l => {
            const pl = l.instance.player
            const inst = l.instance
            const canBuy = !squadFull && myClub.budget >= l.askingPrice
            return (
              <div key={l.id} className={isMobile ? styles.playerRowMarketMobile : styles.playerRowMarket}>
                <PlayerPhoto url={pl.photoUrl} name={pl.name} size={28} className={styles.playerAvatar} />
                <div className={styles.playerInfo}>
                  <div className={styles.playerName}>{pl.name}</div>
                  <div className={styles.playerMeta}>
                    <span className={posClass(pl.position)} style={{ fontSize: 9 }}>{pl.position}</span>
                    <span className={styles.playerAge}>Age {pl.age}</span>
                    {inst.injured && <span className={styles.playerInjured}>INJ</span>}
                    {!inst.injured && inst.form >= 76 && <span style={{ fontSize: 9, fontWeight: 800, color: '#cf9438', background: 'rgba(207,148,56,0.12)', padding: '1px 4px', borderRadius: 3, letterSpacing: '0.04em' }}>IF</span>}
                  </div>
                </div>
                {!isMobile && <span className={styles.playerClub}>{l.sellerClub.name}</span>}
                <span className={styles.playerOvr} style={{ color: ovrColor(pl.overall) }}>{pl.overall}</span>
                {!isMobile && <>
                  <span className={styles.playerStat} data-level={inst.fitness >= 75 ? 'high' : inst.fitness >= 50 ? 'mid' : 'low'}>{inst.fitness}</span>
                  <span className={styles.playerStat} data-level={inst.morale >= 70 ? 'high' : inst.morale >= 50 ? 'mid' : 'low'}>{inst.morale}</span>
                  <span className={styles.playerStat} data-level={inst.form >= 70 ? 'high' : inst.form >= 50 ? 'mid' : 'low'}>{inst.form}</span>
                </>}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                  <button
                    className={styles.btnBuy}
                    onClick={() => handleBuy(l.instanceId)}
                    disabled={!!actionId || squadFull || myClub.budget < l.askingPrice}
                    style={{ opacity: actionId === l.instanceId ? 0.5 : canBuy ? 1 : undefined }}
                    title={myClub.budget < l.askingPrice ? `Need ${fmtPrice(l.askingPrice)}` : ''}
                  >
                    {actionId === l.instanceId ? '…' : fmtPrice(l.askingPrice)}
                  </button>
                  {l.marketValue && l.marketValue !== l.askingPrice && (
                    <span style={{ fontSize: 10, color: l.askingPrice < l.marketValue * 0.95 ? 'var(--green)' : l.askingPrice > l.marketValue * 1.05 ? 'var(--accent)' : 'var(--ash)', whiteSpace: 'nowrap' }}>
                      MV {fmtPrice(l.marketValue)}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Free agents */}
      <div className={styles.panel}>
        <div className={styles.filterArea}>
          <div className={styles.filterTitle}>
            <div className={styles.panelTitle}>Free Agents</div>
            <span className={styles.panelCount}>{freeAgents.length} available</span>
            {squadFull && <span className={styles.panelWarning}>Squad full</span>}
          </div>
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by name…"
            className={styles.searchInput}
          />
          <div className={styles.posFilters}>
            {positions.map(p => (
              <button key={p} onClick={() => setPosFilter(p)} className={posFilter === p ? styles.posChipActive : styles.posChip}>{p}</button>
            ))}
          </div>
        </div>
        {!isMobile && (
          <div className={styles.colHeadersFreeAgent}>
            {['', 'Player', 'OVR', 'FIT', 'MOR', 'FRM', ''].map((h, i) => (
              <span key={i} className={i >= 2 ? styles.colHeadCenter : styles.colHead}>{h}</span>
            ))}
          </div>
        )}
        {loading ? (
          <div className={styles.emptyState}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div className={styles.emptyState}>No free agents match your filter.</div>
        ) : (
          filtered.map(p => (
            <PlayerRow key={p.id} p={p} action={
              <button
                className={styles.btnSign}
                onClick={() => handlePickup(p.id)}
                disabled={!!actionId || squadFull}
                style={{ opacity: actionId === p.id ? 0.5 : 1 }}
              >{actionId === p.id ? '…' : 'Sign'}</button>
            } />
          ))
        )}
      </div>

      {/* Your squad — release panel */}
      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <div className={styles.panelTitle}>Your Squad</div>
          <span className={styles.panelCount}>{myClub.squad.length}/{squadSize}</span>
          {squadTooSmall && <span className={styles.panelWarning}>Min 11 — can't release</span>}
        </div>
        {!isMobile && (
          <div className={styles.colHeadersFreeAgent}>
            {['', 'Player', 'OVR', 'FIT', 'MOR', 'FRM', ''].map((h, i) => (
              <span key={i} className={i >= 2 ? styles.colHeadCenter : styles.colHead}>{h}</span>
            ))}
          </div>
        )}
        {[...myClub.squad].sort((a, b) => b.player.overall - a.player.overall).map(p => (
          <PlayerRow key={p.id} p={p} action={
            <div className={styles.actionGroup}>
              {listedIds.has(p.id) ? (
                <button
                  className={styles.btnDelist}
                  onClick={() => handleDelist(p.id)}
                  disabled={!!actionId}
                  style={{ opacity: actionId === p.id ? 0.5 : 1 }}
                >{actionId === p.id ? '…' : 'Delist'}</button>
              ) : (
                <button
                  className={styles.btnList}
                  onClick={() => {
                    const boosts = (p.boosts ?? []).length
                    setListFor(p)
                    setListPrice(String(suggestedPrice(p.player.baseValue, p.form, p.morale, boosts)))
                  }}
                  disabled={!!actionId || squadTooSmall}
                >List</button>
              )}
              <button
                className={styles.btnRelease}
                onClick={() => setConfirmRelease(p)}
                disabled={!!actionId || squadTooSmall || listedIds.has(p.id)}
                style={{ opacity: actionId === p.id ? 0.5 : 1 }}
              >{actionId === p.id ? '…' : 'Release'}</button>
            </div>
          } />
        ))}
      </div>

      {/* Feedback banner */}
      {msg && (
        <div className={msg.includes('!') ? styles.feedbackSuccess : styles.feedbackError}>
          {msg}
          <button className={styles.feedbackClose} onClick={() => setMsg('')}>×</button>
        </div>
      )}

      {/* List for sale dialog */}
      {listFor && (
        <div className={styles.overlay}>
          <div className={styles.dialog}>
            <div className={styles.dialogTitle}>List {listFor.player.name} for sale</div>
            <div className={styles.dialogSub}>OVR {listFor.player.overall} · {listFor.player.position} · Age {listFor.player.age}</div>
            <label className={styles.dialogLabel}>Asking price (€)</label>
            <input
              type="number" min={1000} step={50000}
              value={listPrice}
              onChange={e => setListPrice(e.target.value)}
              className={styles.dialogInput}
            />
            {(() => {
              const boosts = (listFor.boosts ?? []).length
              const mv = suggestedPrice(listFor.player.baseValue, listFor.form, listFor.morale, boosts)
              const premium = Math.round((mv / listFor.player.baseValue - 1) * 100)
              return (
                <div className={styles.dialogMarketValue}>
                  Suggested: {fmtPrice(mv)}
                  {premium !== 0 && (
                    <span style={{ marginLeft: 6, fontSize: 11, color: premium > 0 ? 'var(--green)' : 'var(--accent)' }}>
                      {premium > 0 ? `+${premium}%` : `${premium}%`} form premium
                    </span>
                  )}
                </div>
              )
            })()}
            <div className={styles.dialogActions}>
              <button className="btn btn-ghost" onClick={() => setListFor(null)}>Cancel</button>
              <button
                className={styles.btnConfirmList}
                onClick={() => { const p = parseInt(listPrice); if (p >= 1000) handleList(listFor.id, p) }}
                disabled={!listPrice || parseInt(listPrice) < 1000}
              >List for €{parseInt(listPrice) >= 1_000_000 ? (parseInt(listPrice) / 1_000_000).toFixed(1) + 'M' : (parseInt(listPrice) / 1_000).toFixed(0) + 'k'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Release confirmation dialog */}
      {confirmRelease && (
        <div className={styles.overlay}>
          <div className={styles.dialog}>
            <div className={styles.dialogTitle}>Release {confirmRelease.player.name}?</div>
            <div className={styles.dialogBody}>
              They will become a free agent and any other club in the league can sign them. This cannot be undone.
            </div>
            <div className={styles.dialogActions}>
              <button className="btn btn-ghost" onClick={() => setConfirmRelease(null)}>Cancel</button>
              <button
                className={styles.btnConfirmRelease}
                onClick={() => handleRelease(confirmRelease.id)}
              >Release</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
