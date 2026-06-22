import { Router } from 'express'
import { z } from 'zod'
import { requireAuth, type AuthRequest } from '../middleware/auth'
import * as leagueService from '../services/league.service'
import * as draftService from '../services/draft.service'
import { prisma } from '../prisma'

const router = Router()
router.use(requireAuth)

const createSchema = z.object({
  name: z.string().min(3).max(50),
  startingBudget: z.number().int().min(10_000).max(1_000_000),
  maxClubs: z.number().int().min(2).max(18).default(18),
  seasonLength: z.number().int().min(10).max(40).default(34),
  squadSize: z.number().int().min(11).max(30).default(25),
})

const joinSchema = z.object({
  clubName: z.string().min(3).max(50),
})

router.post('/', async (req: AuthRequest, res) => {
  const parsed = createSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message })
    return
  }
  try {
    const league = await leagueService.createLeague(req.userId!, parsed.data)
    res.status(201).json(league)
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})

router.get('/mine', async (req: AuthRequest, res) => {
  const leagues = await leagueService.listUserLeagues(req.userId!)
  res.json(leagues)
})

router.get('/:id/matches', async (req: AuthRequest, res) => {
  const matches = await leagueService.getLeagueMatches(req.params.id)
  res.json(matches)
})

router.get('/:id/matches/:matchId', async (req: AuthRequest, res) => {
  const detail = await leagueService.getMatchDetail(req.params.id, req.params.matchId)
  if (!detail) {
    res.status(404).json({ error: 'Match not found' })
    return
  }
  res.json(detail)
})

router.get('/:id', async (req: AuthRequest, res) => {
  const league = await leagueService.getLeague(req.params.id)
  if (!league) {
    res.status(404).json({ error: 'League not found' })
    return
  }
  res.json(league)
})

router.post('/:id/join', async (req: AuthRequest, res) => {
  const parsed = joinSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message })
    return
  }
  try {
    const club = await leagueService.joinLeague(req.userId!, req.params.id, parsed.data.clubName)
    res.status(201).json(club)
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})

const updateSchema = z.object({
  name: z.string().min(3).max(50).optional(),
  startingBudget: z.number().int().min(10_000).max(1_000_000).optional(),
  maxClubs: z.number().int().min(2).max(18).optional(),
  seasonLength: z.number().int().min(10).max(40).optional(),
  matchTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  squadSize: z.number().int().min(11).max(30).optional(),
})

router.patch('/:id', async (req: AuthRequest, res) => {
  const parsed = updateSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message })
    return
  }
  try {
    const league = await leagueService.updateLeague(req.params.id, req.userId!, parsed.data)
    res.json(league)
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})

router.delete('/:id', async (req: AuthRequest, res) => {
  try {
    await leagueService.deleteLeague(req.params.id, req.userId!)
    res.json({ ok: true })
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})

router.delete('/:id/clubs/:clubId', async (req: AuthRequest, res) => {
  try {
    await leagueService.kickClub(req.params.id, req.params.clubId, req.userId!)
    res.json({ ok: true })
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})

const tacticSchema = z.object({
  formation: z.string(),
  style: z.enum(['possession', 'counter', 'pressing', 'lowblock']),
  pressingIntensity: z.number().int().min(0).max(100),
  defensiveLine: z.number().int().min(0).max(100),
  width: z.number().int().min(0).max(100),
  lineup: z.array(z.object({ instanceId: z.string(), position: z.string() })).length(11),
  subs: z.array(z.object({
    outInstanceId: z.string(),
    inInstanceId: z.string(),
    condition: z.object({
      type: z.enum(['minute', 'fitness']),
      value: z.number().int().min(1).max(100),
    }),
  })).max(3).optional(),
  customSlots: z.array(z.object({
    position: z.string(),
    x: z.number().min(0).max(100),
    y: z.number().min(0).max(100),
  })).max(11).optional(),
})

router.patch('/:id/tactic', async (req: AuthRequest, res) => {
  const parsed = tacticSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message })
    return
  }
  try {
    const club = await prisma.club.findFirst({
      where: { leagueId: req.params.id, userId: req.userId! },
    })
    if (!club) {
      res.status(403).json({ error: 'You do not have a club in this league' })
      return
    }
    const updated = await prisma.club.update({
      where: { id: club.id },
      data: { tactic: parsed.data },
    })
    res.json(updated)
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})

const logoSchema = z.object({
  shape:  z.enum(['shield', 'circle', 'hexagon', 'rounded']),
  bg:     z.string().regex(/^#[0-9a-fA-F]{6}$/),
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  emblem: z.enum(['none', 'star', 'bolt', 'crown', 'diamond', 'cross', 'chevron', 'ring']),
  text:   z.string().min(1).max(3),
})

router.patch('/:id/logo', async (req: AuthRequest, res) => {
  const parsed = logoSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message })
    return
  }
  try {
    const club = await prisma.club.findFirst({
      where: { leagueId: req.params.id, userId: req.userId! },
    })
    if (!club) {
      res.status(403).json({ error: 'You do not have a club in this league' })
      return
    }
    const updated = await prisma.club.update({
      where: { id: club.id },
      data: { logoConfig: parsed.data },
    })
    res.json(updated)
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})

router.post('/:id/physio/upgrade', async (req: AuthRequest, res) => {
  try {
    const club = await leagueService.upgradePhysio(req.params.id, req.userId!)
    res.json(club)
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})

router.post('/:id/heal/:instanceId', async (req: AuthRequest, res) => {
  try {
    const result = await leagueService.healPlayer(req.params.id, req.userId!, req.params.instanceId)
    res.json(result)
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})

const trainSchema = z.object({ position: z.string() })

router.post('/:id/train/:instanceId', async (req: AuthRequest, res) => {
  const parsed = trainSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message })
    return
  }
  try {
    const result = await leagueService.trainPlayer(req.params.id, req.userId!, req.params.instanceId, parsed.data.position)
    res.json(result)
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})

router.post('/:id/new-season', async (req: AuthRequest, res) => {
  try {
    await leagueService.startNewSeason(req.params.id, req.userId!)
    res.json({ ok: true })
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})

router.get('/:id/sponsors', async (req: AuthRequest, res) => {
  try {
    const data = await leagueService.getClubSponsorDeals(req.params.id, req.userId!)
    res.json(data)
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})

router.post('/:id/sponsors/sign', async (req: AuthRequest, res) => {
  const parsed = z.object({ dealIndex: z.number().int().min(0) }).safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message })
    return
  }
  try {
    const deal = await leagueService.signSponsorDeal(req.params.id, req.userId!, parsed.data.dealIndex)
    res.status(201).json(deal)
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})

router.get('/:id/stats', async (req: AuthRequest, res) => {
  try {
    const stats = await leagueService.getLeagueStats(req.params.id)
    res.json(stats)
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})

router.post('/:id/draft/start', async (req: AuthRequest, res) => {
  try {
    const result = await leagueService.startDraft(req.params.id, req.userId!)
    res.json(result)
    // If the first pick belongs to an AI club, trigger auto-pick
    draftService.kickoffFirstPickIfAI(req.params.id).catch(() => {})
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})

export default router
