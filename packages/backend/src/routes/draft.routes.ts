import { Router } from 'express'
import { z } from 'zod'
import { requireAuth, type AuthRequest } from '../middleware/auth'
import * as auctionService from '../services/auction.service'
import { prisma } from '../prisma'

const router = Router()
router.use(requireAuth)

// ─── GET /:leagueId  -  window state + budget stats ─────────────────────────────
router.get('/:leagueId', async (req: AuthRequest, res) => {
  try {
    const club = await prisma.club.findFirst({
      where: { leagueId: req.params.leagueId, userId: req.userId },
    })
    const [windowState, budgetStats] = await Promise.all([
      auctionService.getWindowState(req.params.leagueId),
      club
        ? auctionService.getBudgetStats(req.params.leagueId, club.id)
        : Promise.resolve(null),
    ])
    res.json({ window: windowState, budgetStats, myClubId: club?.id ?? null })
  } catch (err: any) {
    res.status(404).json({ error: err.message })
  }
})

// ─── GET /:leagueId/market  -  filtered auction list ────────────────────────────
router.get('/:leagueId/market', async (req: AuthRequest, res) => {
  const club = await prisma.club.findFirst({
    where: { leagueId: req.params.leagueId, userId: req.userId },
  })
  if (!club) { res.status(403).json({ error: 'Not in this league' }); return }

  const { q, pos, minOvr, maxOvr, minAge, maxAge, status, take, skip, sort } = req.query
  const posArr = Array.isArray(pos) ? pos as string[]
    : typeof pos === 'string' ? [pos] : undefined

  try {
    const auctions = await auctionService.getMarket(req.params.leagueId, club.id, {
      q:            typeof q === 'string' ? q : undefined,
      positions:    posArr,
      minOvr:       minOvr   ? parseInt(minOvr   as string) : undefined,
      maxOvr:       maxOvr   ? parseInt(maxOvr   as string) : undefined,
      minAge:       minAge   ? parseInt(minAge   as string) : undefined,
      maxAge:       maxAge   ? parseInt(maxAge   as string) : undefined,
      statusFilter: (status as any) ?? 'ALL',
      take:         take     ? parseInt(take     as string) : 50,
      skip:         skip     ? parseInt(skip     as string) : 0,
      sortBy:       (sort as any) ?? 'endsAt',
    })
    res.json(auctions)
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})

// ─── GET /:leagueId/my-bids ───────────────────────────────────────────────────
router.get('/:leagueId/my-bids', async (req: AuthRequest, res) => {
  const club = await prisma.club.findFirst({
    where: { leagueId: req.params.leagueId, userId: req.userId },
  })
  if (!club) { res.status(403).json({ error: 'Not in this league' }); return }

  try {
    const bids = await auctionService.getMyBids(req.params.leagueId, club.id)
    res.json(bids)
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})

// ─── GET /:leagueId/watchlist ─────────────────────────────────────────────────
router.get('/:leagueId/watchlist', async (req: AuthRequest, res) => {
  const club = await prisma.club.findFirst({
    where: { leagueId: req.params.leagueId, userId: req.userId },
  })
  if (!club) { res.status(403).json({ error: 'Not in this league' }); return }

  try {
    const list = await auctionService.getWatchlist(req.params.leagueId, club.id)
    res.json(list)
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})

// ─── POST /:leagueId/bid ──────────────────────────────────────────────────────
const bidSchema = z.object({
  auctionId: z.string(),
  amount:    z.number().int().positive(),
  maxBid:    z.number().int().positive().optional(),
})

router.post('/:leagueId/bid', async (req: AuthRequest, res) => {
  const parsed = bidSchema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0].message }); return }

  const club = await prisma.club.findFirst({
    where: { leagueId: req.params.leagueId, userId: req.userId },
  })
  if (!club) { res.status(403).json({ error: 'Not in this league' }); return }

  try {
    const result = await auctionService.placeBid(
      req.params.leagueId,
      club.id,
      parsed.data.auctionId,
      parsed.data.amount,
      parsed.data.maxBid,
    )
    res.json(result)
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})

// ─── POST /:leagueId/watchlist/:auctionId ─────────────────────────────────────
router.post('/:leagueId/watchlist/:auctionId', async (req: AuthRequest, res) => {
  const club = await prisma.club.findFirst({
    where: { leagueId: req.params.leagueId, userId: req.userId },
  })
  if (!club) { res.status(403).json({ error: 'Not in this league' }); return }

  try {
    const watching = await auctionService.toggleWatchlist(
      req.params.leagueId,
      club.id,
      req.params.auctionId,
    )
    res.json({ watching })
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})

// ─── GET /:leagueId/budget ────────────────────────────────────────────────────
router.get('/:leagueId/budget', async (req: AuthRequest, res) => {
  const club = await prisma.club.findFirst({
    where: { leagueId: req.params.leagueId, userId: req.userId },
  })
  if (!club) { res.status(403).json({ error: 'Not in this league' }); return }

  try {
    const stats = await auctionService.getBudgetStats(req.params.leagueId, club.id)
    res.json(stats)
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})

// ─── POST /:leagueId/finalize  -  creator closes window + starts season ─────────
router.post('/:leagueId/finalize', async (req: AuthRequest, res) => {
  try {
    await auctionService.finalizeWindow(req.params.leagueId, req.userId!)
    res.json({ ok: true })
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})

export default router
