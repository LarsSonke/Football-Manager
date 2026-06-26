import { useState } from 'react'
import { flagUrl } from '../../utils/flagCodes'
import { posClass } from '../../utils/helpers'
import { PlayerPhoto } from '../../components/PlayerPhoto'
import type { SquadPlayer, PlayerData } from './types'
import { POS_ORDER } from './types'
import styles from './Squad.module.css'

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
    <div className={styles.statBarRow}>
      <span className={styles.statBarLabel} data-dark={String(dark)}>{label}</span>
      <div className={styles.statBarTrack} data-dark={String(dark)}>
        <div className={styles.statBarFill} style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className={styles.statBarValue} style={{ color }}>{value}</span>
    </div>
  )
}

function Stars({ value, max = 5 }: { value: number; max?: number }) {
  return (
    <span className={styles.stars}>
      {'★'.repeat(Math.max(0, Math.min(max, value)))}
      <span className={styles.starsEmpty}>{'★'.repeat(Math.max(0, max - Math.min(max, value)))}</span>
    </span>
  )
}

function PlayerDetailModal({ player, slotPos, onClose }: { player: SquadPlayer; slotPos: string; onClose: () => void }) {
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
      className={styles.modalOverlay}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className={styles.modalPanel}>

        {/* Ink header */}
        <div className={styles.modalHeader}>
          <PlayerPhoto url={p.photoUrl} name={p.name} size={52} style={{ border: '2px solid var(--paper)' }} />
          <div className={styles.modalHeaderInfo}>
            <div className={styles.modalNameRow}>
              <span className={styles.modalPlayerName}>{p.name}</span>
              <span className={posClass(slotPos)} style={{ fontSize: 10, flexShrink: 0 }}>{slotPos}</span>
            </div>
            <div className={styles.modalStats}>
              <div>
                <span className={styles.modalOvrValue} style={{ color: rc(p.overall) }}>{p.overall}</span>
                <span className={styles.modalStatLabel}>OVR</span>
              </div>
              <div>
                <span className={styles.modalOvrValue} style={{ color: 'var(--ash)' }}>{p.potential}</span>
                <span className={styles.modalStatLabel}>POT</span>
              </div>
              <div className={styles.modalStatItem}>
                <Stars value={p.skillMoves} />
                <span className={styles.modalStatLabel}>Skill</span>
              </div>
              {p.nationality && (
                <span className={styles.modalNationality}>
                  {flagUrl(p.nationality) && <img src={flagUrl(p.nationality)!} alt="" className={styles.modalFlag} />}
                  {p.nationality} · {p.age}y
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} className={styles.modalCloseBtn}>✕</button>
        </div>

        {/* Body */}
        <div className={styles.modalBody}>
          <div className={styles.modalSectionLabel}>Main Stats</div>
          <div className={styles.modalMainStatsGrid}>
            {mainStats.map(s => <ModalStatBar key={s.label} label={s.label} value={s.value} dark />)}
          </div>
          <div className={styles.modalSubStatsGrid}>
            {subStatGroups.map(group => (
              <div key={group.title} className={styles.modalStatGroup}>
                <div className={styles.modalStatGroupTitle}>{group.title}</div>
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
      <div className={styles.emptyState}>
        <div className={styles.emptyTitle}>NO SQUAD YET</div>
        <div className={styles.emptySubtitle}>Players will appear here after the draft</div>
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

      <div className={styles.grid}>
        {sorted.map((inst, idx) => {
          const dark = idx % 2 === 0
          const stats = keyStats(inst.player)
          const bars = formBars(inst.form)
          const role = inst.player.preferredRoles?.[0] ?? inst.player.position
          const isTraining = trainingFor === inst.id
          const healCost = calcHealCost(inst.injuryDaysLeft, physioLevel)

          return (
            <div key={inst.id} className={styles.cardSlot}>

              {/* ── Manga card ── */}
              <div
                role="button"
                tabIndex={0}
                onClick={() => setDetailPlayer(inst)}
                onKeyDown={e => e.key === 'Enter' && setDetailPlayer(inst)}
                className={styles.card}
                data-dark={String(dark)}
                style={{ animation: `mgPop .4s ${(idx * 0.04).toFixed(2)}s both` }}
              >
                {/* Diagonal hatch overlay */}
                <div className={styles.hatch} />

                {/* Angled position tag — top right */}
                <div className={styles.posTag}>
                  <span className={styles.posTagLabel}>{inst.player.position}</span>
                </div>

                {/* Status stripe for injured */}
                {inst.injured && (
                  <div className={styles.stripeInjured}>
                    INJURED · {inst.injuryDaysLeft}d left
                  </div>
                )}
                {!inst.injured && inst.suspendedMatchday === nextMatchday && (
                  <div className={styles.stripeSuspended}>
                    SUSPENDED
                  </div>
                )}

                {/* OVR block */}
                <div className={styles.ovrBlock}>
                  <div className={styles.ovrValue} style={{ color: rc(inst.player.overall) }}>
                    {inst.player.overall}
                  </div>
                  <div className={styles.ovrLabel}>Overall</div>
                </div>

                {/* Name + role + stats */}
                <div className={styles.nameBlock}>
                  <div className={styles.playerName}>
                    {inst.player.name.split(' ').slice(-1)[0]}
                  </div>
                  <div className={styles.playerMeta}>
                    {role} · {inst.player.age}
                  </div>

                  {/* Key stats + form bars */}
                  <div className={styles.statsRow}>
                    {stats.map(([k, v]) => (
                      <div key={k} className={styles.statItem}>
                        <div className={styles.statValue} style={{ color: rc(v) }}>{v}</div>
                        <div className={styles.statKey}>{k}</div>
                      </div>
                    ))}
                    <div className={styles.formGroup}>
                      <div className={styles.formBars}>
                        {bars.map((c, i) => (
                          <span key={i} className={styles.formBar} style={{ background: c }} />
                        ))}
                      </div>
                      <div className={styles.formLabel}>Form</div>
                    </div>
                  </div>
                </div>

                {/* Yellow card warning strip */}
                {inst.yellowCards > 0 && inst.suspendedMatchday !== nextMatchday && inst.yellowCards % 5 === 4 && (
                  <div className={styles.stripYellowCard}>
                    {inst.yellowCards % 5}/5 yellows — next = ban
                  </div>
                )}

                {/* Prospect / Veteran tag */}
                {inst.player.age <= 22 && inst.player.potential - inst.player.overall >= 6 && (
                  <div className={styles.stripProspect}>
                    Prospect · Pot {inst.player.potential}
                  </div>
                )}
              </div>

              {/* ── Action strip below card ── */}
              {inst.injured ? (
                <button
                  className={styles.healBtn}
                  data-affordable={String(budget >= healCost)}
                  disabled={budget < healCost}
                  onClick={() => onHeal(inst.id)}
                >
                  Heal · €{(healCost / 1000).toFixed(1)}k
                </button>
              ) : !isTraining ? (
                <button
                  className={styles.trainBtn}
                  onClick={() => setTrainingFor(inst.id)}
                >
                  {inst.trainedPosition ? `Retrain (${inst.trainedPosition})` : 'Train Position'}
                </button>
              ) : (
                <div className={styles.trainMenu}>
                  <div className={styles.trainMenuTitle}>Train to position</div>
                  <div className={styles.trainPositions}>
                    {ALL_POSITIONS.filter(p => p !== inst.player.position).map(p => {
                      const cost = calcTrainCost(inst.player.position, p)
                      const canAfford = cost !== null && budget >= cost
                      const isRestricted = cost === null
                      const isActive = inst.trainedPosition === p
                      return (
                        <button
                          key={p}
                          disabled={isRestricted || !canAfford}
                          onClick={() => { onTrain(inst.id, p); setTrainingFor(null) }}
                          className={styles.trainPosBtn}
                          data-active={String(isActive)}
                          data-affordable={String(!isRestricted && canAfford)}
                          data-restricted={String(isRestricted)}
                          title={isRestricted ? 'GK restriction' : `€${(cost! / 1000).toFixed(0)}k`}
                        >
                          {p}{cost !== null ? ` €${(cost / 1000).toFixed(0)}k` : ''}
                        </button>
                      )
                    })}
                  </div>
                  <button
                    className={styles.cancelBtn}
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
