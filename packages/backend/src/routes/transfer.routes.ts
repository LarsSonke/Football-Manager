import { Router } from 'express'
import { z } from 'zod'
import { requireAuth, type AuthRequest } from '../middleware/auth'
import * as transferService from '../services/transfer.service'
import { prisma } from '../prisma'
import { calcMarketValue } from '../utils/marketValue'

const router = Router({ mergeParams: true })
router.use(requireAuth)

// ─── Free agents ──────────────────────────────────────────────────────────────

router.get('/:id/free-agents', async (req: AuthRequest, res) => {
  try {
    const league = await prisma.league.findUnique({ where: { id: req.params.id } })
    if (!league) { res.status(404).json({ error: 'League not found' }); return }
    if (league.status !== 'ACTIVE') { res.status(400).json({ error: 'League is not active' }); return }

    const agents = await prisma.playerInstance.findMany({
      where: { leagueId: req.params.id, clubId: null },
      include: { player: true },
      orderBy: [{ player: { overall: 'desc' } }],
    })
    res.json(agents)
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})

// ─── Release player ───────────────────────────────────────────────────────────

router.post('/:id/release', async (req: AuthRequest, res) => {
  const { instanceId } = req.body
  if (!instanceId) { res.status(400).json({ error: 'instanceId required' }); return }
  try {
    const club = await prisma.club.findFirst({
      where: { leagueId: req.params.id, userId: req.userId! },
      include: { squad: true },
    })
    if (!club) { res.status(403).json({ error: 'No club in this league' }); return }
    const league = await prisma.league.findUnique({ where: { id: req.params.id } })
    if (league?.status !== 'ACTIVE') { res.status(400).json({ error: 'Can only release players during an active season' }); return }
    if (!league.transferWindowOpen) { res.status(400).json({ error: 'Transfer window is currently closed' }); return }
    if (!club.squad.some(p => p.id === instanceId)) { res.status(403).json({ error: 'Player not in your squad' }); return }
    if (club.squad.length <= 11) { res.status(400).json({ error: 'Squad too small to release — need at least 11 players' }); return }

    await prisma.transferListing.deleteMany({ where: { instanceId } })
    await prisma.playerInstance.update({
      where: { id: instanceId },
      data: { clubId: null, morale: 50, form: 50 },
    })
    res.json({ ok: true })
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})

// ─── Pick up free agent ───────────────────────────────────────────────────────

router.post('/:id/pickup', async (req: AuthRequest, res) => {
  const { instanceId } = req.body
  if (!instanceId) { res.status(400).json({ error: 'instanceId required' }); return }
  try {
    const league = await prisma.league.findUnique({ where: { id: req.params.id } })
    if (!league) { res.status(404).json({ error: 'League not found' }); return }
    if (league.status !== 'ACTIVE') { res.status(400).json({ error: 'Can only sign players during an active season' }); return }
    if (!league.transferWindowOpen) { res.status(400).json({ error: 'Transfer window is currently closed' }); return }

    const club = await prisma.club.findFirst({
      where: { leagueId: req.params.id, userId: req.userId! },
      include: { squad: true },
    })
    if (!club) { res.status(403).json({ error: 'No club in this league' }); return }
    if (club.squad.length >= league.squadSize) { res.status(400).json({ error: `Squad full (max ${league.squadSize})` }); return }

    const instance = await prisma.playerInstance.findFirst({
      where: { id: instanceId, leagueId: req.params.id, clubId: null },
    })
    if (!instance) { res.status(400).json({ error: 'Player not available' }); return }

    const instanceWithPlayer = await prisma.playerInstance.findUnique({
      where: { id: instanceId },
      include: { player: { select: { overall: true } } },
    })
    const wage = instanceWithPlayer?.player
      ? Math.round(instanceWithPlayer.player.overall * league.startingBudget / 25_000)
      : 0

    await prisma.playerInstance.update({
      where: { id: instanceId },
      data: { clubId: club.id, wage },
    })
    res.json({ ok: true })
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})

// ─── Transfer market listings ─────────────────────────────────────────────────

router.get('/:id/market', async (req: AuthRequest, res) => {
  try {
    const listings = await prisma.transferListing.findMany({
      where: { leagueId: req.params.id },
      include: {
        instance: { include: { player: true } },
        sellerClub: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    const instanceIds = listings.map(l => l.instanceId)
    const boostGroups = instanceIds.length > 0
      ? await prisma.playerBoost.groupBy({
          by: ['instanceId'],
          where: { instanceId: { in: instanceIds }, matchdaysLeft: { gt: 0 } },
          _count: { instanceId: true },
        })
      : []
    const boostMap = Object.fromEntries(boostGroups.map(b => [b.instanceId, b._count.instanceId]))

    res.json(listings.map(l => ({
      ...l,
      marketValue: calcMarketValue(
        l.instance.player.baseValue,
        l.instance.form,
        l.instance.morale,
        boostMap[l.instanceId] ?? 0,
      ),
    })))
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})

const listSchema = z.object({
  instanceId: z.string(),
  askingPrice: z.number().int().min(1_000).max(500_000_000),
})

router.post('/:id/list', async (req: AuthRequest, res) => {
  const parsed = listSchema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0].message }); return }
  const { instanceId, askingPrice } = parsed.data
  try {
    const league = await prisma.league.findUnique({ where: { id: req.params.id } })
    if (league?.status !== 'ACTIVE') { res.status(400).json({ error: 'Can only list players during an active season' }); return }
    if (!league.transferWindowOpen) { res.status(400).json({ error: 'Transfer window is currently closed' }); return }

    const club = await prisma.club.findFirst({
      where: { leagueId: req.params.id, userId: req.userId! },
      include: { squad: true },
    })
    if (!club) { res.status(403).json({ error: 'No club in this league' }); return }
    if (!club.squad.some(p => p.id === instanceId)) { res.status(403).json({ error: 'Player not in your squad' }); return }
    if (club.squad.length <= 11) { res.status(400).json({ error: 'Squad too small to list — need at least 12 players' }); return }

    const existing = await prisma.transferListing.findUnique({ where: { instanceId } })
    if (existing) { res.status(400).json({ error: 'Player is already listed' }); return }

    const listing = await prisma.transferListing.create({
      data: { leagueId: req.params.id, sellerClubId: club.id, instanceId, askingPrice },
      include: { instance: { include: { player: true } }, sellerClub: { select: { id: true, name: true } } },
    })
    res.status(201).json(listing)
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})

router.delete('/:id/list/:instanceId', async (req: AuthRequest, res) => {
  try {
    const club = await prisma.club.findFirst({ where: { leagueId: req.params.id, userId: req.userId! } })
    if (!club) { res.status(403).json({ error: 'No club in this league' }); return }

    const listing = await prisma.transferListing.findUnique({ where: { instanceId: req.params.instanceId } })
    if (!listing) { res.status(404).json({ error: 'Listing not found' }); return }
    if (listing.sellerClubId !== club.id) { res.status(403).json({ error: 'Not your listing' }); return }

    await prisma.transferListing.delete({ where: { instanceId: req.params.instanceId } })
    res.json({ ok: true })
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})

router.post('/:id/buy/:instanceId', async (req: AuthRequest, res) => {
  try {
    const league = await prisma.league.findUnique({ where: { id: req.params.id } })
    if (league?.status !== 'ACTIVE') { res.status(400).json({ error: 'Can only buy players during an active season' }); return }
    if (!league.transferWindowOpen) { res.status(400).json({ error: 'Transfer window is currently closed' }); return }

    const listing = await prisma.transferListing.findUnique({
      where: { instanceId: req.params.instanceId },
      include: { sellerClub: { select: { id: true, budget: true } } },
    })
    if (!listing || listing.leagueId !== req.params.id) { res.status(404).json({ error: 'Listing not found' }); return }

    const buyerClub = await prisma.club.findFirst({
      where: { leagueId: req.params.id, userId: req.userId! },
      include: { squad: true },
    })
    if (!buyerClub) { res.status(403).json({ error: 'No club in this league' }); return }
    if (buyerClub.id === listing.sellerClubId) { res.status(400).json({ error: "Can't buy your own player" }); return }
    if (buyerClub.squad.length >= league!.squadSize) { res.status(400).json({ error: `Squad full (max ${league!.squadSize})` }); return }
    if (buyerClub.budget < listing.askingPrice) { res.status(400).json({ error: `Insufficient budget (need €${listing.askingPrice.toLocaleString()})` }); return }

    await prisma.$transaction([
      prisma.playerInstance.update({ where: { id: req.params.instanceId }, data: { clubId: buyerClub.id } }),
      prisma.club.update({ where: { id: buyerClub.id }, data: { budget: { decrement: listing.askingPrice } } }),
      prisma.club.update({ where: { id: listing.sellerClubId }, data: { budget: { increment: listing.askingPrice } } }),
      prisma.transferListing.delete({ where: { instanceId: req.params.instanceId } }),
    ])
    res.json({ ok: true })
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})

// ─── Transfer window toggle ───────────────────────────────────────────────────

router.patch('/:id/transfer-window', async (req: AuthRequest, res) => {
  const parsed = z.object({ open: z.boolean() }).safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: 'open (boolean) required' }); return }
  try {
    const league = await transferService.setTransferWindow(req.params.id, req.userId!, parsed.data.open)
    res.json({ transferWindowOpen: (league as any).transferWindowOpen })
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})

export default router
