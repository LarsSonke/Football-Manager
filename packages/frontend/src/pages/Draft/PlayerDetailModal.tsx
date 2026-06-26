import { useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { flagUrl } from '../../utils/flagCodes'
import { posClass, ovrColor } from '../../utils/helpers'
import type { PlayerData } from './types'

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

// ─── StatBar ──────────────────────────────────────────────────────────────────

function statColor(v: number, cmp?: number) {
  if (cmp !== undefined) return v > cmp ? 'var(--green)' : v < cmp ? 'var(--red)' : 'var(--text-2)'
  return v >= 85 ? 'var(--green)' : v >= 75 ? 'var(--blue)' : v >= 65 ? 'var(--text-1)' : 'var(--text-2)'
}

function statBarColor(v: number, cmp?: number) {
  if (cmp !== undefined) return v > cmp ? 'var(--green)' : v < cmp ? 'var(--red)' : 'var(--border-md)'
  return v >= 85 ? 'var(--green)' : v >= 75 ? 'var(--blue)' : 'var(--border-md)'
}

function StatBar({ label, value, cmp }: { label: string; value: number; cmp?: number }) {
  const bar = (
    <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
      <div style={{ width: `${value}%`, height: '100%', background: statBarColor(value, cmp), borderRadius: 3, transition: 'width 0.45s ease' }} />
    </div>
  )
  const num = (
    <div style={{ width: 26, fontSize: 13, fontWeight: 700, flexShrink: 0, color: statColor(value, cmp), fontFamily: 'var(--font-display)', textAlign: 'left' }}>{value}</div>
  )
  const lbl = <div style={{ width: 28, fontSize: 11, color: 'var(--text-2)', fontWeight: 600, flexShrink: 0, textAlign: 'right' }}>{label}</div>

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
      {lbl}
      {bar}
      {num}
    </div>
  )
}

// ─── Player Detail Modal ──────────────────────────────────────────────────────

export function PlayerDetailModal({ p, isMyTurn, canAfford, onPick, onClose, onToggleCompare, inCompare, pickingId }: {
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
              : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)', fontSize: 32 }}>?</div>
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
