import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../stores/auth.store'

interface NavbarProps {
  backTo?: string
  backLabel?: string
  children?: ReactNode
}

export function Navbar({ backTo, backLabel, children }: NavbarProps) {
  const { user } = useAuth()
  return (
    <nav className="nav">
      {backTo && (
        <Link to={backTo} className="btn btn-outline" style={{ fontSize: 11, padding: '5px 14px' }}>
          ← {backLabel ?? 'Back'}
        </Link>
      )}
      <Link to="/" className="nav-logo">
        <img src="/tactixlogo.png" alt="Tactix" style={{ height: 32, display: 'block' }} />
      </Link>
      <div className="nav-spacer" />
      {user && <span className="nav-user">{user.username}</span>}
      {children}
    </nav>
  )
}
