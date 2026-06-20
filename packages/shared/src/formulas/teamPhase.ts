import {
  gkShotStopping,
  cbDefending, fbDefending, fbAttacking,
  cdmBallWinning, cmBuildup, camChanceCreation,
  wingerDribbling, wingerCrossing,
  strikerFinishing, strikerTargetMan,
  type PlayerAttrsForRoles,
} from './roleRatings'

export interface LineupEntry {
  instanceId: string
  assignedPosition: string   // position slot they're playing this match
  naturalPosition: string    // player's native position (Player.position)
  trainedPosition: string | null
  attrs: PlayerAttrsForRoles
  morale: number             // 0–100 (inter-match)
  form: number               // 0–100 (inter-match)
  fitness: number            // 0–100 (inter-match)
  matchStamina: number       // starts at attrs.powStamina, drains during match
}

export interface TeamPhaseScores {
  attackStrength: number     // quality of offensive play
  midfieldControl: number    // ability to control possession
  defensiveStrength: number  // quality of defensive play
  pressingStrength: number   // pressing effectiveness
  chanceCreation: number     // chance quality in final third
  finishingQuality: number   // converting chances to goals
  goalkeepingQuality: number // GK shot-stopping ability
  setPieceAttack: number     // offensive set-piece threat
  setPieceDefense: number    // defending set pieces
}

export interface TacticModifiers {
  style: 'possession' | 'counter' | 'pressing' | 'lowblock'
  pressingIntensity: number  // 0–100
  defensiveLine: number      // 0–100
  width: number              // 0–100
}

// Condition multiplier applied to each player's role rating.
// Morale/form both shift ±5% at extremes; fitness and stamina penalise
// below-threshold players but never boost above-threshold ones.
export function conditionMultiplier(e: LineupEntry): number {
  const moraleMod  = (e.morale  - 70) * 0.0015
  const formMod    = (e.form    - 70) * 0.0010
  const fitnessMod = e.fitness  < 70  ? (e.fitness  - 70) * 0.0020 : 0
  const staminaMod = e.matchStamina < 60 ? (e.matchStamina - 60) * 0.0025 : 0
  return Math.max(0.70, 1 + moraleMod + formMod + fitnessMod + staminaMod)
}

function avg(entries: LineupEntry[], fn: (a: PlayerAttrsForRoles) => number, fallback = 65): number {
  if (entries.length === 0) return fallback
  return entries.reduce((s, e) => s + fn(e.attrs) * conditionMultiplier(e), 0) / entries.length
}

export function calcTeamPhase(
  lineup: LineupEntry[],
  tactic: TacticModifiers | null,
): TeamPhaseScores {
  const style    = tactic?.style            ?? 'possession'
  const pressing = (tactic?.pressingIntensity ?? 55) / 100
  const width    = (tactic?.width             ?? 50) / 100

  // ── Group by assigned position ────────────────────────────────────────────
  const byPos = (pos: string[]): LineupEntry[] => lineup.filter(e => pos.includes(e.assignedPosition))

  const gks   = byPos(['GK'])
  const cbs   = byPos(['CB'])
  const fbs   = byPos(['LB', 'RB'])
  const cdms  = byPos(['CDM'])
  const cms   = byPos(['CM'])
  const cams  = byPos(['CAM'])
  const wideM = byPos(['LM', 'RM'])
  const wings = byPos(['LW', 'RW'])
  const fwds  = byPos(['CF', 'ST'])

  const allWide = [...wideM, ...wings]

  // ── Role aggregates ───────────────────────────────────────────────────────
  const gkSave   = avg(gks,  gkShotStopping,   65)
  const cbDef    = avg(cbs,  cbDefending,       65)
  const fbDef    = avg(fbs,  fbDefending,       63)
  const fbAtk    = avg(fbs,  fbAttacking,       60)
  const cdmWin   = avg(cdms, cdmBallWinning,    63)
  const cmBld    = avg(cms,  cmBuildup,         63)
  const camCre   = avg(cams, camChanceCreation, 62)
  const wngDrib  = avg(allWide, wingerDribbling, 60)
  const wngCross = avg(allWide, wingerCrossing,  60)
  const stFin    = avg(fwds, strikerFinishing,   62)
  const stTgt    = avg(fwds, strikerTargetMan,   60)

  // ── Raw phase scores ──────────────────────────────────────────────────────

  const attackRaw =
    stFin  * 0.35 +
    (wngDrib * (0.5 + width * 0.3) + wngCross * (0.5 + width * 0.3)) / 2 * 0.25 +
    camCre * 0.20 +
    fbAtk  * 0.10 +
    cmBld  * 0.10

  const defRaw =
    cbDef  * 0.35 +
    cdmWin * 0.25 +
    fbDef  * 0.20 +
    gkSave * 0.10 +
    cmBld  * 0.10

  const midRaw =
    cmBld  * 0.30 +
    cdmWin * 0.25 +
    camCre * 0.20 +
    (wngDrib + wngCross) / 2 * 0.15 +
    fbAtk  * 0.10

  // Pressing = CDM/CM stamina + aggression × pressing intensity slider
  const pressBase = avg(
    [...cdms, ...cms],
    (p) => (p.menAggression * 0.6 + p.powStamina * 0.4),
    60,
  )
  const pressRaw = pressBase * pressing

  const chanceRaw =
    camCre * 0.35 +
    wngCross * 0.25 +
    cmBld  * 0.20 +
    stFin  * 0.10 +
    fbAtk  * 0.10

  const finRaw =
    stFin  * 0.60 +
    stTgt  * 0.20 +
    camCre * 0.10 +
    wngDrib * 0.10

  const setPieceAtkRaw =
    avg(fwds, (p) => p.atkHeadAccuracy, 60) * 0.40 +
    avg(cbs,  (p) => p.atkHeadAccuracy, 60) * 0.30 +
    avg(lineup, (p) => p.sklCurve, 60)       * 0.30

  const setPieceDefRaw =
    avg(lineup, (p) => p.atkHeadAccuracy, 60) * 0.40 +
    cbDef  * 0.35 +
    gkSave * 0.25

  // ── Tactic multipliers ────────────────────────────────────────────────────
  const atkMul  = style === 'counter'    ? 1.06 : style === 'possession' ? 1.02 : 1.00
  const defMul  = style === 'lowblock'   ? 1.10 : style === 'pressing'   ? 1.03 : 1.00
  const midMul  = style === 'possession' ? 1.08 : style === 'counter'    ? 0.92 : 1.00
  const presMul = style === 'pressing'   ? 1.18 : style === 'lowblock'   ? 0.65 : style === 'counter' ? 0.85 : 1.00

  return {
    attackStrength:     clamp(attackRaw * atkMul,  40, 99),
    midfieldControl:    clamp(midRaw    * midMul,  40, 99),
    defensiveStrength:  clamp(defRaw    * defMul,  40, 99),
    pressingStrength:   clamp(pressRaw  * presMul, 20, 99),
    chanceCreation:     clamp(chanceRaw,            40, 99),
    finishingQuality:   clamp(finRaw,               40, 99),
    goalkeepingQuality: clamp(gkSave,               30, 99),
    setPieceAttack:     clamp(setPieceAtkRaw,        40, 99),
    setPieceDefense:    clamp(setPieceDefRaw,        40, 99),
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}
