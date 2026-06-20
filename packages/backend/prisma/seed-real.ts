import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import { parse } from 'csv-parse/sync'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// ─── Position mapping ──────────────────────────────────────────────────────────

const POSITION_MAP: Record<string, string> = {
  GK: 'GK',
  CB: 'CB', LB: 'LB', LWB: 'LB', RB: 'RB', RWB: 'RB',
  CDM: 'CDM', CM: 'CM', CAM: 'CAM', LM: 'LM', RM: 'RM',
  LW: 'LW', RW: 'RW', CF: 'CF', ST: 'ST',
  LAM: 'CAM', RAM: 'CAM', LS: 'ST', RS: 'ST', SS: 'CF',
}

// ─── Derived roles from position ─────────────────────────────────────────────

const POSITION_ROLES: Record<string, string[]> = {
  GK:  ['shot-stopper', 'sweeper-keeper'],
  CB:  ['stopper', 'ball-playing-cb'],
  LB:  ['attacking-fullback', 'fullback'],
  RB:  ['attacking-fullback', 'fullback'],
  CDM: ['holding', 'defensive-mid'],
  CM:  ['box-to-box', 'deep-lying'],
  CAM: ['playmaker', 'shadow-striker'],
  LM:  ['winger', 'inside-forward'],
  RM:  ['winger', 'inside-forward'],
  LW:  ['winger', 'inside-forward'],
  RW:  ['winger', 'inside-forward'],
  CF:  ['false-9', 'complete'],
  ST:  ['complete', 'target-forward'],
}

// ─── Value formula ────────────────────────────────────────────────────────────
// Cubic curve: players ≤50 OVR are free, costs scale steeply for elite players.
// With a 100k budget and ~16 picks, a 75 OVR player (~6,250) is the "average" pick.
// Examples: 60 OVR → 400  |  70 OVR → 3,200  |  80 OVR → 10,800  |  90 OVR → 25,600

function calcValue(overall: number): number {
  if (overall <= 50) return 0
  const x = overall - 50
  return Math.round(x * x * x * 0.4)
}

function int(val: string | undefined, fallback: number): number {
  const n = parseInt(val ?? '')
  return isNaN(n) ? fallback : n
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  // Look for CSV in workspace root first, then prisma/data/
  const candidates = [
    path.join(__dirname, '..', '..', '..', 'FC26_20250921.csv'),
    path.join(__dirname, '..', '..', '..', 'players.csv'),
    path.join(__dirname, 'data', 'players.csv'),
  ]

  const csvPath = candidates.find(p => fs.existsSync(p))

  if (!csvPath) {
    console.error('\n❌  CSV not found. Tried:')
    candidates.forEach(p => console.error('   ', p))
    process.exit(1)
  }

  console.log(`📂  Reading: ${path.basename(csvPath)}`)
  const content = fs.readFileSync(csvPath, 'utf-8')

  const rows: Record<string, string>[] = parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  })

  console.log(`   ${rows.length.toLocaleString()} rows found`)

  const players: any[] = []

  for (const row of rows) {
    const overall = int(row.overall, 0)
    if (overall < 45) continue

    const rawPos = (row.player_positions ?? '').split(',')[0].trim().toUpperCase()
    const position = POSITION_MAP[rawPos]
    if (!position) continue

    // All playable positions for this player (deduplicated, mapped to game codes)
    const allPositions = (row.player_positions ?? '')
      .split(',')
      .map((p: string) => POSITION_MAP[p.trim().toUpperCase()])
      .filter(Boolean) as string[]
    const uniquePositions = [...new Set(allPositions)]
    const preferredRoles = [...new Set(
      allPositions.flatMap((pos: string) => POSITION_ROLES[pos] ?? [])
    )]

    players.push({
      name:           row.short_name || row.long_name || 'Unknown',
      nationality:    row.nationality_name || null,
      position,
      age:            int(row.age, 25),
      overall,
      potential:      int(row.potential, overall),
      pace:           int(row.pace, 50),
      shooting:       int(row.shooting, 50),
      passing:        int(row.passing, 50),
      dribbling:      int(row.dribbling, 50),
      defending:      int(row.defending, 50),
      physical:       int(row.physic, 50),
      // Detailed sub-stats
      atkCrossing:       int(row.attacking_crossing, 50),
      atkFinishing:      int(row.attacking_finishing, 50),
      atkHeadAccuracy:   int(row.attacking_heading_accuracy, 50),
      atkShortPassing:   int(row.attacking_short_passing, 50),
      atkVolleys:        int(row.attacking_volleys, 50),
      sklDribbling:      int(row.skill_dribbling, 50),
      sklCurve:          int(row.skill_curve, 50),
      sklFkAccuracy:     int(row.skill_fk_accuracy, 50),
      sklLongPassing:    int(row.skill_long_passing, 50),
      sklBallControl:    int(row.skill_ball_control, 50),
      movAcceleration:   int(row.movement_acceleration, 50),
      movSprintSpeed:    int(row.movement_sprint_speed, 50),
      movAgility:        int(row.movement_agility, 50),
      movReactions:      int(row.movement_reactions, 50),
      movBalance:        int(row.movement_balance, 50),
      powShotPower:      int(row.power_shot_power, 50),
      powJumping:        int(row.power_jumping, 50),
      powStamina:        int(row.power_stamina, 50),
      powStrength:       int(row.power_strength, 50),
      powLongShots:      int(row.power_long_shots, 50),
      menAggression:     int(row.mentality_aggression, 50),
      menInterceptions:  int(row.mentality_interceptions, 50),
      menPositioning:    int(row.mentality_positioning, 50),
      menVision:         int(row.mentality_vision, 50),
      menPenalties:      int(row.mentality_penalties, 50),
      menComposure:      int(row.mentality_composure, 50),
      defMarkingAware:   int(row.defending_marking_awareness, 50),
      defStandingTackle: int(row.defending_standing_tackle, 50),
      defSlidingTackle:  int(row.defending_sliding_tackle, 50),
      gkDiving:          int(row.goalkeeping_diving, 10),
      gkHandling:        int(row.goalkeeping_handling, 10),
      gkKicking:         int(row.goalkeeping_kicking, 10),
      gkPositioning:     int(row.goalkeeping_positioning, 10),
      gkReflexes:        int(row.goalkeeping_reflexes, 10),
      gkSpeed:           int(row.goalkeeping_speed, 10),
      weakFoot:          int(row.weak_foot, 3),
      skillMoves:        int(row.skill_moves, 3),
      heightCm:          int(row.height_cm, 181),
      positions:         uniquePositions,
      preferredRoles:    preferredRoles.length ? preferredRoles : (POSITION_ROLES[position] ?? ['complete']),
      baseValue:         calcValue(overall),
      photoUrl:          row.player_face_url || null,
    })
  }

  players.sort((a, b) => b.overall - a.overall)
  const top = players  // all players overall >= 65

  console.log(`\n🗑️   Clearing existing players...`)
  await prisma.matchPerformance.deleteMany()
  await prisma.playerInstance.deleteMany()
  await prisma.player.deleteMany()

  console.log(`⚽  Importing ${top.length} players...`)
  const batchSize = 100
  for (let i = 0; i < top.length; i += batchSize) {
    await prisma.player.createMany({ data: top.slice(i, i + batchSize) })
    const done = Math.min(i + batchSize, top.length)
    process.stdout.write(`\r   ${done}/${top.length} (${Math.round((done / top.length) * 100)}%)`)
  }

  console.log(`\n\n✅  Seeded ${top.length} FC 26 players`)
  console.log(`   Overall range: ${top[top.length - 1].overall} – ${top[0].overall}`)

  const byPos = top.reduce<Record<string, number>>((acc, p) => {
    acc[p.position] = (acc[p.position] ?? 0) + 1
    return acc
  }, {})
  console.log('\n   Position breakdown:')
  Object.entries(byPos)
    .sort((a, b) => b[1] - a[1])
    .forEach(([pos, n]) => console.log(`   ${pos.padEnd(4)} ${n}`))
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
