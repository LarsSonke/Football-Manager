import { prisma } from '../prisma'
import { startSeason } from './league.service'
import { getIO } from '../websocket'

const MIN_INCREMENT = 50_000  // €50k minimum bid step
const SNIPE_WINDOW_MS = 5 * 60 * 1000  // bids in last 5 min extend by 5 min

const AI_TEAM_NAMES = [
  'FC Redwood', 'United City', 'Athletic Blue', 'Sporting Verde',
  'Royal Crown FC', 'Iron Gate FC', 'Silver Star United', 'Thunder Bay FC',
  'Coastal United', 'Mountain Lions FC', 'Valley United', 'Harbor City FC',
  'Riverside FC', 'Lakeside Athletic', 'Northgate FC', 'Southend United',
  'Eastside FC', 'Westbridge City',
]

// ─── openWindow ───────────────────────────────────────────────────────────────

export async function openWindow(leagueId: string, requestingUserId: string) {
  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    include: { clubs: { orderBy: { createdAt: 'asc' } } },
  })
  if (!league) throw new Error('League not found')
  if (league.status !== 'SETUP') throw new Error('Transfer window has already been opened')

  const firstClub = league.clubs.find(c => !c.isAI)
  if (firstClub?.userId !== requestingUserId) throw new Error('Only the league creator can open the transfer window')

  // Fill AI clubs
  const humanCount = league.clubs.filter(c => !c.isAI).length
  const aiCount = league.maxClubs - humanCount
  const usedNames = new Set(league.clubs.map(c => c.name))
  const availableAINames = AI_TEAM_NAMES.filter(n => !usedNames.has(n))

  if (aiCount > 0) {
    await prisma.club.createMany({
      data: Array.from({ length: aiCount }, (_, i) => ({
        name: availableAINames[i] ?? `AI Club ${i + 1}`,
        budget: league.startingBudget,
        isAI: true,
        leagueId,
      })),
    })
  }

  // Create player instances for this league
  const allPlayers = await prisma.player.findMany({ select: { id: true } })
  const BATCH = 500
  for (let i = 0; i < allPlayers.length; i += BATCH) {
    await prisma.playerInstance.createMany({
      data: allPlayers.slice(i, i + BATCH).map(p => ({ playerId: p.id, leagueId })),
      skipDuplicates: true,
    })
  }

  // Create the TransferWindow
  const now = new Date()
  const window = await prisma.transferWindow.create({
    data: { leagueId, status: 'OPEN', opensAt: now },
  })

  // Build release schedule
  const defaultSchedule: Record<string, string[]> = {
    '0': ['ST', 'CF', 'LW', 'RW'],
    '1': ['CAM', 'CM', 'CDM', 'LM', 'RM'],
    '2': ['CB', 'LB', 'RB', 'GK'],
  }
  const schedule = (league.releaseSchedule as Record<string, string[]> | null) ?? defaultSchedule

  const posToDay: Record<string, number> = {}
  for (const [day, positions] of Object.entries(schedule)) {
    for (const pos of positions) posToDay[pos] = parseInt(day)
  }

  // Load all instances
  const instances = await prisma.playerInstance.findMany({
    where: { leagueId, clubId: null },
    include: { player: { select: { id: true, position: true, overall: true, baseValue: true } } },
    orderBy: { player: { overall: 'desc' } },
  })

  // Group by release day for stagger calculation
  const dayGroups: Record<number, typeof instances> = {}
  for (const inst of instances) {
    const day = posToDay[inst.player.position] ?? 0
    if (!dayGroups[day]) dayGroups[day] = []
    dayGroups[day].push(inst)
  }

  const MS_PER_DAY = 24 * 60 * 60 * 1000
  const auctionData: Array<{
    windowId: string; leagueId: string; instanceId: string
    openingBid: number; currentBid: number
    releasedAt: Date; endsAt: Date; status: 'OPEN' | 'SCHEDULED'
  }> = []

  for (const [dayStr, group] of Object.entries(dayGroups)) {
    const day = parseInt(dayStr)
    const total = group.length

    group.forEach((inst, idx) => {
      // Spread releases evenly over 4 hours within each day
      const spreadMs = total > 1 ? (idx / (total - 1)) * 4 * 60 * 60 * 1000 : 0
      const releasedAt = new Date(now.getTime() + day * MS_PER_DAY + spreadMs)

      // Auction duration 24-28h, staggered so not all end simultaneously
      const durationExtra = (idx % 5) * 60 * 60 * 1000  // 0-4h extra
      const endsAt = new Date(releasedAt.getTime() + MS_PER_DAY + durationExtra)

      const openingBid = Math.max(50_000, Math.floor(inst.player.baseValue * 0.25))

      auctionData.push({
        windowId: window.id,
        leagueId,
        instanceId: inst.id,
        openingBid,
        currentBid: openingBid,
        releasedAt,
        endsAt,
        status: day === 0 ? 'OPEN' : 'SCHEDULED',
      })
    })
  }

  // Batch insert auctions
  const AUCTION_BATCH = 200
  for (let i = 0; i < auctionData.length; i += AUCTION_BATCH) {
    await prisma.auction.createMany({ data: auctionData.slice(i, i + AUCTION_BATCH) })
  }

  await prisma.league.update({ where: { id: leagueId }, data: { status: 'DRAFTING' } })

  return window
}

// ─── advanceAuctionStatuses ───────────────────────────────────────────────────
// Called lazily on each market request to open scheduled auctions and close expired ones.

export async function advanceAuctionStatuses(leagueId: string): Promise<void> {
  const now = new Date()

  // Open scheduled auctions whose release time has passed
  await prisma.auction.updateMany({
    where: { leagueId, status: 'SCHEDULED', releasedAt: { lte: now } },
    data: { status: 'OPEN' },
  })

  // Find expired open auctions
  const expired = await prisma.auction.findMany({
    where: { leagueId, status: 'OPEN', endsAt: { lte: now } },
    select: { id: true, instanceId: true, winnerClubId: true, currentBid: true },
  })

  for (const auction of expired) {
    await prisma.auction.update({
      where: { id: auction.id },
      data: { status: auction.winnerClubId ? 'WON' : 'UNSOLD' },
    })

    if (auction.winnerClubId) {
      await prisma.playerInstance.update({
        where: { id: auction.instanceId },
        data: { clubId: auction.winnerClubId, wage: 0 },  // wage set during auto-fill
      })
      await prisma.club.update({
        where: { id: auction.winnerClubId },
        data: { budget: { decrement: auction.currentBid } },
      })
    }
  }
}

// ─── getBudgetStats ───────────────────────────────────────────────────────────

export async function getBudgetStats(leagueId: string, clubId: string) {
  const [club, reservedResult, league] = await Promise.all([
    prisma.club.findUnique({ where: { id: clubId }, select: { budget: true } }),
    prisma.auction.aggregate({
      where: { leagueId, status: 'OPEN', winnerClubId: clubId },
      _sum: { currentBid: true },
    }),
    prisma.league.findUnique({ where: { id: leagueId }, select: { wageCap: true } }),
  ])

  const totalBudget = club?.budget ?? 0
  const reservedBudget = reservedResult._sum.currentBid ?? 0
  const availableBudget = totalBudget - reservedBudget

  // Wage bill from existing squad
  const wageBill = await prisma.playerInstance.aggregate({
    where: { leagueId, clubId },
    _sum: { wage: true },
  })

  return {
    totalBudget,
    reservedBudget,
    availableBudget,
    wageBill: wageBill._sum.wage ?? 0,
    wageCap: league?.wageCap ?? 0,
  }
}

// ─── getMarket ────────────────────────────────────────────────────────────────

export async function getMarket(
  leagueId: string,
  clubId: string,
  opts: {
    q?: string
    positions?: string[]
    minOvr?: number
    maxOvr?: number
    minAge?: number
    maxAge?: number
    statusFilter?: 'ALL' | 'OPEN' | 'SCHEDULED' | 'WON' | 'UNSOLD'
    take?: number
    skip?: number
    sortBy?: 'endsAt' | 'currentBid' | 'overall'
  },
) {
  await advanceAuctionStatuses(leagueId)

  const {
    q, positions, minOvr, maxOvr, minAge, maxAge,
    statusFilter = 'ALL', take = 50, skip = 0, sortBy = 'endsAt',
  } = opts

  const statusWhere = statusFilter === 'ALL'
    ? { in: ['OPEN', 'SCHEDULED'] as const }
    : { equals: statusFilter as any }

  const auctions = await prisma.auction.findMany({
    where: {
      leagueId,
      status: statusFilter === 'ALL' ? { in: ['OPEN', 'SCHEDULED'] } : statusFilter as any,
      instance: {
        player: {
          ...(q ? { name: { contains: q, mode: 'insensitive' as const } } : {}),
          ...(positions?.length ? { position: { in: positions as any[] } } : {}),
          ...((minOvr !== undefined || maxOvr !== undefined) ? {
            overall: {
              ...(minOvr !== undefined ? { gte: minOvr } : {}),
              ...(maxOvr !== undefined ? { lte: maxOvr } : {}),
            },
          } : {}),
          ...((minAge !== undefined || maxAge !== undefined) ? {
            age: {
              ...(minAge !== undefined ? { gte: minAge } : {}),
              ...(maxAge !== undefined ? { lte: maxAge } : {}),
            },
          } : {}),
        },
      },
    },
    include: {
      instance: {
        include: {
          player: {
            select: {
              id: true, name: true, position: true, overall: true, potential: true,
              age: true, nationality: true, baseValue: true, photoUrl: true,
              pace: true, shooting: true, passing: true, dribbling: true,
              defending: true, physical: true,
              positions: true, preferredRoles: true,
            },
          },
        },
      },
      bids: {
        where: { clubId, isProxy: false },
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { amount: true, maxBid: true, createdAt: true },
      },
      watchedBy: {
        where: { clubId },
        take: 1,
        select: { id: true },
      },
      _count: { select: { bids: true } },
    },
    orderBy: sortBy === 'endsAt'
      ? { endsAt: 'asc' }
      : sortBy === 'currentBid'
        ? { currentBid: 'desc' }
        : { instance: { player: { overall: 'desc' } } },
    take,
    skip,
  })

  return auctions.map(a => ({
    id: a.id,
    instanceId: a.instanceId,
    player: a.instance.player,
    openingBid: a.openingBid,
    currentBid: a.currentBid,
    winnerClubId: a.winnerClubId,
    releasedAt: a.releasedAt,
    endsAt: a.endsAt,
    status: a.status,
    bidCount: a._count.bids,
    myBid: a.bids[0]?.amount ?? null,
    myMaxBid: a.bids[0]?.maxBid ?? null,
    isLeading: a.winnerClubId === clubId,
    isWatching: a.watchedBy.length > 0,
  }))
}

// ─── getMyBids ────────────────────────────────────────────────────────────────

export async function getMyBids(leagueId: string, clubId: string) {
  await advanceAuctionStatuses(leagueId)

  const auctions = await prisma.auction.findMany({
    where: {
      leagueId,
      bids: { some: { clubId, isProxy: false } },
    },
    include: {
      instance: {
        include: {
          player: {
            select: {
              id: true, name: true, position: true, overall: true,
              age: true, nationality: true, baseValue: true, photoUrl: true,
            },
          },
        },
      },
      bids: {
        where: { clubId, isProxy: false },
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { amount: true, maxBid: true },
      },
      _count: { select: { bids: true } },
    },
    orderBy: { endsAt: 'asc' },
  })

  return auctions.map(a => ({
    id: a.id,
    instanceId: a.instanceId,
    player: a.instance.player,
    openingBid: a.openingBid,
    currentBid: a.currentBid,
    winnerClubId: a.winnerClubId,
    endsAt: a.endsAt,
    status: a.status,
    bidCount: a._count.bids,
    myBid: a.bids[0]?.amount ?? null,
    myMaxBid: a.bids[0]?.maxBid ?? null,
    isLeading: a.winnerClubId === clubId,
    isWatching: false,
  }))
}

// ─── getWatchlist ─────────────────────────────────────────────────────────────

export async function getWatchlist(leagueId: string, clubId: string) {
  await advanceAuctionStatuses(leagueId)

  const entries = await prisma.watchlistEntry.findMany({
    where: { clubId, auction: { leagueId } },
    include: {
      auction: {
        include: {
          instance: {
            include: {
              player: {
                select: {
                  id: true, name: true, position: true, overall: true,
                  age: true, nationality: true, baseValue: true, photoUrl: true,
                },
              },
            },
          },
          bids: {
            where: { clubId, isProxy: false },
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { amount: true, maxBid: true },
          },
        },
      },
    },
    orderBy: { auction: { endsAt: 'asc' } },
  })

  return entries.map(e => ({
    id: e.auction.id,
    instanceId: e.auction.instanceId,
    player: e.auction.instance.player,
    openingBid: e.auction.openingBid,
    currentBid: e.auction.currentBid,
    winnerClubId: e.auction.winnerClubId,
    endsAt: e.auction.endsAt,
    status: e.auction.status,
    bidCount: 0,
    myBid: e.auction.bids[0]?.amount ?? null,
    myMaxBid: e.auction.bids[0]?.maxBid ?? null,
    isLeading: e.auction.winnerClubId === clubId,
    isWatching: true,
  }))
}

// ─── placeBid ─────────────────────────────────────────────────────────────────

export async function placeBid(
  leagueId: string,
  clubId: string,
  auctionId: string,
  amount: number,
  maxBid?: number,
): Promise<{ currentBid: number; leading: boolean; endsAt: Date }> {
  return prisma.$transaction(async tx => {
    const auction = await tx.auction.findUnique({
      where: { id: auctionId },
      include: {
        bids: {
          where: { isProxy: false },
          orderBy: { createdAt: 'desc' },
        },
      },
    })
    if (!auction) throw new Error('Auction not found')
    if (auction.leagueId !== leagueId) throw new Error('Auction not in this league')
    if (auction.status !== 'OPEN') throw new Error(`Auction is ${auction.status.toLowerCase()}`)
    if (auction.winnerClubId === clubId) throw new Error('You are already the highest bidder')

    const now = new Date()
    if (auction.endsAt <= now) throw new Error('Auction has ended')

    const effectiveMax = maxBid !== undefined ? Math.max(amount, maxBid) : amount
    const minBid = auction.winnerClubId ? auction.currentBid + MIN_INCREMENT : auction.openingBid

    if (amount < minBid) {
      throw new Error(`Minimum bid is €${minBid.toLocaleString('en-US')}`)
    }

    // Budget check: available = club budget - sum of winning bids on other open auctions
    const [club, reservedResult] = await Promise.all([
      tx.club.findUnique({ where: { id: clubId }, select: { budget: true } }),
      tx.auction.aggregate({
        where: { leagueId, status: 'OPEN', winnerClubId: clubId, id: { not: auctionId } },
        _sum: { currentBid: true },
      }),
    ])
    if (!club) throw new Error('Club not found')
    const available = club.budget - (reservedResult._sum.currentBid ?? 0)
    if (amount > available) {
      throw new Error(`Insufficient budget. Available: €${available.toLocaleString('en-US')}`)
    }

    // Find current leader's proxy maxBid
    const leaderProxyBid = auction.winnerClubId
      ? auction.bids.find(b => b.clubId === auction.winnerClubId && b.maxBid !== null)
      : null
    const leaderMax = leaderProxyBid?.maxBid ?? (auction.winnerClubId ? auction.currentBid : 0)

    let finalBid: number
    let finalWinner: string

    if (!auction.winnerClubId) {
      // No current leader  -  we win at our stated amount
      finalBid = amount
      finalWinner = clubId
    } else if (effectiveMax > leaderMax) {
      // We outbid the leader's proxy  -  bid just above their max
      finalBid = Math.min(leaderMax + MIN_INCREMENT, effectiveMax)
      finalWinner = clubId
    } else {
      // Leader's proxy wins  -  they auto-bid just above our max
      finalBid = Math.min(effectiveMax + MIN_INCREMENT, leaderMax)
      finalWinner = auction.winnerClubId
    }

    // Anti-sniping: extend if bid lands in final 5 min
    const msLeft = auction.endsAt.getTime() - now.getTime()
    const newEndsAt = msLeft < SNIPE_WINDOW_MS
      ? new Date(auction.endsAt.getTime() + SNIPE_WINDOW_MS)
      : auction.endsAt

    // Record the bidder's stated bid
    await tx.bid.create({
      data: {
        auctionId,
        clubId,
        amount,
        maxBid: effectiveMax > amount ? effectiveMax : undefined,
        isProxy: false,
      },
    })

    // If leader's proxy auto-fired, record that auto-bid
    if (finalWinner !== clubId && auction.winnerClubId) {
      await tx.bid.create({
        data: { auctionId, clubId: auction.winnerClubId, amount: finalBid, isProxy: true },
      })
    }

    await tx.auction.update({
      where: { id: auctionId },
      data: { currentBid: finalBid, winnerClubId: finalWinner, endsAt: newEndsAt },
    })

    // Emit socket event so other connected managers see the new bid
    try {
      getIO().to(`draft:${leagueId}`).emit('auction:bid', {
        auctionId,
        currentBid: finalBid,
        endsAt: newEndsAt,
      })
    } catch { /* no active connections */ }

    return { currentBid: finalBid, leading: finalWinner === clubId, endsAt: newEndsAt }
  })
}

// ─── toggleWatchlist ──────────────────────────────────────────────────────────

export async function toggleWatchlist(
  leagueId: string,
  clubId: string,
  auctionId: string,
): Promise<boolean> {
  const existing = await prisma.watchlistEntry.findUnique({
    where: { auctionId_clubId: { auctionId, clubId } },
  })
  if (existing) {
    await prisma.watchlistEntry.delete({ where: { id: existing.id } })
    return false
  } else {
    await prisma.watchlistEntry.create({ data: { auctionId, clubId } })
    return true
  }
}

// ─── getWindowState ───────────────────────────────────────────────────────────

export async function getWindowState(leagueId: string) {
  const window = await prisma.transferWindow.findUnique({ where: { leagueId } })
  if (!window) throw new Error('Transfer window not found')

  const counts = await prisma.auction.groupBy({
    by: ['status'],
    where: { leagueId },
    _count: { _all: true },
  })
  const byStatus = Object.fromEntries(counts.map(c => [c.status, c._count._all]))

  return {
    id: window.id,
    status: window.status,
    opensAt: window.opensAt,
    scheduled: byStatus['SCHEDULED'] ?? 0,
    open: byStatus['OPEN'] ?? 0,
    won: byStatus['WON'] ?? 0,
    unsold: byStatus['UNSOLD'] ?? 0,
  }
}

// ─── autoFillSquads ───────────────────────────────────────────────────────────

async function autoFillSquads(leagueId: string): Promise<void> {
  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    select: { squadSize: true, maxManualPicks: true },
  })
  const clubs = await prisma.club.findMany({ where: { leagueId } })
  const squadSize = league?.squadSize ?? 25

  // All unassigned instances, best OVR first
  const unassigned = await prisma.playerInstance.findMany({
    where: { leagueId, clubId: null },
    include: { player: { select: { id: true, position: true, overall: true } } },
    orderBy: { player: { overall: 'desc' } },
  })

  // Group unassigned by position for fast lookup
  const poolByPos: Record<string, typeof unassigned> = {}
  for (const inst of unassigned) {
    const pos = inst.player.position
    if (!poolByPos[pos]) poolByPos[pos] = []
    poolByPos[pos].push(inst)
  }
  const used = new Set<string>()

  function takeFromPool(pos: string): (typeof unassigned)[0] | null {
    const pool = poolByPos[pos] ?? []
    const inst = pool.find(i => !used.has(i.id))
    if (!inst) return null
    used.add(inst.id)
    return inst
  }

  function takeAny(): (typeof unassigned)[0] | null {
    for (const pool of Object.values(poolByPos)) {
      const inst = pool.find(i => !used.has(i.id))
      if (inst) { used.add(inst.id); return inst }
    }
    return null
  }

  for (const club of clubs) {
    const currentCount = await prisma.playerInstance.count({ where: { leagueId, clubId: club.id } })
    if (currentCount >= squadSize) continue

    // What positions does this club already have?
    const existing = await prisma.playerInstance.findMany({
      where: { leagueId, clubId: club.id },
      select: { player: { select: { position: true } } },
    })
    const posCounts: Record<string, number> = {}
    for (const inst of existing) {
      posCounts[inst.player.position] = (posCounts[inst.player.position] ?? 0) + 1
    }

    const minReqs: Record<string, number> = { GK: 2, CB: 3, LB: 1, RB: 1, CDM: 1, CM: 2, ST: 2 }
    const toFill: string[] = []

    for (const [pos, min] of Object.entries(minReqs)) {
      const have = posCounts[pos] ?? 0
      for (let n = have; n < min; n++) toFill.push(pos)
    }

    const autoAssigned: string[] = []
    let filled = 0
    const needed = squadSize - currentCount

    // Fill min requirements first
    for (const pos of toFill) {
      if (filled >= needed) break
      const inst = takeFromPool(pos)
      if (!inst) continue
      autoAssigned.push(inst.id)
      filled++
    }

    // Fill remaining from best available
    while (filled < needed) {
      const inst = takeAny()
      if (!inst) break
      autoAssigned.push(inst.id)
      filled++
    }

    if (autoAssigned.length > 0) {
      await prisma.playerInstance.updateMany({
        where: { id: { in: autoAssigned } },
        data: { clubId: club.id },
      })
      // Set wages from OVR
      const instances = await prisma.playerInstance.findMany({
        where: { id: { in: autoAssigned } },
        include: { player: { select: { overall: true } } },
      })
      await Promise.all(instances.map(i =>
        prisma.playerInstance.update({
          where: { id: i.id },
          data: { wage: i.player.overall * 200 },
        }),
      ))
    }
  }
}

// ─── finalizeWindow ───────────────────────────────────────────────────────────

export async function finalizeWindow(leagueId: string, requestingUserId: string): Promise<void> {
  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    include: { clubs: { orderBy: { createdAt: 'asc' } } },
  })
  if (!league) throw new Error('League not found')
  if (league.status !== 'DRAFTING') throw new Error('Transfer window is not active')

  const firstClub = league.clubs.find(c => !c.isAI)
  if (firstClub?.userId !== requestingUserId) throw new Error('Only the league creator can finalize the transfer window')

  // Advance all statuses
  await advanceAuctionStatuses(leagueId)

  // Force-close any remaining OPEN or SCHEDULED auctions
  const stillActive = await prisma.auction.findMany({
    where: { leagueId, status: { in: ['OPEN', 'SCHEDULED'] } },
    select: { id: true, instanceId: true, winnerClubId: true, currentBid: true },
  })

  for (const auction of stillActive) {
    await prisma.auction.update({
      where: { id: auction.id },
      data: { status: auction.winnerClubId ? 'WON' : 'UNSOLD' },
    })
    if (auction.winnerClubId) {
      await prisma.playerInstance.update({
        where: { id: auction.instanceId },
        data: { clubId: auction.winnerClubId },
      })
      await prisma.club.update({
        where: { id: auction.winnerClubId },
        data: { budget: { decrement: auction.currentBid } },
      })
    }
  }

  // Auto-fill all squads
  await autoFillSquads(leagueId)

  // Set wages for won auction players (if not set)
  const wonInstances = await prisma.playerInstance.findMany({
    where: { leagueId, clubId: { not: null }, wage: 0 },
    include: { player: { select: { overall: true } } },
  })
  await Promise.all(wonInstances.map(i =>
    prisma.playerInstance.update({
      where: { id: i.id },
      data: { wage: i.player.overall * 200 },
    }),
  ))

  // Mark window closed
  await prisma.transferWindow.update({
    where: { leagueId },
    data: { status: 'CLOSED' },
  })

  // Start the season
  await startSeason(leagueId)

  try {
    getIO().to(`draft:${leagueId}`).emit('window:finalized', { leagueId })
  } catch { /* no active connections */ }
}
