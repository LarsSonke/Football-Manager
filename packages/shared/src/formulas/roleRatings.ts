// All role rating functions return a 0–100 composite score derived from
// detailed FC26 sub-stats. Used by the simulation engine to assess players
// in their assigned lineup position rather than relying solely on overall.

export interface PlayerAttrsForRoles {
  atkCrossing: number; atkFinishing: number; atkHeadAccuracy: number
  atkShortPassing: number; atkVolleys: number
  sklDribbling: number; sklCurve: number; sklFkAccuracy: number
  sklLongPassing: number; sklBallControl: number
  movAcceleration: number; movSprintSpeed: number; movAgility: number
  movReactions: number; movBalance: number
  powShotPower: number; powJumping: number; powStamina: number
  powStrength: number; powLongShots: number
  menAggression: number; menInterceptions: number; menPositioning: number
  menVision: number; menPenalties: number; menComposure: number
  defMarkingAware: number; defStandingTackle: number; defSlidingTackle: number
  gkDiving: number; gkHandling: number; gkKicking: number
  gkPositioning: number; gkReflexes: number; gkSpeed: number
  weakFoot: number   // 1–5 scale
  skillMoves: number // 1–5 scale
  heightCm: number
}

// Normalize 1–5 scale to 0–100
function n5(v: number): number {
  return Math.max(0, Math.min(100, (v - 1) * 25))
}

export function gkShotStopping(p: PlayerAttrsForRoles): number {
  return (
    p.gkReflexes    * 0.30 +
    p.gkDiving      * 0.25 +
    p.gkPositioning * 0.20 +
    p.gkHandling    * 0.15 +
    p.movReactions  * 0.10
  )
}

export function gkDistribution(p: PlayerAttrsForRoles): number {
  return (
    p.gkKicking      * 0.35 +
    p.sklLongPassing  * 0.25 +
    p.atkShortPassing * 0.20 +
    p.menVision       * 0.20
  )
}

export function cbDefending(p: PlayerAttrsForRoles): number {
  return (
    p.defMarkingAware   * 0.25 +
    p.defStandingTackle * 0.20 +
    p.powStrength       * 0.15 +
    p.menInterceptions  * 0.15 +
    p.atkHeadAccuracy   * 0.10 +
    p.movReactions      * 0.10 +
    p.menAggression     * 0.05
  )
}

export function fbDefending(p: PlayerAttrsForRoles): number {
  return (
    p.defMarkingAware   * 0.25 +
    p.defStandingTackle * 0.20 +
    p.movAcceleration   * 0.15 +
    p.menInterceptions  * 0.15 +
    p.movSprintSpeed    * 0.15 +
    p.movReactions      * 0.10
  )
}

export function fbAttacking(p: PlayerAttrsForRoles): number {
  return (
    p.atkCrossing     * 0.30 +
    p.movSprintSpeed  * 0.20 +
    p.movAcceleration * 0.15 +
    p.sklBallControl  * 0.15 +
    p.atkShortPassing * 0.10 +
    p.powStamina      * 0.10
  )
}

export function cdmBallWinning(p: PlayerAttrsForRoles): number {
  return (
    p.defStandingTackle * 0.25 +
    p.menInterceptions  * 0.25 +
    p.defMarkingAware   * 0.15 +
    p.powStrength       * 0.10 +
    p.movReactions      * 0.10 +
    p.menAggression     * 0.10 +
    p.powStamina        * 0.05
  )
}

export function cmBuildup(p: PlayerAttrsForRoles): number {
  return (
    p.atkShortPassing * 0.25 +
    p.menVision       * 0.20 +
    p.sklBallControl  * 0.15 +
    p.powStamina      * 0.10 +
    p.menComposure    * 0.10 +
    p.sklLongPassing  * 0.10 +
    p.movReactions    * 0.10
  )
}

export function camChanceCreation(p: PlayerAttrsForRoles): number {
  return (
    p.menVision       * 0.25 +
    p.atkShortPassing * 0.20 +
    p.sklDribbling    * 0.15 +
    p.sklBallControl  * 0.15 +
    p.menComposure    * 0.10 +
    p.movAgility      * 0.10 +
    p.sklCurve        * 0.05
  )
}

export function wingerDribbling(p: PlayerAttrsForRoles): number {
  return (
    p.sklDribbling    * 0.30 +
    p.movAgility      * 0.20 +
    p.movAcceleration * 0.15 +
    p.sklBallControl  * 0.15 +
    p.movBalance      * 0.10 +
    p.menComposure    * 0.10
  )
}

export function wingerCrossing(p: PlayerAttrsForRoles): number {
  return (
    p.atkCrossing     * 0.30 +
    p.movSprintSpeed  * 0.20 +
    p.sklCurve        * 0.15 +
    p.atkShortPassing * 0.15 +
    p.menVision       * 0.10 +
    p.movAcceleration * 0.10
  )
}

export function strikerFinishing(p: PlayerAttrsForRoles): number {
  return (
    p.atkFinishing    * 0.30 +
    p.menPositioning  * 0.20 +
    p.menComposure    * 0.15 +
    p.powShotPower    * 0.10 +
    p.movAcceleration * 0.10 +
    p.atkHeadAccuracy * 0.10 +
    n5(p.weakFoot)    * 0.05
  )
}

export function strikerTargetMan(p: PlayerAttrsForRoles): number {
  return (
    p.atkHeadAccuracy * 0.25 +
    p.powStrength     * 0.20 +
    p.powJumping      * 0.20 +
    p.atkFinishing    * 0.15 +
    p.menPositioning  * 0.10 +
    p.menComposure    * 0.10
  )
}

// Returns the primary composite role rating for a player in the given lineup position.
export function roleRatingForPosition(p: PlayerAttrsForRoles, position: string): number {
  switch (position) {
    case 'GK':  return gkShotStopping(p)
    case 'CB':  return cbDefending(p)
    case 'LB':
    case 'RB':  return fbDefending(p) * 0.60 + fbAttacking(p) * 0.40
    case 'CDM': return cdmBallWinning(p)
    case 'CM':  return cmBuildup(p)
    case 'CAM': return camChanceCreation(p)
    case 'LM':
    case 'RM':  return wingerCrossing(p) * 0.50 + wingerDribbling(p) * 0.50
    case 'LW':
    case 'RW':  return wingerDribbling(p) * 0.60 + wingerCrossing(p) * 0.40
    case 'CF':  return strikerFinishing(p) * 0.50 + camChanceCreation(p) * 0.50
    case 'ST':  return strikerFinishing(p) * 0.65 + strikerTargetMan(p) * 0.35
    default:    return 65
  }
}
