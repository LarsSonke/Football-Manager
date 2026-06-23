import { Router } from 'express'
import { z } from 'zod'
import * as authService from '../services/auth.service'

const router = Router()

const registerSchema = z.object({
  email: z.string().email(),
  username: z.string().min(3).max(20).regex(/^[a-zA-Z0-9_]+$/, 'Letters, numbers, underscores only'),
  password: z.string().min(8),
})

const loginSchema = z.object({
  identifier: z.string().min(1).optional(),
  email: z.string().email().optional(),
  password: z.string().min(1, 'Password is required'),
}).refine((data) => Boolean(data.identifier || data.email), {
  message: 'Email or username is required',
  path: ['identifier'],
})

router.post('/register', async (req, res) => {
  const parsed = registerSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message })
    return
  }
  try {
    const result = await authService.register(
      parsed.data.email,
      parsed.data.username,
      parsed.data.password,
    )
    res.status(201).json(result)
  } catch (err: any) {
    res.status(409).json({ error: err.message })
  }
})

router.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message })
    return
  }
  try {
    const credential = parsed.data.identifier ?? parsed.data.email ?? ''
    const result = await authService.login(credential, parsed.data.password)
    res.json(result)
  } catch (err: any) {
    res.status(401).json({ error: err.message })
  }
})

export default router
