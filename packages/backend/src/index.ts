import 'dotenv/config'
import http from 'http'
import { createApp } from './app'
import { initWebSocket } from './websocket'
import { initScheduler } from './scheduler/matchday.scheduler'
import { prisma } from './prisma'

const PORT = Number(process.env.PORT) || 3000

async function main() {
  const app = createApp()
  const server = http.createServer(app)

  initWebSocket(server)
  initScheduler()

  server.listen(PORT, () => {
    console.log(`Backend running at http://localhost:${PORT}`)
    console.log(`Environment: ${process.env.NODE_ENV ?? 'development'}`)
  })
}

main().catch(async (err) => {
  console.error('Fatal startup error:', err)
  await prisma.$disconnect()
  process.exit(1)
})
