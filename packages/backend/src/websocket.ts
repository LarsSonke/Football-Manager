import { Server } from 'socket.io'
import type { Server as HttpServer } from 'http'

let io: Server

export function initWebSocket(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: {
      origin:
        process.env.NODE_ENV === 'production'
          ? process.env.FRONTEND_URL
          : 'http://localhost:5173',
      methods: ['GET', 'POST'],
    },
  })

  io.on('connection', (socket) => {
    socket.on('join:league', (leagueId: string) => {
      socket.join(`league:${leagueId}`)
    })

    socket.on('join:draft', (leagueId: string) => {
      socket.join(`draft:${leagueId}`)
    })

    socket.on('leave:draft', (leagueId: string) => {
      socket.leave(`draft:${leagueId}`)
    })
  })

  return io
}

export function getIO(): Server {
  if (!io) throw new Error('WebSocket server not initialized')
  return io
}
