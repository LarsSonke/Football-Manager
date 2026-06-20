import { create } from 'zustand'
import { api } from '../api/client'

interface User {
  id: string
  email: string
  username: string
}

interface AuthState {
  user: User | null
  token: string | null
  login: (email: string, password: string) => Promise<void>
  register: (email: string, username: string, password: string) => Promise<void>
  logout: () => void
  hydrate: () => void
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  token: localStorage.getItem('token'),

  hydrate() {
    const token = localStorage.getItem('token')
    const userRaw = localStorage.getItem('user')
    if (token && userRaw) {
      set({ token, user: JSON.parse(userRaw) })
    }
  },

  async login(email, password) {
    const { data } = await api.post('/auth/login', { email, password })
    localStorage.setItem('token', data.token)
    localStorage.setItem('user', JSON.stringify(data.user))
    set({ user: data.user, token: data.token })
  },

  async register(email, username, password) {
    const { data } = await api.post('/auth/register', { email, username, password })
    localStorage.setItem('token', data.token)
    localStorage.setItem('user', JSON.stringify(data.user))
    set({ user: data.user, token: data.token })
  },

  logout() {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    set({ user: null, token: null })
  },
}))
