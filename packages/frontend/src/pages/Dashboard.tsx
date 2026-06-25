import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../stores/auth.store'
import { api } from '../api/client'
import { Navbar } from '../components/Navbar'

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
  hasCup: boolean
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

const LABEL: CSSProperties = {
  fontFamily: 'var(--font-narrow)',
  fontSize: 10,
  color: 'var(--text-2)',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.14em',
  display: 'block',
  marginBottom: 6,
}

export default function Dashboard() {
  const { logout } = useAuth()
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
    hasCup: false,
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
      setForm({ name: '', startingBudget: 100000, maxClubs: 18, seasonLength: 34, squadSize: 25, hasCup: false })
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
    <div style={{ position: 'relative' }}>
      {/* Speed lines */}
      <div style={{
        // position: 'fixed', inset: 0, pointerEvents: 'none', opacity: .04, zIndex: 0,
        // background: 'repeating-conic-gradient(from 0deg at 82% 50%, #fff 0 .5deg, transparent .5deg 3.4deg)',
        // WebkitMaskImage: 'radial-gradient(ellipse 80% 80% at 82% 50%, transparent 120px, #000 420px)',
        // maskImage: 'radial-gradient(ellipse 80% 80% at 82% 50%, transparent 120px, #000 420px)',
      }} />
      <Navbar>
        <button className="btn btn-outline" onClick={logout} style={{ fontSize: 11, padding: '6px 14px' }}>
          Sign out
        </button>
      </Navbar>

      <div className="page" style={{ position: 'relative', zIndex: 1 }}>

        {/* ── Chapter header ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 28 }}>
          <div>
            <div style={{ fontFamily: 'var(--font-narrow)', fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--accent)', fontWeight: 700, marginBottom: 4 }}>
              Your Leagues
            </div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 42, fontWeight: 400, letterSpacing: '.01em', lineHeight: 0.88 }}>
              MY LEAGUES
            </h1>
            <p style={{ color: 'var(--text-2)', fontSize: 12, marginTop: 8, fontFamily: 'var(--font-narrow)', letterSpacing: '.06em' }}>
              {leagues.length === 0 ? 'No leagues yet — create one or invite friends' : `${leagues.length} league${leagues.length > 1 ? 's' : ''} active`}
            </p>
          </div>
          <span style={{ flex: 1, height: 2, background: 'var(--paper)', marginTop: 14 }} />
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button className="btn btn-ghost" onClick={() => setPanel(panel === 'join' ? 'none' : 'join')}>
              Join League
            </button>
            <button className="btn btn-green" onClick={() => setPanel(panel === 'create' ? 'none' : 'create')}>
              + New League
            </button>
          </div>
        </div>

        {error && <p className="error-text" style={{ marginBottom: 16 }}>{error}</p>}

        {/* ── Create panel ── */}
        {panel === 'create' && (
          <div style={{ border: '3px solid var(--paper)', background: 'var(--steel)', marginBottom: 24 }}>
            <div style={{ background: 'var(--ink)', borderBottom: '3px solid var(--paper)', padding: '10px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, letterSpacing: '.02em' }}>CREATE LEAGUE</span>
            </div>
            <div style={{ padding: 24 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>

                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={LABEL}>League name</label>
                  <input
                    placeholder="e.g. Friday Night League"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </div>

                <div>
                  <label style={LABEL}>Starting budget</label>
                  <div style={{ color: 'var(--accent)', fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 400, marginBottom: 8, lineHeight: 1 }}>
                    €{(form.startingBudget / 1000).toFixed(0)}M
                  </div>
                  <input type="range" min={10000} max={500000} step={10000}
                    value={form.startingBudget}
                    onChange={(e) => setForm({ ...form, startingBudget: Number(e.target.value) })}
                    style={{ padding: 0, height: 4, background: 'none', border: 'none', boxShadow: 'none', cursor: 'pointer' }}
                  />
                </div>

                <div>
                  <label style={LABEL}>Clubs</label>
                  <div style={{ color: 'var(--text-1)', fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 400, marginBottom: 8, lineHeight: 1 }}>
                    {form.maxClubs} clubs
                  </div>
                  <input type="range" min={2} max={18} step={2}
                    value={form.maxClubs}
                    onChange={(e) => setForm({ ...form, maxClubs: Number(e.target.value) })}
                    style={{ padding: 0, height: 4, background: 'none', border: 'none', boxShadow: 'none', cursor: 'pointer' }}
                  />
                </div>

                <div>
                  <label style={LABEL}>Season length</label>
                  <div style={{ color: 'var(--text-1)', fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 400, marginBottom: 8, lineHeight: 1 }}>
                    {form.seasonLength} days
                  </div>
                  <input type="range" min={10} max={40} step={2}
                    value={form.seasonLength}
                    onChange={(e) => setForm({ ...form, seasonLength: Number(e.target.value) })}
                    style={{ padding: 0, height: 4, background: 'none', border: 'none', boxShadow: 'none', cursor: 'pointer' }}
                  />
                </div>

                <div>
                  <label style={LABEL}>Squad size</label>
                  <div style={{ color: 'var(--text-1)', fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 400, marginBottom: 8, lineHeight: 1 }}>
                    {form.squadSize} players
                  </div>
                  <input type="range" min={11} max={30} step={1}
                    value={form.squadSize}
                    onChange={(e) => setForm({ ...form, squadSize: Number(e.target.value) })}
                    style={{ padding: 0, height: 4, background: 'none', border: 'none', boxShadow: 'none', cursor: 'pointer' }}
                  />
                </div>

                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none' }}>
                    <input type="checkbox" checked={form.hasCup} onChange={e => setForm({ ...form, hasCup: e.target.checked })}
                      style={{ width: 16, height: 16, cursor: 'pointer', accentColor: 'var(--accent)' }} />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-narrow)', letterSpacing: '.08em', textTransform: 'uppercase' }}>Fantasy Cup</div>
                      <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 2 }}>Adds a knockout cup tournament alongside the league</div>
                    </div>
                  </label>
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

        {/* ── Join panel ── */}
        {panel === 'join' && (
          <div style={{ border: '3px solid var(--paper)', background: 'var(--steel)', marginBottom: 24 }}>
            <div style={{ background: 'var(--ink)', borderBottom: '3px solid var(--paper)', padding: '10px 18px' }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, letterSpacing: '.02em' }}>JOIN LEAGUE</span>
            </div>
            <div style={{ padding: 24 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={LABEL}>Invite link or League ID</label>
                  <input placeholder="Paste the invite link or league ID" value={joinId} onChange={(e) => setJoinId(e.target.value)} />
                </div>
                <div>
                  <label style={LABEL}>Your club name</label>
                  <input placeholder="e.g. Lars United" value={joinName} onChange={(e) => setJoinName(e.target.value)} />
                </div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button className="btn btn-outline" onClick={() => setPanel('none')}>Cancel</button>
                  <button className="btn btn-green" onClick={joinLeague} disabled={loading || !joinId || !joinName}>
                    {loading ? 'Joining...' : 'Join League'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Empty state ── */}
        {leagues.length === 0 && panel === 'none' && (
          <div style={{ border: '3px solid var(--paper)', padding: '60px 0', textAlign: 'center', color: 'var(--text-2)', background: 'var(--steel)' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 64, lineHeight: 1, color: 'rgba(244,241,234,0.06)', marginBottom: 12 }}>FM</div>
            <p style={{ fontFamily: 'var(--font-display)', fontSize: 20, color: 'var(--text-1)' }}>NO LEAGUES YET</p>
            <p style={{ fontSize: 13, marginTop: 8, fontFamily: 'var(--font-narrow)', letterSpacing: '.06em' }}>Create a league and invite your friends to join</p>
          </div>
        )}

        {/* ── League cards ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {leagues.map((entry, i) => {
            const progress = entry.league.seasonLength > 0
              ? (entry.league.currentDay / entry.league.seasonLength) * 100
              : 0

            return (
              <div
                key={entry.id}
                onClick={() => navigate(`/league/${entry.league.id}`)}
                style={{
                  border: '3px solid rgba(244,241,234,0.1)',
                  background: 'var(--steel)',
                  padding: '18px 22px',
                  cursor: 'pointer',
                  transition: 'border-color .15s, background .15s',
                  animation: `mgUp .4s ${(i * 0.06).toFixed(2)}s both`,
                  position: 'relative',
                  overflow: 'hidden',
                }}
                onMouseEnter={e => {
                  const el = e.currentTarget as HTMLDivElement
                  el.style.borderColor = 'var(--paper)'
                  el.style.background = '#1c1c22'
                }}
                onMouseLeave={e => {
                  const el = e.currentTarget as HTMLDivElement
                  el.style.borderColor = 'rgba(244,241,234,0.1)'
                  el.style.background = 'var(--steel)'
                }}
              >
                {/* ghost rank number */}
                <div style={{ position: 'absolute', right: -8, top: -10, fontFamily: 'var(--font-display)', fontSize: 100, lineHeight: 1, color: 'rgba(244,241,234,0.04)', pointerEvents: 'none', userSelect: 'none' }}>
                  {String(i + 1).padStart(2, '0')}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                      <span style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 400, letterSpacing: '.01em', lineHeight: 1 }}>
                        {entry.league.name.toUpperCase()}
                      </span>
                      <span className={`badge ${STATUS_BADGE[entry.league.status]}`}>
                        {STATUS_LABEL[entry.league.status]}
                      </span>
                    </div>
                    <div style={{ fontFamily: 'var(--font-narrow)', color: 'var(--text-2)', fontSize: 12, display: 'flex', gap: 18, letterSpacing: '.08em', textTransform: 'uppercase' }}>
                      <span>{entry.name}</span>
                      <span style={{ color: 'var(--accent)' }}>€{(entry.budget / 1000).toFixed(0)}M</span>
                      {(entry.league.status === 'ACTIVE' || entry.league.status === 'FINISHED') && (
                        <span>Day {entry.league.currentDay}/{entry.league.seasonLength}</span>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
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
                        style={{
                          fontFamily: 'var(--font-narrow)',
                          fontSize: 11, padding: '5px 14px',
                          background: copiedId === entry.league.id ? 'var(--paper)' : 'transparent',
                          border: `2px solid ${copiedId === entry.league.id ? 'var(--paper)' : 'rgba(244,241,234,0.4)'}`,
                          color: copiedId === entry.league.id ? 'var(--ink)' : 'var(--paper)',
                          cursor: 'pointer', fontWeight: 700, whiteSpace: 'nowrap',
                          letterSpacing: '.12em', textTransform: 'uppercase',
                          transition: 'all .15s',
                        }}
                      >
                        {copiedId === entry.league.id ? '✓ Copied' : 'Copy Invite'}
                      </button>
                    )}
                    <span style={{ fontFamily: 'var(--font-display)', color: 'var(--text-3)', fontSize: 22, lineHeight: 1 }}>›</span>
                  </div>
                </div>

                {entry.league.status === 'ACTIVE' && (
                  <div style={{ marginTop: 14 }}>
                    <div style={{ height: 3, background: 'rgba(244,241,234,0.08)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${progress}%`, background: 'var(--accent)', transformOrigin: 'left', animation: 'mgGrow .8s .2s cubic-bezier(.2,.8,.3,1) both' }} />
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
