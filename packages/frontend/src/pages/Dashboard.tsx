import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../stores/auth.store'
import { api } from '../api/client'
import { Navbar } from '../components/Navbar'
import styles from './Dashboard.module.css'

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
    <div className={styles.pageRoot}>
      <Navbar>
        <button className={`btn btn-outline ${styles.signOutBtn}`} onClick={logout}>
          Sign out
        </button>
      </Navbar>

      <div className="page" style={{ position: 'relative', zIndex: 1 }}>

        {/* ── Chapter header ── */}
        <div className={styles.chapterHeader}>
          <div>
            <div className={styles.chapterEyebrow}>Your Leagues</div>
            <h1 className={styles.chapterTitle}>MY LEAGUES</h1>
            <p className={styles.chapterSubtitle}>
              {leagues.length === 0
                ? 'No leagues yet — create one or invite friends'
                : `${leagues.length} league${leagues.length > 1 ? 's' : ''} active`}
            </p>
          </div>
          <span className={styles.chapterRule} />
          <div className={styles.chapterActions}>
            <button className="btn btn-ghost" onClick={() => setPanel(panel === 'join' ? 'none' : 'join')}>
              Join League
            </button>
            <button className="btn btn-green" onClick={() => setPanel(panel === 'create' ? 'none' : 'create')}>
              + New League
            </button>
          </div>
        </div>

        {error && <p className={`error-text ${styles.errorMargin}`}>{error}</p>}

        {/* ── Create panel ── */}
        {panel === 'create' && (
          <div className={styles.formPanel}>
            <div className={styles.formPanelHeader}>
              <span className={styles.formPanelTitle}>CREATE LEAGUE</span>
            </div>
            <div className={styles.formPanelBody}>
              <div className={styles.createGrid}>

                <div className={styles.fullSpan}>
                  <label className={styles.fieldLabel}>League name</label>
                  <input
                    placeholder="e.g. Friday Night League"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </div>

                <div>
                  <label className={styles.fieldLabel}>Starting budget</label>
                  <div className={styles.sliderValueAccent}>
                    €{(form.startingBudget / 1000).toFixed(0)}M
                  </div>
                  <input
                    type="range" min={10000} max={500000} step={10000}
                    value={form.startingBudget}
                    onChange={(e) => setForm({ ...form, startingBudget: Number(e.target.value) })}
                    className={styles.rangeInput}
                  />
                </div>

                <div>
                  <label className={styles.fieldLabel}>Clubs</label>
                  <div className={styles.sliderValue}>{form.maxClubs} clubs</div>
                  <input
                    type="range" min={2} max={18} step={2}
                    value={form.maxClubs}
                    onChange={(e) => setForm({ ...form, maxClubs: Number(e.target.value) })}
                    className={styles.rangeInput}
                  />
                </div>

                <div>
                  <label className={styles.fieldLabel}>Season length</label>
                  <div className={styles.sliderValue}>{form.seasonLength} days</div>
                  <input
                    type="range" min={10} max={40} step={2}
                    value={form.seasonLength}
                    onChange={(e) => setForm({ ...form, seasonLength: Number(e.target.value) })}
                    className={styles.rangeInput}
                  />
                </div>

                <div>
                  <label className={styles.fieldLabel}>Squad size</label>
                  <div className={styles.sliderValue}>{form.squadSize} players</div>
                  <input
                    type="range" min={11} max={30} step={1}
                    value={form.squadSize}
                    onChange={(e) => setForm({ ...form, squadSize: Number(e.target.value) })}
                    className={styles.rangeInput}
                  />
                </div>

                <div className={styles.fullSpan}>
                  <label className={styles.cupLabel}>
                    <input
                      type="checkbox"
                      checked={form.hasCup}
                      onChange={e => setForm({ ...form, hasCup: e.target.checked })}
                      className={styles.cupCheckbox}
                    />
                    <div>
                      <div className={styles.cupTitle}>Fantasy Cup</div>
                      <div className={styles.cupDescription}>Adds a knockout cup tournament alongside the league</div>
                    </div>
                  </label>
                </div>

                <div className={styles.fieldActions}>
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
          <div className={styles.formPanel}>
            <div className={styles.formPanelHeader}>
              <span className={styles.formPanelTitle}>JOIN LEAGUE</span>
            </div>
            <div className={styles.formPanelBody}>
              <div className={styles.joinStack}>
                <div>
                  <label className={styles.fieldLabel}>Invite link or League ID</label>
                  <input placeholder="Paste the invite link or league ID" value={joinId} onChange={(e) => setJoinId(e.target.value)} />
                </div>
                <div>
                  <label className={styles.fieldLabel}>Your club name</label>
                  <input placeholder="e.g. Lars United" value={joinName} onChange={(e) => setJoinName(e.target.value)} />
                </div>
                <div className={styles.joinActions}>
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
          <div className={styles.emptyState}>
            <div className={styles.emptyGhost}>FM</div>
            <p className={styles.emptyTitle}>NO LEAGUES YET</p>
            <p className={styles.emptySubtitle}>Create a league and invite your friends to join</p>
          </div>
        )}

        {/* ── League cards ── */}
        <div className={styles.leagueList}>
          {leagues.map((entry, i) => {
            const progress = entry.league.seasonLength > 0
              ? (entry.league.currentDay / entry.league.seasonLength) * 100
              : 0

            return (
              <div
                key={entry.id}
                onClick={() => navigate(`/league/${entry.league.id}`)}
                className={styles.leagueCard}
                style={{ animation: `mgUp .4s ${(i * 0.06).toFixed(2)}s both` }}
              >
                {/* ghost rank number */}
                <div className={styles.ghostRank}>
                  {String(i + 1).padStart(2, '0')}
                </div>

                <div className={styles.cardInner}>
                  <div className={styles.cardLeft}>
                    <div className={styles.cardTitleRow}>
                      <span className={styles.leagueName}>
                        {entry.league.name.toUpperCase()}
                      </span>
                      <span className={`badge ${STATUS_BADGE[entry.league.status]}`}>
                        {STATUS_LABEL[entry.league.status]}
                      </span>
                    </div>
                    <div className={styles.cardMeta}>
                      <span>{entry.name}</span>
                      <span className={styles.metaBudget}>€{(entry.budget / 1000).toFixed(0)}M</span>
                      {(entry.league.status === 'ACTIVE' || entry.league.status === 'FINISHED') && (
                        <span>Day {entry.league.currentDay}/{entry.league.seasonLength}</span>
                      )}
                    </div>
                  </div>

                  <div className={styles.cardRight}>
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
                        className={`${styles.copyBtn} ${copiedId === entry.league.id ? styles.copyBtnCopied : ''}`}
                      >
                        {copiedId === entry.league.id ? '✓ Copied' : 'Copy Invite'}
                      </button>
                    )}
                    <span className={styles.cardChevron}>›</span>
                  </div>
                </div>

                {entry.league.status === 'ACTIVE' && (
                  <div className={styles.progressWrap}>
                    <div className={styles.progressTrack}>
                      <div className={styles.progressFill} style={{ width: `${progress}%` }} />
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
