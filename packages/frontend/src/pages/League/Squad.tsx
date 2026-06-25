import { useState } from 'react'
import { flagUrl } from '../../utils/flagCodes'
import { posClass, getBadgeColor } from '../../utils/helpers'
import type { SquadPlayer, PlayerData } from './types'
import { POS_ORDER } from './types'

// ─── Manga helpers ────────────────────────────────────────────────────────────

function rc(v: number): string {
  return v >= 85 ? '#2f6b46' : v >= 78 ? '#6a8a2f' : v >= 70 ? '#cf9438' : '#e5202f'
}

function keyStats(p: PlayerData): Array<[string, number]> {
  const pos = p.position
  if (pos === 'GK') return [['DIV', p.gkDiving], ['HAN', p.gkHandling], ['REF', p.gkReflexes]]
  if (['CB','LB','RB','LWB','RWB'].includes(pos)) return [['PAC', p.pace], ['DEF', p.defending], ['PHY', p.physical]]
  if (['CDM','CM','LM','RM','CAM'].includes(pos)) return [['PAC', p.pace], ['PAS', p.passing], ['PHY', p.physical]]
  return [['PAC', p.pace], ['SHT', p.shooting], ['PHY', p.physical]]
}

function formBars(form: number): string[] {
  const n = Math.round(form / 20)
  const c = form >= 75 ? '#2f6b46' : form >= 50 ? '#cf9438' : '#e5202f'
  return Array.from({ length: 5 }, (_, i) => i < n ? c : 'rgba(140,140,146,.28)')
}

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

// ─── PlayerDetailModal ────────────────────────────────────────────────────────

function ModalStatBar({ label, value, dark }: { label: string; value: number; dark: boolean }) {
  const pct = Math.min(100, Math.max(0, value))
  const color = rc(pct)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
      <span style={{ fontSize: 10, color: dark ? 'var(--ash)' : '#666', width: 110, textAlign: 'right', flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, height: 5, background: dark ? 'rgba(255,255,255,0.07)' : 'rgba(8,8,10,.1)', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, transition: 'width 0.3s' }} />
      </div>
      <span style={{ fontFamily: 'var(--font-display)', fontSize: 12, color, width: 24, textAlign: 'right', flexShrink: 0 }}>{value}</span>
    </div>
  )
}

function Stars({ value, max = 5 }: { value: number; max?: number }) {
  return (
    <span style={{ color: '#cf9438', letterSpacing: 1, fontSize: 13 }}>
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
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.82)', zIndex: 1000, display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center', padding: isMobile ? 0 : 20 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ border: '3px solid var(--paper)', background: 'var(--steel)', width: '100%', maxWidth: isMobile ? '100%' : 680, height: isMobile ? '92vh' : '82vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', animation: 'mgSlam .35s cubic-bezier(.2,.8,.3,1) both' }}>

        {/* Ink header */}
        <div style={{ background: 'var(--ink)', padding: '10px 20px', borderBottom: '3px solid var(--paper)', display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
          {p.photoUrl ? (
            <img src={p.photoUrl} alt={p.name} style={{ width: 52, height: 52, objectFit: 'cover', objectPosition: 'top', border: '2px solid var(--paper)', flexShrink: 0 }} referrerPolicy="no-referrer" />
          ) : (
            <div style={{ width: 52, height: 52, background: getBadgeColor(p.name), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 900, color: '#000', flexShrink: 0, border: '2px solid var(--paper)' }}>
              {p.name.split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('')}
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 22, lineHeight: .9, letterSpacing: '-.01em', textTransform: 'uppercase', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
              <span className={posClass(slotPos)} style={{ fontSize: 10, flexShrink: 0 }}>{slotPos}</span>
            </div>
            <div style={{ display: 'flex', gap: 16, marginTop: 5, flexWrap: 'wrap' }}>
              <div>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: rc(p.overall) }}>{p.overall}</span>
                <span style={{ fontFamily: 'var(--font-narrow)', fontSize: 9, color: 'var(--ash)', textTransform: 'uppercase', letterSpacing: '.14em', marginLeft: 4 }}>OVR</span>
              </div>
              <div>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: 'var(--ash)' }}>{p.potential}</span>
                <span style={{ fontFamily: 'var(--font-narrow)', fontSize: 9, color: 'var(--ash)', textTransform: 'uppercase', letterSpacing: '.14em', marginLeft: 4 }}>POT</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Stars value={p.skillMoves} />
                <span style={{ fontFamily: 'var(--font-narrow)', fontSize: 9, color: 'var(--ash)', textTransform: 'uppercase', letterSpacing: '.1em' }}>Skill</span>
              </div>
              {p.nationality && (
                <span style={{ fontFamily: 'var(--font-narrow)', fontSize: 11, color: 'var(--ash)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  {flagUrl(p.nationality) && <img src={flagUrl(p.nationality)!} alt="" style={{ width: 16, height: 12, border: '1px solid rgba(244,241,234,.2)' }} />}
                  {p.nationality} · {p.age}y
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: '2px solid rgba(244,241,234,.3)', cursor: 'pointer', color: 'var(--paper)', fontSize: 16, padding: '4px 10px', lineHeight: 1, flexShrink: 0, fontFamily: 'var(--font-display)' }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
          <div style={{ fontFamily: 'var(--font-narrow)', fontSize: 10, fontWeight: 700, color: 'var(--ash)', textTransform: 'uppercase', letterSpacing: '.18em', marginBottom: 10 }}>Main Stats</div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '0 24px', marginBottom: 20 }}>
            {mainStats.map(s => <ModalStatBar key={s.label} label={s.label} value={s.value} dark />)}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '0 24px' }}>
            {subStatGroups.map(group => (
              <div key={group.title} style={{ marginBottom: 16 }}>
                <div style={{ fontFamily: 'var(--font-narrow)', fontSize: 10, fontWeight: 700, color: 'var(--ash)', textTransform: 'uppercase', letterSpacing: '.18em', marginBottom: 8 }}>{group.title}</div>
                {group.stats.map(s => <ModalStatBar key={s.label} label={s.label} value={s.value} dark />)}
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
      <div style={{ padding: '64px 0', textAlign: 'center', animation: 'mgUp .4s both' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 36, color: 'var(--ash)', letterSpacing: '-.01em' }}>NO SQUAD YET</div>
        <div style={{ fontFamily: 'var(--font-narrow)', fontSize: 11, color: 'var(--ash)', letterSpacing: '.18em', textTransform: 'uppercase', marginTop: 8 }}>Players will appear here after the draft</div>
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

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 13 }}>
        {sorted.map((inst, idx) => {
          const dark = idx % 2 === 0
          const cardBg = dark ? 'var(--steel)' : 'var(--paper)'
          const cardFg = dark ? 'var(--paper)' : 'var(--ink)'
          const dimC = dark ? 'var(--ash)' : '#666'
          const rule = dark ? 'rgba(244,241,234,.12)' : 'rgba(8,8,10,.12)'
          const stats = keyStats(inst.player)
          const bars = formBars(inst.form)
          const role = inst.player.preferredRoles?.[0] ?? inst.player.position
          const isTraining = trainingFor === inst.id
          const healCost = calcHealCost(inst.injuryDaysLeft, physioLevel)

          return (
            <div key={inst.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>

              {/* ── Manga card ── */}
              <div
                role="button"
                tabIndex={0}
                onClick={() => setDetailPlayer(inst)}
                onKeyDown={e => e.key === 'Enter' && setDetailPlayer(inst)}
                style={{
                  position: 'relative', border: '3px solid var(--paper)',
                  background: cardBg, color: cardFg, overflow: 'hidden',
                  cursor: 'pointer', transition: 'transform .2s, box-shadow .2s',
                  animation: `mgPop .4s ${(idx * 0.04).toFixed(2)}s both`,
                }}
                onMouseEnter={e => {
                  const el = e.currentTarget as HTMLDivElement
                  el.style.transform = 'translateY(-6px)'
                  el.style.boxShadow = '0 16px 0 -8px var(--accent)'
                }}
                onMouseLeave={e => {
                  const el = e.currentTarget as HTMLDivElement
                  el.style.transform = ''
                  el.style.boxShadow = ''
                }}
              >
                {/* Diagonal hatch overlay */}
                <div style={{ position: 'absolute', inset: 0, opacity: .06, background: 'repeating-linear-gradient(120deg, currentColor 0 2px, transparent 2px 10px)', pointerEvents: 'none' }} />

                {/* Angled position tag — top right */}
                <div style={{ position: 'absolute', right: 0, top: 0, background: 'var(--accent)', color: '#fff', padding: '3px 12px 5px', clipPath: 'polygon(16% 0,100% 0,100% 100%,0 100%)' }}>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 14 }}>{inst.player.position}</span>
                </div>

                {/* Status stripe for injured */}
                {inst.injured && (
                  <div style={{ background: 'var(--accent)', color: '#fff', padding: '3px 16px', fontFamily: 'var(--font-narrow)', fontSize: 9, letterSpacing: '.2em', textTransform: 'uppercase', fontWeight: 700, textAlign: 'center' }}>
                    INJURED · {inst.injuryDaysLeft}d left
                  </div>
                )}
                {!inst.injured && inst.suspendedMatchday === nextMatchday && (
                  <div style={{ background: '#cf9438', color: 'var(--ink)', padding: '3px 16px', fontFamily: 'var(--font-narrow)', fontSize: 9, letterSpacing: '.2em', textTransform: 'uppercase', fontWeight: 700, textAlign: 'center' }}>
                    SUSPENDED
                  </div>
                )}

                {/* OVR block */}
                <div style={{ padding: '16px 16px 0', position: 'relative' }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 58, lineHeight: .78, color: rc(inst.player.overall) }}>
                    {inst.player.overall}
                  </div>
                  <div style={{ fontFamily: 'var(--font-narrow)', fontSize: 9, letterSpacing: '.2em', textTransform: 'uppercase', color: dimC, marginTop: 2 }}>Overall</div>
                </div>

                {/* Name + role + stats */}
                <div style={{ padding: '12px 16px 16px', position: 'relative' }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, lineHeight: .86, textTransform: 'uppercase', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {inst.player.name.split(' ').slice(-1)[0]}
                  </div>
                  <div style={{ fontFamily: 'var(--font-narrow)', fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase', color: dimC, marginTop: 2 }}>
                    {role} · {inst.player.age}
                  </div>

                  {/* Key stats + form bars */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 14, borderTop: `2px solid ${rule}`, paddingTop: 12 }}>
                    {stats.map(([k, v]) => (
                      <div key={k} style={{ textAlign: 'center' }}>
                        <div style={{ fontFamily: 'var(--font-display)', fontSize: 19, color: rc(v) }}>{v}</div>
                        <div style={{ fontFamily: 'var(--font-narrow)', fontSize: 8, letterSpacing: '.14em', textTransform: 'uppercase', color: dimC }}>{k}</div>
                      </div>
                    ))}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                      <div style={{ display: 'flex', gap: 2 }}>
                        {bars.map((c, i) => (
                          <span key={i} style={{ width: 6, height: 15, background: c, display: 'block' }} />
                        ))}
                      </div>
                      <div style={{ fontFamily: 'var(--font-narrow)', fontSize: 8, letterSpacing: '.14em', textTransform: 'uppercase', color: dimC }}>Form</div>
                    </div>
                  </div>
                </div>

                {/* Yellow card warning strip */}
                {inst.yellowCards > 0 && inst.suspendedMatchday !== nextMatchday && inst.yellowCards % 5 === 4 && (
                  <div style={{ background: 'rgba(207,148,56,.15)', borderTop: `2px solid rgba(207,148,56,.4)`, padding: '4px 16px', fontFamily: 'var(--font-narrow)', fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', color: '#cf9438', fontWeight: 700 }}>
                    {inst.yellowCards % 5}/5 yellows — next = ban
                  </div>
                )}

                {/* Prospect / Veteran tag */}
                {inst.player.age <= 22 && inst.player.potential - inst.player.overall >= 6 && (
                  <div style={{ background: 'rgba(47,107,70,.25)', borderTop: `2px solid rgba(47,107,70,.4)`, padding: '4px 16px', fontFamily: 'var(--font-narrow)', fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', color: '#2f6b46', fontWeight: 700 }}>
                    Prospect · Pot {inst.player.potential}
                  </div>
                )}
              </div>

              {/* ── Action strip below card ── */}
              {inst.injured ? (
                <button
                  style={{
                    padding: '8px', border: '2px solid var(--accent)', background: budget >= healCost ? 'var(--accent)' : 'transparent',
                    color: budget >= healCost ? '#fff' : 'var(--accent)', cursor: budget >= healCost ? 'pointer' : 'not-allowed',
                    fontFamily: 'var(--font-narrow)', fontSize: 10, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase',
                    opacity: budget >= healCost ? 1 : .5, transition: 'all .15s',
                  }}
                  disabled={budget < healCost}
                  onClick={() => onHeal(inst.id)}
                >
                  Heal · €{(healCost / 1000).toFixed(1)}k
                </button>
              ) : !isTraining ? (
                <button
                  style={{
                    padding: '8px', border: '2px solid rgba(244,241,234,.2)', background: 'transparent',
                    color: 'var(--ash)', cursor: 'pointer',
                    fontFamily: 'var(--font-narrow)', fontSize: 10, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase',
                    transition: 'border-color .15s, color .15s',
                  }}
                  onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = 'var(--paper)'; b.style.color = 'var(--paper)' }}
                  onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = 'rgba(244,241,234,.2)'; b.style.color = 'var(--ash)' }}
                  onClick={() => setTrainingFor(inst.id)}
                >
                  {inst.trainedPosition ? `Retrain (${inst.trainedPosition})` : 'Train Position'}
                </button>
              ) : (
                <div style={{ border: '2px solid rgba(244,241,234,.2)', background: 'var(--steel)', padding: 10 }}>
                  <div style={{ fontFamily: 'var(--font-narrow)', fontSize: 10, fontWeight: 700, color: 'var(--ash)', textTransform: 'uppercase', letterSpacing: '.14em', marginBottom: 8 }}>Train to position</div>
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
                            padding: '4px 8px', fontSize: 10, fontWeight: 700,
                            cursor: cost !== null && canAfford ? 'pointer' : 'not-allowed',
                            background: inst.trainedPosition === p ? 'rgba(39,205,255,0.15)' : 'var(--ink)',
                            color: cost === null ? 'var(--ash)' : !canAfford ? 'var(--ash)' : inst.trainedPosition === p ? 'var(--cyan)' : 'var(--paper)',
                            border: `2px solid ${inst.trainedPosition === p ? 'rgba(39,205,255,0.4)' : 'rgba(244,241,234,.15)'}`,
                            opacity: cost === null ? 0.4 : 1,
                            fontFamily: 'var(--font-narrow)', letterSpacing: '.08em', textTransform: 'uppercase',
                          }}
                          title={cost === null ? 'GK restriction' : `€${(cost / 1000).toFixed(0)}k`}
                        >
                          {p}{cost !== null ? ` €${(cost / 1000).toFixed(0)}k` : ''}
                        </button>
                      )
                    })}
                  </div>
                  <button
                    style={{ width: '100%', padding: '5px', border: '2px solid rgba(244,241,234,.2)', background: 'transparent', color: 'var(--ash)', cursor: 'pointer', fontFamily: 'var(--font-narrow)', fontSize: 10, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase' }}
                    onClick={() => setTrainingFor(null)}
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}
