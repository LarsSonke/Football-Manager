import { Router } from 'express'
import { requireAuth, type AuthRequest } from '../middleware/auth'
import * as matchService from '../services/match.service'

const router = Router({ mergeParams: true })
router.use(requireAuth)

router.get('/:id/matches', async (req: AuthRequest, res) => {
  const matches = await matchService.getLeagueMatches(req.params.id)
  res.json(matches)
})

router.get('/:id/matches/:matchId', async (req: AuthRequest, res) => {
  const detail = await matchService.getMatchDetail(req.params.id, req.params.matchId)
  if (!detail) {
    res.status(404).json({ error: 'Match not found' })
    return
  }
  res.json(detail)
})

router.get('/:id/matches/:matchId/events', async (req: AuthRequest, res) => {
  const data = await matchService.getMatchEvents(req.params.id, req.params.matchId)
  if (!data) { res.status(404).json({ error: 'Match not found or not yet played' }); return }
  res.json(data)
})

router.get('/:id/awards', async (req: AuthRequest, res) => {
  try {
    const awards = await matchService.getMatchdayStars(req.params.id)
    res.json(awards)
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})

router.get('/:id/stats', async (req: AuthRequest, res) => {
  try {
    const stats = await matchService.getLeagueStats(req.params.id)
    res.json(stats)
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})

export default router
