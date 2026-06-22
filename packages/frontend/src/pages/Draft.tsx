import { useEffect, useState, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { io, type Socket } from 'socket.io-client'
import { useAuth } from '../stores/auth.store'
import { api } from '../api/client'
import type { DraftPickEvent } from '@football/shared'
import { flagUrl } from '../utils/flagCodes'

// ─── Types ────────────────────────────────────────────────────────────────────

interface PlayerData {
  id: string; name: string; nationality: string | null; position: string
  age: number; overall: number; potential: number
  pace: number; shooting: number; passing: number
  dribbling: number; defending: number; physical: number
  positions: string[]; preferredRoles: string[]; baseValue: number
  photoUrl: string | null
}

// ─── Tooltip descriptions ─────────────────────────────────────────────────────

const ROLE_DESCRIPTIONS: Record<string, string> = {
  'shot-stopper':       'Focuses purely on making saves — better reflexes and reactions between the posts.',
  'sweeper-keeper':     'Sweeps behind the defence — rushes out for through balls, aggressive 1v1.',
  'stopper':            'Aggressive centre-back — wins direct confrontations and aerial duels.',
  'ball-playing-cb':    'Starts attacks from the back — accurate long passes out of defence.',
  'attacking-fullback': 'Overlaps and delivers crosses — contributes directly to offensive play.',
  'fullback':           'Stays defensively solid — prioritises marking wingers and covering depth.',
  'holding':            'Sits deep and shields the backline — breaks up play and covers space.',
  'defensive-mid':      'Intercepts and disrupts — strong defensive presence in the midfield.',
  'box-to-box':         'Gets forward and tracks back — contributes to both attack and defence.',
  'deep-lying':         'Dictates tempo from deep — accurate passing and game management.',
  'playmaker':          'Creates chances for others — boosts key passes and assists.',
  'shadow-striker':     'Arrives late in the box — high runs and finishing from midfield positions.',
  'winger':             'Provides width and pace — dribbles past fullbacks, delivers crosses.',
  'inside-forward':     'Cuts inside onto stronger foot — dangerous at shooting from wide angles.',
  'false-9':            'Drops deep to link play — pulls defenders out of position, creates space.',
  'complete':           'Balanced all-round — hold-up, movement and finishing in equal measure.',
  'target-forward':     'Physical aerial presence — brings others into play and wins flick-ons.',
}

interface AvailablePlayer {
  id: string; playerId: string; player: PlayerData
}

interface PickRecord {
  id: string; round: number; pickNumber: number; price: number; playerId: string
  club: { id: string; name: string }
}

interface AuctionRound {
  nominatorIdx: number
  instanceId: string | null
  playerId: string | null
  highBid: number
  highBidderId: string | null
  endsAt: string | null
  budgets: Record<string, number>
}

interface DraftSession {
  id: string; status: string; type: string
  currentRound: number; roundsTotal: number
  currentPick: number; pickOrder: string[]
  pickTimeLimit: number
  picks: PickRecord[]
  auctionState?: AuctionRound | null
}

interface PickedPlayer {
  id: string; name: string; position: string; overall: number; photoUrl?: string | null
}

interface DraftState {
  session: DraftSession
  availablePlayers: AvailablePlayer[]
  currentClubId: string | null
  pickedPlayerMap: Record<string, PickedPlayer>
}

interface ClubInfo {
  id: string; name: string; budget: number; isAI: boolean
  user: { id: string; username: string } | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const POS_GROUPS: Record<string, string[]> = {
  GK: ['GK'],
  DEF: ['CB', 'LB', 'RB'],
  MID: ['CDM', 'CM', 'CAM', 'LM', 'RM'],
  ATT: ['LW', 'RW', 'CF', 'ST'],
}

function posClass(pos: string): string {
  if (pos === 'GK') return 'pos pos-gk'
  if (['CB','LB','RB'].includes(pos)) return 'pos pos-def'
  if (['CDM','CM','CAM','LM','RM'].includes(pos)) return 'pos pos-mid'
  return 'pos pos-att'
}

function statColor(v: number, cmp?: number) {
  if (cmp !== undefined) return v > cmp ? 'var(--green)' : v < cmp ? 'var(--red)' : 'var(--text-2)'
  return v >= 85 ? 'var(--green)' : v >= 75 ? 'var(--blue)' : v >= 65 ? 'var(--text-1)' : 'var(--text-2)'
}

function statBarColor(v: number, cmp?: number) {
  if (cmp !== undefined) return v > cmp ? 'var(--green)' : v < cmp ? 'var(--red)' : 'var(--border-md)'
  return v >= 85 ? 'var(--green)' : v >= 75 ? 'var(--blue)' : 'var(--border-md)'
}

function ovrColor(ovr: number) {
  return ovr >= 85 ? '#e9c46a' : ovr >= 75 ? '#36e27e' : 'var(--text-1)'
}

// ─── HoverTag (badge with portal tooltip) ────────────────────────────────────

function HoverTag({ label, description, badgeStyle }: {
  label: string; description?: string; badgeStyle?: React.CSSProperties
}) {
  const [tip, setTip] = useState<{ x: number; y: number } | null>(null)
  const ref = useRef<HTMLSpanElement>(null)

  function onEnter() {
    if (!description) return
    const r = ref.current?.getBoundingClientRect()
    if (r) setTip({ x: r.left + r.width / 2, y: r.bottom + 8 })
  }

  return (
    <>
      <span
        ref={ref}
        className="badge"
        style={{ cursor: description ? 'help' : 'default', ...badgeStyle }}
        onMouseEnter={onEnter}
        onMouseLeave={() => setTip(null)}
      >{label}</span>
      {tip && description && createPortal(
        <div style={{
          position: 'fixed', left: tip.x, top: tip.y, transform: 'translateX(-50%)',
          zIndex: 99999, width: 220, background: 'var(--bg-base)',
          border: '1px solid var(--border-md)', borderRadius: 'var(--radius-sm)',
          padding: '9px 11px', fontSize: 11, color: 'var(--text-1)', lineHeight: 1.55,
          pointerEvents: 'none', boxShadow: '0 6px 24px rgba(0,0,0,0.55)',
        }}>
          <div style={{ fontWeight: 700, marginBottom: 3, color: 'var(--blue)', fontSize: 11 }}>{label}</div>
          {description}
        </div>,
        document.body
      )}
    </>
  )
}

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

// ─── StatBar ──────────────────────────────────────────────────────────────────

function StatBar({ label, value, cmp, flip }: { label: string; value: number; cmp?: number; flip?: boolean }) {
  const bar = (
    <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden', ...(flip ? { transform: 'scaleX(-1)' } : {}) }}>
      <div style={{ width: `${value}%`, height: '100%', background: statBarColor(value, cmp), borderRadius: 3, transition: 'width 0.45s ease' }} />
    </div>
  )
  const num = (
    <div style={{ width: 26, fontSize: 13, fontWeight: 700, flexShrink: 0, color: statColor(value, cmp), fontFamily: 'var(--font-display)', textAlign: flip ? 'right' : 'left' }}>{value}</div>
  )
  const lbl = <div style={{ width: 28, fontSize: 11, color: 'var(--text-2)', fontWeight: 600, flexShrink: 0, textAlign: 'right' }}>{label}</div>

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
      {!flip && lbl}
      {flip ? num : null}
      {bar}
      {flip ? null : num}
    </div>
  )
}

// ─── Player Detail Modal ──────────────────────────────────────────────────────

function PlayerDetailModal({ p, isMyTurn, canAfford, onPick, onClose, onToggleCompare, inCompare, pickingId }: {
  p: PlayerData; isMyTurn: boolean; canAfford: boolean
  onPick: () => void; onClose: () => void
  onToggleCompare: () => void; inCompare: boolean; pickingId: string | null
}) {
  const flagSrc = flagUrl(p.nationality)
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={onClose}>
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-md)', borderRadius: 'var(--radius)', padding: 24, maxWidth: 400, width: '100%', position: 'relative', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <button onClick={onClose} style={{ position: 'absolute', top: 10, right: 14, background: 'none', border: 'none', color: 'var(--text-2)', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>×</button>

        {/* Header */}
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', marginBottom: 20 }}>
          <div style={{ width: 72, height: 84, borderRadius: 8, border: `2px solid ${ovrColor(p.overall)}`, overflow: 'hidden', background: 'var(--bg-base)', flexShrink: 0, position: 'relative' }}>
            {p.photoUrl
              ? <img src={p.photoUrl} alt="" referrerPolicy="no-referrer" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }} onError={e => { const el = e.currentTarget as HTMLImageElement; el.style.display = 'none'; const p = el.parentElement; if (p) p.setAttribute('data-failed', '1') }} />
              : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)', fontSize: 32 }}>👤</div>
            }
            {/* OVR badge overlaid at bottom */}
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, textAlign: 'center', background: 'rgba(0,0,0,0.6)', fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 800, color: ovrColor(p.overall), lineHeight: '20px' }}>{p.overall}</div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 800, color: 'var(--text-1)', lineHeight: 1.15 }}>{p.name}</div>
            <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 3 }}>
              {flagSrc && <img src={flagSrc} alt="" style={{ width: 16, height: 12, verticalAlign: 'middle', borderRadius: 1, marginRight: 3 }} />}{p.nationality ?? '—'} · {p.age}y · POT <span style={{ color: p.potential >= 90 ? 'var(--gold)' : p.potential >= 85 ? 'var(--green)' : 'var(--text-1)', fontWeight: 700 }}>{p.potential}</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, marginTop: 6 }}>
              {(p.positions?.length ? p.positions : [p.position]).map((pos, i) => (
                <span key={pos} className={posClass(pos)} style={{ fontSize: 9, opacity: i === 0 ? 1 : 0.7 }}>{pos}</span>
              ))}
            </div>
            <div style={{ marginTop: 6, fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, color: canAfford ? 'var(--green)' : 'var(--red)' }}>
              €{(p.baseValue / 1_000).toFixed(1)}M
            </div>
          </div>
        </div>

        {/* Stats */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.5, color: 'var(--text-2)', textTransform: 'uppercase', marginBottom: 8 }}>Stats</div>
          <StatBar label="PAC" value={p.pace} />
          <StatBar label="SHO" value={p.shooting} />
          <StatBar label="PAS" value={p.passing} />
          <StatBar label="DRI" value={p.dribbling} />
          <StatBar label="DEF" value={p.defending} />
          <StatBar label="PHY" value={p.physical} />
        </div>

        {/* Roles */}
        {p.preferredRoles?.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.5, color: 'var(--text-2)', textTransform: 'uppercase', marginBottom: 6 }}>Roles <span style={{ opacity: 0.5, fontWeight: 400, textTransform: 'none' }}>(hover for details)</span></div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {p.preferredRoles.map(r => (
                <HoverTag key={r} label={r} description={ROLE_DESCRIPTIONS[r]} />
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8 }}>
          {isMyTurn && canAfford && (
            <button className="btn btn-green" style={{ flex: 1 }} onClick={onPick} disabled={!!pickingId}>
              {pickingId === p.id ? '...' : 'Pick Player'}
            </button>
          )}
          <button
            className={`btn ${inCompare ? 'btn-gold' : 'btn-outline'}`}
            style={{ flex: isMyTurn && canAfford ? '0 0 auto' : 1 }}
            onClick={onToggleCompare}
          >
            {inCompare ? '✓ In Compare' : '⇄ Compare'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Compare Modal ────────────────────────────────────────────────────────────

function CompareModal({ a, b, isMyTurn, myBudget, onPick, onClose, pickingId }: {
  a: PlayerData; b: PlayerData; isMyTurn: boolean; myBudget: number
  onPick: (id: string) => void; onClose: () => void; pickingId: string | null
}) {
  const flagA = flagUrl(a.nationality)
  const flagB = flagUrl(b.nationality)
  const STATS: [string, keyof PlayerData][] = [
    ['PAC', 'pace'], ['SHO', 'shooting'], ['PAS', 'passing'],
    ['DRI', 'dribbling'], ['DEF', 'defending'], ['PHY', 'physical'],
  ]
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.82)', zIndex: 1001, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={onClose}>
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-md)', borderRadius: 'var(--radius)', padding: 24, maxWidth: 620, width: '100%', position: 'relative', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <button onClick={onClose} style={{ position: 'absolute', top: 10, right: 14, background: 'none', border: 'none', color: 'var(--text-2)', fontSize: 22, cursor: 'pointer' }}>×</button>

        <div style={{ textAlign: 'center', fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: 1.5, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', marginBottom: 20 }}>Compare Players</div>

        {/* Player headers */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 36px 1fr', gap: 10, marginBottom: 20 }}>
          <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
            <div style={{ width: 56, height: 64, borderRadius: 6, overflow: 'hidden', background: 'var(--bg-base)', border: `2px solid ${ovrColor(a.overall)}` }}>
              {a.photoUrl
                ? <img src={a.photoUrl} alt="" referrerPolicy="no-referrer" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }} onError={e => { const el = e.currentTarget as HTMLImageElement; el.style.display = 'none'; const p = el.parentElement; if (p) p.setAttribute('data-failed', '1') }} />
                : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)', fontSize: 24 }}>👤</div>
              }
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 800, color: ovrColor(a.overall), lineHeight: 1 }}>{a.overall}</div>
            <span className={posClass(a.position)} style={{ display: 'inline-block' }}>{a.position}</span>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>{a.name}</div>
            <div style={{ fontSize: 11, color: 'var(--text-2)' }}>{flagA && <img src={flagA} alt="" style={{ width: 16, height: 12, verticalAlign: 'middle', borderRadius: 1, marginRight: 3 }} />}{a.nationality} · {a.age}y · POT {a.potential}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 13, color: 'var(--text-2)' }}>VS</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ width: 56, height: 64, borderRadius: 6, overflow: 'hidden', background: 'var(--bg-base)', border: `2px solid ${ovrColor(b.overall)}` }}>
              {b.photoUrl
                ? <img src={b.photoUrl} alt="" referrerPolicy="no-referrer" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }} onError={e => { const el = e.currentTarget as HTMLImageElement; el.style.display = 'none'; const p = el.parentElement; if (p) p.setAttribute('data-failed', '1') }} />
                : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)', fontSize: 24 }}>👤</div>
              }
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 800, color: ovrColor(b.overall), lineHeight: 1 }}>{b.overall}</div>
            <span className={posClass(b.position)} style={{ display: 'inline-block' }}>{b.position}</span>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>{b.name}</div>
            <div style={{ fontSize: 11, color: 'var(--text-2)' }}>{flagB && <img src={flagB} alt="" style={{ width: 16, height: 12, verticalAlign: 'middle', borderRadius: 1, marginRight: 3 }} />}{b.nationality} · {b.age}y · POT {b.potential}</div>
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 20 }}>
          {STATS.map(([label, key]) => {
            const va = a[key] as number
            const vb = b[key] as number
            return (
              <div key={label} style={{ display: 'grid', gridTemplateColumns: '1fr 36px 1fr', gap: 8, alignItems: 'center' }}>
                {/* A side: number right, bar fills toward center */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexDirection: 'row-reverse' }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, color: statColor(va, vb), width: 26, textAlign: 'right', flexShrink: 0 }}>{va}</div>
                  <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden', transform: 'scaleX(-1)' }}>
                    <div style={{ width: `${va}%`, height: '100%', background: statBarColor(va, vb), borderRadius: 3, transition: 'width 0.45s ease' }} />
                  </div>
                </div>
                <div style={{ textAlign: 'center', fontSize: 10, fontWeight: 700, color: 'var(--text-2)', letterSpacing: 0.3 }}>{label}</div>
                {/* B side: bar fills from center */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: `${vb}%`, height: '100%', background: statBarColor(vb, va), borderRadius: 3, transition: 'width 0.45s ease' }} />
                  </div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, color: statColor(vb, va), width: 26, flexShrink: 0 }}>{vb}</div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Positions + Roles */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
          {([a, b] as PlayerData[]).map((p, idx) => (
            <div key={p.id} style={{ textAlign: idx === 0 ? 'right' : 'left' }}>
              {/* All positions */}
              {(p.positions?.length > 1) && (
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.5, color: 'var(--text-2)', textTransform: 'uppercase', marginBottom: 4 }}>Positions</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, justifyContent: idx === 0 ? 'flex-end' : 'flex-start' }}>
                    {p.positions.map((pos, i) => <span key={pos} className={posClass(pos)} style={{ fontSize: 9, opacity: i === 0 ? 1 : 0.7 }}>{pos}</span>)}
                  </div>
                </div>
              )}
              {p.preferredRoles?.length > 0 && (
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.5, color: 'var(--text-2)', textTransform: 'uppercase', marginBottom: 4 }}>Roles</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, justifyContent: idx === 0 ? 'flex-end' : 'flex-start' }}>
                    {p.preferredRoles.map(r => (
                      <HoverTag key={r} label={r} description={ROLE_DESCRIPTIONS[r]} badgeStyle={{ fontSize: 10 }} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Pick buttons */}
        {isMyTurn && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {([a, b] as PlayerData[]).map(p => {
              const afford = myBudget >= p.baseValue
              return (
                <button key={p.id} className={`btn ${afford ? 'btn-green' : 'btn-ghost'}`}
                  disabled={!afford || !!pickingId} onClick={() => onPick(p.id)}>
                  {pickingId === p.id ? '...' : afford ? `Pick ${p.name.split(' ').slice(-1)[0]}` : "Can't afford"}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Squad Analysis Panel ─────────────────────────────────────────────────────

const IDEAL_FORMATION: Record<string, number> = {
  GK: 1, CB: 2, LB: 1, RB: 1, CDM: 1, CM: 2, CAM: 1, LW: 1, RW: 1, ST: 2,
}

const STAT_LABELS: [string, keyof PlayerData, string][] = [
  ['Speed',    'pace',      '⚡'],
  ['Attack',   'shooting',  '🎯'],
  ['Passing',  'passing',   '🎩'],
  ['Dribbling','dribbling', '⚽'],
  ['Defence',  'defending', '🛡️'],
  ['Physicality','physical','💪'],
]

function SquadAnalysis({ myPicks, pickedPlayerMap }: {
  myPicks: PickRecord[]
  pickedPlayerMap: Record<string, PickedPlayer & Partial<PlayerData>>
}) {
  const squad = myPicks.map(p => pickedPlayerMap[p.playerId]).filter(Boolean) as (PickedPlayer & Partial<PlayerData>)[]
  if (squad.length === 0) return (
    <div style={{ fontSize: 12, color: 'var(--text-2)', textAlign: 'center', padding: '12px 0' }}>No players drafted yet</div>
  )

  // Position counts
  const posCounts: Record<string, number> = {}
  squad.forEach(p => { posCounts[p.position] = (posCounts[p.position] ?? 0) + 1 })

  // Missing positions (based on ideal)
  const gaps: string[] = []
  Object.entries(IDEAL_FORMATION).forEach(([pos, needed]) => {
    const have = posCounts[pos] ?? 0
    if (have < needed) gaps.push(`${pos} (${needed - have} more)`)
  })

  // Average stats (only players with full stats)
  const withStats = squad.filter(p => p.pace !== undefined) as PlayerData[]
  const avgStats = withStats.length === 0 ? null : STAT_LABELS.map(([label, key, icon]) => {
    const avg = Math.round(withStats.reduce((s, p) => s + (p[key] as number), 0) / withStats.length)
    return { label, icon, avg }
  })

  // Weakest areas
  const weakAreas = avgStats ? [...avgStats].sort((a, b) => a.avg - b.avg).slice(0, 2) : []

  return (
    <div>
      {/* Average stats */}
      {avgStats && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.5, color: 'var(--text-2)', textTransform: 'uppercase', marginBottom: 8 }}>Squad Averages</div>
          {avgStats.map(({ label, icon, avg }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
              <div style={{ width: 70, fontSize: 11, color: 'var(--text-2)' }}>{icon} {label}</div>
              <div style={{ flex: 1, height: 5, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ width: `${avg}%`, height: '100%', background: avg >= 78 ? 'var(--green)' : avg >= 70 ? 'var(--blue)' : 'var(--red)', borderRadius: 3 }} />
              </div>
              <div style={{ width: 24, fontSize: 12, fontWeight: 700, color: avg >= 78 ? 'var(--green)' : avg >= 70 ? 'var(--blue)' : 'var(--red)', fontFamily: 'var(--font-display)' }}>{avg}</div>
            </div>
          ))}
        </div>
      )}

      {/* Missing positions */}
      {gaps.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.5, color: 'var(--text-2)', textTransform: 'uppercase', marginBottom: 6 }}>Positions Needed</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {gaps.map(g => (
              <span key={g} className="badge" style={{ background: 'rgba(232,128,106,0.12)', color: 'var(--red)', border: '1px solid rgba(232,128,106,0.3)', fontSize: 10 }}>{g}</span>
            ))}
          </div>
        </div>
      )}

      {/* Weak areas suggestion */}
      {weakAreas.length > 0 && (
        <div style={{ padding: '10px 12px', background: 'rgba(233,196,106,0.08)', border: '1px solid rgba(233,196,106,0.2)', borderRadius: 'var(--radius-sm)' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>⚠ Look For</div>
          <div style={{ fontSize: 11, color: 'var(--text-1)' }}>
            Strong in <span style={{ color: 'var(--gold)', fontWeight: 600 }}>{weakAreas.map(w => w.label).join(' & ')}</span> — your squad averages are below 70 in these areas.
          </div>
        </div>
      )}
    </div>
  )
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

  // Compute positions recommended by squad analysis (used by RECOMMEND filter)
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
      <nav className="nav">
        <button className="btn btn-outline" style={{ fontSize: 12, padding: '5px 10px' }} onClick={() => navigate(`/league/${leagueId}`)}>← League</button>
        <Link to="/" className="nav-logo"><img src="/logo.png" alt="Football Manager" style={{ height: 30, display: 'block' }} /></Link>
        <div className="nav-spacer" />
        {myClub && <span style={{ fontSize: 12, color: 'var(--text-2)' }}>💰 €{(myClub.budget / 1000).toFixed(0)}M</span>}
        <span className="nav-user">{user?.username}</span>
      </nav>

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
        <div>
          <div className="card-header" style={{ marginBottom: 14, borderRadius: 'var(--radius) var(--radius) 0 0' }}>
            <span className="accent-bar" />
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Available Pool</span>
          </div>
          {/* Filter row 1: position tabs + search */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ display: 'flex', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
              {['ALL', 'GK', 'DEF', 'MID', 'ATT'].map(g => (
                <button key={g} onClick={() => setPosFilter(g)} style={{
                  padding: '7px 14px', border: 'none', cursor: 'pointer',
                  fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 700,
                  background: posFilter === g ? 'var(--green)' : 'transparent',
                  color: posFilter === g ? '#000' : 'var(--text-2)',
                  transition: 'all 0.15s',
                }}>{g}</button>
              ))}
              <button onClick={() => setPosFilter('RECOMMEND')} style={{
                padding: '7px 14px', border: 'none', cursor: 'pointer',
                fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 700,
                background: posFilter === 'RECOMMEND' ? 'var(--gold)' : 'transparent',
                color: posFilter === 'RECOMMEND' ? '#000' : 'var(--gold)',
                transition: 'all 0.15s',
              }} title="Show affordable players for positions your squad is missing">⭐ Recommend</button>
            </div>
            <input placeholder="Search player..." value={search} onChange={e => setSearch(e.target.value)} style={{ flex: 1, minWidth: 160, maxWidth: 240 }} />
          </div>

          {/* Filter row 2: OVR range + can afford + count */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 14, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ fontSize: 11, color: 'var(--text-2)', whiteSpace: 'nowrap' }}>OVR</span>
              <input
                type="number" min={40} max={99} placeholder="min"
                value={minOvr} onChange={e => setMinOvr(e.target.value)}
                style={{ width: 56, fontSize: 12, padding: '5px 7px' }}
              />
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>–</span>
              <input
                type="number" min={40} max={99} placeholder="max"
                value={maxOvr} onChange={e => setMaxOvr(e.target.value)}
                style={{ width: 56, fontSize: 12, padding: '5px 7px' }}
              />
            </div>
            <button
              onClick={() => setCanAfford(v => !v)}
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
                onClick={() => { setMinOvr(''); setMaxOvr(''); setCanAfford(false); setPosFilter('ALL'); setSearch('') }}
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
                  onClick={() => {
                    if (isAuction && nominateMode) {
                      handleNominate(inst.id)
                    } else if (!isAuction) {
                      setDetailPlayer(p)
                    } else {
                      setDetailPlayer(p)
                    }
                  }}
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
                    onClick={e => { e.stopPropagation(); toggleCompare(p) }}
                    title="Compare"
                  >⇄</button>

                  {/* Pick/Nominate button */}
                  {isAuction ? (
                    <button
                      className={`btn ${nominateMode && isMyNominatorTurn && !auction?.instanceId ? 'btn-green' : 'btn-ghost'}`}
                      style={{ fontSize: 12, padding: '7px 14px', minWidth: 72 }}
                      disabled={!isMyNominatorTurn || !!auction?.instanceId}
                      onClick={e => { e.stopPropagation(); handleNominate(inst.id) }}
                    >
                      Nominate
                    </button>
                  ) : (
                    <button
                      className={`btn ${isMyTurn && playerAffordable ? 'btn-green' : 'btn-ghost'}`}
                      style={{ fontSize: 12, padding: '7px 14px', minWidth: 60 }}
                      disabled={!isMyTurn || !playerAffordable || !!picking}
                      onClick={e => { e.stopPropagation(); handlePick(p.id) }}
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
              onClick={() => {
                const nextPage = page + 1
                setPage(nextPage)
                doFetch(nextPage, true)
              }}
            >
              {playersLoading ? 'Loading...' : 'Load More'}
            </button>
          )}
        </div>

        {/* ── Right sidebar ──────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, position: 'sticky', top: 76 }}>

          {/* Auction panel */}
          {isAuction && (
            <div style={{ padding: '16px 20px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', marginBottom: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-2)', marginBottom: 12 }}>
                Auction Draft
              </div>

              {/* Active auction */}
              {auction?.instanceId && auction.endsAt ? (
                <div>
                  {/* Timer */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 900, color: auctionCountdown <= 5 ? 'var(--red)' : auctionCountdown <= 10 ? 'var(--gold)' : 'var(--text-1)' }}>
                      {auctionCountdown}s
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, color: 'var(--text-2)' }}>Current bid</div>
                      <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 800, color: 'var(--green)' }}>
                        €{(auction.highBid / 1000).toFixed(1)}k
                      </div>
                      {auction.highBidderId && (
                        <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
                          {clubs.find(c => c.id === auction.highBidderId)?.name ?? 'Unknown'}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Nominated player info */}
                  {(() => {
                    const nomInst = draft.availablePlayers.find(p => p.id === auction.instanceId)
                    const nomPlayer = nomInst?.player
                    return nomPlayer ? (
                      <div style={{ display: 'flex', gap: 10, padding: '10px 12px', background: 'var(--bg-base)', borderRadius: 8, marginBottom: 12 }}>
                        <div style={{ width: 44, height: 52, background: 'var(--bg-card-2)', borderRadius: 4, overflow: 'hidden', flexShrink: 0 }}>
                          {nomPlayer.photoUrl
                            ? <img src={nomPlayer.photoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }} />
                            : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>👤</div>
                          }
                        </div>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 14 }}>{nomPlayer.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-2)' }}>{nomPlayer.position} · {nomPlayer.age}y · {nomPlayer.overall} OVR</div>
                          <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>POT {nomPlayer.potential}</div>
                        </div>
                      </div>
                    ) : null
                  })()}

                  {/* Bid input */}
                  {myClub && (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        type="number"
                        value={bidAmount}
                        onChange={e => setBidAmount(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleBid()}
                        placeholder={`Min ${auction.highBid + 100}`}
                        min={auction.highBid + 100}
                        style={{ flex: 1, padding: '8px 10px', background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-1)', fontSize: 13 }}
                      />
                      <button
                        className="btn btn-primary"
                        onClick={handleBid}
                        disabled={!bidAmount || parseInt(bidAmount, 10) <= auction.highBid}
                        style={{ flexShrink: 0 }}
                      >
                        Bid
                      </button>
                    </div>
                  )}
                  {myClub && auction.budgets[myClub.id] !== undefined && (
                    <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 6 }}>
                      Your budget: €{((auction.budgets[myClub.id] ?? 0) / 1000).toFixed(1)}k
                    </div>
                  )}
                </div>
              ) : (
                /* Waiting for nomination */
                <div>
                  {isMyNominatorTurn ? (
                    <div>
                      <div style={{ fontSize: 13, color: 'var(--green)', fontWeight: 700, marginBottom: 10 }}>
                        Your turn to nominate a player!
                      </div>
                      <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => setNominateMode(true)}>
                        Choose Player to Nominate
                      </button>
                    </div>
                  ) : (
                    <div style={{ fontSize: 13, color: 'var(--text-2)', textAlign: 'center', padding: '20px 0' }}>
                      Waiting for {clubs.find(c => auction && c.id === session.pickOrder[auction.nominatorIdx % session.pickOrder.length])?.name ?? '…'} to nominate a player
                    </div>
                  )}
                </div>
              )}

              {auctionMsg && <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 8 }}>{auctionMsg}</div>}
            </div>
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
            <div className="card" style={{ padding: 0 }}>
              <div className="card-header">
                <span className="accent-bar" />
                <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' }}>My Squad</span>
              </div>
              <div style={{ padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div />
                <div>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 800, color: 'var(--text-1)' }}>{myPicks.length}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-2)', marginLeft: 4 }}>/ {session.roundsTotal}</span>
                </div>
              </div>
              <div style={{ marginBottom: 12 }}>
                <div className="stat-bar-wrap">
                  <div className="stat-bar-fill" style={{ width: `${(myPicks.length / session.roundsTotal) * 100}%`, background: 'var(--green)' }} />
                </div>
                <div style={{ textAlign: 'right', fontSize: 11, color: 'var(--green)', marginTop: 3, fontFamily: 'var(--font-display)', fontWeight: 700 }}>
                  €{(myClub.budget / 1_000).toFixed(0)}M left
                </div>
              </div>
              <SquadAnalysis myPicks={myPicks} pickedPlayerMap={pickedPlayerMap as any} />
              </div>
            </div>
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
