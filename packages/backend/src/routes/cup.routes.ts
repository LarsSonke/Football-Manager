import { Router } from 'express'
import { requireAuth, type AuthRequest } from '../middleware/auth'
import * as cupService from '../services/cup.service'

const router = Router({ mergeParams: true })
router.use(requireAuth)

router.get('/:id/cup', async (req: AuthRequest, res) => {
  try {
    const bracket = await cupService.getCupBracket(req.params.id)
    res.json(bracket)
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})

export default router
