import { useState, useRef, useEffect } from 'react'
import { Bell } from 'lucide-react'
import { useNotifications } from '../stores/notifications.store'
import styles from './NotificationBell.module.css'

const TYPE_ICON: Record<string, string> = {
  outbid: '⚡',
  injury: '🩹',
  won: '✅',
  info: 'ℹ️',
}

export function NotificationBell() {
  const { notifications, dismiss, markAllRead, clearAll } = useNotifications()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const unread = notifications.filter(n => !n.read).length

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  function handleOpen() {
    setOpen(o => !o)
    if (!open) markAllRead()
  }

  return (
    <div ref={ref} className={styles.root}>
      <button className={styles.bellBtn} onClick={handleOpen} title="Notifications">
        <Bell size={16} />
        {unread > 0 && <span className={styles.badge}>{unread > 9 ? '9+' : unread}</span>}
      </button>

      {open && (
        <div className={styles.dropdown}>
          <div className={styles.dropdownHeader}>
            <span className={styles.dropdownTitle}>Notifications</span>
            {notifications.length > 0 && (
              <button className={styles.clearBtn} onClick={clearAll}>Clear all</button>
            )}
          </div>

          {notifications.length === 0 ? (
            <div className={styles.empty}>No notifications</div>
          ) : (
            <div className={styles.list}>
              {notifications.map(n => (
                <div key={n.id} className={styles.item} data-type={n.type}>
                  <span className={styles.itemIcon}>{TYPE_ICON[n.type] ?? '•'}</span>
                  <div className={styles.itemBody}>
                    <div className={styles.itemTitle}>{n.title}</div>
                    <div className={styles.itemText}>{n.body}</div>
                  </div>
                  <button className={styles.dismissBtn} onClick={() => dismiss(n.id)}>×</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
