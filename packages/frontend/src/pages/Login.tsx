import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../stores/auth.store'

export default function Login() {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [identifier, setIdentifier] = useState('')
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
        await login(identifier, password)
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
      position: 'relative',
    }}>

      {/* Speed lines emanating from center */}
      <div style={{
        position: 'fixed', inset: 0, pointerEvents: 'none', opacity: .08,
        background: 'repeating-conic-gradient(from 0deg at 50% 50%, #fff 0deg .5deg, transparent .5deg 3.4deg)',
        WebkitMaskImage: 'radial-gradient(circle at 50% 50%, transparent 100px, #000 360px)',
        maskImage: 'radial-gradient(circle at 50% 50%, transparent 100px, #000 360px)',
      }} />

      <div style={{ width: '100%', maxWidth: 420, position: 'relative', animation: 'mgSlam .5s cubic-bezier(.2,.8,.3,1) both' }}>

        {/* Logo */}
        <div style={{ marginBottom: 28, animation: 'mgInL .45s .05s both' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 38, letterSpacing: '-.01em' }}>FOOTBALL</span>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 38, color: 'var(--accent)', transform: 'skewX(-10deg)', margin: '0 6px 0 10px' }}>//</span>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 38, letterSpacing: '-.01em' }}>MGR</span>
          </div>
          <div style={{ fontFamily: 'var(--font-narrow)', fontSize: 11, letterSpacing: '.22em', textTransform: 'uppercase', color: 'var(--ash)', marginTop: 4 }}>
            Build your squad. Beat your friends.
          </div>
        </div>

        {/* Manga panel */}
        <div style={{ border: '3px solid var(--paper)', background: 'var(--steel)', overflow: 'hidden' }}>

          {/* Ink header bar */}
          <div style={{ background: 'var(--ink)', padding: '9px 20px', borderBottom: '3px solid var(--paper)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, letterSpacing: '.02em' }}>
              {mode === 'login' ? 'SIGN IN' : 'CREATE ACCOUNT'}
            </span>
            <div style={{ display: 'flex' }}>
              {(['login', 'register'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => { setMode(m); setError('') }}
                  style={{
                    padding: '4px 14px', border: 'none', cursor: 'pointer',
                    fontFamily: 'var(--font-narrow)', fontSize: 10, fontWeight: 700,
                    letterSpacing: '.18em', textTransform: 'uppercase',
                    background: mode === m ? 'var(--accent)' : 'transparent',
                    color: mode === m ? '#fff' : 'var(--ash)',
                    transition: 'all .15s',
                  }}
                >
                  {m === 'login' ? 'Sign in' : 'Register'}
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={handleSubmit} style={{ padding: '24px 20px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {mode === 'login' ? (
              <input
                type="text"
                placeholder="Email or username"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                required
                autoComplete="username"
                style={{ background: 'var(--ink)', border: '2px solid rgba(244,241,234,.2)', color: 'var(--paper)', fontFamily: 'var(--font-narrow)', fontSize: 13, letterSpacing: '.06em', borderRadius: 0 }}
              />
            ) : (
              <input
                type="email"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                style={{ background: 'var(--ink)', border: '2px solid rgba(244,241,234,.2)', color: 'var(--paper)', fontFamily: 'var(--font-narrow)', fontSize: 13, letterSpacing: '.06em', borderRadius: 0 }}
              />
            )}

            {mode === 'register' && (
              <input
                type="text"
                placeholder="Username (letters, numbers, _)"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoComplete="username"
                style={{ background: 'var(--ink)', border: '2px solid rgba(244,241,234,.2)', color: 'var(--paper)', fontFamily: 'var(--font-narrow)', fontSize: 13, letterSpacing: '.06em', borderRadius: 0 }}
              />
            )}

            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              style={{ background: 'var(--ink)', border: '2px solid rgba(244,241,234,.2)', color: 'var(--paper)', fontFamily: 'var(--font-narrow)', fontSize: 13, letterSpacing: '.06em', borderRadius: 0 }}
            />

            {error && <p className="error-text" style={{ margin: 0 }}>{error}</p>}

            <button
              type="submit"
              disabled={loading}
              style={{
                marginTop: 4, padding: '14px', border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
                background: 'var(--accent)', color: '#fff',
                clipPath: 'polygon(0 0, 100% 0, 96% 100%, 0 100%)',
                fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 900,
                letterSpacing: '.12em', textTransform: 'uppercase',
                transition: 'transform .2s', opacity: loading ? .55 : 1,
              }}
              onMouseEnter={e => { if (!loading) (e.currentTarget as HTMLButtonElement).style.transform = 'translateX(4px)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = '' }}
            >
              {loading ? '...' : mode === 'login' ? 'Sign In' : 'Create Account'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
