import { Router } from 'express'
import { requireAuth } from '../middleware/auth'
import { prisma } from '../prisma'

const router = Router()
router.use(requireAuth)

router.get('/', async (req, res) => {
  const { position, search } = req.query

  const players = await prisma.player.findMany({
    where: {
      ...(position ? { position: position as any } : {}),
      ...(search
        ? { name: { contains: search as string, mode: 'insensitive' } }
        : {}),
    },
    orderBy: { overall: 'desc' },
    take: 200,
  })

  res.json(players)
})

router.get('/league/:leagueId', async (req, res) => {
  const instances = await prisma.playerInstance.findMany({
    where: { leagueId: req.params.leagueId },
    include: {
      player: true,
      club: { select: { id: true, name: true } },
    },
    orderBy: { player: { overall: 'desc' } },
  })
  res.json(instances)
})

export default router
