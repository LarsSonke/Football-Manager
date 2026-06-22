import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../stores/auth.store'
import { api } from '../api/client'

interface LeagueEntry {
  id: string
  name: string
  budget: number
  league: {
    id: string
    name: string
    status: string
    currentDay: number
    seasonLength: number
    maxClubs: number
  }
}

interface CreateForm {
  name: string
  startingBudget: number
  maxClubs: number
  seasonLength: number
  squadSize: number
}

const STATUS_BADGE: Record<string, string> = {
  SETUP: 'badge-setup',
  DRAFTING: 'badge-drafting',
  ACTIVE: 'badge-active',
  FINISHED: 'badge-finished',
}

const STATUS_LABEL: Record<string, string> = {
  SETUP: 'Setup',
  DRAFTING: 'Drafting',
  ACTIVE: 'Live',
  FINISHED: 'Finished',
}

export default function Dashboard() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [leagues, setLeagues] = useState<LeagueEntry[]>([])
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [panel, setPanel] = useState<'none' | 'create' | 'join'>(() => {
    const inv = new URLSearchParams(window.location.search).get('join')
    return inv ? 'join' : 'none'
  })
  const [joinId, setJoinId] = useState(() => new URLSearchParams(window.location.search).get('join') ?? '')
  const [joinName, setJoinName] = useState('')
  const [form, setForm] = useState<CreateForm>({
    name: '',
    startingBudget: 100000,
    maxClubs: 18,
    seasonLength: 34,
    squadSize: 25,
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    api.get('/leagues/mine').then((r) => setLeagues(r.data))
  }, [])

  async function createLeague() {
    setError('')
    setLoading(true)
    try {
      await api.post('/leagues', form)
      const r = await api.get('/leagues/mine')
      setLeagues(r.data)
      setPanel('none')
      setForm({ name: '', startingBudget: 100000, maxClubs: 18, seasonLength: 34, squadSize: 25 })
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Failed to create league')
    } finally {
      setLoading(false)
    }
  }

  async function joinLeague() {
    setError('')
    setLoading(true)
    const raw = joinId.trim()
    const leagueId = raw.startsWith('http')
      ? (new URL(raw).searchParams.get('join') ?? raw.split('/').pop() ?? raw)
      : raw
    try {
      await api.post(`/leagues/${leagueId}/join`, { clubName: joinName })
      const r = await api.get('/leagues/mine')
      setLeagues(r.data)
      setPanel('none')
      setJoinId('')
      setJoinName('')
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Failed to join league')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      {/* Nav */}
      <nav className="nav">
        <Link to="/" className="nav-logo">
          <img src="/logo.png" alt="Football Manager" style={{ height: 32, display: 'block' }} />
        </Link>
        <div className="nav-spacer" />
        <span className="nav-user">{user?.username}</span>
        <button className="btn btn-outline" onClick={logout} style={{ fontSize: 12, padding: '6px 12px' }}>
          Sign out
        </button>
      </nav>

      <div className="page">
        {/* Header row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 30, fontWeight: 800, letterSpacing: 0.5 }}>
              MY LEAGUES
            </h1>
            <p style={{ color: 'var(--text-2)', fontSize: 13, marginTop: 3 }}>
              {leagues.length === 0 ? 'No leagues yet — create one or join a friend\'s' : `${leagues.length} league${leagues.length > 1 ? 's' : ''}`}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost" onClick={() => setPanel(panel === 'join' ? 'none' : 'join')}>
              Join League
            </button>
            <button className="btn btn-green" onClick={() => setPanel(panel === 'create' ? 'none' : 'create')}>
              + New League
            </button>
          </div>
        </div>

        {error && <p className="error-text" style={{ marginBottom: 16 }}>{error}</p>}

        {/* Create panel */}
        {panel === 'create' && (
          <div className="card" style={{ marginBottom: 24, padding: 0 }}>
            <div className="card-header">
              <span className="accent-bar" />
              <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Create League</span>
            </div>
            <div style={{ padding: 24 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>
                  League name
                </label>
                <input
                  placeholder="e.g. Friday Night League"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>

              <div>
                <label style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>
                  Starting budget
                </label>
                <div style={{ color: 'var(--green)', fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, marginBottom: 6 }}>
                  €{(form.startingBudget / 1000).toFixed(0)}M
                </div>
                <input type="range" min={10000} max={500000} step={10000}
                  value={form.startingBudget}
                  onChange={(e) => setForm({ ...form, startingBudget: Number(e.target.value) })}
                  style={{ padding: 0, height: 4, background: 'none', border: 'none', boxShadow: 'none', cursor: 'pointer' }}
                />
              </div>

              <div>
                <label style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>
                  Clubs
                </label>
                <div style={{ color: 'var(--text-1)', fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, marginBottom: 6 }}>
                  {form.maxClubs} clubs
                </div>
                <input type="range" min={2} max={18} step={2}
                  value={form.maxClubs}
                  onChange={(e) => setForm({ ...form, maxClubs: Number(e.target.value) })}
                  style={{ padding: 0, height: 4, background: 'none', border: 'none', boxShadow: 'none', cursor: 'pointer' }}
                />
              </div>

              <div>
                <label style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>
                  Season length
                </label>
                <div style={{ color: 'var(--text-1)', fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, marginBottom: 6 }}>
                  {form.seasonLength} days
                </div>
                <input type="range" min={10} max={40} step={2}
                  value={form.seasonLength}
                  onChange={(e) => setForm({ ...form, seasonLength: Number(e.target.value) })}
                  style={{ padding: 0, height: 4, background: 'none', border: 'none', boxShadow: 'none', cursor: 'pointer' }}
                />
              </div>

              <div>
                <label style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>
                  Squad size
                </label>
                <div style={{ color: 'var(--text-1)', fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, marginBottom: 6 }}>
                  {form.squadSize} players
                </div>
                <input type="range" min={11} max={30} step={1}
                  value={form.squadSize}
                  onChange={(e) => setForm({ ...form, squadSize: Number(e.target.value) })}
                  style={{ padding: 0, height: 4, background: 'none', border: 'none', boxShadow: 'none', cursor: 'pointer' }}
                />
              </div>

              <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
                <button className="btn btn-outline" onClick={() => setPanel('none')}>Cancel</button>
                <button className="btn btn-green" onClick={createLeague} disabled={loading || !form.name}>
                  {loading ? 'Creating...' : 'Create League'}
                </button>
              </div>
            </div>
            </div>
          </div>
        )}

        {/* Join panel */}
        {panel === 'join' && (
          <div className="card" style={{ marginBottom: 24, padding: 0 }}>
            <div className="card-header">
              <span className="accent-bar" />
              <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Join League</span>
            </div>
            <div style={{ padding: 24 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>
                  Invite link or League ID
                </label>
                <input placeholder="Paste the invite link or league ID" value={joinId} onChange={(e) => setJoinId(e.target.value)} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>
                  Your club name
                </label>
                <input placeholder="e.g. Lars United" value={joinName} onChange={(e) => setJoinName(e.target.value)} />
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="btn btn-outline" onClick={() => setPanel('none')}>Cancel</button>
                <button className="btn btn-green" onClick={joinLeague} disabled={loading || !joinId || !joinName}>
                  {loading ? 'Joining...' : 'Join'}
                </button>
              </div>
            </div>
            </div>
          </div>
        )}

        {/* League cards */}
        {leagues.length === 0 && panel === 'none' && (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-2)' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🏟️</div>
            <p style={{ fontSize: 16, fontWeight: 500 }}>No leagues yet</p>
            <p style={{ fontSize: 13, marginTop: 6 }}>Create a league and invite your friends to join</p>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {leagues.map((entry) => {
            const progress = entry.league.seasonLength > 0
              ? (entry.league.currentDay / entry.league.seasonLength) * 100
              : 0

            return (
              <div
                key={entry.id}
                onClick={() => navigate(`/league/${entry.league.id}`)}
                className="card"
                style={{ padding: '18px 22px', cursor: 'pointer', transition: 'border-color 0.15s, background 0.15s' }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border-md)'; (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-card-2)' }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(255,255,255,0.07)'; (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-card)' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                      <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, letterSpacing: 0.3 }}>
                        {entry.league.name}
                      </span>
                      <span className={`badge ${STATUS_BADGE[entry.league.status]}`}>
                        {STATUS_LABEL[entry.league.status]}
                      </span>
                    </div>
                    <div style={{ color: 'var(--text-2)', fontSize: 12, display: 'flex', gap: 14 }}>
                      <span>🏟 {entry.name}</span>
                      <span>💰 €{(entry.budget / 1000).toFixed(0)}M remaining</span>
                      {(entry.league.status === 'ACTIVE' || entry.league.status === 'FINISHED') && (
                        <span>📅 Day {entry.league.currentDay}/{entry.league.seasonLength}</span>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {entry.league.status === 'SETUP' && (
                      <button
                        onClick={e => {
                          e.stopPropagation()
                          const link = `${window.location.origin}/?join=${entry.league.id}`
                          navigator.clipboard.writeText(link).then(() => {
                            setCopiedId(entry.league.id)
                            setTimeout(() => setCopiedId(null), 2000)
                          })
                        }}
                        style={{ fontSize: 11, padding: '4px 10px', background: 'rgba(39,205,255,0.1)', border: '1px solid rgba(39,205,255,0.3)', borderRadius: 6, color: copiedId === entry.league.id ? 'var(--green)' : 'var(--cyan)', cursor: 'pointer', fontWeight: 700, whiteSpace: 'nowrap' }}
                      >
                        {copiedId === entry.league.id ? '✓ Copied!' : 'Copy Invite'}
                      </button>
                    )}
                    <span style={{ color: 'var(--text-3)', fontSize: 18 }}>›</span>
                  </div>
                </div>

                {/* Season progress bar */}
                {entry.league.status === 'ACTIVE' && (
                  <div style={{ marginTop: 12 }}>
                    <div className="stat-bar-wrap">
                      <div className="stat-bar-fill" style={{ width: `${progress}%`, background: 'var(--green)' }} />
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
