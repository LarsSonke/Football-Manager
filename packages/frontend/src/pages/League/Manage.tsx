import { useState } from 'react'
import { api } from '../../api/client'
import { ClubBadge } from '../../components/ClubBadge'
import type { LeagueData } from './types'

export default function Manage({ league, onUpdate, onDelete }: { league: LeagueData; onUpdate: (data: Partial<LeagueData>) => void; onDelete: () => void }) {
  const canEdit = league.status === 'SETUP'
  const canDelete = league.status === 'SETUP' || league.status === 'DRAFTING'
  const [name, setName] = useState(league.name)
  const [budget, setBudget] = useState(String(league.startingBudget))
  const [maxClubs, setMaxClubs] = useState(String(league.maxClubs ?? 18))
  const [seasonLength, setSeasonLength] = useState(String(league.seasonLength))
  const [matchTime, setMatchTime] = useState(league.matchTime ?? '20:00')
  const [squadSize, setSquadSize] = useState(String(league.squadSize ?? 25))
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const [kickingId, setKickingId] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [formError, setFormError] = useState('')
  const [hostMsg, setHostMsg] = useState('')
  const [hostLoading, setHostLoading] = useState<'draft' | 'matchday' | 'season' | null>(null)
  const [confirmSeason, setConfirmSeason] = useState(false)

  async function handleSave() {
    setFormError('')
    setSaving(true)
    try {
      const res = await api.patch(`/leagues/${league.id}`, { name: name.trim(), startingBudget: parseInt(budget), maxClubs: parseInt(maxClubs), seasonLength: parseInt(seasonLength), matchTime, squadSize: parseInt(squadSize) })
      onUpdate(res.data)
      setSaveMsg('Saved!')
      setTimeout(() => setSaveMsg(''), 2500)
    } catch (err: any) {
      setFormError(err.response?.data?.error ?? 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function handleKick(clubId: string) {
    setKickingId(clubId)
    try {
      await api.delete(`/leagues/${league.id}/clubs/${clubId}`)
      onUpdate({ clubs: league.clubs.filter(c => c.id !== clubId) } as any)
    } catch (err: any) {
      setFormError(err.response?.data?.error ?? 'Failed to remove club')
    } finally {
      setKickingId(null)
    }
  }

  async function handleDelete() {
    setDeleting(true)
    try {
      await api.delete(`/leagues/${league.id}`)
      onDelete()
    } catch (err: any) {
      setFormError(err.response?.data?.error ?? 'Failed to delete league')
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  const field: React.CSSProperties = { width: '100%', padding: '9px 12px', background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-1)', fontSize: 13 }
  const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 5, display: 'block' }

  async function handleQuickDraft() {
    setHostLoading('draft'); setHostMsg('')
    try {
      await api.post(`/draft/${league.id}/quick-complete`)
      setHostMsg('Draft completed! Season is starting...')
    } catch (e: any) { setHostMsg(e.response?.data?.error ?? 'Failed') }
    finally { setHostLoading(null) }
  }

  async function handleSimulateMatchday() {
    setHostLoading('matchday'); setHostMsg('')
    try {
      await api.post(`/leagues/${league.id}/simulate-matchday`)
      setHostMsg('Matchday simulation started!')
    } catch (e: any) { setHostMsg(e.response?.data?.error ?? 'Failed') }
    finally { setHostLoading(null) }
  }

  async function handleSimulateSeason() {
    setHostLoading('season'); setConfirmSeason(false); setHostMsg('')
    try {
      await api.post(`/leagues/${league.id}/simulate-season`)
      setHostMsg('Season simulation running... results will appear when done.')
    } catch (e: any) { setHostMsg(e.response?.data?.error ?? 'Failed') }
    finally { setHostLoading(null) }
  }

  return (
    <div style={{ maxWidth: 600 }}>
      {formError && <p className="error-text" style={{ marginBottom: 14 }}>{formError}</p>}

      <div className="card" style={{ marginBottom: 16, padding: 0 }}>
        <div className="card-header">
          <span className="accent-bar" />
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' }}>League Settings</span>
        </div>
        <div style={{ padding: 20 }}>
        {!canEdit && <div style={{ padding: '10px 14px', background: 'rgba(245,166,35,0.08)', border: '1px solid rgba(245,166,35,0.2)', borderRadius: 'var(--radius-sm)', marginBottom: 16, fontSize: 12, color: 'var(--gold)' }}>Settings are locked once the draft has started.</div>}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
          <div style={{ gridColumn: '1 / -1' }}><label style={lbl}>League Name</label><input style={field} value={name} onChange={e => setName(e.target.value)} disabled={!canEdit} /></div>
          <div><label style={lbl}>Starting Budget (€)</label><input style={field} type="number" value={budget} onChange={e => setBudget(e.target.value)} disabled={!canEdit} /></div>
          <div><label style={lbl}>Max Clubs</label><input style={field} type="number" min={2} max={18} value={maxClubs} onChange={e => setMaxClubs(e.target.value)} disabled={!canEdit} /></div>
          <div><label style={lbl}>Season Length</label><input style={field} type="number" min={10} max={40} value={seasonLength} onChange={e => setSeasonLength(e.target.value)} disabled={!canEdit} /></div>
          <div><label style={lbl}>Match Time (UTC)</label><input style={field} type="time" value={matchTime} onChange={e => setMatchTime(e.target.value)} disabled={!canEdit} /></div>
          <div><label style={lbl}>Squad Size (players per club)</label><input style={field} type="number" min={11} max={30} value={squadSize} onChange={e => setSquadSize(e.target.value)} disabled={!canEdit} /></div>
        </div>
        {canEdit && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button className="btn btn-green" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</button>
            {saveMsg && <span style={{ fontSize: 12, color: 'var(--green)' }}>✓ {saveMsg}</span>}
          </div>
        )}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16, padding: 0 }}>
        <div className="card-header">
          <span className="accent-bar" />
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Members ({league.clubs.filter(c => !c.isAI).length} / {league.maxClubs ?? 18})</span>
        </div>
        <div style={{ padding: 20 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {league.clubs.filter(c => !c.isAI).map((club, i) => (
            <div key={club.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'var(--bg-card-2)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
              <ClubBadge name={club.name} size={32} logoConfig={club.logoConfig} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-1)' }}>{club.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 2 }}>{club.user?.username}{i === 0 ? <span style={{ color: 'var(--gold)', fontWeight: 700, marginLeft: 6 }}>★ Creator</span> : null}</div>
              </div>
              {canEdit && i !== 0 && (
                <button className="btn btn-ghost" style={{ fontSize: 11, padding: '5px 10px', color: 'var(--red)', borderColor: 'rgba(232,128,106,0.3)' }} disabled={kickingId === club.id} onClick={() => handleKick(club.id)}>
                  {kickingId === club.id ? '...' : 'Kick'}
                </button>
              )}
            </div>
          ))}
        </div>
        </div>
      </div>

      {(league.draftSession?.status === 'ACTIVE' || league.status === 'ACTIVE') && (
        <div className="card" style={{ marginBottom: 16, padding: 0 }}>
          <div className="card-header">
            <span className="accent-bar" />
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Host Controls</span>
          </div>
          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {hostMsg && <div style={{ fontSize: 12, color: 'var(--green)', padding: '8px 12px', background: 'rgba(54,226,126,0.08)', border: '1px solid rgba(54,226,126,0.2)', borderRadius: 'var(--radius-sm)' }}>{hostMsg}</div>}

            {league.draftSession?.status === 'ACTIVE' && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>Quick Draft</div>
                  <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 2 }}>Auto-pick all remaining draft slots for every club.</div>
                </div>
                <button className="btn btn-green" style={{ whiteSpace: 'nowrap', flexShrink: 0 }} disabled={hostLoading !== null} onClick={handleQuickDraft}>
                  {hostLoading === 'draft' ? 'Drafting...' : 'Quick Draft'}
                </button>
              </div>
            )}

            {league.status === 'ACTIVE' && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>Simulate Matchday</div>
                  <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 2 }}>Immediately play the next matchday.</div>
                </div>
                <button className="btn" style={{ whiteSpace: 'nowrap', flexShrink: 0, background: 'rgba(39,205,255,0.12)', color: 'var(--cyan)', border: '1px solid rgba(39,205,255,0.3)' }} disabled={hostLoading !== null} onClick={handleSimulateMatchday}>
                  {hostLoading === 'matchday' ? 'Starting...' : 'Sim Matchday'}
                </button>
              </div>
            )}

            {league.status === 'ACTIVE' && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>Simulate Full Season</div>
                  <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 2 }}>Instantly play out all remaining matchdays.</div>
                </div>
                {!confirmSeason ? (
                  <button className="btn" style={{ whiteSpace: 'nowrap', flexShrink: 0, background: 'rgba(233,196,106,0.12)', color: 'var(--gold)', border: '1px solid rgba(233,196,106,0.3)' }} disabled={hostLoading !== null} onClick={() => setConfirmSeason(true)}>
                    Sim Full Season
                  </button>
                ) : (
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button className="btn" style={{ background: 'var(--gold)', color: '#000', border: 'none', fontSize: 12 }} disabled={hostLoading !== null} onClick={handleSimulateSeason}>
                      {hostLoading === 'season' ? 'Running...' : 'Confirm'}
                    </button>
                    <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => setConfirmSeason(false)}>Cancel</button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {canDelete && (
        <div className="card" style={{ padding: 0, border: '1px solid rgba(232,128,106,0.25)', background: 'rgba(232,128,106,0.04)', overflow: 'hidden' }}>
          <div className="card-header" style={{ background: 'rgba(232,128,106,0.06)', borderRadius: '16px 16px 0 0', borderColor: 'rgba(232,128,106,0.15)' }}>
            <span className="accent-bar" style={{ background: 'var(--red)' }} />
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--red)' }}>Danger Zone</span>
          </div>
          <div style={{ padding: 20 }}>
          {!confirmDelete ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>Delete this league</div>
                <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 2 }}>Permanently removes all data. Cannot be undone.</div>
              </div>
              <button className="btn" style={{ background: 'rgba(232,128,106,0.15)', color: 'var(--red)', border: '1px solid rgba(232,128,106,0.4)', whiteSpace: 'nowrap', flexShrink: 0 }} onClick={() => setConfirmDelete(true)}>Delete League</button>
            </div>
          ) : (
            <div style={{ padding: 14, background: 'rgba(232,128,106,0.1)', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(232,128,106,0.3)' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--red)', marginBottom: 12 }}>Delete <strong>{league.name}</strong>? This cannot be undone.</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn" style={{ background: 'var(--red)', color: '#fff', border: 'none' }} onClick={handleDelete} disabled={deleting}>{deleting ? 'Deleting...' : 'Yes, Delete Forever'}</button>
                <button className="btn btn-ghost" onClick={() => setConfirmDelete(false)}>Cancel</button>
              </div>
            </div>
          )}
          </div>
        </div>
      )}
    </div>
  )
}
