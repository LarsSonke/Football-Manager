import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../stores/auth.store'

export default function Login() {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const { login, register } = useAuth()
  const navigate = useNavigate()

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      if (mode === 'login') {
        await login(email, password)
      } else {
        await register(email, username, password)
      }
      navigate('/dashboard')
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
      background: 'radial-gradient(ellipse at 50% 0%, #0d2a1a 0%, var(--bg-base) 60%)',
    }}>
      {/* Pitch lines decoration */}
      <div style={{
        position: 'fixed', inset: 0, pointerEvents: 'none', overflow: 'hidden', opacity: 0.04,
      }}>
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 340, height: 340, border: '2px solid #fff', borderRadius: '50%' }} />
        <div style={{ position: 'absolute', top: 0, bottom: 0, left: '50%', width: 2, background: '#fff' }} />
        <div style={{ position: 'absolute', inset: 40, border: '2px solid #fff' }} />
      </div>

      <div style={{ width: '100%', maxWidth: 400, position: 'relative' }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>⚽</div>
          <div style={{
            fontFamily: 'var(--font-display)', fontSize: 36, fontWeight: 800,
            letterSpacing: 1, color: 'var(--text-1)',
          }}>
            FOOTBALL<span style={{ color: 'var(--green)' }}>MGR</span>
          </div>
          <div style={{ color: 'var(--text-2)', fontSize: 13, marginTop: 4 }}>
            Build your squad. Beat your friends.
          </div>
        </div>

        {/* Card */}
        <div className="card" style={{ padding: 28 }}>
          {/* Mode toggle */}
          <div style={{ display: 'flex', background: 'var(--bg-base)', borderRadius: 6, padding: 4, marginBottom: 24, gap: 4 }}>
            {(['login', 'register'] as const).map((m) => (
              <button
                key={m}
                onClick={() => { setMode(m); setError('') }}
                style={{
                  flex: 1, padding: '8px', border: 'none', borderRadius: 4,
                  cursor: 'pointer', fontFamily: 'var(--font-body)',
                  fontSize: 13, fontWeight: 600, transition: 'all 0.15s',
                  background: mode === m ? 'var(--bg-card-2)' : 'transparent',
                  color: mode === m ? 'var(--text-1)' : 'var(--text-2)',
                  boxShadow: mode === m ? 'var(--shadow-sm)' : 'none',
                }}
              >
                {m === 'login' ? 'Sign in' : 'Create account'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />

            {mode === 'register' && (
              <input
                type="text"
                placeholder="Username (letters, numbers, _)"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoComplete="username"
              />
            )}

            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />

            {error && <p className="error-text">{error}</p>}

            <button
              type="submit"
              className="btn btn-green"
              disabled={loading}
              style={{ marginTop: 4, padding: '11px', fontSize: 14 }}
            >
              {loading ? '...' : mode === 'login' ? 'Sign in' : 'Create account'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
