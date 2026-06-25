import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Link } from 'react-router-dom';
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
      <div
      // style={{
      //   position: 'fixed',
      //   inset: 0,
      //   pointerEvents: 'none',
      //   opacity: 0.05,
      //   backgroundImage: `url("data:image/svg+xml,%3Csvg width='900' height='600' viewBox='0 0 900 600' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' stroke='white' stroke-width='5' stroke-linecap='round' stroke-linejoin='round' opacity='.9'%3E%3Crect x='45' y='35' width='810' height='530'/%3E%3Cline x1='450' y1='35' x2='450' y2='565'/%3E%3Ccircle cx='450' cy='300' r='58'/%3E%3Crect x='45' y='200' width='105' height='200'/%3E%3Crect x='750' y='200' width='105' height='200'/%3E%3C/g%3E%3Cg fill='none' stroke='white' stroke-width='7' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='230' cy='170' r='15'/%3E%3Ccircle cx='300' cy='275' r='15'/%3E%3Ccircle cx='260' cy='420' r='15'/%3E%3Ccircle cx='585' cy='170' r='15'/%3E%3Ccircle cx='640' cy='300' r='15'/%3E%3Ccircle cx='600' cy='430' r='15'/%3E%3Cpath d='M190 155 L215 180 M215 155 L190 180'/%3E%3Cpath d='M350 205 L375 230 M375 205 L350 230'/%3E%3Cpath d='M540 250 L565 275 M565 250 L540 275'/%3E%3Cpath d='M710 200 L735 225 M735 200 L710 225'/%3E%3Cpath d='M685 390 L710 415 M710 390 L685 415'/%3E%3Cpath d='M205 330 L230 355 M230 330 L205 355'/%3E%3C/g%3E%3Cg fill='none' stroke='white' stroke-width='6' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M250 120 C330 105 380 115 430 90'/%3E%3Cpath d='M430 90 L405 78 M430 90 L410 112'/%3E%3Cpath d='M330 180 C370 220 360 270 320 310'/%3E%3Cpath d='M320 310 L325 280 M320 310 L350 300'/%3E%3Cpath d='M620 205 C570 230 540 270 530 330'/%3E%3Cpath d='M530 330 L555 312 M530 330 L525 300'/%3E%3Cpath d='M650 370 C600 395 550 425 490 410'/%3E%3Cpath d='M490 410 L515 392 M490 410 L518 428'/%3E%3Cpath d='M170 260 C140 275 120 295 95 315'/%3E%3Cpath d='M95 315 L125 312 M95 315 L110 290'/%3E%3C/g%3E%3C/svg%3E")`,
      //   backgroundSize: '100% 100%',
      //   backgroundPosition: 'center',
      //   backgroundRepeat: 'no-repeat',
      // }}
      />

      <img src="/tactixlogo.png" alt="Club logo" className="club-logo" />

      <div style={{ width: '100%', maxWidth: 420, position: 'relative', animation: 'mgSlam .5s cubic-bezier(.2,.8,.3,1) both' }}>

        {/* Logo */}
        {/* <div style={{ marginBottom: 28, animation: 'mgInL .45s .05s both' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 38, letterSpacing: '-.01em' }}>FOOTBALL</span>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 38, color: 'var(--accent)', transform: 'skewX(-10deg)', margin: '0 6px 0 10px' }}>//</span>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 38, letterSpacing: '-.01em' }}>MGR</span>
          </div>
          <div style={{ fontFamily: 'var(--font-narrow)', fontSize: 11, letterSpacing: '.22em', textTransform: 'uppercase', color: 'var(--ash)', marginTop: 4 }}>
            Build your squad. Beat your friends.
          </div>
        </div> */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <Link to="/">
            <img
              src="/tactixlogowhite.png"
              alt="Tactix Football Manager"
            />
          </Link>
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
