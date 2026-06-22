import { Router } from 'express'
import { z } from 'zod'
import { requireAuth, type AuthRequest } from '../middleware/auth'
import * as draftService from '../services/draft.service'
import { prisma } from '../prisma'

const router = Router()
router.use(requireAuth)

router.get('/:leagueId', async (req: AuthRequest, res) => {
  try {
    const state = await draftService.getDraftState(req.params.leagueId)
    res.json(state)
  } catch (err: any) {
    res.status(404).json({ error: err.message })
  }
})

router.get('/:leagueId/players', async (req: AuthRequest, res) => {
  const { q, pos, take, skip, minOvr, maxOvr, maxPrice } = req.query
  const posArr = Array.isArray(pos) ? pos as string[] : typeof pos === 'string' ? [pos] : undefined
  const players = await draftService.searchPlayers(req.params.leagueId, {
    q:         typeof q === 'string' ? q : undefined,
    positions: posArr,
    take:     take     ? parseInt(take     as string) : 100,
    skip:     skip     ? parseInt(skip     as string) : 0,
    minOvr:   minOvr   ? parseInt(minOvr   as string) : undefined,
    maxOvr:   maxOvr   ? parseInt(maxOvr   as string) : undefined,
    maxPrice: maxPrice ? parseInt(maxPrice as string) : undefined,
  })
  res.json(players)
})

const pickSchema = z.object({ playerId: z.string() })

router.post('/:leagueId/pick', async (req: AuthRequest, res) => {
  const parsed = pickSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message })
    return
  }

  // Resolve the club making the pick
  const club = await prisma.club.findFirst({
    where: { leagueId: req.params.leagueId, userId: req.userId },
  })
  if (!club) {
    res.status(403).json({ error: 'You are not in this league' })
    return
  }

  try {
    const event = await draftService.makePick(
      req.params.leagueId,
      club.id,
      parsed.data.playerId,
    )
    res.json(event)
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})

export default router
