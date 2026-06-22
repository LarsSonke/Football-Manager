import { prisma } from '../prisma'
import { getIO } from '../websocket'
import { startSeason } from './league.service'
import type { DraftPickEvent } from '@football/shared'

// ─── Auction types ────────────────────────────────────────────────────────────

export interface AuctionRound {
  nominatorIdx: number        // index into session.pickOrder
  instanceId: string | null   // being auctioned (null = waiting for nomination)
  playerId: string | null
  highBid: number
  highBidderId: string | null // club ID
  endsAt: string | null       // ISO timestamp
  budgets: Record<string, number>  // clubId → remaining budget
}

// ─── Auction timer map ────────────────────────────────────────────────────────

const auctionTimers = new Map<string, ReturnType<typeof setTimeout>>()

// ─── Draft state ──────────────────────────────────────────────────────────────

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
  opts: { q?: string; positions?: string[]; take?: number; skip?: number; minOvr?: number; maxOvr?: number; maxPrice?: number },
) {
  const { q, positions, take = 100, skip = 0, minOvr, maxOvr, maxPrice } = opts

  const overallFilter: { gte?: number; lte?: number } = {}
  if (minOvr !== undefined) overallFilter.gte = minOvr
  if (maxOvr !== undefined) overallFilter.lte = maxOvr

  return prisma.playerInstance.findMany({
    where: {
      leagueId,
      clubId: null,
      player: {
        ...(positions?.length ? { position: { in: positions as any[] } } : {}),
        ...(q ? { name: { contains: q, mode: 'insensitive' as const } } : {}),
        ...(Object.keys(overallFilter).length ? { overall: overallFilter } : {}),
        ...(maxPrice !== undefined ? { baseValue: { lte: maxPrice } } : {}),
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
  if (!session) throw new Error('Draft session not found')
  if (session.type === 'AUCTION') throw new Error('Use nominate/bid for auction drafts')
  if (session.status !== 'ACTIVE') throw new Error('Draft not active')

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

export async function kickoffAuctionIfAIFirst(leagueId: string): Promise<void> {
  const session = await prisma.draftSession.findUnique({ where: { leagueId } })
  if (!session || session.type !== 'AUCTION') return
  const state = getAuctionState(session)
  const nominatorIdx = state?.nominatorIdx ?? 0
  const nominatorId = session.pickOrder[nominatorIdx % session.pickOrder.length]
  const club = await prisma.club.findUnique({ where: { id: nominatorId } })
  if (club?.isAI) {
    const budgets = state?.budgets ?? await initAuctionBudgets(leagueId, session.pickOrder)
    setTimeout(() => aiNominate(leagueId, nominatorId, budgets).catch(console.error), 3000)
  }
}

// ─── Auction helpers ──────────────────────────────────────────────────────────

function getAuctionState(session: { auctionState: unknown }): AuctionRound | null {
  if (!session.auctionState || typeof session.auctionState !== 'object') return null
  return session.auctionState as AuctionRound
}

async function initAuctionBudgets(leagueId: string, pickOrder: string[]): Promise<Record<string, number>> {
  const clubs = await prisma.club.findMany({ where: { id: { in: pickOrder } }, select: { id: true, budget: true } })
  return Object.fromEntries(clubs.map(c => [c.id, c.budget]))
}

// ─── Auction actions ──────────────────────────────────────────────────────────

export async function nominatePlayer(leagueId: string, clubId: string, instanceId: string): Promise<void> {
  const session = await prisma.draftSession.findUnique({ where: { leagueId } })
  if (!session || session.status !== 'ACTIVE' || session.type !== 'AUCTION') throw new Error('Not an active auction draft')

  let state = getAuctionState(session)
  if (!state) {
    // First nomination: initialise budgets
    const budgets = await initAuctionBudgets(leagueId, session.pickOrder)
    state = { nominatorIdx: 0, instanceId: null, playerId: null, highBid: 0, highBidderId: null, endsAt: null, budgets }
  }

  const nominatorClubId = session.pickOrder[state.nominatorIdx % session.pickOrder.length]
  if (nominatorClubId !== clubId) throw new Error("It's not your turn to nominate")
  if (state.instanceId !== null) throw new Error('An auction is already in progress')

  const inst = await prisma.playerInstance.findUnique({
    where: { id: instanceId },
    include: { player: { select: { id: true } } },
  })
  if (!inst || inst.leagueId !== leagueId || inst.clubId !== null) throw new Error('Player not available')

  const endsAt = new Date(Date.now() + 40_000).toISOString()
  const newState: AuctionRound = {
    ...state,
    instanceId,
    playerId: inst.playerId,
    highBid: 1,
    highBidderId: null,
    endsAt,
  }

  await prisma.draftSession.update({ where: { leagueId }, data: { auctionState: newState as any } })

  getIO().to(`draft:${leagueId}`).emit('auction:nomination', {
    instanceId, playerId: inst.playerId, highBid: 1, endsAt, nominatorClubId,
    budgets: newState.budgets,
  })

  // Schedule auto-award after 40 seconds
  scheduleAward(leagueId, 40_000)
}

function scheduleAward(leagueId: string, delay: number): void {
  const existing = auctionTimers.get(leagueId)
  if (existing) clearTimeout(existing)
  const t = setTimeout(() => awardCurrentPlayer(leagueId).catch(console.error), delay)
  auctionTimers.set(leagueId, t)
}

async function awardCurrentPlayer(leagueId: string): Promise<void> {
  auctionTimers.delete(leagueId)

  const session = await prisma.draftSession.findUnique({
    where: { leagueId },
    include: { picks: true },
  })
  if (!session || session.status !== 'ACTIVE' || session.type !== 'AUCTION') return

  const state = getAuctionState(session)
  if (!state?.instanceId) return

  const { instanceId, highBid, highBidderId, nominatorIdx, budgets } = state

  // If no one bid, nominator wins at 1
  const winnerClubId = highBidderId ?? session.pickOrder[nominatorIdx % session.pickOrder.length]
  const finalBid = highBidderId ? highBid : 1

  // Check budget
  const winnerBudget = budgets[winnerClubId] ?? 0
  const actualBid = Math.min(finalBid, winnerBudget)

  // Update budgets
  const newBudgets = { ...budgets, [winnerClubId]: winnerBudget - actualBid }

  // Get instance player ID
  const inst = await prisma.playerInstance.findUnique({ where: { id: instanceId }, include: { player: { select: { id: true } } } })
  if (!inst) return

  const wage = Math.round(actualBid * 0.004)

  await prisma.$transaction([
    prisma.playerInstance.update({ where: { id: instanceId }, data: { clubId: winnerClubId, wage } }),
    prisma.draftPick.create({
      data: {
        sessionId: session.id,
        clubId: winnerClubId,
        playerId: inst.playerId,
        round: Math.floor(session.picks.length / session.pickOrder.length) + 1,
        pickNumber: session.picks.length + 1,
        price: actualBid,
      },
    }),
    prisma.club.update({ where: { id: winnerClubId }, data: { budget: { decrement: actualBid } } }),
  ])

  // Check if draft is complete
  const newPickCount = session.picks.length + 1
  const totalNeeded = session.roundsTotal * session.pickOrder.length

  // Get all clubs' pick counts
  const allPicks = await prisma.draftPick.findMany({ where: { sessionId: session.id }, select: { clubId: true } })
  const picksByClub = new Map<string, number>()
  for (const p of allPicks) picksByClub.set(p.clubId, (picksByClub.get(p.clubId) ?? 0) + 1)
  const allFull = session.pickOrder.every(cId => (picksByClub.get(cId) ?? 0) >= session.roundsTotal)

  // Next nominator (skip full clubs)
  let nextIdx = nominatorIdx + 1
  if (!allFull) {
    while ((picksByClub.get(session.pickOrder[nextIdx % session.pickOrder.length]) ?? 0) >= session.roundsTotal) {
      nextIdx++
    }
  }

  const nextState: AuctionRound = {
    nominatorIdx: nextIdx,
    instanceId: null, playerId: null,
    highBid: 0, highBidderId: null, endsAt: null,
    budgets: newBudgets,
  }

  if (allFull || newPickCount >= totalNeeded) {
    await prisma.draftSession.update({ where: { leagueId }, data: { status: 'COMPLETED', auctionState: nextState as any } })
    getIO().to(`draft:${leagueId}`).emit('auction:awarded', { instanceId, playerId: inst.playerId, clubId: winnerClubId, finalBid: actualBid })
    getIO().to(`draft:${leagueId}`).emit('draft:complete', {})
    await startSeason(leagueId)
  } else {
    await prisma.draftSession.update({ where: { leagueId }, data: { auctionState: nextState as any } })
    getIO().to(`draft:${leagueId}`).emit('auction:awarded', { instanceId, playerId: inst.playerId, clubId: winnerClubId, finalBid: actualBid })

    // AI nomination if it's an AI club's turn
    const nextNominatorId = session.pickOrder[nextIdx % session.pickOrder.length]
    const nextClub = await prisma.club.findUnique({ where: { id: nextNominatorId } })
    if (nextClub?.isAI) {
      setTimeout(() => aiNominate(leagueId, nextNominatorId, nextState.budgets).catch(console.error), 2000 + Math.random() * 2000)
    }
  }
}

async function aiNominate(leagueId: string, clubId: string, budgets: Record<string, number>): Promise<void> {
  // Pick highest-overall available player
  const best = await prisma.playerInstance.findFirst({
    where: { leagueId, clubId: null },
    include: { player: { select: { id: true } } },
    orderBy: { player: { overall: 'desc' } },
  })
  if (best) await nominatePlayer(leagueId, clubId, best.id).catch(() => {})
}

export async function placeBid(leagueId: string, clubId: string, amount: number): Promise<void> {
  const session = await prisma.draftSession.findUnique({ where: { leagueId } })
  if (!session || session.status !== 'ACTIVE' || session.type !== 'AUCTION') throw new Error('Not an active auction draft')

  const state = getAuctionState(session)
  if (!state?.instanceId || !state.endsAt) throw new Error('No active nomination')
  if (new Date(state.endsAt) < new Date()) throw new Error('Bidding has closed')

  if (amount <= state.highBid) throw new Error(`Bid must be above current high bid of €${state.highBid}`)

  const budget = state.budgets[clubId] ?? 0
  if (amount > budget) throw new Error(`Insufficient budget (you have €${budget})`)

  // Extend timer: reset to 10s if less than 10s remain
  const remaining = new Date(state.endsAt).getTime() - Date.now()
  const newEndsAt = remaining < 10_000
    ? new Date(Date.now() + 10_000).toISOString()
    : state.endsAt

  const newState: AuctionRound = { ...state, highBid: amount, highBidderId: clubId, endsAt: newEndsAt }
  await prisma.draftSession.update({ where: { leagueId }, data: { auctionState: newState as any } })

  getIO().to(`draft:${leagueId}`).emit('auction:bid', { clubId, amount, newEndsAt })

  // Reschedule award timer
  const newRemaining = new Date(newEndsAt).getTime() - Date.now()
  scheduleAward(leagueId, Math.max(newRemaining, 1000))

  // AI counter-bid (other AI clubs that value this player)
  const inst = await prisma.playerInstance.findUnique({ where: { id: state.instanceId }, include: { player: { select: { overall: true } } } })
  const playerValue = inst?.player.overall ? inst.player.overall * 500 : 10000
  const aiClubs = await prisma.club.findMany({ where: { id: { in: session.pickOrder }, isAI: true } })
  for (const ai of aiClubs) {
    if (ai.id === clubId) continue
    const aiMax = Math.min(playerValue, state.budgets[ai.id] ?? 0)
    if (amount < aiMax * 0.85 && Math.random() > 0.4) {
      const aiBid = Math.min(Math.round(amount * 1.1), Math.floor(aiMax * 0.9))
      if (aiBid > amount) {
        setTimeout(() => placeBid(leagueId, ai.id, aiBid).catch(() => {}), 1500 + Math.random() * 2000)
      }
    }
  }
}

// ─── Snake draft helpers ──────────────────────────────────────────────────────

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
