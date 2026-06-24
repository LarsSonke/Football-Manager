import { Router } from 'express'
import { z } from 'zod'
import { requireAuth, type AuthRequest } from '../middleware/auth'
import * as sponsorService from '../services/sponsor.service'

const router = Router({ mergeParams: true })
router.use(requireAuth)

router.get('/:id/sponsors', async (req: AuthRequest, res) => {
  try {
    const data = await sponsorService.getClubSponsorDeals(req.params.id, req.userId!)
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
    const deal = await sponsorService.signSponsorDeal(req.params.id, req.userId!, parsed.data.dealIndex)
    res.status(201).json(deal)
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})

export default router
