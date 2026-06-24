import express from 'express'
import cors from 'cors'
import authRoutes from './routes/auth.routes'
import leagueRoutes from './routes/league.routes'
import matchRoutes from './routes/match.routes'
import transferRoutes from './routes/transfer.routes'
import managementRoutes from './routes/management.routes'
import sponsorRoutes from './routes/sponsor.routes'
import cupRoutes from './routes/cup.routes'
import playerRoutes from './routes/player.routes'
import draftRoutes from './routes/draft.routes'
import messagesRoutes from './routes/messages.routes'

export function createApp() {
  const app = express()

  app.use(
    cors({
      origin:
        process.env.NODE_ENV === 'production'
          ? process.env.FRONTEND_URL
          : 'http://localhost:5173',
      credentials: true,
    }),
  )
  app.use(express.json())

  app.use('/api/auth', authRoutes)
  app.use('/api/leagues', leagueRoutes)
  app.use('/api/leagues', matchRoutes)
  app.use('/api/leagues', transferRoutes)
  app.use('/api/leagues', managementRoutes)
  app.use('/api/leagues', sponsorRoutes)
  app.use('/api/leagues', cupRoutes)
  app.use('/api/players', playerRoutes)
  app.use('/api/draft', draftRoutes)
  app.use('/api/leagues', messagesRoutes)

  app.get('/api/health', (_, res) => res.json({ ok: true, ts: new Date().toISOString() }))

  return app
}
