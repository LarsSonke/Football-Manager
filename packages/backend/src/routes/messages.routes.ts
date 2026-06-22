import { Router } from 'express'
import { requireAuth, type AuthRequest } from '../middleware/auth'
import { prisma } from '../prisma'
import { getIO } from '../websocket'

const router = Router()
router.use(requireAuth)

// ─── GET /:leagueId/messages ─────────────────────────────────────────────────
// Returns inbox: all other human-club users in this league with their last message

router.get('/:leagueId/messages', async (req: AuthRequest, res) => {
  const { leagueId } = req.params
  const userId = req.userId!

  try {
    // Get all human clubs in this league (including the current user's club)
    const clubs = await prisma.club.findMany({
      where: { leagueId, isAI: false, userId: { not: null } },
      include: { user: { select: { id: true, username: true } } },
    })

    const otherClubs = clubs.filter(c => c.userId !== userId)

    const inbox = await Promise.all(
      otherClubs.map(async club => {
        const lastMessage = await prisma.message.findFirst({
          where: {
            leagueId,
            OR: [
              { fromUserId: userId, toUserId: club.userId! },
              { fromUserId: club.userId!, toUserId: userId },
            ],
          },
          orderBy: { createdAt: 'desc' },
          include: {
            fromUser: { select: { id: true, username: true } },
            toUser: { select: { id: true, username: true } },
          },
        })
        return {
          user: club.user,
          clubName: club.name,
          lastMessage,
        }
      }),
    )

    res.json(inbox)
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})

// ─── GET /:leagueId/messages/:userId ─────────────────────────────────────────
// Returns full thread between current user and the specified userId

router.get('/:leagueId/messages/:userId', async (req: AuthRequest, res) => {
  const { leagueId, userId: otherUserId } = req.params
  const currentUserId = req.userId!

  try {
    const messages = await prisma.message.findMany({
      where: {
        leagueId,
        OR: [
          { fromUserId: currentUserId, toUserId: otherUserId },
          { fromUserId: otherUserId, toUserId: currentUserId },
        ],
      },
      orderBy: { createdAt: 'asc' },
      include: {
        fromUser: { select: { id: true, username: true } },
        toUser: { select: { id: true, username: true } },
      },
    })

    res.json(messages)
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})

// ─── POST /:leagueId/messages/:userId ────────────────────────────────────────
// Send a message (text or transfer offer)

router.post('/:leagueId/messages/:userId', async (req: AuthRequest, res) => {
  const { leagueId, userId: toUserId } = req.params
  const fromUserId = req.userId!
  const { text, instanceId, offerPrice } = req.body

  const isOffer = instanceId != null && offerPrice != null
  if (!isOffer && !text) {
    res.status(400).json({ error: 'Either text or (instanceId + offerPrice) must be provided' })
    return
  }

  try {
    const message = await prisma.message.create({
      data: {
        leagueId,
        fromUserId,
        toUserId,
        text: text ?? null,
        type: isOffer ? 'TRANSFER_OFFER' : 'TEXT',
        instanceId: isOffer ? instanceId : null,
        offerPrice: isOffer ? offerPrice : null,
        offerStatus: isOffer ? 'PENDING' : null,
      },
      include: {
        fromUser: { select: { id: true, username: true } },
        toUser: { select: { id: true, username: true } },
      },
    })

    getIO().to(`user:${toUserId}`).emit('dm:message', message)

    res.status(201).json(message)
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})

// ─── POST /:leagueId/messages/:messageId/accept ───────────────────────────────
// Accept a transfer offer

router.post('/:leagueId/messages/:messageId/accept', async (req: AuthRequest, res) => {
  const { leagueId, messageId } = req.params
  const currentUserId = req.userId!

  try {
    const msg = await prisma.message.findUnique({ where: { id: messageId } })
    if (!msg) { res.status(404).json({ error: 'Message not found' }); return }
    if (msg.toUserId !== currentUserId) { res.status(403).json({ error: 'Not authorised' }); return }
    if (msg.type !== 'TRANSFER_OFFER') { res.status(400).json({ error: 'Not a transfer offer' }); return }
    if (msg.offerStatus !== 'PENDING') { res.status(400).json({ error: 'Offer is not pending' }); return }
    if (!msg.instanceId || msg.offerPrice == null) { res.status(400).json({ error: 'Malformed offer' }); return }

    // Find the player instance and clubs
    const instance = await prisma.playerInstance.findUnique({ where: { id: msg.instanceId } })
    if (!instance) { res.status(404).json({ error: 'Player instance not found' }); return }

    const senderClub = await prisma.club.findFirst({ where: { leagueId, userId: msg.fromUserId } })
    const receiverClub = await prisma.club.findFirst({
      where: { leagueId, userId: currentUserId },
      include: { squad: true },
    })

    if (!senderClub || !receiverClub) {
      res.status(400).json({ error: 'Could not find clubs for this transfer' })
      return
    }

    // Determine buyer and seller
    // If instance belongs to sender's club -> sender sells to receiver
    // Otherwise, receiver sells to sender (sender made an offer to buy receiver's player)
    const senderIsSeller = instance.clubId === senderClub.id
    const buyerClubId = senderIsSeller ? receiverClub.id : senderClub.id
    const sellerClubId = senderIsSeller ? senderClub.id : receiverClub.id

    const buyerClub = await prisma.club.findUnique({ where: { id: buyerClubId }, include: { squad: true } })
    if (!buyerClub) { res.status(400).json({ error: 'Buyer club not found' }); return }

    if (buyerClub.budget < msg.offerPrice) {
      res.status(400).json({ error: 'Buyer does not have sufficient budget' })
      return
    }

    const league = await prisma.league.findUnique({ where: { id: leagueId } })
    if (!league) { res.status(404).json({ error: 'League not found' }); return }

    if (buyerClub.squad.length >= league.squadSize) {
      res.status(400).json({ error: 'Buyer squad is full' })
      return
    }

    // Execute transfer in a transaction
    const [updatedMessage] = await prisma.$transaction([
      prisma.message.update({
        where: { id: messageId },
        data: { offerStatus: 'ACCEPTED' },
        include: {
          fromUser: { select: { id: true, username: true } },
          toUser: { select: { id: true, username: true } },
        },
      }),
      prisma.playerInstance.update({
        where: { id: msg.instanceId },
        data: { clubId: buyerClubId },
      }),
      prisma.club.update({
        where: { id: buyerClubId },
        data: { budget: { decrement: msg.offerPrice } },
      }),
      prisma.club.update({
        where: { id: sellerClubId },
        data: { budget: { increment: msg.offerPrice } },
      }),
      // Remove any transfer listing for this player
      prisma.transferListing.deleteMany({ where: { instanceId: msg.instanceId } }),
    ])

    getIO().to(`user:${msg.fromUserId}`).emit('dm:message', updatedMessage)
    getIO().to(`user:${msg.toUserId}`).emit('dm:message', updatedMessage)

    res.json(updatedMessage)
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})

// ─── POST /:leagueId/messages/:messageId/reject ───────────────────────────────
// Reject a transfer offer

router.post('/:leagueId/messages/:messageId/reject', async (req: AuthRequest, res) => {
  const { messageId } = req.params
  const currentUserId = req.userId!

  try {
    const msg = await prisma.message.findUnique({ where: { id: messageId } })
    if (!msg) { res.status(404).json({ error: 'Message not found' }); return }
    if (msg.toUserId !== currentUserId) { res.status(403).json({ error: 'Not authorised' }); return }
    if (msg.type !== 'TRANSFER_OFFER') { res.status(400).json({ error: 'Not a transfer offer' }); return }
    if (msg.offerStatus !== 'PENDING') { res.status(400).json({ error: 'Offer is not pending' }); return }

    const updatedMessage = await prisma.message.update({
      where: { id: messageId },
      data: { offerStatus: 'REJECTED' },
      include: {
        fromUser: { select: { id: true, username: true } },
        toUser: { select: { id: true, username: true } },
      },
    })

    getIO().to(`user:${msg.fromUserId}`).emit('dm:message', updatedMessage)
    getIO().to(`user:${msg.toUserId}`).emit('dm:message', updatedMessage)

    res.json(updatedMessage)
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})

// ─── GET /:leagueId/league-chat ───────────────────────────────────────────────
// Returns last 50 league-wide chat messages, oldest first

router.get('/:leagueId/league-chat', async (req: AuthRequest, res) => {
  const { leagueId } = req.params
  try {
    const messages = await prisma.leagueMessage.findMany({
      where: { leagueId },
      orderBy: { createdAt: 'asc' },
      take: 50,
      include: {
        fromUser: { select: { id: true, username: true } },
      },
    })
    res.json(messages)
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})

// ─── POST /:leagueId/league-chat ──────────────────────────────────────────────
// Post a message to the league-wide chat

router.post('/:leagueId/league-chat', async (req: AuthRequest, res) => {
  const { leagueId } = req.params
  const fromUserId = req.userId!
  const { text } = req.body
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    res.status(400).json({ error: 'text is required' })
    return
  }
  try {
    const message = await prisma.leagueMessage.create({
      data: { leagueId, fromUserId, text: text.trim() },
      include: {
        fromUser: { select: { id: true, username: true } },
      },
    })
    getIO().to(`league:${leagueId}`).emit('league:message', message)
    res.status(201).json(message)
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})

export default router
