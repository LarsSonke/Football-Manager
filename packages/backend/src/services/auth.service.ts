import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { prisma } from '../prisma'

export async function register(email: string, username: string, password: string) {
  const existing = await prisma.user.findFirst({
    where: { OR: [{ email }, { username }] },
  })
  if (existing) {
    throw new Error(existing.email === email ? 'Email already in use' : 'Username taken')
  }

  const hashed = await bcrypt.hash(password, 12)
  const user = await prisma.user.create({
    data: { email, username, password: hashed },
    select: { id: true, email: true, username: true },
  })

  return { user, token: signToken(user.id, user.username) }
}

export async function login(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) throw new Error('Invalid credentials')

  const valid = await bcrypt.compare(password, user.password)
  if (!valid) throw new Error('Invalid credentials')

  return {
    user: { id: user.id, email: user.email, username: user.username },
    token: signToken(user.id, user.username),
  }
}

function signToken(userId: string, username: string): string {
  return jwt.sign({ userId, username }, process.env.JWT_SECRET!, { expiresIn: '7d' })
}
