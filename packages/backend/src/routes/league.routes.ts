import { Router } from 'express'
import { z } from 'zod'
import { requireAuth, type AuthRequest } from '../middleware/auth'
import * as leagueService from '../services/league.service'
import * as draftService from '../services/draft.service'
import { prisma } from '../prisma'
import { simulateLeagueMatchday, simulateSeasonFast } from '../scheduler/matchday.scheduler'
import { getLeagueNews } from '../services/news.service'

const router = Router()
router.use(requireAuth)

const createSchema = z.object({
  name: z.string().min(3).max(50),
  startingBudget: z.number().int().min(10_000).max(1_000_000),
  maxClubs: z.number().int().min(2).max(18).default(18),
  seasonLength: z.number().int().min(10).max(40).default(34),
  squadSize: z.number().int().min(11).max(30).default(25),
  hasCup: z.boolean().default(false),
  competitionType: z.enum(['LEAGUE', 'WORLD_CUP', 'CHAMPIONS_LEAGUE']).default('LEAGUE'),
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

router.get('/:id/clubs/:clubId/profile', async (req: AuthRequest, res) => {
  try {
    const { id: leagueId, clubId } = req.params

    const [club, matches, perfGroups] = await Promise.all([
      prisma.club.findUnique({
        where: { id: clubId },
        include: {
          squad: {
            include: { player: true },
            orderBy: [{ player: { overall: 'desc' } }],
          },
          user: { select: { id: true, username: true } },
        },
      }),
      prisma.match.findMany({
        where: {
          leagueId,
          status: 'SIMULATED',
          OR: [{ homeClubId: clubId }, { awayClubId: clubId }],
        },
        orderBy: { matchday: 'desc' },
        take: 5,
        include: {
          homeClub: { select: { id: true, name: true, logoConfig: true } },
          awayClub: { select: { id: true, name: true, logoConfig: true } },
        },
      }),
      prisma.matchPerformance.groupBy({
        by: ['instanceId'],
        where: { match: { leagueId }, instance: { clubId } },
        _sum: { goals: true, assists: true },
        _avg: { rating: true },
        _count: { instanceId: true },
        orderBy: { _sum: { goals: 'desc' } },
        take: 5,
      }),
    ])

    if (!club || club.leagueId !== leagueId) {
      res.status(404).json({ error: 'Club not found' })
      return
    }

    // Resolve player names for top performers
    const perfInstanceIds = perfGroups.map(g => g.instanceId)
    const perfInstances = perfInstanceIds.length > 0
      ? await prisma.playerInstance.findMany({
          where: { id: { in: perfInstanceIds } },
          include: { player: { select: { name: true, position: true } } },
        })
      : []
    const perfMap = Object.fromEntries(perfInstances.map(i => [i.id, i]))

    res.json({
      club: {
        id: club.id,
        name: club.name,
        logoConfig: club.logoConfig,
        budget: club.budget,
        wins: club.wins,
        draws: club.draws,
        losses: club.losses,
        goalsFor: club.goalsFor,
        goalsAgainst: club.goalsAgainst,
        points: club.points,
        isAI: club.isAI,
        user: club.user,
      },
      squad: club.squad.map(inst => ({
        id: inst.id,
        playerId: inst.playerId,
        name: inst.player.name,
        nationality: inst.player.nationality,
        position: inst.player.position,
        age: inst.player.age,
        overall: inst.player.overall,
        potential: inst.player.potential,
        morale: inst.morale,
        form: inst.form,
        fitness: inst.fitness,
        injured: inst.injured,
        injuryDaysLeft: inst.injuryDaysLeft,
        wage: inst.wage,
      })),
      recentMatches: matches.map(m => ({
        id: m.id,
        matchday: m.matchday,
        homeClub: { id: m.homeClub.id, name: m.homeClub.name, logoConfig: m.homeClub.logoConfig },
        awayClub: { id: m.awayClub.id, name: m.awayClub.name, logoConfig: m.awayClub.logoConfig },
        homeScore: m.homeScore,
        awayScore: m.awayScore,
      })),
      topPerformers: perfGroups.map(g => ({
        instanceId: g.instanceId,
        name: perfMap[g.instanceId]?.player.name ?? '—',
        position: perfMap[g.instanceId]?.player.position ?? '?',
        goals: g._sum.goals ?? 0,
        assists: g._sum.assists ?? 0,
        appearances: g._count.instanceId,
        avgRating: g._avg.rating ? Math.round(g._avg.rating * 10) / 10 : 0,
      })),
    })
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})

router.post('/:id/new-season', async (req: AuthRequest, res) => {
  try {
    const result = await leagueService.startNewSeason(req.params.id, req.userId!)
    res.json({ ok: true, growthChanges: result.growthChanges })
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})

router.get('/:id/news', async (req: AuthRequest, res) => {
  try {
    const items = await getLeagueNews(req.params.id)
    res.json(items)
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})

async function getHostClub(leagueId: string) {
  return prisma.club.findFirst({
    where: { leagueId, isAI: false },
    orderBy: { createdAt: 'asc' },
  })
}

router.post('/:id/simulate-matchday', async (req: AuthRequest, res) => {
  const host = await getHostClub(req.params.id)
  if (!host) { res.status(404).json({ error: 'League not found' }); return }
  if (host.userId !== req.userId) { res.status(403).json({ error: 'Only the league host can trigger matchdays' }); return }
  const league = await prisma.league.findUnique({ where: { id: req.params.id } })
  if (league?.status !== 'ACTIVE') { res.status(400).json({ error: 'League is not currently active' }); return }
  simulateLeagueMatchday(req.params.id).catch(err => console.error('Manual matchday error:', err))
  res.json({ ok: true })
})

router.post('/:id/simulate-season', async (req: AuthRequest, res) => {
  const host = await getHostClub(req.params.id)
  if (!host) { res.status(404).json({ error: 'League not found' }); return }
  if (host.userId !== req.userId) { res.status(403).json({ error: 'Only the league host can simulate the season' }); return }
  const league = await prisma.league.findUnique({ where: { id: req.params.id } })
  if (league?.status !== 'ACTIVE') { res.status(400).json({ error: 'League is not currently active' }); return }
  simulateSeasonFast(req.params.id).catch(err => console.error('Instant season error:', err))
  res.json({ ok: true })
})

router.post('/:id/draft/start', async (req: AuthRequest, res) => {
  const draftType: 'SNAKE' | 'AUCTION' = req.body?.type === 'AUCTION' ? 'AUCTION' : 'SNAKE'
  try {
    const result = await leagueService.startDraft(req.params.id, req.userId!, draftType)
    res.json(result)
    if (draftType === 'AUCTION') {
      draftService.kickoffAuctionIfAIFirst(req.params.id).catch(() => {})
    } else {
      draftService.kickoffFirstPickIfAI(req.params.id).catch(() => {})
    }
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})

export default router
