import { useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { flagUrl } from '../../utils/flagCodes'
import { posClass, ovrColor } from '../../utils/helpers'
import type { PlayerData } from './types'

// ─── Tooltip descriptions (shared with PlayerDetailModal) ─────────────────────

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

// ─── Stat helpers ─────────────────────────────────────────────────────────────

function statColor(v: number, cmp?: number) {
  if (cmp !== undefined) return v > cmp ? 'var(--green)' : v < cmp ? 'var(--red)' : 'var(--text-2)'
  return v >= 85 ? 'var(--green)' : v >= 75 ? 'var(--blue)' : v >= 65 ? 'var(--text-1)' : 'var(--text-2)'
}

function statBarColor(v: number, cmp?: number) {
  if (cmp !== undefined) return v > cmp ? 'var(--green)' : v < cmp ? 'var(--red)' : 'var(--border-md)'
  return v >= 85 ? 'var(--green)' : v >= 75 ? 'var(--blue)' : 'var(--border-md)'
}

// ─── Compare Modal ────────────────────────────────────────────────────────────

export function CompareModal({ a, b, isMyTurn, myBudget, onPick, onClose, pickingId }: {
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
