import { Router } from 'express'
import { z } from 'zod'
import { requireAuth, type AuthRequest } from '../middleware/auth'
import * as managementService from '../services/management.service'
import { prisma } from '../prisma'

const router = Router({ mergeParams: true })
router.use(requireAuth)

// ─── Tactic ───────────────────────────────────────────────────────────────────

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

// ─── Logo ─────────────────────────────────────────────────────────────────────

const logoSchema = z.object({
  shape:     z.enum(['shield', 'circle', 'hexagon', 'rounded']),
  bg:        z.string().regex(/^#[0-9a-fA-F]{6}$/),
  accent:    z.string().regex(/^#[0-9a-fA-F]{6}$/),
  textColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  emblem:    z.enum(['none', 'star', 'bolt', 'crown', 'diamond', 'cross', 'chevron', 'ring', 'flames', 'sword', 'castle', 'wings', 'arrow', 'trident']),
  text:      z.string().min(1).max(3),
  division:  z.enum(['none', 'half-v', 'half-h', 'sash', 'quarters']).optional(),
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

// ─── Club name ────────────────────────────────────────────────────────────────

router.patch('/:id/name', async (req: AuthRequest, res) => {
  const parsed = z.object({ name: z.string().min(3).max(50) }).safeParse(req.body)
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
    const conflict = await prisma.club.findFirst({
      where: { leagueId: req.params.id, name: { equals: parsed.data.name, mode: 'insensitive' }, id: { not: club.id } },
    })
    if (conflict) {
      res.status(409).json({ error: 'Another club in this league already has that name' })
      return
    }
    const updated = await prisma.club.update({
      where: { id: club.id },
      data: { name: parsed.data.name },
    })
    res.json({ ok: true, name: updated.name })
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})

// ─── Kit ──────────────────────────────────────────────────────────────────────

router.patch('/:id/kit', async (req: AuthRequest, res) => {
  try {
    const club = await managementService.saveKit(req.params.id, req.userId!, req.body)
    res.json({ ok: true, kitConfig: club.kitConfig })
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})

// ─── Physio ───────────────────────────────────────────────────────────────────

router.post('/:id/physio/upgrade', async (req: AuthRequest, res) => {
  try {
    const club = await managementService.upgradePhysio(req.params.id, req.userId!)
    res.json(club)
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})

router.post('/:id/heal/:instanceId', async (req: AuthRequest, res) => {
  try {
    const result = await managementService.healPlayer(req.params.id, req.userId!, req.params.instanceId)
    res.json(result)
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})

// ─── Training ─────────────────────────────────────────────────────────────────

const trainSchema = z.object({ position: z.string() })

router.post('/:id/train/:instanceId', async (req: AuthRequest, res) => {
  const parsed = trainSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message })
    return
  }
  try {
    const result = await managementService.trainPlayer(req.params.id, req.userId!, req.params.instanceId, parsed.data.position)
    res.json(result)
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})

// ─── Club upgrades ────────────────────────────────────────────────────────────

const upgradeSchema = z.object({
  type: z.enum(['scout', 'coach', 'trainer', 'marketing', 'stadium', 'training', 'kit', 'vip']),
})

router.post('/:id/upgrade', async (req: AuthRequest, res) => {
  const parsed = upgradeSchema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0].message }); return }
  try {
    const club = await managementService.upgradeClub(req.params.id, req.userId!, parsed.data.type)
    res.json(club)
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})

// ─── Stat boosts ─────────────────────────────────────────────────────────────

const boostSchema = z.object({
  instanceId: z.string(),
  stat: z.enum(['pace', 'shooting', 'passing', 'dribbling', 'defending', 'physical']),
})

router.post('/:id/boost', async (req: AuthRequest, res) => {
  const parsed = boostSchema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0].message }); return }
  try {
    const result = await managementService.purchaseBoost(req.params.id, req.userId!, parsed.data.instanceId, parsed.data.stat)
    res.json(result)
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})

// ─── Scout report ─────────────────────────────────────────────────────────────

router.get('/:id/scout/:clubId', async (req: AuthRequest, res) => {
  try {
    const report = await managementService.getScoutReport(req.params.id, req.userId!, req.params.clubId)
    res.json(report)
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})

// ─── Coach advice ─────────────────────────────────────────────────────────────

router.get('/:id/coach-advice', async (req: AuthRequest, res) => {
  try {
    const advice = await managementService.getCoachAdvice(req.params.id, req.userId!)
    res.json(advice)
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})

export default router
