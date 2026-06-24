import { useState } from 'react'
import { effectiveRating } from '@football/shared'
import { flagUrl } from '../../utils/flagCodes'
import { posClass, getBadgeColor } from '../../utils/helpers'
import type { SquadPlayer } from './types'
import { POS_ORDER } from './types'

// ─── Squad helpers ────────────────────────────────────────────────────────────

const ALL_POSITIONS = ['GK','CB','LB','RB','CDM','CM','CAM','LM','RM','LW','RW','CF','ST']

function posGroup(pos: string): number {
  if (pos === 'GK') return 0
  if (['CB','LB','RB'].includes(pos)) return 1
  if (['CDM','CM','CAM','LM','RM'].includes(pos)) return 2
  return 3
}

function calcTrainCost(from: string, to: string): number | null {
  const fg = posGroup(from), tg = posGroup(to)
  if (fg === 0 || tg === 0) return null
  if (fg === tg) return 3_000
  if (Math.abs(fg - tg) === 1) return 7_000
  return 12_000
}

function calcHealCost(daysLeft: number, physioLevel: number): number {
  const discount = physioLevel >= 2 ? 0.3 : physioLevel >= 1 ? 0.6 : 1.0
  return Math.round(daysLeft * 1_000 * discount)
}

// ─── OvrBadge ────────────────────────────────────────────────────────────────

function OvrBadge({ value, label }: { value: number; label: string }) {
  const color = value >= 85 ? 'var(--gold)' : value >= 75 ? 'var(--green)' : value >= 65 ? 'var(--text-2)' : 'var(--text-3)'
  return (
    <div style={{ textAlign: 'center', lineHeight: 1 }}>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 800, color }}>{Math.round(value)}</div>
      <div style={{ fontSize: 10, color: 'var(--text-2)', marginTop: 3, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
    </div>
  )
}

// ─── StatBar (for squad cards) ────────────────────────────────────────────────

function StatBar({ label, value }: { label: string; value: number }) {
  const barColor = value >= 75 ? 'var(--green)' : value >= 50 ? 'var(--gold)' : 'var(--red)'
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
        <span style={{ color: 'var(--text-2)' }}>{label}</span>
        <span style={{ color: 'var(--text-1)', fontWeight: 600 }}>{value}</span>
      </div>
      <div className="stat-bar-wrap">
        <div className="stat-bar-fill" style={{ width: `${value}%`, background: barColor }} />
      </div>
    </div>
  )
}

// ─── PlayerDetailModal (minimal version for Squad — no role tab) ──────────────

function ModalStatBar({ label, value }: { label: string; value: number }) {
  const pct = Math.min(100, Math.max(0, value))
  const color = pct >= 80 ? 'var(--green)' : pct >= 65 ? 'var(--gold)' : pct >= 45 ? 'var(--text-2)' : 'var(--red)'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
      <span style={{ fontSize: 10, color: 'var(--text-2)', width: 110, textAlign: 'right', flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, height: 5, background: 'rgba(255,255,255,0.07)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.3s' }} />
      </div>
      <span style={{ fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 800, color, width: 24, textAlign: 'right', flexShrink: 0 }}>{value}</span>
    </div>
  )
}

function Stars({ value, max = 5 }: { value: number; max?: number }) {
  return (
    <span style={{ color: 'var(--gold)', letterSpacing: 1, fontSize: 13 }}>
      {'★'.repeat(Math.max(0, Math.min(max, value)))}
      <span style={{ color: 'rgba(255,255,255,0.15)' }}>{'★'.repeat(Math.max(0, max - Math.min(max, value)))}</span>
    </span>
  )
}

function PlayerDetailModal({ player, slotPos, onClose }: { player: SquadPlayer; slotPos: string; onClose: () => void }) {
  const isMobile = window.innerWidth < 768
  const p = player.player
  const mainStats = [
    { label: 'Pace', value: p.pace },
    { label: 'Shooting', value: p.shooting },
    { label: 'Passing', value: p.passing },
    { label: 'Dribbling', value: p.dribbling },
    { label: 'Defending', value: p.defending },
    { label: 'Physical', value: p.physical },
  ]
  const subStatGroups = [
    { title: 'Attacking', stats: [
      { label: 'Crossing', value: p.atkCrossing },
      { label: 'Finishing', value: p.atkFinishing },
      { label: 'Heading', value: p.atkHeadAccuracy },
      { label: 'Short Passing', value: p.atkShortPassing },
      { label: 'Volleys', value: p.atkVolleys },
    ]},
    { title: 'Skill', stats: [
      { label: 'Dribbling', value: p.sklDribbling },
      { label: 'Curve', value: p.sklCurve },
      { label: 'FK Accuracy', value: p.sklFkAccuracy },
      { label: 'Long Passing', value: p.sklLongPassing },
      { label: 'Ball Control', value: p.sklBallControl },
    ]},
    { title: 'Movement', stats: [
      { label: 'Acceleration', value: p.movAcceleration },
      { label: 'Sprint Speed', value: p.movSprintSpeed },
      { label: 'Agility', value: p.movAgility },
      { label: 'Reactions', value: p.movReactions },
      { label: 'Balance', value: p.movBalance },
    ]},
    { title: 'Power', stats: [
      { label: 'Shot Power', value: p.powShotPower },
      { label: 'Jumping', value: p.powJumping },
      { label: 'Stamina', value: p.powStamina },
      { label: 'Strength', value: p.powStrength },
      { label: 'Long Shots', value: p.powLongShots },
    ]},
    { title: 'Mentality', stats: [
      { label: 'Aggression', value: p.menAggression },
      { label: 'Interceptions', value: p.menInterceptions },
      { label: 'Positioning', value: p.menPositioning },
      { label: 'Vision', value: p.menVision },
      { label: 'Penalties', value: p.menPenalties },
      { label: 'Composure', value: p.menComposure },
    ]},
    { title: 'Defending', stats: [
      { label: 'Marking', value: p.defMarkingAware },
      { label: 'Stand. Tackle', value: p.defStandingTackle },
      { label: 'Slid. Tackle', value: p.defSlidingTackle },
    ]},
    ...(p.position === 'GK' ? [{ title: 'Goalkeeping', stats: [
      { label: 'Diving', value: p.gkDiving },
      { label: 'Handling', value: p.gkHandling },
      { label: 'Kicking', value: p.gkKicking },
      { label: 'Positioning', value: p.gkPositioning },
      { label: 'Reflexes', value: p.gkReflexes },
      { label: 'Speed', value: p.gkSpeed },
    ]}] : []),
  ]

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1000, display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center', padding: isMobile ? 0 : 16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: isMobile ? 0 : 'var(--radius)', width: '100%', maxWidth: isMobile ? '100%' : 680, height: isMobile ? '100%' : '82vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 16 }}>
          {p.photoUrl ? (
            <img src={p.photoUrl} alt={p.name} style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--border)' }} />
          ) : (
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: getBadgeColor(p.name), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 900, color: '#000', flexShrink: 0 }}>
              {p.name.split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('')}
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-1)' }}>{p.name}</span>
              <span className={posClass(slotPos)} style={{ fontSize: 10 }}>{slotPos}</span>
            </div>
            <div style={{ display: 'flex', gap: 16, marginTop: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: 'var(--text-2)' }}>Age {p.age}</span>
              {p.heightCm > 0 && <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{p.heightCm} cm</span>}
              {p.nationality && <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{p.nationality}</span>}
            </div>
            <div style={{ display: 'flex', gap: 20, marginTop: 8 }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 900, color: 'var(--text-1)' }}>{p.overall}</div>
                <div style={{ fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.5 }}>OVR</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 900, color: 'var(--green)' }}>{p.potential}</div>
                <div style={{ fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.5 }}>POT</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <Stars value={p.skillMoves} />
                <div style={{ fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 }}>Skill</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <Stars value={p.weakFoot} />
                <div style={{ fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 }}>Weak Foot</div>
              </div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-2)', fontSize: 20, padding: 4, lineHeight: 1, flexShrink: 0 }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
          {/* Main stat bars */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>Main Stats</div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '0 24px' }}>
              {mainStats.map(s => <ModalStatBar key={s.label} label={s.label} value={s.value} />)}
            </div>
          </div>
          {/* Sub-stat groups */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '0 24px' }}>
            {subStatGroups.map(group => (
              <div key={group.title} style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>{group.title}</div>
                {group.stats.map(s => <ModalStatBar key={s.label} label={s.label} value={s.value} />)}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Squad ────────────────────────────────────────────────────────────────────

export default function Squad({ squad, physioLevel, budget, nextMatchday, onHeal, onTrain }: {
  squad: SquadPlayer[]
  physioLevel: number
  budget: number
  nextMatchday: number
  onHeal: (instanceId: string) => void
  onTrain: (instanceId: string, position: string) => void
}) {
  const [trainingFor, setTrainingFor] = useState<string | null>(null)
  const [detailPlayer, setDetailPlayer] = useState<SquadPlayer | null>(null)

  if (squad.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '64px 0', color: 'var(--text-2)' }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>👕</div>
        <p>No players drafted yet</p>
      </div>
    )
  }

  const sorted = [...squad].sort((a, b) => {
    const ai = POS_ORDER.indexOf(a.player.position)
    const bi = POS_ORDER.indexOf(b.player.position)
    return ai !== bi ? ai - bi : b.player.overall - a.player.overall
  })

  return (
    <>
    {detailPlayer && (
      <PlayerDetailModal
        player={detailPlayer}
        slotPos={detailPlayer.player.position}
        onClose={() => setDetailPlayer(null)}
      />
    )}
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
      {sorted.map(inst => {
        const effRating = effectiveRating(
          { overall: inst.player.overall, morale: inst.morale, form: inst.form, fitness: inst.fitness, injured: inst.injured },
          0.8,
        )
        const delta = Math.round(effRating - inst.player.overall)
        const cardBorderColor = inst.injured ? 'rgba(232,128,106,0.45)' : inst.player.overall >= 85 ? 'rgba(233,196,106,0.35)' : inst.player.overall >= 75 ? 'rgba(54,226,126,0.15)' : 'rgba(255,255,255,0.06)'
        const flagSrc = flagUrl(inst.player.nationality)
        const healCost = calcHealCost(inst.injuryDaysLeft, physioLevel)
        const isTraining = trainingFor === inst.id

        return (
          <div key={inst.id} style={{ background: 'linear-gradient(160deg, var(--bg-card-2) 0%, var(--bg-card) 100%)', border: `1px solid ${cardBorderColor}`, borderRadius: 'var(--radius)', padding: '14px 16px', position: 'relative', overflow: 'hidden' }}>
            {inst.player.overall >= 85 && !inst.injured && <div style={{ position: 'absolute', top: -20, right: -20, width: 80, height: 80, background: 'radial-gradient(circle, rgba(245,166,35,0.08) 0%, transparent 70%)', pointerEvents: 'none' }} />}

            <div
              role="button"
              tabIndex={0}
              onClick={() => setDetailPlayer(inst)}
              onKeyDown={e => e.key === 'Enter' && setDetailPlayer(inst)}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, cursor: 'pointer', borderRadius: 6 }}
              title="Click to view full stats"
            >
              <div style={{ display: 'flex', gap: 10, flex: 1, minWidth: 0 }}>
                <div style={{ width: 52, height: 60, borderRadius: 6, overflow: 'hidden', background: 'var(--bg-base)', flexShrink: 0 }}>
                  {inst.player.photoUrl
                    ? <img src={inst.player.photoUrl} alt="" referrerPolicy="no-referrer" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }} onError={e => { const el = e.currentTarget as HTMLImageElement; el.style.display = 'none'; const p = el.parentElement; if (p) p.setAttribute('data-failed', '1') }} />
                    : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)', fontSize: 24 }}>👤</div>
                  }
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 5, flexWrap: 'wrap' }}>
                    <span className={posClass(inst.player.position)}>{inst.player.position}</span>
                    {inst.trainedPosition && (
                      <span style={{ fontSize: 9, padding: '2px 5px', background: 'rgba(39,205,255,0.12)', color: 'var(--cyan)', borderRadius: 4, fontWeight: 700, border: '1px solid rgba(39,205,255,0.25)' }}>
                        +{inst.trainedPosition}
                      </span>
                    )}
                    {inst.player.age <= 22 && inst.player.potential - inst.player.overall >= 6 && (
                      <span style={{ fontSize: 9, padding: '2px 5px', background: 'rgba(54,226,126,0.12)', color: 'var(--green)', borderRadius: 4, fontWeight: 700, border: '1px solid rgba(54,226,126,0.3)' }}>PROSPECT</span>
                    )}
                    {inst.player.age >= 32 && (
                      <span style={{ fontSize: 9, padding: '2px 5px', background: 'rgba(232,128,106,0.1)', color: 'var(--red)', borderRadius: 4, fontWeight: 700, border: '1px solid rgba(232,128,106,0.3)' }}>VETERAN</span>
                    )}
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{inst.player.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 2 }}>{flagSrc && <img src={flagSrc} alt="" style={{ width: 16, height: 12, verticalAlign: 'middle', borderRadius: 1, marginRight: 3 }} />}{inst.player.nationality} · {inst.player.age}y</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, flexShrink: 0, marginLeft: 8 }}>
                <OvrBadge value={inst.player.overall} label="OVR" />
                <div style={{ width: 1, background: 'var(--border)' }} />
                <div style={{ textAlign: 'center', lineHeight: 1 }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 800, color: 'var(--text-3)', lineHeight: 1 }}>{inst.player.potential}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 3, fontWeight: 700 }}>POT</div>
                </div>
                <div style={{ width: 1, background: 'var(--border)' }} />
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 800, color: delta >= 0 ? 'var(--green)' : 'var(--red)', lineHeight: 1 }}>{Math.round(effRating)}</div>
                  <div style={{ fontSize: 10, color: delta >= 0 ? 'var(--green)' : 'var(--red)', marginTop: 3, fontWeight: 700 }}>{delta > 0 ? `+${delta}` : delta === 0 ? '±0' : delta} EFF</div>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
              <StatBar label="Morale"   value={inst.morale} />
              <StatBar label="Form"     value={inst.form} />
              <StatBar label="Fitness"  value={inst.fitness} />
            </div>

            {/* Suspension row */}
            {!inst.injured && inst.suspendedMatchday === nextMatchday && (
              <div style={{ display: 'flex', alignItems: 'center', padding: '7px 10px', background: 'rgba(255,165,0,0.1)', border: '1px solid rgba(255,165,0,0.3)', borderRadius: 'var(--radius-xs)', marginBottom: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--gold)' }}>SUSPENDED</span>
                <span style={{ fontSize: 11, color: 'var(--text-2)', marginLeft: 6 }}>Misses next match</span>
              </div>
            )}

            {/* Yellow card accumulation row */}
            {inst.yellowCards > 0 && inst.suspendedMatchday !== nextMatchday && (
              <div style={{ display: 'flex', alignItems: 'center', padding: '5px 10px', background: inst.yellowCards % 5 === 4 ? 'rgba(255,214,0,0.08)' : 'transparent', border: inst.yellowCards % 5 === 4 ? '1px solid rgba(255,214,0,0.25)' : '1px solid transparent', borderRadius: 'var(--radius-xs)', marginBottom: 6 }}>
                <span style={{ fontSize: 12 }}>🟨</span>
                <span style={{ fontSize: 11, color: inst.yellowCards % 5 === 4 ? '#ffd600' : 'var(--text-2)', fontWeight: inst.yellowCards % 5 === 4 ? 700 : 400, marginLeft: 5 }}>
                  {inst.yellowCards % 5} / 5 yellows
                </span>
                {inst.yellowCards % 5 === 4 && (
                  <span style={{ fontSize: 10, color: '#ffd600', fontWeight: 700, marginLeft: 6 }}>— 1 more = ban</span>
                )}
              </div>
            )}

            {/* Injury row */}
            {inst.injured && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 10px', background: 'rgba(232,128,106,0.1)', border: '1px solid rgba(232,128,106,0.3)', borderRadius: 'var(--radius-xs)', marginBottom: 8 }}>
                <div>
                  <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--red)' }}>INJURED</span>
                  <span style={{ fontSize: 11, color: 'var(--text-2)', marginLeft: 6 }}>{inst.injuryDaysLeft} day{inst.injuryDaysLeft !== 1 ? 's' : ''} left</span>
                </div>
                <button
                  className="btn"
                  style={{ fontSize: 11, padding: '4px 10px', background: budget >= healCost ? 'var(--red)' : 'rgba(232,128,106,0.15)', color: '#fff', border: 'none', opacity: budget >= healCost ? 1 : 0.5 }}
                  disabled={budget < healCost}
                  onClick={() => onHeal(inst.id)}
                  title={`Heal for €${(healCost / 1000).toFixed(1)}k`}
                >
                  Heal €{(healCost / 1000).toFixed(1)}k
                </button>
              </div>
            )}

            {/* Train position */}
            {!isTraining ? (
              <button
                className="btn btn-ghost"
                style={{ width: '100%', fontSize: 11, padding: '5px 0' }}
                onClick={() => setTrainingFor(inst.id)}
              >
                {inst.trainedPosition ? `Retrain (${inst.trainedPosition})` : 'Train position'}
              </button>
            ) : (
              <div style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xs)', padding: 10 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Train to position</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                  {ALL_POSITIONS.filter(p => p !== inst.player.position).map(p => {
                    const cost = calcTrainCost(inst.player.position, p)
                    const canAfford = cost !== null && budget >= cost
                    return (
                      <button
                        key={p}
                        disabled={cost === null || !canAfford}
                        onClick={() => { onTrain(inst.id, p); setTrainingFor(null) }}
                        style={{
                          padding: '4px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700, cursor: cost !== null && canAfford ? 'pointer' : 'not-allowed',
                          background: inst.trainedPosition === p ? 'rgba(39,205,255,0.2)' : 'var(--bg-card)',
                          color: cost === null ? 'var(--text-3)' : !canAfford ? 'var(--text-3)' : inst.trainedPosition === p ? 'var(--cyan)' : 'var(--text-1)',
                          border: `1px solid ${inst.trainedPosition === p ? 'rgba(39,205,255,0.4)' : 'var(--border)'}`,
                          opacity: cost === null ? 0.4 : 1,
                        }}
                        title={cost === null ? 'GK restriction' : `€${(cost / 1000).toFixed(0)}k`}
                      >
                        {p}{cost !== null ? ` €${(cost / 1000).toFixed(0)}k` : ' —'}
                      </button>
                    )
                  })}
                </div>
                <button className="btn btn-ghost" style={{ width: '100%', fontSize: 11, padding: '4px 0' }} onClick={() => setTrainingFor(null)}>Cancel</button>
              </div>
            )}
          </div>
        )
      })}
    </div>
    </>
  )
}
