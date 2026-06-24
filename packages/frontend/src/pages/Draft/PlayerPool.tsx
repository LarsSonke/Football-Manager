import { flagUrl } from '../../utils/flagCodes'
import { posClass, ovrColor } from '../../utils/helpers'
import type { PlayerData, AvailablePlayer, ClubInfo } from './types'

// ─── MiniStats ────────────────────────────────────────────────────────────────

function MiniStats({ p }: { p: PlayerData }) {
  const stats: [string, number][] = [
    ['PAC', p.pace], ['SHO', p.shooting], ['PAS', p.passing],
    ['DRI', p.dribbling], ['DEF', p.defending], ['PHY', p.physical],
  ]
  return (
    <div style={{ display: 'flex', gap: 10 }}>
      {stats.map(([label, val]) => (
        <div key={label} style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, lineHeight: 1, color: val >= 80 ? 'var(--green)' : val >= 65 ? 'var(--text-1)' : 'var(--text-2)' }}>{val}</div>
          <div style={{ fontSize: 9, color: 'var(--text-2)', marginTop: 2, fontWeight: 600 }}>{label}</div>
        </div>
      ))}
    </div>
  )
}

// ─── PlayerPool ───────────────────────────────────────────────────────────────

interface PlayerPoolProps {
  players: AvailablePlayer[]
  playersLoading: boolean
  hasMore: boolean
  page: number
  posFilter: string
  search: string
  minOvr: string
  maxOvr: string
  canAfford: boolean
  myClub: ClubInfo | undefined
  isMyTurn: boolean
  isAuction: boolean
  nominateMode: boolean
  isMyNominatorTurn: boolean
  auctionInstanceId: string | null | undefined
  picking: string | null
  compareList: PlayerData[]
  error: string
  onPosFilterChange: (v: string) => void
  onSearchChange: (v: string) => void
  onMinOvrChange: (v: string) => void
  onMaxOvrChange: (v: string) => void
  onCanAffordToggle: () => void
  onClearFilters: () => void
  onPlayerClick: (inst: AvailablePlayer) => void
  onToggleCompare: (p: PlayerData) => void
  onPick: (playerId: string) => void
  onNominate: (instanceId: string) => void
  onLoadMore: () => void
  onCancelNominate: () => void
}

export function PlayerPool({
  players, playersLoading, hasMore,
  posFilter, search, minOvr, maxOvr, canAfford,
  myClub, isMyTurn, isAuction, nominateMode, isMyNominatorTurn, auctionInstanceId,
  picking, compareList, error,
  onPosFilterChange, onSearchChange, onMinOvrChange, onMaxOvrChange,
  onCanAffordToggle, onClearFilters, onPlayerClick, onToggleCompare,
  onPick, onNominate, onLoadMore,
}: PlayerPoolProps) {
  return (
    <div>
      <div className="card-header" style={{ marginBottom: 14, borderRadius: 'var(--radius) var(--radius) 0 0' }}>
        <span className="accent-bar" />
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Available Pool</span>
      </div>

      {/* Filter row 1: position tabs + search */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
          {['ALL', 'GK', 'DEF', 'MID', 'ATT'].map(g => (
            <button key={g} onClick={() => onPosFilterChange(g)} style={{
              padding: '7px 14px', border: 'none', cursor: 'pointer',
              fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 700,
              background: posFilter === g ? 'var(--green)' : 'transparent',
              color: posFilter === g ? '#000' : 'var(--text-2)',
              transition: 'all 0.15s',
            }}>{g}</button>
          ))}
          <button onClick={() => onPosFilterChange('RECOMMEND')} style={{
            padding: '7px 14px', border: 'none', cursor: 'pointer',
            fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 700,
            background: posFilter === 'RECOMMEND' ? 'var(--gold)' : 'transparent',
            color: posFilter === 'RECOMMEND' ? '#000' : 'var(--gold)',
            transition: 'all 0.15s',
          }} title="Show affordable players for positions your squad is missing">⭐ Recommend</button>
        </div>
        <input placeholder="Search player..." value={search} onChange={e => onSearchChange(e.target.value)} style={{ flex: 1, minWidth: 160, maxWidth: 240 }} />
      </div>

      {/* Filter row 2: OVR range + can afford + count */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ fontSize: 11, color: 'var(--text-2)', whiteSpace: 'nowrap' }}>OVR</span>
          <input
            type="number" min={40} max={99} placeholder="min"
            value={minOvr} onChange={e => onMinOvrChange(e.target.value)}
            style={{ width: 56, fontSize: 12, padding: '5px 7px' }}
          />
          <span style={{ fontSize: 11, color: 'var(--text-3)' }}>–</span>
          <input
            type="number" min={40} max={99} placeholder="max"
            value={maxOvr} onChange={e => onMaxOvrChange(e.target.value)}
            style={{ width: 56, fontSize: 12, padding: '5px 7px' }}
          />
        </div>
        <button
          onClick={onCanAffordToggle}
          style={{
            padding: '6px 12px', borderRadius: 'var(--radius-sm)', fontSize: 12, fontWeight: 700,
            cursor: 'pointer', border: `1px solid ${canAfford ? 'var(--green)' : 'var(--border)'}`,
            background: canAfford ? 'rgba(54,226,126,0.12)' : 'transparent',
            color: canAfford ? 'var(--green)' : 'var(--text-2)',
          }}
          title="Only show players you can afford"
        >
          💰 Can Afford
        </button>
        {(minOvr || maxOvr || canAfford || posFilter !== 'ALL' || search) && (
          <button
            onClick={onClearFilters}
            style={{ padding: '5px 10px', borderRadius: 'var(--radius-sm)', fontSize: 11, cursor: 'pointer', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-3)' }}
          >✕ Clear</button>
        )}
        <span style={{ fontSize: 12, color: 'var(--text-2)', marginLeft: 'auto', whiteSpace: 'nowrap' }}>
          {playersLoading ? 'Loading...' : `${players.length} shown${hasMore ? '+' : ''}`}
        </span>
      </div>

      {posFilter === 'RECOMMEND' && (
        <div style={{ padding: '8px 12px', background: 'rgba(233,196,106,0.08)', border: '1px solid rgba(233,196,106,0.2)', borderRadius: 'var(--radius-sm)', marginBottom: 12, fontSize: 12, color: 'var(--gold)' }}>
          ⭐ Showing affordable players for your missing squad positions
        </div>
      )}

      {error && <p className="error-text" style={{ marginBottom: 10 }}>{error}</p>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 'calc(100vh - 340px)', overflowY: 'auto', paddingRight: 4 }}>
        {playersLoading && (
          <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-2)', fontSize: 13 }}>Loading players...</div>
        )}
        {!playersLoading && players.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-2)' }}>No players match your filter.</div>
        )}
        {players.map(inst => {
          const p = inst.player
          const flagSrc = flagUrl(p.nationality)
          const playerAffordable = !myClub || myClub.budget >= p.baseValue
          const isPicking = picking === p.id
          const inCompare = compareList.some(c => c.id === p.id)

          return (
            <div
              key={inst.id}
              style={{
                display: 'grid', gridTemplateColumns: '44px 44px 1fr auto auto auto',
                alignItems: 'center', gap: 12, padding: '10px 14px',
                background: inCompare ? 'rgba(233,196,106,0.06)' : 'var(--bg-card)',
                border: `1px solid ${inCompare ? 'rgba(233,196,106,0.35)' : 'var(--border)'}`,
                borderRadius: 'var(--radius-sm)', opacity: playerAffordable ? 1 : 0.45,
                cursor: 'pointer', transition: 'border-color 0.15s, background 0.15s',
              }}
              onClick={() => onPlayerClick(inst)}
              onMouseEnter={e => { if (!inCompare && playerAffordable) (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border-md)' }}
              onMouseLeave={e => { if (!inCompare) (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border)' }}
            >
              {/* Face photo */}
              <div style={{ width: 44, height: 52, borderRadius: 6, overflow: 'hidden', background: 'var(--bg-base)', flexShrink: 0 }}>
                {p.photoUrl
                  ? <img src={p.photoUrl} alt="" referrerPolicy="no-referrer" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }} onError={e => { const el = e.currentTarget as HTMLImageElement; el.style.display = 'none'; const p = el.parentElement; if (p) p.setAttribute('data-failed', '1') }} />
                  : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)', fontSize: 22 }}>👤</div>
                }
              </div>

              {/* OVR + all positions */}
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 800, lineHeight: 1, color: ovrColor(p.overall) }}>{p.overall}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, justifyContent: 'center', marginTop: 3 }}>
                  {(p.positions?.length ? p.positions : [p.position]).map((pos, i) => (
                    <span key={pos} className={posClass(pos)} style={{ fontSize: 8, padding: '1px 3px', opacity: i === 0 ? 1 : 0.65 }}>{pos}</span>
                  ))}
                </div>
              </div>

              {/* Name + stats */}
              <div>
                <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-1)', marginBottom: 4 }}>
                  {p.name}
                  <span style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 400, marginLeft: 8 }}>
                    {flagSrc && <img src={flagSrc} alt="" style={{ width: 16, height: 12, verticalAlign: 'middle', borderRadius: 1, marginRight: 3 }} />}{p.nationality} · {p.age}y
                  </span>
                </div>
                <MiniStats p={p} />
              </div>

              {/* Price */}
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, color: playerAffordable ? 'var(--text-1)' : 'var(--red)' }}>
                  €{(p.baseValue / 1000).toFixed(1)}M
                </div>
                {myClub && (
                  <div style={{ fontSize: 10, color: 'var(--text-2)', marginTop: 2 }}>
                    {playerAffordable ? `€${((myClub.budget - p.baseValue) / 1000).toFixed(1)}M left` : "Can't afford"}
                  </div>
                )}
              </div>

              {/* Compare button */}
              <button
                className={`btn ${inCompare ? 'btn-gold' : 'btn-ghost'}`}
                style={{ fontSize: 12, padding: '6px 10px' }}
                onClick={e => { e.stopPropagation(); onToggleCompare(p) }}
                title="Compare"
              >⇄</button>

              {/* Pick/Nominate button */}
              {isAuction ? (
                <button
                  className={`btn ${nominateMode && isMyNominatorTurn && !auctionInstanceId ? 'btn-green' : 'btn-ghost'}`}
                  style={{ fontSize: 12, padding: '7px 14px', minWidth: 72 }}
                  disabled={!isMyNominatorTurn || !!auctionInstanceId}
                  onClick={e => { e.stopPropagation(); onNominate(inst.id) }}
                >
                  Nominate
                </button>
              ) : (
                <button
                  className={`btn ${isMyTurn && playerAffordable ? 'btn-green' : 'btn-ghost'}`}
                  style={{ fontSize: 12, padding: '7px 14px', minWidth: 60 }}
                  disabled={!isMyTurn || !playerAffordable || !!picking}
                  onClick={e => { e.stopPropagation(); onPick(p.id) }}
                >
                  {isPicking ? '...' : 'Pick'}
                </button>
              )}
            </div>
          )
        })}
      </div>

      {/* Load more */}
      {hasMore && (
        <button
          className="btn btn-outline"
          style={{ width: '100%', marginTop: 10, fontSize: 12 }}
          disabled={playersLoading}
          onClick={onLoadMore}
        >
          {playersLoading ? 'Loading...' : 'Load More'}
        </button>
      )}
    </div>
  )
}
