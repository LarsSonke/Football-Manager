import { create } from 'zustand'

export interface AppNotification {
  id: string
  type: 'outbid' | 'injury' | 'won' | 'info'
  title: string
  body: string
  timestamp: number
  leagueId?: string
  auctionId?: string
  read: boolean
}

interface NotificationsStore {
  notifications: AppNotification[]
  add: (n: Omit<AppNotification, 'id' | 'timestamp' | 'read'>) => void
  dismiss: (id: string) => void
  markAllRead: () => void
  clearAll: () => void
}

export const useNotifications = create<NotificationsStore>((set) => ({
  notifications: [],

  add(n) {
    set(state => ({
      notifications: [
        { ...n, id: Math.random().toString(36).slice(2), timestamp: Date.now(), read: false },
        ...state.notifications,
      ].slice(0, 50),
    }))
  },

  dismiss(id) {
    set(state => ({ notifications: state.notifications.filter(n => n.id !== id) }))
  },

  markAllRead() {
    set(state => ({ notifications: state.notifications.map(n => ({ ...n, read: true })) }))
  },

  clearAll() {
    set({ notifications: [] })
  },
}))
