import { useState } from 'react'
import { api } from '../../api/client'
import type { LeagueData, ClubData } from './types'

// ─── Types & Constants ────────────────────────────────────────────────────────

type UpgradeType = 'scout' | 'coach' | 'trainer' | 'marketing' | 'stadium' | 'training' | 'kit' | 'vip'

const UPGRADE_COSTS_PCT: Record<UpgradeType, number[]> = {
  scout:     [0.04, 0.08, 0.15],
  coach:     [0.04, 0.08, 0.15],
  trainer:   [0.04, 0.08, 0.15],
  marketing: [0.04, 0.08, 0.15],
  stadium:   [0.07, 0.14, 0.24],
  training:  [0.05, 0.10, 0.18],
  kit:       [0.02, 0.04, 0.07],
  vip:       [0.06, 0.12, 0.20],
}
const BOOST_COST_PCT = 0.025
const BOOST_STATS = ['pace', 'shooting', 'passing', 'dribbling', 'defending', 'physical'] as const

const STAFF_UPGRADES: { type: UpgradeType; label: string; icon: string; desc: (lvl: number) => string }[] = [
  { type: 'scout',     label: 'Scout',             icon: '🔍', desc: l => l === 0 ? 'Unlock scout reports' : l === 1 ? 'Shows opponent results' : l === 2 ? 'Shows formation & stats' : 'Shows likely lineup' },
  { type: 'coach',     label: 'Asst. Coach',        icon: '📋', desc: l => l === 0 ? 'Unlock coach advice' : l === 1 ? 'Formation suggestion' : l === 2 ? 'Formation + lineup tips' : 'Full tactical breakdown' },
  { type: 'trainer',   label: 'Trainer',            icon: '🏋️', desc: l => l === 0 ? 'No training boost' : l === 1 ? '+2% dev speed' : l === 2 ? '+5% dev speed' : '+10% dev speed' },
  { type: 'marketing', label: 'Marketing',          icon: '📣', desc: l => l === 0 ? 'No match bonus' : l === 1 ? '+5% match income' : l === 2 ? '+10% match income' : '+18% match income' },
]

const FACILITY_UPGRADES: { type: UpgradeType; label: string; icon: string; desc: (lvl: number) => string }[] = [
  { type: 'stadium',   label: 'Stadium',            icon: '🏟️', desc: l => l === 0 ? 'No home bonus' : l === 1 ? '+8% home income' : l === 2 ? '+15% home income' : '+25% home income' },
  { type: 'training',  label: 'Training Facility',  icon: '⚽', desc: l => l === 0 ? 'No fitness boost' : l === 1 ? '+2 fitness/day' : l === 2 ? '+4 fitness/day' : '+7 fitness/day' },
  { type: 'kit',       label: 'Kit Quality',        icon: '👕', desc: l => l === 0 ? 'No morale bonus' : l === 1 ? '+2 morale/day' : l === 2 ? '+4 morale/day' : '+6 morale/day' },
  { type: 'vip',       label: 'VIP Area',           icon: '🥂', desc: l => l === 0 ? 'No passive income' : l === 1 ? '+0.1% budget/day' : l === 2 ? '+0.2% budget/day' : '+0.4% budget/day' },
]

const UPGRADE_FIELD_MAP: Record<UpgradeType, string> = {
  scout: 'scoutLevel', coach: 'coachLevel', trainer: 'trainerLevel', marketing: 'marketingLevel',
  stadium: 'stadiumLevel', training: 'trainingLevel', kit: 'kitLevel', vip: 'vipLevel',
}

// ─── UpgradeCard ──────────────────────────────────────────────────────────────

function UpgradeCard({ label, icon, currentLevel, type, desc, startingBudget, budget, leagueId, onUpgraded }: {
  label: string; icon: string; currentLevel: number; type: UpgradeType
  desc: (lvl: number) => string; startingBudget: number; budget: number
  leagueId: string; onUpgraded: (type: UpgradeType, newLevel: number, newBudget: number) => void
}) {
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const maxed = currentLevel >= 3
  const costPct = maxed ? 0 : UPGRADE_COSTS_PCT[type][currentLevel]
  const cost = Math.round(startingBudget * costPct)
  const canAfford = budget >= cost

  async function handleUpgrade() {
    setLoading(true); setErr('')
    try {
      const r = await api.post(`/leagues/${leagueId}/upgrade`, { type })
      onUpgraded(type, r.data[UPGRADE_FIELD_MAP[type]], r.data.budget)
    } catch (e: any) { setErr(e.response?.data?.error ?? 'Upgrade failed') }
    finally { setLoading(false) }
  }

  return (
    <div style={{ background: 'var(--bg-card)', border: `1px solid ${maxed ? 'rgba(54,226,126,0.25)' : 'var(--border)'}`, borderRadius: 'var(--radius)', padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <span style={{ fontSize: 24 }}>{icon}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-1)' }}>{label}</div>
          <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 1 }}>{desc(currentLevel)}</div>
        </div>
        <div style={{ display: 'flex', gap: 3 }}>
          {[1,2,3].map(i => (
            <div key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: i <= currentLevel ? 'var(--green)' : 'rgba(255,255,255,0.12)' }} />
          ))}
        </div>
      </div>
      {err && <div style={{ fontSize: 11, color: 'var(--red)', marginBottom: 6 }}>{err}</div>}
      {!maxed ? (
        <button
          className="btn btn-green"
          style={{ width: '100%', fontSize: 11, padding: '7px 0', opacity: canAfford ? 1 : 0.5 }}
          onClick={handleUpgrade}
          disabled={loading || !canAfford}
        >
          {loading ? '...' : `Upgrade → L${currentLevel + 1}  (€${(cost / 1000).toFixed(1)}k)`}
        </button>
      ) : (
        <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--green)', fontWeight: 700, padding: '6px 0' }}>MAX LEVEL</div>
      )}
    </div>
  )
}

// ─── Management ───────────────────────────────────────────────────────────────

export default function Management({ league, myClub, isCreator, onRefresh }: {
  league: LeagueData; myClub: ClubData; isCreator: boolean; onRefresh: () => void
}) {
  const [upgradeMsg, setUpgradeMsg] = useState('')
  const [boostMsg, setBoostMsg] = useState('')
  const [boostLoading, setBoostLoading] = useState<string | null>(null)
  const [scoutClubId, setScoutClubId] = useState('')
  const [scoutReport, setScoutReport] = useState<object | null>(null)
  const [scoutLoading, setScoutLoading] = useState(false)
  const [coachAdvice, setCoachAdvice] = useState<object | null>(null)
  const [coachLoading, setCoachLoading] = useState(false)
  const [windowLoading, setWindowLoading] = useState(false)
  const [windowMsg, setWindowMsg] = useState('')
  const [clubLevels, setClubLevels] = useState({
    scoutLevel: myClub.scoutLevel,
    coachLevel: myClub.coachLevel,
    trainerLevel: myClub.trainerLevel,
    marketingLevel: myClub.marketingLevel,
    stadiumLevel: myClub.stadiumLevel,
    trainingLevel: myClub.trainingLevel,
    kitLevel: myClub.kitLevel,
    vipLevel: myClub.vipLevel,
  })
  const [budget, setBudget] = useState(myClub.budget)

  function handleUpgraded(type: UpgradeType, newLevel: number, newBudget: number) {
    const field = UPGRADE_FIELD_MAP[type] as keyof typeof clubLevels
    setClubLevels(prev => ({ ...prev, [field]: newLevel }))
    setBudget(newBudget)
    setUpgradeMsg(`${type} upgraded to level ${newLevel}!`)
    setTimeout(() => setUpgradeMsg(''), 3000)
    onRefresh()
  }

  async function handleBoost(instanceId: string, stat: string) {
    setBoostLoading(instanceId + stat)
    setBoostMsg('')
    try {
      await api.post(`/leagues/${league.id}/boost`, { instanceId, stat })
      setBoostMsg(`Boost applied!`)
      setTimeout(() => setBoostMsg(''), 3000)
      onRefresh()
    } catch (e: any) {
      setBoostMsg(e.response?.data?.error ?? 'Boost failed')
    } finally { setBoostLoading(null) }
  }

  async function handleScoutReport() {
    if (!scoutClubId) return
    setScoutLoading(true); setScoutReport(null)
    try {
      const r = await api.get(`/leagues/${league.id}/scout/${scoutClubId}`)
      setScoutReport(r.data)
    } catch (e: any) { setScoutReport({ error: e.response?.data?.error ?? 'Failed' }) }
    finally { setScoutLoading(false) }
  }

  async function handleCoachAdvice() {
    setCoachLoading(true); setCoachAdvice(null)
    try {
      const r = await api.get(`/leagues/${league.id}/coach-advice`)
      setCoachAdvice(r.data)
    } catch (e: any) { setCoachAdvice({ error: e.response?.data?.error ?? 'Failed' }) }
    finally { setCoachLoading(false) }
  }

  async function handleToggleWindow() {
    setWindowLoading(true); setWindowMsg('')
    try {
      const newOpen = !(league.transferWindowOpen ?? true)
      await api.patch(`/leagues/${league.id}/transfer-window`, { open: newOpen })
      setWindowMsg(newOpen ? 'Transfer window opened' : 'Transfer window closed')
      setTimeout(() => setWindowMsg(''), 3000)
      onRefresh()
    } catch (e: any) { setWindowMsg(e.response?.data?.error ?? 'Failed') }
    finally { setWindowLoading(false) }
  }

  const boostCost = Math.round(league.startingBudget * BOOST_COST_PCT)
  const otherClubs = league.clubs.filter(c => c.id !== myClub.id)
  const cardStyle: React.CSSProperties = { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 0, overflow: 'hidden' }
  const secLabel: React.CSSProperties = { fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: 'var(--text-2)' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 780 }}>
      {upgradeMsg && <div style={{ padding: '10px 14px', background: 'rgba(54,226,126,0.08)', border: '1px solid rgba(54,226,126,0.2)', borderRadius: 'var(--radius-sm)', fontSize: 12, color: 'var(--green)' }}>✓ {upgradeMsg}</div>}

      {/* Budget display */}
      <div style={{ padding: '12px 16px', background: 'var(--bg-card-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center', gap: 16 }}>
        <div>
          <div style={{ fontSize: 10, color: 'var(--text-2)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Available Budget</div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 800, color: 'var(--green)' }}>€{(budget / 1000).toFixed(1)}k</div>
        </div>
      </div>

      {/* Staff */}
      <div style={cardStyle}>
        <div className="card-header"><span className="accent-bar" /><span style={secLabel}>Staff</span></div>
        <div style={{ padding: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
          {STAFF_UPGRADES.map(u => (
            <UpgradeCard key={u.type}
              label={u.label} icon={u.icon}
              currentLevel={(clubLevels as any)[u.type === 'scout' ? 'scoutLevel' : u.type === 'coach' ? 'coachLevel' : u.type === 'trainer' ? 'trainerLevel' : 'marketingLevel']}
              type={u.type} desc={u.desc}
              startingBudget={league.startingBudget} budget={budget}
              leagueId={league.id} onUpgraded={handleUpgraded}
            />
          ))}
        </div>
      </div>

      {/* Facilities */}
      <div style={cardStyle}>
        <div className="card-header"><span className="accent-bar" /><span style={secLabel}>Facilities</span></div>
        <div style={{ padding: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
          {FACILITY_UPGRADES.map(u => (
            <UpgradeCard key={u.type}
              label={u.label} icon={u.icon}
              currentLevel={(clubLevels as any)[u.type === 'stadium' ? 'stadiumLevel' : u.type === 'training' ? 'trainingLevel' : u.type === 'kit' ? 'kitLevel' : 'vipLevel']}
              type={u.type} desc={u.desc}
              startingBudget={league.startingBudget} budget={budget}
              leagueId={league.id} onUpgraded={handleUpgraded}
            />
          ))}
        </div>
      </div>

      {/* Scout report */}
      {clubLevels.scoutLevel > 0 && (
        <div style={cardStyle}>
          <div className="card-header"><span className="accent-bar" /><span style={secLabel}>Scout Report</span></div>
          <div style={{ padding: 16 }}>
            <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
              <select value={scoutClubId} onChange={e => setScoutClubId(e.target.value)}
                style={{ flex: 1, padding: '8px 12px', background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-1)', fontSize: 13 }}>
                <option value="">Select opponent...</option>
                {otherClubs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <button className="btn btn-green" onClick={handleScoutReport} disabled={!scoutClubId || scoutLoading} style={{ whiteSpace: 'nowrap' }}>
                {scoutLoading ? '...' : 'Scout'}
              </button>
            </div>
            {scoutReport && (
              <div style={{ padding: 12, background: 'var(--bg-base)', borderRadius: 'var(--radius-sm)', fontSize: 12, color: 'var(--text-1)' }}>
                <pre style={{ margin: 0, fontFamily: 'inherit', whiteSpace: 'pre-wrap' }}>{JSON.stringify(scoutReport, null, 2)}</pre>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Coach advice */}
      {clubLevels.coachLevel > 0 && (
        <div style={cardStyle}>
          <div className="card-header"><span className="accent-bar" /><span style={secLabel}>Coach Advice</span></div>
          <div style={{ padding: 16 }}>
            <button className="btn btn-green" onClick={handleCoachAdvice} disabled={coachLoading} style={{ marginBottom: 12 }}>
              {coachLoading ? '...' : 'Get Advice'}
            </button>
            {coachAdvice && (
              <div style={{ padding: 12, background: 'var(--bg-base)', borderRadius: 'var(--radius-sm)', fontSize: 12, color: 'var(--text-1)' }}>
                <pre style={{ margin: 0, fontFamily: 'inherit', whiteSpace: 'pre-wrap' }}>{JSON.stringify(coachAdvice, null, 2)}</pre>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Stat boosts */}
      <div style={cardStyle}>
        <div className="card-header"><span className="accent-bar" /><span style={secLabel}>Stat Boosts · €{(boostCost / 1000).toFixed(1)}k each · 5 matchdays</span></div>
        <div style={{ padding: 16 }}>
          {boostMsg && <div style={{ marginBottom: 10, fontSize: 12, color: boostMsg.startsWith('Boost') ? 'var(--green)' : 'var(--red)' }}>{boostMsg}</div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {myClub.squad.slice().sort((a, b) => b.player.overall - a.player.overall).map(p => (
              <div key={p.id} style={{ padding: '10px 12px', background: 'var(--bg-base)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <span className={`pos ${p.player.position === 'GK' ? 'pos-gk' : ['CB','LB','RB'].includes(p.player.position) ? 'pos-def' : ['CDM','CM','CAM','LM','RM'].includes(p.player.position) ? 'pos-mid' : 'pos-att'}`} style={{ fontSize: 9, padding: '2px 5px' }}>{p.player.position}</span>
                  <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-1)' }}>{p.player.name}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-2)', marginLeft: 'auto' }}>OVR {p.player.overall}</span>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {BOOST_STATS.map(stat => {
                    const active = (p.boosts ?? []).some(b => b.stat === stat)
                    const key = p.id + stat
                    return (
                      <button key={stat}
                        onClick={() => !active && handleBoost(p.id, stat)}
                        disabled={active || boostLoading === key || budget < boostCost}
                        style={{
                          padding: '4px 10px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                          background: active ? 'rgba(54,226,126,0.15)' : 'rgba(255,255,255,0.06)',
                          border: `1px solid ${active ? 'rgba(54,226,126,0.4)' : 'var(--border)'}`,
                          color: active ? 'var(--green)' : 'var(--text-2)',
                          cursor: active ? 'default' : 'pointer',
                          opacity: !active && budget < boostCost ? 0.4 : 1,
                        }}
                      >
                        {active ? `✓ ${stat}` : boostLoading === key ? '...' : stat}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Transfer window (creator only) */}
      {isCreator && (
        <div style={{ ...cardStyle, border: '1px solid rgba(245,166,35,0.2)' }}>
          <div className="card-header" style={{ borderColor: 'rgba(245,166,35,0.15)' }}><span className="accent-bar" style={{ background: 'var(--gold)' }} /><span style={{ ...secLabel, color: 'var(--gold)' }}>Transfer Window</span></div>
          <div style={{ padding: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>
                Window is currently <span style={{ color: (league.transferWindowOpen ?? true) ? 'var(--green)' : 'var(--red)' }}>{(league.transferWindowOpen ?? true) ? 'OPEN' : 'CLOSED'}</span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 2 }}>Controls whether players can be transferred between clubs</div>
            </div>
            <button
              className="btn"
              style={{ background: (league.transferWindowOpen ?? true) ? 'rgba(232,128,106,0.15)' : 'rgba(54,226,126,0.15)', color: (league.transferWindowOpen ?? true) ? 'var(--red)' : 'var(--green)', border: `1px solid ${(league.transferWindowOpen ?? true) ? 'rgba(232,128,106,0.4)' : 'rgba(54,226,126,0.4)'}`, whiteSpace: 'nowrap' }}
              onClick={handleToggleWindow} disabled={windowLoading}
            >
              {windowLoading ? '...' : (league.transferWindowOpen ?? true) ? 'Close Window' : 'Open Window'}
            </button>
          </div>
          {windowMsg && <div style={{ padding: '0 16px 12px', fontSize: 12, color: 'var(--gold)' }}>✓ {windowMsg}</div>}
        </div>
      )}
    </div>
  )
}
