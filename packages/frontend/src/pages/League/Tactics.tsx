import { useEffect, useRef, useState } from 'react'
import { tacticFitScore } from '@football/shared'
import { getBadgeColor, posClass } from '../../utils/helpers'
import { KitSvg, type KitConfig } from '../../components/KitSvg'
import { api } from '../../api/client'
import { useIsMobile } from './types'
import type { ClubData, SquadPlayer, LineupSlot, SubSlot, TacticData, CustomSlot } from './types'

// ─── Formation Constants ──────────────────────────────────────────────────────

const FORMATION_SLOTS: Record<string, { position: string; x: number; y: number }[]> = {
  '4-4-2': [
    { position: 'GK', x: 50, y: 92 },
    { position: 'LB', x: 14, y: 73 }, { position: 'CB', x: 36, y: 77 }, { position: 'CB', x: 64, y: 77 }, { position: 'RB', x: 86, y: 73 },
    { position: 'LM', x: 14, y: 48 }, { position: 'CM', x: 38, y: 50 }, { position: 'CM', x: 62, y: 50 }, { position: 'RM', x: 86, y: 48 },
    { position: 'ST', x: 36, y: 23 }, { position: 'ST', x: 64, y: 23 },
  ],
  '4-3-3': [
    { position: 'GK', x: 50, y: 92 },
    { position: 'LB', x: 14, y: 73 }, { position: 'CB', x: 36, y: 77 }, { position: 'CB', x: 64, y: 77 }, { position: 'RB', x: 86, y: 73 },
    { position: 'CM', x: 25, y: 48 }, { position: 'CM', x: 50, y: 50 }, { position: 'CM', x: 75, y: 48 },
    { position: 'LW', x: 14, y: 24 }, { position: 'ST', x: 50, y: 18 }, { position: 'RW', x: 86, y: 24 },
  ],
  '4-3-3 (DM)': [
    { position: 'GK', x: 50, y: 92 },
    { position: 'LB', x: 14, y: 73 }, { position: 'CB', x: 36, y: 77 }, { position: 'CB', x: 64, y: 77 }, { position: 'RB', x: 86, y: 73 },
    { position: 'CDM', x: 50, y: 60 }, { position: 'CM', x: 28, y: 47 }, { position: 'CM', x: 72, y: 47 },
    { position: 'LW', x: 14, y: 24 }, { position: 'ST', x: 50, y: 18 }, { position: 'RW', x: 86, y: 24 },
  ],
  '4-2-3-1': [
    { position: 'GK', x: 50, y: 92 },
    { position: 'LB', x: 14, y: 73 }, { position: 'CB', x: 36, y: 77 }, { position: 'CB', x: 64, y: 77 }, { position: 'RB', x: 86, y: 73 },
    { position: 'CDM', x: 36, y: 56 }, { position: 'CDM', x: 64, y: 56 },
    { position: 'LW', x: 14, y: 35 }, { position: 'CAM', x: 50, y: 33 }, { position: 'RW', x: 86, y: 35 },
    { position: 'ST', x: 50, y: 16 },
  ],
  '4-1-4-1': [
    { position: 'GK', x: 50, y: 92 },
    { position: 'LB', x: 14, y: 73 }, { position: 'CB', x: 36, y: 77 }, { position: 'CB', x: 64, y: 77 }, { position: 'RB', x: 86, y: 73 },
    { position: 'CDM', x: 50, y: 58 },
    { position: 'LM', x: 14, y: 40 }, { position: 'CM', x: 36, y: 42 }, { position: 'CM', x: 64, y: 42 }, { position: 'RM', x: 86, y: 40 },
    { position: 'ST', x: 50, y: 18 },
  ],
  '4-3-2-1': [
    { position: 'GK', x: 50, y: 92 },
    { position: 'LB', x: 14, y: 73 }, { position: 'CB', x: 36, y: 77 }, { position: 'CB', x: 64, y: 77 }, { position: 'RB', x: 86, y: 73 },
    { position: 'CM', x: 25, y: 54 }, { position: 'CDM', x: 50, y: 58 }, { position: 'CM', x: 75, y: 54 },
    { position: 'CAM', x: 33, y: 38 }, { position: 'CAM', x: 67, y: 38 },
    { position: 'ST', x: 50, y: 18 },
  ],
  '4-2-4': [
    { position: 'GK', x: 50, y: 92 },
    { position: 'LB', x: 14, y: 73 }, { position: 'CB', x: 36, y: 77 }, { position: 'CB', x: 64, y: 77 }, { position: 'RB', x: 86, y: 73 },
    { position: 'CDM', x: 36, y: 58 }, { position: 'CDM', x: 64, y: 58 },
    { position: 'LW', x: 12, y: 24 }, { position: 'ST', x: 38, y: 20 }, { position: 'ST', x: 62, y: 20 }, { position: 'RW', x: 88, y: 24 },
  ],
  '3-5-2': [
    { position: 'GK', x: 50, y: 92 },
    { position: 'CB', x: 24, y: 76 }, { position: 'CB', x: 50, y: 79 }, { position: 'CB', x: 76, y: 76 },
    { position: 'LM', x: 10, y: 50 }, { position: 'CM', x: 32, y: 50 }, { position: 'CDM', x: 50, y: 53 }, { position: 'CM', x: 68, y: 50 }, { position: 'RM', x: 90, y: 50 },
    { position: 'ST', x: 36, y: 23 }, { position: 'ST', x: 64, y: 23 },
  ],
  '3-4-3': [
    { position: 'GK', x: 50, y: 92 },
    { position: 'CB', x: 25, y: 78 }, { position: 'CB', x: 50, y: 80 }, { position: 'CB', x: 75, y: 78 },
    { position: 'LM', x: 12, y: 50 }, { position: 'CM', x: 38, y: 50 }, { position: 'CM', x: 62, y: 50 }, { position: 'RM', x: 88, y: 50 },
    { position: 'LW', x: 18, y: 24 }, { position: 'ST', x: 50, y: 18 }, { position: 'RW', x: 82, y: 24 },
  ],
  '5-3-2': [
    { position: 'GK', x: 50, y: 92 },
    { position: 'LB', x: 10, y: 70 }, { position: 'CB', x: 28, y: 76 }, { position: 'CB', x: 50, y: 79 }, { position: 'CB', x: 72, y: 76 }, { position: 'RB', x: 90, y: 70 },
    { position: 'CM', x: 25, y: 45 }, { position: 'CM', x: 50, y: 48 }, { position: 'CM', x: 75, y: 45 },
    { position: 'ST', x: 36, y: 22 }, { position: 'ST', x: 64, y: 22 },
  ],
  '5-4-1': [
    { position: 'GK', x: 50, y: 92 },
    { position: 'LB', x: 10, y: 70 }, { position: 'CB', x: 27, y: 76 }, { position: 'CB', x: 50, y: 79 }, { position: 'CB', x: 73, y: 76 }, { position: 'RB', x: 90, y: 70 },
    { position: 'LM', x: 14, y: 48 }, { position: 'CM', x: 38, y: 50 }, { position: 'CM', x: 62, y: 50 }, { position: 'RM', x: 86, y: 48 },
    { position: 'ST', x: 50, y: 18 },
  ],
}

const FORMATION_DESC: Record<string, string> = {
  '4-4-2':     'Balanced classic — strong in midfield width and dual strikers',
  '4-3-3':     'Possession-based three-man midfield with wide attackers pressing high',
  '4-3-3 (DM)':'Deep-lying playmaker shields defense while CMs push forward to feed wings',
  '4-2-3-1':   'Double pivot shields a creative CAM, ideal for controlling tempo',
  '4-1-4-1':   'Holding midfielder anchors a compact midfield rectangle',
  '4-3-2-1':   'Christmas tree — narrow and layered with two shadow strikers behind the target',
  '4-2-4':     'Ultra-attacking double pivot feeding four forwards — high risk, high reward',
  '3-5-2':     'Wingback-driven system with central midfield overload and direct strikers',
  '3-4-3':     'Aggressive three-back with wide midfielders stretching play and wing trio pressing high',
  '5-3-2':     'Wingbacks provide width while three central mids control the tempo',
  '5-4-1':     'Defensive fortress — five-man backline absorbs pressure, counter on transitions',
}

const STYLE_LABELS: Record<string, string> = {
  possession: 'Possession',
  counter:    'Counter',
  pressing:   'Pressing',
  lowblock:   'Low Block',
}
const STYLE_DESC: Record<string, string> = {
  possession: 'Short passing, hold the ball, dominate territory and wait for gaps.',
  counter:    'Sit deep, win the ball, and exploit space behind their defence at pace.',
  pressing:   'Aggressive press high up the pitch to force turnovers in dangerous areas.',
  lowblock:   'Compact 10-man block absorbs waves of pressure, hits hard on transitions.',
}
const STYLE_TRAITS: Record<string, { bonuses: string[]; cost: string }> = {
  possession: { bonuses: ['Midfield control +8%',  'Attack +2%',         'Ball retention'], cost: 'Exposed to fast counter attacks' },
  counter:    { bonuses: ['Attack +6%',             'Low stamina drain',  'Fast transitions'], cost: 'Midfield control −8%' },
  pressing:   { bonuses: ['Press strength +18%',    'Defense +3%',       'High turnover rate'], cost: 'Stamina drain +22% — very tiring' },
  lowblock:   { bonuses: ['Defense +10%',           'Stamina drain −22%','Hard to break down'], cost: 'Press −35%, limited buildup' },
}

// Positions that may only appear once in a formation
const UNIQUE_POSITIONS = new Set(['GK', 'LB', 'RB', 'LM', 'RM', 'LW', 'RW'])

// These pairs must both be present or both absent
const FLANK_PAIRS: [string, string][] = [['LB', 'RB'], ['LM', 'RM'], ['LW', 'RW']]

// Mirror partner for each flank position
const MIRROR_POSITION: Record<string, string> = { LB:'RB', RB:'LB', LM:'RM', RM:'LM', LW:'RW', RW:'LW' }

// Positions that count as defenders (min 3, max 5)
const DEFENDER_POSITIONS = new Set(['CB', 'LB', 'RB'])

// Positions that make tactical sense as alternatives for each role
const RELATABLE_POSITIONS: Record<string, string[]> = {
  GK:  ['GK'],
  CB:  ['CB', 'CDM', 'LB', 'RB'],
  LB:  ['LB', 'CB', 'LM'],
  RB:  ['RB', 'CB', 'RM'],
  CDM: ['CDM', 'CM', 'CB'],
  CM:  ['CM', 'CDM', 'CAM', 'LM', 'RM'],
  CAM: ['CAM', 'CM', 'LW', 'RW', 'ST'],
  LM:  ['LM', 'LB', 'CM', 'LW'],
  RM:  ['RM', 'RB', 'CM', 'RW'],
  LW:  ['LW', 'LM', 'CAM', 'ST'],
  RW:  ['RW', 'RM', 'CAM', 'ST'],
  ST:  ['ST', 'LW', 'RW', 'CAM'],
}

function autoDetectPosition(x: number, y: number): string {
  const left  = x < 28
  const right = x > 72
  if (y >= 83) return 'GK'
  if (y >= 65) return left ? 'LB'  : right ? 'RB'  : 'CB'
  if (y >= 50) return left ? 'LM'  : right ? 'RM'  : 'CDM'
  if (y >= 35) return left ? 'LM'  : right ? 'RM'  : 'CM'
  if (y >= 22) return left ? 'LW'  : right ? 'RW'  : 'CAM'
  return               left ? 'LW'  : right ? 'RW'  : 'ST'
}

function resolvePosition(x: number, y: number, slots: { position: string }[], excludeIdx = -1): string {
  const others   = slots.filter((_, i) => i !== excludeIdx)
  const usedUnique = new Set(others.filter(s => UNIQUE_POSITIONS.has(s.position)).map(s => s.position))
  const defCount   = others.filter(s => DEFENDER_POSITIONS.has(s.position)).length

  function isAvailable(pos: string): boolean {
    if (UNIQUE_POSITIONS.has(pos) && usedUnique.has(pos)) return false
    if (DEFENDER_POSITIONS.has(pos) && defCount >= 5) return false
    return true
  }

  const primary = autoDetectPosition(x, y)
  if (isAvailable(primary)) return primary

  for (const alt of RELATABLE_POSITIONS[primary] ?? []) {
    if (alt !== primary && isAvailable(alt)) return alt
  }

  if (defCount >= 5) return y >= 50 ? 'CDM' : y >= 35 ? 'CM' : 'ST'
  return y >= 65 ? 'CB' : y >= 35 ? 'CM' : 'ST'
}

function autoAssign(
  formation: string,
  squad: SquadPlayer[],
  nextMatchday: number,
): LineupSlot[] {
  const slots = FORMATION_SLOTS[formation]
  if (!slots) return []
  const healthy = [...squad.filter(p => !p.injured && p.suspendedMatchday !== nextMatchday)].sort(
    (a, b) => b.player.overall - a.player.overall,
  )
  const used = new Set<string>()
  const lineup: (string | null)[] = new Array(slots.length).fill(null)

  for (let i = 0; i < slots.length; i++) {
    const match = healthy.find(p => !used.has(p.id) && p.player.position === slots[i].position)
    if (match) { lineup[i] = match.id; used.add(match.id) }
  }
  for (let i = 0; i < slots.length; i++) {
    if (lineup[i]) continue
    const match = healthy.find(p => !used.has(p.id) && tacticFitScore(p.player.position, slots[i].position) >= 0.7)
    if (match) { lineup[i] = match.id; used.add(match.id) }
  }
  for (let i = 0; i < slots.length; i++) {
    if (lineup[i]) continue
    const match = healthy.find(p => !used.has(p.id))
    if (match) { lineup[i] = match.id; used.add(match.id) }
  }

  return lineup.map((instanceId, i) => ({
    instanceId: instanceId ?? '',
    position: slots[i].position,
  }))
}

// ─── Tactic stage definitions ─────────────────────────────────────────────────

const PRESSING_STAGES = [
  { label: 'Off',    value: 15, desc: 'Sit back and hold shape — save energy for attack' },
  { label: 'Low',   value: 35, desc: 'Light press only when opponents make mistakes' },
  { label: 'Medium',value: 55, desc: 'Balanced press when out of possession' },
  { label: 'High',  value: 75, desc: 'Aggressive press to win the ball high up the pitch' },
  { label: 'Max',   value: 95, desc: 'Full-court press — very high intensity, very tiring' },
]
const DEFLINE_STAGES = [
  { label: 'Very Deep', value: 10, desc: 'Deep block — protects space in behind, invites pressure' },
  { label: 'Deep',      value: 35, desc: 'Solid defensive shape, comfortable with a low block' },
  { label: 'Standard',  value: 55, desc: 'Balanced line — reasonable cover, reasonable compactness' },
  { label: 'High',      value: 75, desc: 'Push up to compress midfield and spring the offside trap' },
  { label: 'Max',       value: 92, desc: 'Extreme high line — maximises offside trap, very risky' },
]
const WIDTH_STAGES = [
  { label: 'Very Narrow', value: 10, desc: 'Overload the middle channels — cuts off wide areas' },
  { label: 'Narrow',      value: 30, desc: 'Central focus with cover wide' },
  { label: 'Normal',      value: 55, desc: 'Balanced width — reasonable crossing and central play' },
  { label: 'Wide',        value: 75, desc: 'Stretch opposition defence with wide runs and crosses' },
  { label: 'Very Wide',   value: 95, desc: 'Maximum width — byline crosses, central gaps open' },
]

const PRESSING_IMPACTS: Record<number, { recovery: number; stamina: number }> = {
  15: { recovery: 1, stamina: 1 },
  35: { recovery: 2, stamina: 2 },
  55: { recovery: 3, stamina: 3 },
  75: { recovery: 4, stamina: 4 },
  95: { recovery: 5, stamina: 5 },
}
const DEFLINE_IMPACTS: Record<number, { compact: number; counterRisk: number }> = {
  10: { compact: 1, counterRisk: 1 },
  35: { compact: 2, counterRisk: 2 },
  55: { compact: 3, counterRisk: 3 },
  75: { compact: 4, counterRisk: 4 },
  92: { compact: 5, counterRisk: 5 },
}
const WIDTH_IMPACTS: Record<number, { wing: number; central: number }> = {
  10: { wing: 1, central: 5 },
  30: { wing: 2, central: 4 },
  55: { wing: 3, central: 3 },
  75: { wing: 4, central: 2 },
  95: { wing: 5, central: 1 },
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function PipBar({ value, color = 'var(--green)' }: { value: number; color?: string }) {
  return (
    <div style={{ display: 'flex', gap: 3 }}>
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: i < value ? color : 'rgba(255,255,255,0.1)', flexShrink: 0 }} />
      ))}
    </div>
  )
}

function snapToStage(value: number, stages: { value: number }[]): number {
  return stages.reduce((a, b) => Math.abs(b.value - value) < Math.abs(a.value - value) ? b : a).value
}

function calcLineupRating(lineup: LineupSlot[], instanceMap: Record<string, SquadPlayer>): number | null {
  const filled = lineup.filter(s => s.instanceId && instanceMap[s.instanceId])
  if (!filled.length) return null
  const sum = filled.reduce((acc, slot) => {
    const sq = instanceMap[slot.instanceId]!
    const fit = tacticFitScore(sq.player.position, slot.position, sq.trainedPosition ?? undefined)
    return acc + sq.player.overall * Math.max(0, fit)
  }, 0)
  return Math.round(sum / filled.length)
}

const ROLE_DESCRIPTIONS: Record<string, string> = {
  'shot-stopper':       'Command the box, dominate aerial balls, block shots',
  'sweeper-keeper':     'Actively sweep outside the box to cut out through balls',
  'stopper':            'Aggressive, win the ball first in defensive duels',
  'ball-playing-cb':    'Initiate build-up from the back with precise passing',
  'attacking-fullback': 'Overlap frequently, support wide attacks',
  'fullback':           'Disciplined defensively, provide solid cover',
  'holding':            'Sit deep, screen the defense, simple distribution',
  'defensive-mid':      'Break up play, win back possession quickly',
  'box-to-box':         'High energy, contribute both offensively and defensively',
  'deep-lying':         'Orchestrate from deep with precise long passes',
  'playmaker':          'Create chances with key passes and incisive vision',
  'shadow-striker':     'Arrive late into the box, score from second positions',
  'winger':             'Hug the touchline, cross and set up wide attacks',
  'inside-forward':     'Cut inside and shoot from wide positions',
  'false-9':            'Drop deep to link play, pull defenders out of position',
  'complete':           'Versatile all-round player, contributes to all aspects',
  'target-forward':     'Hold up the ball, win aerials, bring others into play',
}

function Stars({ value, max = 5 }: { value: number; max?: number }) {
  return (
    <span style={{ color: 'var(--gold)', letterSpacing: 1, fontSize: 13 }}>
      {'★'.repeat(Math.max(0, Math.min(max, value)))}
      <span style={{ color: 'rgba(255,255,255,0.15)' }}>{'★'.repeat(Math.max(0, max - Math.min(max, value)))}</span>
    </span>
  )
}

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

function PlayerDetailModal({
  player, slotPos, slotIndex, lineup,
  onClose, onRoleChange,
}: {
  player: SquadPlayer
  slotPos: string
  slotIndex?: number | null
  lineup?: LineupSlot[]
  onClose: () => void
  onRoleChange?: (slotIndex: number, role: string) => void
}) {
  const isMobile = useIsMobile()
  const hasSlot = slotIndex != null && lineup != null
  const [tab, setTab] = useState<'stats' | 'roles'>('stats')
  const p = player.player
  const currentRole = hasSlot ? (lineup![slotIndex!]?.role ?? '') : ''
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

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', padding: '0 20px' }}>
          {(['stats', ...(hasSlot ? ['roles'] : [])] as ('stats' | 'roles')[]).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: '10px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
              background: 'none', border: 'none', borderBottom: `2px solid ${tab === t ? 'var(--green)' : 'transparent'}`,
              color: tab === t ? 'var(--green)' : 'var(--text-2)', textTransform: 'capitalize',
              transition: 'all 0.15s', marginBottom: -1,
            }}>{t === 'stats' ? 'Stats' : 'Player Roles'}</button>
          ))}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
          {tab === 'stats' && (
            <>
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>Main Stats</div>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '0 24px' }}>
                  {mainStats.map(s => <ModalStatBar key={s.label} label={s.label} value={s.value} />)}
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '0 24px' }}>
                {subStatGroups.map(group => (
                  <div key={group.title} style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>{group.title}</div>
                    {group.stats.map(s => <ModalStatBar key={s.label} label={s.label} value={s.value} />)}
                  </div>
                ))}
              </div>
            </>
          )}

          {tab === 'roles' && (
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 16, lineHeight: 1.6 }}>
                Select a role for <strong style={{ color: 'var(--text-1)' }}>{p.name}</strong> in the <strong style={{ color: 'var(--text-1)' }}>{slotPos}</strong> position. The role shapes how they behave during matches.
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {p.preferredRoles.map(role => {
                  const active = currentRole === role
                  return (
                    <button key={role} onClick={() => onRoleChange?.(slotIndex!, role)} style={{
                      display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 14px',
                      background: active ? 'rgba(54,226,126,0.08)' : 'var(--bg-base)',
                      border: `1.5px solid ${active ? 'var(--green)' : 'var(--border)'}`,
                      borderRadius: 8, cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s',
                    }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: active ? 'var(--green)' : 'var(--border)', marginTop: 4, flexShrink: 0, transition: 'background 0.15s' }} />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: active ? 'var(--green)' : 'var(--text-1)', textTransform: 'capitalize', marginBottom: 3 }}>
                          {role.replace(/-/g, ' ')}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-2)', lineHeight: 1.5 }}>
                          {ROLE_DESCRIPTIONS[role] ?? 'Standard role for this position'}
                        </div>
                      </div>
                    </button>
                  )
                })}
                {p.preferredRoles.length === 0 && (
                  <div style={{ fontSize: 12, color: 'var(--text-2)', padding: 16, textAlign: 'center' }}>No preferred roles defined for this player.</div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

type TacticStyle = 'possession' | 'counter' | 'pressing' | 'lowblock'

interface TacticPreset {
  name: string
  tactic: { formation: string; style: string; pressing: number; defLine: number; width: number; lineup: LineupSlot[] }
}

// ─── Tactics ──────────────────────────────────────────────────────────────────

export default function Tactics({ leagueId, myClub, onSaved, nextMatchday }: {
  leagueId: string
  myClub: ClubData
  onSaved: (tactic: TacticData) => void
  nextMatchday: number
}) {
  const isMobile = useIsMobile()
  const saved = myClub.tactic
  const [formation, setFormation] = useState(saved?.formation ?? '4-3-3')
  const [style, setStyle] = useState<TacticStyle>(saved?.style ?? 'possession')
  const [pressing, setPressing] = useState(snapToStage(saved?.pressingIntensity ?? 55, PRESSING_STAGES))
  const [defLine, setDefLine] = useState(snapToStage(saved?.defensiveLine ?? 55, DEFLINE_STAGES))
  const [width, setWidth] = useState(snapToStage(saved?.width ?? 55, WIDTH_STAGES))
  const [lineup, setLineup] = useState<LineupSlot[]>(() =>
    saved?.lineup?.length === 11 ? saved.lineup : autoAssign(saved?.formation ?? '4-3-3', myClub.squad, nextMatchday)
  )
  const [subs, setSubs] = useState<SubSlot[]>(saved?.subs ?? [])
  const [customSlots, setCustomSlots] = useState<CustomSlot[]>(() => {
    if (saved?.customSlots?.length) return saved.customSlots.map((s, i) => ({ ...s, id: String(i) }))
    if ((saved?.formation ?? '4-3-3') === 'custom') return (FORMATION_SLOTS['4-3-3'] ?? []).map((s, i) => ({ ...s, id: String(i) }))
    return []
  })
  const [customPickerFor, setCustomPickerFor] = useState<null | number>(null)
  const customDragRef = useRef<number | null>(null)
  const customDragMovedRef = useRef(false)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const [isDirty, setIsDirty] = useState(false)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useRef(false)
  const [detailInfo, setDetailInfo] = useState<{ player: SquadPlayer; slotPos: string; slotIndex: number } | null>(null)
  const pitchScale = isMobile ? 92 : 78
  const [dragSrc, setDragSrc] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)
  const dragMovedRef = useRef(false)
  const pitchRef        = useRef<HTMLDivElement | null>(null)
  const longPressRef    = useRef<ReturnType<typeof setTimeout> | null>(null)
  const touchSrcRef     = useRef<number | null>(null)
  const touchTargetRef  = useRef<number | null>(null)
  const touchStartXY    = useRef<{ x: number; y: number } | null>(null)
  const [touchSrc,    setTouchSrc]    = useState<number | null>(null)
  const [touchPos,    setTouchPos]    = useState<{ x: number; y: number } | null>(null)
  const [touchTarget, setTouchTarget] = useState<number | null>(null)
  const [presets, setPresets] = useState<TacticPreset[]>(() => {
    try { return JSON.parse(localStorage.getItem(`tactic-presets-${leagueId}`) ?? '[]') } catch { return [] }
  })

  useEffect(() => {
    if (!mountedRef.current) { mountedRef.current = true; return }
    setIsDirty(true)
  }, [formation, style, pressing, defLine, width, lineup, subs])

  useEffect(() => {
    if (!isDirty) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => { handleSave() }, 2000)
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDirty, formation, style, pressing, defLine, width, lineup, subs])

  useEffect(() => {
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }
  }, [])

  useEffect(() => {
    const el = pitchRef.current
    if (!el) return
    function onTouchMove(e: TouchEvent) {
      const touch = e.touches[0]
      if (touchSrcRef.current === null) {
        if (longPressRef.current !== null && touchStartXY.current) {
          const dx = touch.clientX - touchStartXY.current.x
          const dy = touch.clientY - touchStartXY.current.y
          if (dx * dx + dy * dy > 64) {
            clearTimeout(longPressRef.current)
            longPressRef.current = null
          }
        }
        return
      }
      e.preventDefault()
      setTouchPos({ x: touch.clientX, y: touch.clientY })
      const hit    = document.elementFromPoint(touch.clientX, touch.clientY)
      const slotEl = hit?.closest('[data-si]')
      const si     = slotEl ? parseInt((slotEl as HTMLElement).dataset.si ?? '') : NaN
      const next   = isNaN(si) ? null : si
      touchTargetRef.current = next
      setTouchTarget(next)
    }
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    return () => el.removeEventListener('touchmove', onTouchMove)
  }, [])

  function changeFormation(f: string) {
    if (f === 'custom') {
      const base = FORMATION_SLOTS[formation] ?? FORMATION_SLOTS['4-3-3'] ?? []
      setCustomSlots(base.map((s, i) => ({ ...s, id: String(Date.now() + i) })))
      setFormation('custom')
      return
    }
    setFormation(f)
    setLineup(autoAssign(f, myClub.squad, nextMatchday))
  }

  function addCustomSlotAt(position: string, x: number, y: number) {
    if (customSlots.length >= 11) return
    const id = String(Date.now())
    setCustomSlots(prev => [...prev, { id, position, x, y }])
    setLineup(prev => [...prev, { instanceId: '', position }])
  }

  function removeCustomSlot(i: number) {
    setCustomSlots(prev => prev.filter((_, ci) => ci !== i))
    setLineup(prev => prev.filter((_, ci) => ci !== i))
  }

  function editCustomSlotPosition(i: number, position: string) {
    setCustomSlots(prev => prev.map((s, ci) => ci === i ? { ...s, position } : s))
    setLineup(prev => prev.map((s, ci) => ci === i ? { ...s, position } : s))
    setCustomPickerFor(null)
  }

  function swapSlots(a: number, b: number) {
    if (a === b) return
    setLineup(prev => {
      const next = [...prev]
      const tmpId = next[a].instanceId
      const tmpRole = next[a].role
      next[a] = { ...next[a], instanceId: next[b].instanceId, role: next[b].role }
      next[b] = { ...next[b], instanceId: tmpId, role: tmpRole }
      return next
    })
  }

  function handleDragStart(i: number) {
    setDragSrc(i)
    dragMovedRef.current = false
  }

  function handleDragOver(e: React.DragEvent, i: number) {
    e.preventDefault()
    dragMovedRef.current = true
    setDragOver(i)
  }

  function handleDrop(e: React.DragEvent, i: number) {
    e.preventDefault()
    if (dragSrc !== null) swapSlots(dragSrc, i)
    setDragSrc(null)
    setDragOver(null)
  }

  function handleDragEnd() {
    setDragSrc(null)
    setDragOver(null)
    dragMovedRef.current = false
  }

  function handleTouchStart(e: React.TouchEvent, i: number, hasPlayer: boolean) {
    if (!hasPlayer) return
    const touch = e.touches[0]
    touchStartXY.current = { x: touch.clientX, y: touch.clientY }
    longPressRef.current = setTimeout(() => {
      longPressRef.current = null
      touchSrcRef.current  = i
      setTouchSrc(i)
      setTouchPos({ x: touch.clientX, y: touch.clientY })
      touchTargetRef.current = null
      setTouchTarget(null)
      if (navigator.vibrate) navigator.vibrate(40)
    }, 400)
  }

  function handlePitchTouchEnd(e: React.TouchEvent) {
    if (longPressRef.current !== null) {
      clearTimeout(longPressRef.current)
      longPressRef.current = null
    }
    if (touchSrcRef.current !== null) {
      e.preventDefault()
      if (touchTargetRef.current !== null && touchSrcRef.current !== touchTargetRef.current) {
        swapSlots(touchSrcRef.current, touchTargetRef.current)
      }
    }
    touchSrcRef.current    = null
    touchTargetRef.current = null
    touchStartXY.current   = null
    setTouchSrc(null)
    setTouchPos(null)
    setTouchTarget(null)
  }

  function handleSlotClick(i: number, player: SquadPlayer | null, slotPos: string) {
    if (dragMovedRef.current) return
    if (!player) return
    setDetailInfo({ player, slotPos, slotIndex: i })
  }

  function handleRoleChange(slotIndex: number, role: string) {
    setLineup(prev => prev.map((s, i) => i === slotIndex ? { ...s, role } : s))
  }

  async function handleSave() {
    if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null }
    setSaving(true)
    try {
      const payload: TacticData = { formation, style, pressingIntensity: pressing, defensiveLine: defLine, width, lineup, subs, customSlots: formation === 'custom' ? customSlots.map(({ id: _id, ...s }) => s) : undefined }
      await api.patch(`/leagues/${leagueId}/tactic`, payload)
      onSaved(payload)
      setIsDirty(false)
      setSaveMsg('Saved!')
      setTimeout(() => setSaveMsg(''), 2500)
    } catch {
      setSaveMsg('Save failed')
    } finally {
      setSaving(false)
    }
  }

  function savePreset() {
    const name = window.prompt('Preset name:', `Preset ${presets.length + 1}`)
    if (!name) return
    const newPresets: TacticPreset[] = [...presets.slice(0, 3), { name: name.trim(), tactic: { formation, style, pressing, defLine, width, lineup } }]
    setPresets(newPresets)
    localStorage.setItem(`tactic-presets-${leagueId}`, JSON.stringify(newPresets))
  }

  function deletePreset(i: number) {
    const newPresets = presets.filter((_, idx) => idx !== i)
    setPresets(newPresets)
    localStorage.setItem(`tactic-presets-${leagueId}`, JSON.stringify(newPresets))
  }

  function loadPreset(preset: TacticPreset) {
    setFormation(preset.tactic.formation)
    setStyle(preset.tactic.style as TacticStyle)
    setPressing(preset.tactic.pressing)
    setDefLine(preset.tactic.defLine)
    setWidth(preset.tactic.width)
    setLineup(preset.tactic.lineup)
  }

  const slots = formation === 'custom' ? customSlots : (FORMATION_SLOTS[formation] ?? [])
  const instanceMap = Object.fromEntries(myClub.squad.map(p => [p.id, p]))
  const startingIds = new Set(lineup.map(s => s.instanceId))
  const bench = myClub.squad.filter(p => !startingIds.has(p.id)).sort((a, b) => b.player.overall - a.player.overall)

  const currentRating = calcLineupRating(lineup, instanceMap)
  const activeSrc  = dragSrc !== null ? dragSrc  : touchSrc
  const activeOver = dragSrc !== null ? dragOver : touchTarget
  const previewLineup = (activeSrc !== null && activeOver !== null && activeSrc !== activeOver)
    ? lineup.map((s, i) =>
        i === activeSrc  ? { ...s, instanceId: lineup[activeOver].instanceId, role: lineup[activeOver].role } :
        i === activeOver ? { ...s, instanceId: lineup[activeSrc].instanceId,  role: lineup[activeSrc].role  } : s
      )
    : null
  const previewRating = previewLineup ? calcLineupRating(previewLineup, instanceMap) : null

  const cardW   = isMobile ? Math.max(40, Math.round(pitchScale * 0.64)) : Math.max(52,  Math.round(pitchScale * 1.55))
  const photoSz = isMobile ? Math.max(16, Math.round(pitchScale * 0.20)) : Math.max(20,  Math.round(pitchScale * 0.60))
  const nameFz  = isMobile ? Math.max(6,  Math.round(pitchScale * 0.085)) : Math.max(7,   Math.round(pitchScale * 0.195))
  const ovrFz   = isMobile ? Math.max(9,  Math.round(pitchScale * 0.125)) : Math.max(9,   Math.round(pitchScale * 0.27))
  const posFz   = isMobile ? Math.max(5,  Math.round(pitchScale * 0.065)) : Math.max(6,   Math.round(pitchScale * 0.155))
  const roleFz  = isMobile ? 0 : Math.max(5, Math.round(pitchScale * 0.125))

  return (
    <>
    {detailInfo && (
      <PlayerDetailModal
        player={detailInfo.player}
        slotPos={detailInfo.slotPos}
        slotIndex={detailInfo.slotIndex}
        lineup={lineup}
        onClose={() => setDetailInfo(null)}
        onRoleChange={handleRoleChange}
      />
    )}

    {/* Floating player clone during touch drag */}
    {touchSrc !== null && touchPos !== null && (() => {
      const entry  = lineup[touchSrc]
      const player = entry?.instanceId ? instanceMap[entry.instanceId] : null
      if (!player) return null
      const fitColor = 'var(--green)'
      return (
        <div style={{
          position: 'fixed',
          left: touchPos.x - Math.round(cardW * 0.55),
          top:  touchPos.y - Math.round(cardW * 1.1),
          width: Math.round(cardW * 1.15),
          pointerEvents: 'none',
          zIndex: 9999,
          transform: 'rotate(3deg)',
          filter: 'drop-shadow(0 8px 20px rgba(0,0,0,0.8))',
        }}>
          <div style={{
            background: 'rgba(0,0,0,0.95)',
            border: `2.5px solid ${fitColor}`,
            borderRadius: 10,
            padding: '4px 5px',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
          }}>
            {player.player.photoUrl ? (
              <img src={player.player.photoUrl} alt="" style={{ width: photoSz, height: photoSz, borderRadius: '50%', objectFit: 'cover', border: `2px solid ${fitColor}` }} />
            ) : (
              <div style={{ width: photoSz, height: photoSz, borderRadius: '50%', background: getBadgeColor(player.player.name), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: Math.round(photoSz * 0.35), fontWeight: 900, color: '#000', flexShrink: 0, border: `2px solid ${fitColor}` }}>
                {player.player.name.split(' ').map(w => w[0]).slice(0, 2).join('')}
              </div>
            )}
            <span style={{ fontSize: nameFz, fontWeight: 700, color: '#fff', textAlign: 'center', lineHeight: 1.2, width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {player.player.name.split(' ').slice(-1)[0]}
            </span>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: ovrFz, fontWeight: 900, color: fitColor, lineHeight: 1 }}>
              {player.player.overall}
            </span>
          </div>
        </div>
      )
    })()}

    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1fr) 300px', gap: 20, alignItems: 'start' }}>

      {/* Left: pitch */}
      <div>
        {/* Formation picker */}
        <div style={{ display: 'flex', gap: 5, marginBottom: 8, flexWrap: 'wrap' }}>
          {Object.keys(FORMATION_SLOTS).map(f => (
            <button key={f} onClick={() => changeFormation(f)} style={{
              padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700,
              cursor: 'pointer', border: 'none', fontFamily: 'var(--font-display)',
              background: formation === f ? 'var(--green)' : 'var(--bg-card)',
              color: formation === f ? '#000' : 'var(--text-2)',
              transition: 'all 0.15s',
            }}>{f}</button>
          ))}
          <button onClick={() => changeFormation('custom')} style={{
            padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700,
            cursor: 'pointer', border: `1.5px solid ${formation === 'custom' ? 'var(--green)' : 'var(--border)'}`,
            fontFamily: 'var(--font-display)',
            background: formation === 'custom' ? 'rgba(54,226,126,0.12)' : 'transparent',
            color: formation === 'custom' ? 'var(--green)' : 'var(--text-2)',
            transition: 'all 0.15s',
          }}>✏ Custom</button>
          <button onClick={() => setLineup(autoAssign(formation === 'custom' ? '4-3-3' : formation, myClub.squad, nextMatchday))} style={{ padding: '5px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700, cursor: 'pointer', border: '1.5px solid var(--green)', background: 'rgba(54,226,126,0.08)', color: 'var(--green)', marginLeft: 'auto' }}>↺ Best XI</button>
        </div>
        {formation === 'custom' ? (
          <div style={{ fontSize: 11, color: 'var(--text-2)', marginBottom: 12, padding: '8px 10px', background: 'rgba(255,255,255,0.04)', borderRadius: 6, lineHeight: 1.6 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ display: 'flex', flexWrap: 'wrap', gap: '0 10px' }}>
                <span style={{ fontWeight: 700, color: customSlots.length === 11 ? 'var(--green)' : 'var(--gold)' }}>{customSlots.length}/11 slots</span>
                {customSlots.length > 0 && !customSlots.some(s => s.position === 'GK') && (
                  <span style={{ color: 'var(--red)' }}>needs a GK</span>
                )}
                {(() => {
                  const defCount = customSlots.filter(s => DEFENDER_POSITIONS.has(s.position)).length
                  if (customSlots.length > 0 && defCount < 3) return <span key="def-min" style={{ color: 'var(--red)' }}>min 3 defenders ({defCount})</span>
                  if (defCount > 5) return <span key="def-max" style={{ color: 'var(--red)' }}>max 5 defenders ({defCount})</span>
                  return null
                })()}
                {FLANK_PAIRS.flatMap(([l, r]) => {
                  const hasL = customSlots.some(s => s.position === l)
                  const hasR = customSlots.some(s => s.position === r)
                  if (hasL && !hasR) return [`${l} needs ${r}`]
                  if (hasR && !hasL) return [`${r} needs ${l}`]
                  return []
                }).map(msg => (
                  <span key={msg} style={{ color: 'var(--red)' }}>{msg}</span>
                ))}
              </span>
              <button onClick={() => { setCustomSlots([]); setLineup([]) }} style={{ fontSize: 10, color: 'var(--red)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, flexShrink: 0, marginLeft: 8 }}>Clear all</button>
            </div>
            <span style={{ fontSize: 10, color: 'var(--text-3)' }}>Click pitch to add — position auto-detected from location · drag to reposition · click badge to override</span>
          </div>
        ) : FORMATION_DESC[formation] ? (
          <div style={{ fontSize: 11, color: 'var(--text-2)', marginBottom: 12, padding: '7px 10px', background: 'rgba(255,255,255,0.04)', borderRadius: 6, lineHeight: 1.5 }}>
            <span style={{ fontWeight: 700, color: 'var(--text-1)' }}>{formation}</span>
            {' — '}{FORMATION_DESC[formation]}
          </div>
        ) : null}

        {/* Pitch */}
        <div style={{ width: `${pitchScale}%`, margin: '0 auto' }}>
        <div
          ref={pitchRef}
          style={{
            position: 'relative', width: '100%', aspectRatio: '68 / 58',
            borderRadius: 14, overflow: 'hidden',
            border: '2px solid rgba(255,255,255,0.12)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          }}
          onDragOver={e => e.preventDefault()}
          onTouchEnd={handlePitchTouchEnd}
          onClick={e => {
            if (formation !== 'custom') return
            if (customDragMovedRef.current) { customDragMovedRef.current = false; return }
            if (customSlots.length >= 11) return
            const rect = pitchRef.current?.getBoundingClientRect()
            if (!rect) return
            const x = Math.max(5, Math.min(95, Math.round(((e.clientX - rect.left) / rect.width) * 100)))
            const y = Math.max(5, Math.min(95, Math.round(((e.clientY - rect.top) / rect.height) * 100)))
            addCustomSlotAt(resolvePosition(x, y, customSlots), x, y)
          }}
          onMouseMove={e => {
            if (customDragRef.current === null) return
            const rect = pitchRef.current?.getBoundingClientRect()
            if (!rect) return
            customDragMovedRef.current = true
            const x = Math.max(5, Math.min(95, Math.round(((e.clientX - rect.left) / rect.width) * 100)))
            const y = Math.max(5, Math.min(95, Math.round(((e.clientY - rect.top) / rect.height) * 100)))
            setCustomSlots(prev => prev.map((s, ci) => ci === customDragRef.current ? { ...s, x, y } : s))
          }}
          onMouseUp={e => {
            if (customDragRef.current !== null && customDragMovedRef.current) {
              const idx = customDragRef.current
              const rect = pitchRef.current?.getBoundingClientRect()
              if (rect) {
                const x = Math.max(5, Math.min(95, Math.round(((e.clientX - rect.left) / rect.width) * 100)))
                const y = Math.max(5, Math.min(95, Math.round(((e.clientY - rect.top) / rect.height) * 100)))
                const detected = resolvePosition(x, y, customSlots, idx)
                setCustomSlots(prev => prev.map((s, ci) => ci === idx ? { ...s, position: detected, x, y } : s))
                setLineup(prev => prev.map((s, ci) => ci === idx ? { ...s, position: detected } : s))
              }
            }
            customDragRef.current = null
          }}
          onMouseLeave={() => { customDragRef.current = null }}
        >
          {/* Grass stripes */}
          <div style={{ position: 'absolute', inset: 0, background: 'repeating-linear-gradient(to bottom, #1e5c1e 0%, #1e5c1e 10%, #1a4a1a 10%, #1a4a1a 20%)' }} />

          {/* Pitch SVG markings */}
          <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} viewBox="0 0 100 100" preserveAspectRatio="none">
            <rect x="2" y="2" width="96" height="96" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="0.6" />
            <line x1="2" y1="2" x2="98" y2="2" stroke="rgba(255,255,255,0.35)" strokeWidth="0.7" />
            <ellipse cx="50" cy="2" rx="16" ry="13" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="0.5" clipPath="url(#bottomHalf)" />
            <clipPath id="bottomHalf"><rect x="0" y="2" width="100" height="100" /></clipPath>
            <circle cx="50" cy="2" r="0.6" fill="rgba(255,255,255,0.4)" />
            <rect x="20" y="64" width="60" height="34" fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="0.5" />
            <rect x="35" y="88" width="30" height="10" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="0.4" />
            <circle cx="50" cy="76" r="0.6" fill="rgba(255,255,255,0.4)" />
            <path d="M 23 64 A 17 17 0 0 0 77 64" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="0.4" />
            <path d="M 2 94 A 3 3 0 0 0 5 98" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="0.4" />
            <path d="M 98 94 A 3 3 0 0 1 95 98" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="0.4" />
          </svg>

          {/* Player slots */}
          {slots.map((slot, i) => {
            const entry = lineup[i]
            const player = entry?.instanceId ? instanceMap[entry.instanceId] : null
            const fit = player ? tacticFitScore(player.player.position, slot.position, player.trainedPosition) : 0
            const fitColor = fit >= 1 ? 'var(--green)' : fit >= 0.7 ? 'var(--gold)' : 'var(--red)'
            const isDragSrc    = dragSrc === i
            const isDragTarget = dragOver === i && dragSrc !== null && dragSrc !== i
            const isTouchSrc   = touchSrc === i
            const isTouchTarget = touchTarget === i && touchSrc !== null && touchSrc !== i
            const isActiveSrc  = isDragSrc || isTouchSrc
            const isActiveTarget = isDragTarget || isTouchTarget
            const role = entry?.role

            const isCustomMode = formation === 'custom'
            const isCustomDragging = isCustomMode && customDragRef.current === i
            const flankMirror = MIRROR_POSITION[slot.position]
            const hasFlankWarning = isCustomMode && !!flankMirror && !slots.some((s, si) => si !== i && s.position === flankMirror)

            return (
              <div
                key={isCustomMode ? (slot as CustomSlot).id : i}
                data-si={i}
                draggable={!isCustomMode && !!player}
                onDragStart={() => { if (!isCustomMode) handleDragStart(i) }}
                onDragOver={e => { if (!isCustomMode) handleDragOver(e, i) }}
                onDrop={e => { if (!isCustomMode) handleDrop(e, i) }}
                onDragEnd={() => { if (!isCustomMode) handleDragEnd() }}
                onTouchStart={e => { if (!isCustomMode) handleTouchStart(e, i, !!player) }}
                onMouseDown={e => {
                  if (!isCustomMode) return
                  e.stopPropagation()
                  customDragMovedRef.current = false
                  customDragRef.current = i
                }}
                onClick={e => {
                  if (!isCustomMode) { handleSlotClick(i, player, slot.position); return }
                  e.stopPropagation()
                  if (!customDragMovedRef.current) {
                    handleSlotClick(i, player, slot.position)
                  }
                  customDragMovedRef.current = false
                }}
                style={{
                  position: 'absolute',
                  left: `${slot.x}%`, top: `${slot.y}%`,
                  transform: 'translate(-50%, -50%)',
                  width: cardW,
                  background: isCustomDragging
                    ? 'rgba(255,255,255,0.12)'
                    : isActiveTarget
                    ? 'rgba(54,226,126,0.2)'
                    : isActiveSrc
                    ? 'rgba(255,255,255,0.05)'
                    : player ? 'rgba(0,0,0,0.82)' : 'rgba(0,0,0,0.4)',
                  border: `2px solid ${isCustomDragging ? 'rgba(255,255,255,0.6)' : isActiveTarget ? 'var(--green)' : isActiveSrc ? 'rgba(255,255,255,0.4)' : player?.injured ? 'var(--red)' : player?.suspendedMatchday === nextMatchday ? 'var(--gold)' : player ? fitColor : 'rgba(255,255,255,0.2)'}`,
                  borderRadius: 10,
                  cursor: isCustomMode ? 'move' : player ? 'grab' : 'default',
                  padding: isMobile ? '3px 4px' : `${Math.round(pitchScale * 0.07)}px ${Math.round(pitchScale * 0.08)}px`,
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  gap: Math.round(pitchScale * 0.04),
                  zIndex: isCustomDragging ? 30 : isActiveSrc ? 20 : 10,
                  transition: isCustomDragging ? 'none' : 'border-color 0.12s, background 0.12s, opacity 0.12s',
                  backdropFilter: 'blur(6px)',
                  opacity: isActiveSrc && !isCustomMode ? 0.3 : 1,
                  boxShadow: player ? '0 3px 12px rgba(0,0,0,0.6)' : 'none',
                  userSelect: 'none',
                }}
              >
                {/* Flank-pair warning pill */}
                {hasFlankWarning && (
                  <div style={{
                    position: 'absolute',
                    bottom: '100%', left: '50%', transform: 'translateX(-50%)',
                    marginBottom: 4,
                    background: 'var(--gold)', color: '#000',
                    fontSize: Math.max(7, posFz), fontWeight: 900,
                    padding: '2px 6px', borderRadius: 4,
                    whiteSpace: 'nowrap', zIndex: 15, lineHeight: 1.4,
                    pointerEvents: 'none',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.5)',
                  }}>
                    ⚠ add {flankMirror}
                  </div>
                )}
                {/* In custom mode: × delete button */}
                {isCustomMode && (
                  <button
                    onMouseDown={e => e.stopPropagation()}
                    onClick={e => { e.stopPropagation(); removeCustomSlot(i) }}
                    style={{
                      position: 'absolute', top: -6, right: -6,
                      width: 16, height: 16, borderRadius: '50%',
                      background: 'var(--red)', border: 'none',
                      color: '#fff', fontSize: 9, fontWeight: 900,
                      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      lineHeight: 1, padding: 0, zIndex: 5,
                    }}
                  >×</button>
                )}
                {/* Position badge */}
                <div
                  onMouseDown={e => { if (isCustomMode) e.stopPropagation() }}
                  onClick={e => {
                    if (!isCustomMode) return
                    e.stopPropagation()
                    if (!customDragMovedRef.current) {
                      setCustomPickerFor(i)
                    }
                  }}
                  style={{
                    background: player ? fitColor : isCustomMode ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.15)',
                    color: player ? '#000' : isCustomMode ? '#fff' : 'rgba(255,255,255,0.5)',
                    fontSize: posFz, fontWeight: 900,
                    textTransform: 'uppercase', letterSpacing: 0.5,
                    padding: `1px ${Math.round(posFz * 0.5)}px`, borderRadius: 3,
                    cursor: isCustomMode ? 'pointer' : 'default',
                    outline: isCustomMode && customPickerFor === i ? '1.5px solid #fff' : 'none',
                  }}
                >
                  {slot.position}
                </div>

                {player ? (
                  <>
                    {/* Photo with injury/suspension badge */}
                    {(() => {
                      const isSusp = player.suspendedMatchday === nextMatchday
                      const alertColor = player.injured ? 'var(--red)' : isSusp ? 'var(--gold)' : null
                      const dimmed = player.injured || isSusp
                      return (
                        <div style={{ position: 'relative', flexShrink: 0 }}>
                          {player.player.photoUrl ? (
                            <img src={player.player.photoUrl} alt="" style={{ width: photoSz, height: photoSz, borderRadius: '50%', objectFit: 'cover', border: `2px solid ${alertColor ?? fitColor}`, opacity: dimmed ? 0.65 : 1 }} />
                          ) : (
                            <div style={{ width: photoSz, height: photoSz, borderRadius: '50%', background: getBadgeColor(player.player.name), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: Math.round(photoSz * 0.35), fontWeight: 900, color: '#000', flexShrink: 0, border: `2px solid ${alertColor ?? fitColor}`, opacity: dimmed ? 0.65 : 1 }}>
                              {player.player.name.split(' ').map(w => w[0]).slice(0, 2).join('')}
                            </div>
                          )}
                          {player.injured && (
                            <div style={{
                              position: 'absolute', bottom: -2, right: -2, zIndex: 2,
                              width: Math.max(9, Math.round(photoSz * 0.42)), height: Math.max(9, Math.round(photoSz * 0.42)),
                              borderRadius: '50%', background: 'var(--red)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: Math.max(5, Math.round(photoSz * 0.24)), fontWeight: 900, color: '#fff', lineHeight: 1,
                              border: '1.5px solid rgba(0,0,0,0.9)',
                            }}>✚</div>
                          )}
                          {!player.injured && isSusp && (
                            <div style={{
                              position: 'absolute', bottom: -2, right: -2, zIndex: 2,
                              width: Math.max(9, Math.round(photoSz * 0.42)), height: Math.max(9, Math.round(photoSz * 0.42)),
                              borderRadius: '50%', background: 'var(--gold)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: Math.max(5, Math.round(photoSz * 0.22)), fontWeight: 900, color: '#000', lineHeight: 1,
                              border: '1.5px solid rgba(0,0,0,0.9)',
                            }}>S</div>
                          )}
                        </div>
                      )
                    })()}
                    <KitSvg config={myClub.kitConfig as KitConfig | null} size={Math.max(20, Math.round(photoSz * 0.75))} uid={`tac-${player.id}`} />
                    <span style={{ fontSize: nameFz, fontWeight: 700, color: (player.injured || player.suspendedMatchday === nextMatchday) ? 'rgba(255,255,255,0.55)' : '#fff', textAlign: 'center', lineHeight: 1.2, width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {player.player.name.split(' ').slice(-1)[0]}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                      <span style={{ fontFamily: 'var(--font-display)', fontSize: ovrFz, fontWeight: 900, color: player.injured ? 'var(--red)' : player.suspendedMatchday === nextMatchday ? 'var(--gold)' : fitColor, lineHeight: 1 }}>{player.player.overall}</span>
                      {!player.injured && player.suspendedMatchday !== nextMatchday && fit < 1 && <span style={{ fontSize: Math.max(6, posFz - 1), color: fitColor, fontWeight: 800 }}>{fit >= 0.7 ? '~' : '!'}</span>}
                      {player.injured && <span style={{ fontSize: Math.max(6, posFz - 1), color: 'var(--red)', fontWeight: 800 }}>!</span>}
                      {!player.injured && player.suspendedMatchday === nextMatchday && <span style={{ fontSize: Math.max(6, posFz - 1), color: 'var(--gold)', fontWeight: 800 }}>S</span>}
                    </div>
                    {/* Fitness / Morale / Form dots */}
                    <div style={{ display: 'flex', gap: Math.max(2, Math.round(pitchScale * 0.025)), alignItems: 'center' }}>
                      {([
                        { v: player.fitness, label: 'F' },
                        { v: player.morale,  label: 'M' },
                        { v: player.form,    label: 'C' },
                      ] as const).map(({ v, label }) => {
                        const dotColor = v >= 75 ? 'var(--green)' : v >= 50 ? 'var(--gold)' : 'var(--red)'
                        const dotSz = Math.max(4, Math.round(pitchScale * 0.05))
                        return (
                          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <div style={{ width: dotSz, height: dotSz, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
                            {roleFz > 0 && <span style={{ fontSize: Math.max(5, Math.round(dotSz * 0.9)), color: 'rgba(255,255,255,0.38)', fontWeight: 700, lineHeight: 1 }}>{label}</span>}
                          </div>
                        )
                      })}
                    </div>
                    {role && roleFz > 0 && (
                      <span style={{ fontSize: roleFz, color: 'rgba(255,255,255,0.5)', width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'center', textTransform: 'capitalize' }}>
                        {role.replace(/-/g, ' ')}
                      </span>
                    )}
                  </>
                ) : (
                  <span style={{ fontSize: posFz, color: 'rgba(255,255,255,0.2)', padding: `${Math.round(pitchScale * 0.05)}px 0` }}>Empty</span>
                )}
              </div>
            )
          })}
        </div>
        </div>{/* end pitch scale wrapper */}

        {/* Custom formation position override picker */}
        {customPickerFor !== null && (() => {
          const rect = pitchRef.current?.getBoundingClientRect()
          const s = customSlots[customPickerFor]
          if (!s || !rect) return null
          const vx = rect.left + (s.x / 100) * rect.width
          const vy = rect.top  + (s.y / 100) * rect.height
          const PICKER_W = 200
          const PICKER_H = 190
          const left = Math.max(8, Math.min(vx - PICKER_W / 2, window.innerWidth - PICKER_W - 8))
          const top  = vy + 14 + PICKER_H > window.innerHeight ? vy - PICKER_H - 14 : vy + 14
          return (
            <>
              <div onMouseDown={() => setCustomPickerFor(null)} style={{ position: 'fixed', inset: 0, zIndex: 999 }} />
              <div style={{
                position: 'fixed', left, top, zIndex: 1000,
                background: 'var(--bg-card)', border: '1px solid var(--border)',
                borderRadius: 10, padding: '10px 12px',
                boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
                minWidth: PICKER_W,
              }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
                  Change position
                </div>
                {(() => {
                  const relatable = RELATABLE_POSITIONS[s.position] ?? [s.position]
                  const otherSlots  = customSlots.filter((_, ci) => ci !== customPickerFor)
                  const usedUnique  = new Set(otherSlots.filter(cs => UNIQUE_POSITIONS.has(cs.position)).map(cs => cs.position))
                  const usedAll     = new Set(otherSlots.map(cs => cs.position))
                  const otherDefCount = otherSlots.filter(cs => DEFENDER_POSITIONS.has(cs.position)).length
                  return (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                      {relatable.map(pos => {
                        const isCurrent   = s.position === pos
                        const isTaken     = (UNIQUE_POSITIONS.has(pos) && usedUnique.has(pos))
                                         || (DEFENDER_POSITIONS.has(pos) && otherDefCount >= 5)
                        const mirror      = MIRROR_POSITION[pos]
                        const needsMirror = !isTaken && !isCurrent && mirror && !usedAll.has(mirror)
                        return (
                          <button
                            key={pos}
                            disabled={isTaken}
                            onMouseDown={e => e.stopPropagation()}
                            onClick={e => { e.stopPropagation(); if (!isTaken) editCustomSlotPosition(customPickerFor, pos) }}
                            title={
                              isTaken
                                ? DEFENDER_POSITIONS.has(pos) && otherDefCount >= 5
                                  ? 'Max 5 defenders reached'
                                  : `${pos} already used`
                                : needsMirror ? `Remember to also add ${mirror}` : undefined
                            }
                            style={{
                              padding: '5px 12px', borderRadius: 5, fontSize: 12, fontWeight: 800,
                              border: `1px solid ${isCurrent ? 'var(--green)' : needsMirror ? 'var(--gold)' : 'var(--border)'}`,
                              cursor: isTaken ? 'not-allowed' : 'pointer',
                              background: isCurrent ? 'rgba(54,226,126,0.15)' : needsMirror ? 'rgba(233,196,106,0.08)' : 'rgba(255,255,255,0.06)',
                              color: isCurrent ? 'var(--green)' : isTaken ? 'rgba(255,255,255,0.2)' : needsMirror ? 'var(--gold)' : 'var(--text-1)',
                              textTransform: 'uppercase', letterSpacing: 0.4,
                              opacity: isTaken ? 0.45 : 1,
                              position: 'relative',
                            }}
                          >
                            {pos}
                            {needsMirror && <span style={{ fontSize: 8, position: 'absolute', top: 1, right: 2, lineHeight: 1 }}>⚠</span>}
                          </button>
                        )
                      })}
                    </div>
                  )
                })()}
              </div>
            </>
          )
        })()}

        {/* Bench */}
        {bench.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Bench · {bench.length} players</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 6 }}>
              {bench.map(p => (
                <div
                  key={p.id}
                  draggable
                  onDragStart={() => { /* bench-to-pitch DnD could be added */ }}
                  style={{ padding: '6px 8px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 7, display: 'flex', alignItems: 'center', gap: 6, cursor: 'default' }}
                >
                  {p.player.photoUrl ? (
                    <img src={p.player.photoUrl} alt="" style={{ width: 24, height: 24, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                  ) : (
                    <div style={{ width: 24, height: 24, borderRadius: '50%', background: getBadgeColor(p.player.name), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 900, color: '#000', flexShrink: 0 }}>
                      {p.player.name.split(' ').map(w => w[0]).slice(0, 2).join('')}
                    </div>
                  )}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.player.name.split(' ').slice(-1)[0]}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span className={posClass(p.player.position)} style={{ fontSize: 8 }}>{p.player.position}</span>
                      <span style={{ fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 800, color: 'var(--text-2)' }}>{p.player.overall}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-3)' }}>
          {isMobile ? 'Hold a player (400 ms) to drag · tap to view stats' : 'Drag players between slots to rearrange · Click a player to view stats & set role'}
        </div>
      </div>

      {/* Right: settings */}
      <div style={{ display: isMobile ? 'grid' : 'flex', gridTemplateColumns: isMobile ? '1fr 1fr' : undefined, flexDirection: isMobile ? undefined : 'column', gap: 14, alignItems: isMobile ? 'start' : undefined }}>

        {/* Team rating */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '14px 16px' }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Team Rating</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 36, fontWeight: 900, color: 'var(--text-1)', lineHeight: 1 }}>
              {currentRating ?? '—'}
            </span>
            {previewRating !== null && currentRating !== null && (
              <>
                <span style={{ fontSize: 20, color: 'var(--text-3)' }}>→</span>
                <div>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 36, fontWeight: 900, lineHeight: 1,
                    color: previewRating > currentRating ? 'var(--green)' : previewRating < currentRating ? 'var(--red)' : 'var(--text-1)' }}>
                    {previewRating}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 700, marginLeft: 4,
                    color: previewRating > currentRating ? 'var(--green)' : previewRating < currentRating ? 'var(--red)' : 'var(--text-3)' }}>
                    {previewRating > currentRating ? `+${previewRating - currentRating}` :
                     previewRating < currentRating ? `${previewRating - currentRating}` : '='}
                  </span>
                </div>
              </>
            )}
          </div>
          {previewRating !== null && (
            <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 6 }}>Drop to apply · drag away to cancel</div>
          )}
        </div>

        {/* Tactical style */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
          <div className="card-header">
            <span className="accent-bar" />
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Tactical Style</span>
          </div>
          <div style={{ padding: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5, marginBottom: 10 }}>
              {(Object.keys(STYLE_LABELS) as TacticStyle[]).map(s => (
                <button key={s} onClick={() => setStyle(s)} style={{
                  padding: '8px 6px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  border: `1.5px solid ${style === s ? 'var(--green)' : 'var(--border)'}`,
                  background: style === s ? 'rgba(54,226,126,0.1)' : 'transparent',
                  color: style === s ? 'var(--green)' : 'var(--text-2)',
                  textAlign: 'center', transition: 'all 0.15s',
                }}>{STYLE_LABELS[s]}</button>
              ))}
            </div>
            <div style={{ background: 'var(--bg-base)', borderRadius: 8, padding: '10px 12px' }}>
              <div style={{ fontSize: 11, color: 'var(--text-2)', lineHeight: 1.5, marginBottom: 9 }}>{STYLE_DESC[style]}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {STYLE_TRAITS[style].bonuses.map(t => (
                  <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: 'var(--green)' }}>
                    <span style={{ fontWeight: 800, fontSize: 11 }}>+</span>{t}
                  </div>
                ))}
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: 'var(--red)', marginTop: 2 }}>
                  <span style={{ fontWeight: 800, fontSize: 11 }}>−</span>{STYLE_TRAITS[style].cost}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Settings — stage buttons */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
          <div className="card-header">
            <span className="accent-bar" />
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Settings</span>
          </div>
          <div style={{ padding: 14 }}>

            {/* Pressing */}
            {(() => {
              const active = PRESSING_STAGES.find(s => s.value === pressing)
              const imp = PRESSING_IMPACTS[pressing]
              return (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 7 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Pressing</span>
                    <span style={{ fontSize: 11, color: 'var(--green)', fontWeight: 700 }}>{active?.label ?? ''}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 3, marginBottom: 7 }}>
                    {PRESSING_STAGES.map(stage => (
                      <button key={stage.label} onClick={() => setPressing(stage.value)} title={stage.desc} style={{
                        flex: 1, padding: '6px 2px', fontSize: 10, fontWeight: 700, cursor: 'pointer',
                        borderRadius: 5, border: `1.5px solid ${pressing === stage.value ? 'var(--green)' : 'var(--border)'}`,
                        background: pressing === stage.value ? 'rgba(54,226,126,0.12)' : 'transparent',
                        color: pressing === stage.value ? 'var(--green)' : 'var(--text-3)',
                        transition: 'all 0.15s', whiteSpace: 'nowrap',
                      }}>{stage.label}</button>
                    ))}
                  </div>
                  {active && <div style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 8 }}>{active.desc}</div>}
                  {imp && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, background: 'var(--bg-base)', borderRadius: 6, padding: '8px 10px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <span style={{ fontSize: 9, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>Ball Recovery</span>
                        <PipBar value={imp.recovery} color="var(--green)" />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <span style={{ fontSize: 9, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>Stamina Cost</span>
                        <PipBar value={imp.stamina} color={imp.stamina >= 4 ? 'var(--red)' : imp.stamina >= 3 ? 'var(--gold)' : 'var(--green)'} />
                      </div>
                    </div>
                  )}
                </div>
              )
            })()}

            {/* Defensive Line */}
            {(() => {
              const active = DEFLINE_STAGES.find(s => s.value === defLine)
              const imp = DEFLINE_IMPACTS[defLine]
              return (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 7 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Defensive Line</span>
                    <span style={{ fontSize: 11, color: 'var(--green)', fontWeight: 700 }}>{active?.label ?? ''}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 3, marginBottom: 7 }}>
                    {DEFLINE_STAGES.map(stage => (
                      <button key={stage.label} onClick={() => setDefLine(stage.value)} title={stage.desc} style={{
                        flex: 1, padding: '6px 2px', fontSize: 10, fontWeight: 700, cursor: 'pointer',
                        borderRadius: 5, border: `1.5px solid ${defLine === stage.value ? 'var(--green)' : 'var(--border)'}`,
                        background: defLine === stage.value ? 'rgba(54,226,126,0.12)' : 'transparent',
                        color: defLine === stage.value ? 'var(--green)' : 'var(--text-3)',
                        transition: 'all 0.15s', whiteSpace: 'nowrap',
                      }}>{stage.label}</button>
                    ))}
                  </div>
                  {active && <div style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 8 }}>{active.desc}</div>}
                  {imp && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, background: 'var(--bg-base)', borderRadius: 6, padding: '8px 10px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <span style={{ fontSize: 9, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>Compactness</span>
                        <PipBar value={imp.compact} color="var(--green)" />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <span style={{ fontSize: 9, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>Counter Risk</span>
                        <PipBar value={imp.counterRisk} color={imp.counterRisk >= 4 ? 'var(--red)' : imp.counterRisk >= 3 ? 'var(--gold)' : 'var(--green)'} />
                      </div>
                    </div>
                  )}
                </div>
              )
            })()}

            {/* Width */}
            {(() => {
              const active = WIDTH_STAGES.find(s => s.value === width)
              const imp = WIDTH_IMPACTS[width]
              return (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 7 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Width</span>
                    <span style={{ fontSize: 11, color: 'var(--green)', fontWeight: 700 }}>{active?.label ?? ''}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 3, marginBottom: 7 }}>
                    {WIDTH_STAGES.map(stage => (
                      <button key={stage.label} onClick={() => setWidth(stage.value)} title={stage.desc} style={{
                        flex: 1, padding: '6px 2px', fontSize: 10, fontWeight: 700, cursor: 'pointer',
                        borderRadius: 5, border: `1.5px solid ${width === stage.value ? 'var(--green)' : 'var(--border)'}`,
                        background: width === stage.value ? 'rgba(54,226,126,0.12)' : 'transparent',
                        color: width === stage.value ? 'var(--green)' : 'var(--text-3)',
                        transition: 'all 0.15s', whiteSpace: 'nowrap',
                      }}>{stage.label}</button>
                    ))}
                  </div>
                  {active && <div style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 8 }}>{active.desc}</div>}
                  {imp && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, background: 'var(--bg-base)', borderRadius: 6, padding: '8px 10px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <span style={{ fontSize: 9, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>Wing Threat</span>
                        <PipBar value={imp.wing} color="var(--green)" />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <span style={{ fontSize: 9, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>Central Strength</span>
                        <PipBar value={imp.central} color="var(--green)" />
                      </div>
                    </div>
                  )}
                </div>
              )
            })()}

          </div>
        </div>

        {/* Substitutions */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
          <div className="card-header">
            <span className="accent-bar" />
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Substitutions</span>
          </div>
          <div style={{ padding: 14 }}>
            <div style={{ fontSize: 11, color: 'var(--text-2)', marginBottom: 10 }}>
              Set up to 3 subs. Each triggers when the starter hits a fitness threshold or a match minute.
            </div>
            {subs.map((sub, i) => {
              const outPlayer = instanceMap[sub.outInstanceId]
              const inPlayer  = instanceMap[sub.inInstanceId]
              return (
                <div key={i} style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, flexWrap: 'wrap' as const }}>
                    <select
                      value={sub.outInstanceId}
                      onChange={e => setSubs(prev => prev.map((s, j) => j === i ? { ...s, outInstanceId: e.target.value } : s))}
                      style={{ flex: 1, minWidth: 0, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-1)', fontSize: 11, padding: '4px 6px' }}
                    >
                      <option value="">— Off —</option>
                      {lineup.map(slot => {
                        const p = instanceMap[slot.instanceId]
                        return p ? <option key={slot.instanceId} value={slot.instanceId}>{p.player.name} ({slot.position})</option> : null
                      })}
                    </select>
                    <span style={{ fontSize: 10, color: 'var(--text-3)' }}>▶</span>
                    <select
                      value={sub.inInstanceId}
                      onChange={e => setSubs(prev => prev.map((s, j) => j === i ? { ...s, inInstanceId: e.target.value } : s))}
                      style={{ flex: 1, minWidth: 0, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-1)', fontSize: 11, padding: '4px 6px' }}
                    >
                      <option value="">— On —</option>
                      {bench.map(p => <option key={p.id} value={p.id}>{p.player.name} ({p.player.position})</option>)}
                    </select>
                    <button onClick={() => setSubs(prev => prev.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: 16, padding: '0 2px', lineHeight: 1 }}>✕</button>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 10, color: 'var(--text-2)', flexShrink: 0 }}>Trigger when</span>
                    <select
                      value={sub.condition.type}
                      onChange={e => setSubs(prev => prev.map((s, j) => j === i ? { ...s, condition: { ...s.condition, type: e.target.value as 'minute' | 'fitness' } } : s))}
                      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-1)', fontSize: 11, padding: '3px 5px' }}
                    >
                      <option value="fitness">fitness ≤</option>
                      <option value="minute">minute ≥</option>
                    </select>
                    <input
                      type="number"
                      min={sub.condition.type === 'fitness' ? 10 : 45}
                      max={sub.condition.type === 'fitness' ? 80 : 89}
                      value={sub.condition.value}
                      onChange={e => setSubs(prev => prev.map((s, j) => j === i ? { ...s, condition: { ...s.condition, value: Number(e.target.value) } } : s))}
                      style={{ width: 52, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-1)', fontSize: 11, padding: '3px 6px', textAlign: 'center' as const }}
                    />
                    <span style={{ fontSize: 10, color: 'var(--text-2)' }}>{sub.condition.type === 'fitness' ? '(stamina)' : '(match min)'}</span>
                  </div>
                  {outPlayer && inPlayer && (
                    <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 6 }}>
                      {outPlayer.player.name} → {inPlayer.player.name} · {sub.condition.type === 'fitness' ? `when stamina ≤ ${sub.condition.value}` : `at minute ${sub.condition.value}`}
                    </div>
                  )}
                </div>
              )
            })}
            {subs.length < 3 && (
              <button
                className="btn btn-outline"
                style={{ width: '100%', fontSize: 11, marginTop: 4 }}
                onClick={() => setSubs(prev => [...prev, { outInstanceId: '', inInstanceId: '', condition: { type: 'fitness', value: 40 } }])}
              >
                + Add Substitution
              </button>
            )}
          </div>
        </div>

        {/* Fit legend */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
          <div className="card-header">
            <span className="accent-bar" />
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Position Fit</span>
          </div>
          <div style={{ padding: 14 }}>
          {[['var(--green)', 'Natural position — full rating'], ['var(--gold)', '~ Adjacent position — slight penalty'], ['var(--red)', '! Wrong position — large penalty']].map(([c, l]) => (
            <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, fontSize: 11, color: 'var(--text-2)' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: c, flexShrink: 0, display: 'inline-block' }} />
              {l}
            </div>
          ))}
          </div>
        </div>

        {/* Presets */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
          <div className="card-header">
            <span className="accent-bar" />
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Presets</span>
          </div>
          <div style={{ padding: 12 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: presets.length > 0 ? 8 : 0 }}>
              {presets.map((p, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 0, background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 20, overflow: 'hidden' }}>
                  <button onClick={() => loadPreset(p)} style={{ padding: '4px 10px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600, color: 'var(--text-1)' }}>{p.name}</button>
                  <button onClick={() => deletePreset(i)} style={{ padding: '4px 6px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--text-3)', lineHeight: 1 }}>✕</button>
                </div>
              ))}
            </div>
            {presets.length < 4 && (
              <button className="btn btn-ghost" style={{ width: '100%', fontSize: 11 }} onClick={savePreset}>
                💾 Save current as preset
              </button>
            )}
            {presets.length >= 4 && (
              <div style={{ fontSize: 10, color: 'var(--text-3)', textAlign: 'center' }}>Max 4 presets — delete one to save a new preset</div>
            )}
          </div>
        </div>

        {/* Save */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {isDirty && !saving && (
            <span style={{ fontSize: 12, color: 'var(--gold)', fontWeight: 700, flexShrink: 0 }}>● Unsaved</span>
          )}
          <button className="btn btn-green" style={{ flex: 1 }} onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save Tactics'}
          </button>
          {saveMsg && !isDirty && <span style={{ fontSize: 12, color: saveMsg === 'Save failed' ? 'var(--red)' : 'var(--green)' }}>{saveMsg}</span>}
        </div>
      </div>
    </div>
    </>
  )
}
