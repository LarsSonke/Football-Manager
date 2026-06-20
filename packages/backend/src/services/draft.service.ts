import { prisma } from '../prisma'
import { getIO } from '../websocket'
import { startSeason } from './league.service'
import type { DraftPickEvent } from '@football/shared'

export async function getDraftState(leagueId: string) {
  const session = await prisma.draftSession.findUnique({
    where: { leagueId },
    include: {
      picks: {
        orderBy: { pickedAt: 'asc' },
        include: { club: { select: { id: true, name: true } } },
      },
    },
  })
  if (!session) throw new Error('Draft not found')

  const currentClubId =
    session.status === 'ACTIVE' ? session.pickOrder[session.currentPick] ?? null : null

  // Build a name map for drafted players so the UI can show names in recent picks
  const draftedPlayerIds = session.picks.map(p => p.playerId)
  const draftedPlayers = draftedPlayerIds.length > 0
    ? await prisma.player.findMany({
        where: { id: { in: draftedPlayerIds } },
        select: {
          id: true, name: true, position: true, overall: true,
          pace: true, shooting: true, passing: true,
          dribbling: true, defending: true, physical: true,
          photoUrl: true,
        },
      })
    : []
  const pickedPlayerMap = Object.fromEntries(draftedPlayers.map(p => [p.id, p]))

  // Initial player list: top 200 by overall — frontend fetches more via searchPlayers
  const availablePlayers = await prisma.playerInstance.findMany({
    where: { leagueId, clubId: null },
    include: { player: true },
    orderBy: { player: { overall: 'desc' } },
    take: 200,
  })

  return { session, availablePlayers, currentClubId, pickedPlayerMap }
}

export async function searchPlayers(
  leagueId: string,
  opts: { q?: string; positions?: string[]; take?: number; skip?: number },
) {
  const { q, positions, take = 100, skip = 0 } = opts
  return prisma.playerInstance.findMany({
    where: {
      leagueId,
      clubId: null,
      player: {
        ...(positions?.length ? { position: { in: positions as any[] } } : {}),
        ...(q ? { name: { contains: q, mode: 'insensitive' as const } } : {}),
      },
    },
    include: { player: true },
    orderBy: { player: { overall: 'desc' } },
    skip,
    take,
  })
}

export async function makePick(
  leagueId: string,
  clubId: string,
  playerId: string,
): Promise<DraftPickEvent> {
  const session = await prisma.draftSession.findUnique({ where: { leagueId } })
  if (!session || session.status !== 'ACTIVE') throw new Error('Draft not active')

  const currentClubId = session.pickOrder[session.currentPick]
  if (currentClubId !== clubId) throw new Error("Not your turn to pick")

  const instance = await prisma.playerInstance.findUnique({
    where: { playerId_leagueId: { playerId, leagueId } },
    include: { player: true },
  })
  if (!instance) throw new Error('Player not found in this league')
  if (instance.clubId !== null) throw new Error('Player already drafted')

  const club = await prisma.club.findUnique({ where: { id: clubId } })
  if (!club) throw new Error('Club not found')

  const price = instance.player.baseValue
  // AI clubs must always be able to pick so the draft never stalls
  if (!club.isAI && club.budget < price) throw new Error('Insufficient budget')

  // Record pick and assign player
  await prisma.draftPick.create({
    data: {
      sessionId: session.id,
      clubId,
      playerId,
      round: session.currentRound,
      pickNumber: session.currentPick,
      price,
    },
  })

  await prisma.playerInstance.update({
    where: { id: instance.id },
    data: { clubId, wage: Math.floor(price * 0.004) },
  })

  await prisma.club.update({
    where: { id: clubId },
    data: { budget: { decrement: price } },
  })

  // Advance the draft pointer
  const { nextPickOrder, nextRound, nextPickIndex, draftComplete } = advancePick(
    session.pickOrder,
    session.currentPick,
    session.currentRound,
    session.roundsTotal,
  )

  const newStatus = draftComplete ? 'COMPLETED' : 'ACTIVE'

  await prisma.draftSession.update({
    where: { id: session.id },
    data: {
      currentRound: nextRound,
      currentPick: nextPickIndex,
      pickOrder: nextPickOrder,
      status: newStatus,
    },
  })

  const nextClubId = draftComplete ? null : nextPickOrder[nextPickIndex]

  const event: DraftPickEvent = {
    pick: { clubId, playerId, round: session.currentRound, pickNumber: session.currentPick, price },
    nextClubId,
    draftComplete,
  }

  // Broadcast to everyone in the draft room
  try {
    getIO().to(`draft:${leagueId}`).emit('draft:pick', event)
  } catch {
    // No active connections — that's fine, state is in DB
  }

  if (draftComplete) {
    await startSeason(leagueId)
    getIO().to(`league:${leagueId}`).emit('season:started', { leagueId })
  }

  // If next club is AI, trigger an auto-pick after a short delay
  if (!draftComplete && nextClubId) {
    const nextClub = await prisma.club.findUnique({ where: { id: nextClubId } })
    if (nextClub?.isAI) {
      setTimeout(() => aiAutoPick(leagueId, nextClubId), 2000)
    }
  }

  return event
}

export async function kickoffFirstPickIfAI(leagueId: string): Promise<void> {
  const session = await prisma.draftSession.findUnique({ where: { leagueId } })
  if (!session || session.status !== 'ACTIVE') return
  const currentClubId = session.pickOrder[session.currentPick] ?? null
  if (!currentClubId) return
  const club = await prisma.club.findUnique({ where: { id: currentClubId } })
  if (club?.isAI) {
    setTimeout(() => aiAutoPick(leagueId, currentClubId), 2000)
  }
}

// Position → broad category mapping
const GK_POSITIONS  = new Set(['GK'])
const DEF_POSITIONS = new Set(['CB', 'LB', 'RB'])
const MID_POSITIONS = new Set(['CDM', 'CM', 'CAM', 'LM', 'RM'])
const ATT_POSITIONS = new Set(['LW', 'RW', 'CF', 'ST'])

function positionCategory(pos: string): 'GK' | 'DEF' | 'MID' | 'ATT' {
  if (GK_POSITIONS.has(pos))  return 'GK'
  if (DEF_POSITIONS.has(pos)) return 'DEF'
  if (ATT_POSITIONS.has(pos)) return 'ATT'
  return 'MID'
}

async function aiAutoPick(leagueId: string, clubId: string): Promise<void> {
  const [club, session] = await Promise.all([
    prisma.club.findUnique({ where: { id: clubId } }),
    prisma.draftSession.findUnique({ where: { leagueId } }),
  ])
  if (!club || !session || session.status !== 'ACTIVE') return

  // Current squad composition by broad category
  const squadInstances = await prisma.playerInstance.findMany({
    where: { leagueId, clubId },
    include: { player: { select: { position: true } } },
  })
  const catCounts: Record<string, number> = { GK: 0, DEF: 0, MID: 0, ATT: 0 }
  for (const inst of squadInstances) {
    const cat = positionCategory(inst.player.position)
    catCounts[cat] = (catCounts[cat] ?? 0) + 1
  }

  // Budget planning: how much to spend per remaining pick on average
  const picksRemaining = Math.max(1, session.roundsTotal - session.currentRound + 1)
  const budgetPerPick  = club.budget / picksRemaining

  // Ideal squad shape scaled to total rounds
  const r = session.roundsTotal
  const targets: Record<string, number> = {
    GK:  Math.max(1, Math.round(r * 0.12)),
    DEF: Math.round(r * 0.30),
    MID: Math.round(r * 0.30),
    ATT: 0,
  }
  targets.ATT = Math.max(1, r - targets.GK - targets.DEF - targets.MID)

  // Fetch top-50 players this club can still afford
  let candidates = await prisma.playerInstance.findMany({
    where: { leagueId, clubId: null, player: { baseValue: { lte: club.budget } } },
    include: { player: true },
    orderBy: { player: { overall: 'desc' } },
    take: 50,
  })

  // Safety fallback: pick cheapest available so the draft never stalls
  if (candidates.length === 0) {
    const cheapest = await prisma.playerInstance.findFirst({
      where: { leagueId, clubId: null },
      include: { player: true },
      orderBy: { player: { baseValue: 'asc' } },
    })
    if (!cheapest) return
    try { await makePick(leagueId, clubId, cheapest.playerId) } catch {}
    return
  }

  // Score each candidate on three axes
  const scored = candidates.map(inst => {
    const p   = inst.player
    const cat = positionCategory(p.position)

    // 1. Quality (0–1): raw OVR normalised
    const qualityScore = p.overall / 100

    // 2. Positional need (0–1): how far below target is this category?
    const target    = targets[cat] ?? 1
    const have      = catCounts[cat] ?? 0
    const needScore = have >= target ? 0 : (target - have) / target

    // 3. Budget efficiency (0–1): penalise spending much more than avg per pick
    //    costRatio = 1 means right on pace; 2 = twice the average
    const costRatio   = budgetPerPick > 0 ? p.baseValue / budgetPerPick : 0
    const budgetScore = costRatio <= 1.5
      ? 1
      : Math.max(0, 1 - (costRatio - 1.5) / 3)

    // Small jitter so different AI clubs don't always pick identically
    const jitter = Math.random() * 0.06 - 0.03

    return {
      inst,
      score: qualityScore * 0.40 + needScore * 0.35 + budgetScore * 0.25 + jitter,
    }
  })

  scored.sort((a, b) => b.score - a.score)

  try {
    await makePick(leagueId, clubId, scored[0].inst.playerId)
  } catch {
    // Transient failure — no retry needed
  }
}

function advancePick(
  pickOrder: string[],
  currentPick: number,
  currentRound: number,
  roundsTotal: number,
): {
  nextPickOrder: string[]
  nextRound: number
  nextPickIndex: number
  draftComplete: boolean
} {
  const nextPickIndex = currentPick + 1

  if (nextPickIndex < pickOrder.length) {
    return { nextPickOrder: pickOrder, nextRound: currentRound, nextPickIndex, draftComplete: false }
  }

  // End of round
  const nextRound = currentRound + 1

  if (nextRound > roundsTotal) {
    return { nextPickOrder: pickOrder, nextRound, nextPickIndex: 0, draftComplete: true }
  }

  // Snake: reverse order for next round
  const nextPickOrder = [...pickOrder].reverse()
  return { nextPickOrder, nextRound, nextPickIndex: 0, draftComplete: false }
}
