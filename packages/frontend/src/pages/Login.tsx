import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Link } from 'react-router-dom'
import { useAuth } from '../stores/auth.store'
import styles from './Login.module.css'

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
    <div className={styles.pageRoot}>
      <img src="/tactixlogo.png" alt="Club logo" className="club-logo" />

      <div className={styles.card}>

        {/* Logo */}
        <div className={styles.logoWrap}>
          <Link to="/">
            <img src="/tactixlogowhite.png" alt="Tactix Football Manager" />
          </Link>
        </div>

        {/* Manga panel */}
        <div className={styles.panel}>

          {/* Ink header bar */}
          <div className={styles.panelHeader}>
            <span className={styles.panelTitle}>
              {mode === 'login' ? 'SIGN IN' : 'CREATE ACCOUNT'}
            </span>
            <div className={styles.modeTabs}>
              {(['login', 'register'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => { setMode(m); setError('') }}
                  className={`${styles.modeTab} ${mode === m ? styles.modeTabActive : ''}`}
                >
                  {m === 'login' ? 'Sign in' : 'Register'}
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={handleSubmit} className={styles.form}>
            {mode === 'login' ? (
              <input
                type="text"
                placeholder="Email or username"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                required
                autoComplete="username"
                className={styles.input}
              />
            ) : (
              <input
                type="email"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className={styles.input}
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
                className={styles.input}
              />
            )}

            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              className={styles.input}
            />

            {error && <p className={`error-text ${styles.errorNoMargin}`}>{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className={styles.submitBtn}
            >
              {loading ? '...' : mode === 'login' ? 'Sign In' : 'Create Account'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
