import { useState } from 'react'
import type { ReactNode } from 'react'
import { Search, Clipboard, Dumbbell, Megaphone, Building2, Shirt, Wine } from 'lucide-react'
import { api } from '../../api/client'
import { BallIcon } from '../../components/icons'
import type { LeagueData, ClubData } from './types'
import styles from './Management.module.css'

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

const STAFF_UPGRADES: { type: UpgradeType; label: string; icon: ReactNode; desc: (lvl: number) => string }[] = [
  { type: 'scout',     label: 'Scout',            icon: <Search size={18} />,    desc: l => l === 0 ? 'Unlock scout reports' : l === 1 ? 'Shows opponent results' : l === 2 ? 'Shows formation & stats' : 'Shows likely lineup' },
  { type: 'coach',     label: 'Asst. Coach',      icon: <Clipboard size={18} />, desc: l => l === 0 ? 'Unlock coach advice' : l === 1 ? 'Formation suggestion' : l === 2 ? 'Formation + lineup tips' : 'Full tactical breakdown' },
  { type: 'trainer',   label: 'Trainer',          icon: <Dumbbell size={18} />,  desc: l => l === 0 ? 'No training boost' : l === 1 ? '+2% dev speed' : l === 2 ? '+5% dev speed' : '+10% dev speed' },
  { type: 'marketing', label: 'Marketing',        icon: <Megaphone size={18} />, desc: l => l === 0 ? 'No match bonus' : l === 1 ? '+5% match income' : l === 2 ? '+10% match income' : '+18% match income' },
]

const FACILITY_UPGRADES: { type: UpgradeType; label: string; icon: ReactNode; desc: (lvl: number) => string }[] = [
  { type: 'stadium',   label: 'Stadium',           icon: <Building2 size={18} />,     desc: l => l === 0 ? 'No home bonus' : l === 1 ? '+8% home income' : l === 2 ? '+15% home income' : '+25% home income' },
  { type: 'training',  label: 'Training Facility', icon: <BallIcon size={18} />,       desc: l => l === 0 ? 'No fitness boost' : l === 1 ? '+2 fitness/day' : l === 2 ? '+4 fitness/day' : '+7 fitness/day' },
  { type: 'kit',       label: 'Kit Quality',       icon: <Shirt size={18} />,         desc: l => l === 0 ? 'No morale bonus' : l === 1 ? '+2 morale/day' : l === 2 ? '+4 morale/day' : '+6 morale/day' },
  { type: 'vip',       label: 'VIP Area',          icon: <Wine size={18} />,          desc: l => l === 0 ? 'No passive income' : l === 1 ? '+0.1% budget/day' : l === 2 ? '+0.2% budget/day' : '+0.4% budget/day' },
]

const UPGRADE_FIELD_MAP: Record<UpgradeType, string> = {
  scout: 'scoutLevel', coach: 'coachLevel', trainer: 'trainerLevel', marketing: 'marketingLevel',
  stadium: 'stadiumLevel', training: 'trainingLevel', kit: 'kitLevel', vip: 'vipLevel',
}

// ─── UpgradeCard ──────────────────────────────────────────────────────────────

function UpgradeCard({ label, icon, currentLevel, type, desc, startingBudget, budget, leagueId, onUpgraded }: {
  label: string; icon: ReactNode; currentLevel: number; type: UpgradeType
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
    <div className={maxed ? styles.upgradeCardMaxed : styles.upgradeCard}>
      <div className={styles.upgradeCardHeader}>
        <span className={styles.upgradeIcon}>{icon}</span>
        <div className={styles.upgradeMeta}>
          <div className={styles.upgradeLabel}>{label}</div>
          <div className={styles.upgradeDesc}>{desc(currentLevel)}</div>
        </div>
        <div className={styles.upgradePips}>
          {[1,2,3].map(i => (
            <div key={i} className={i <= currentLevel ? styles.pipFilled : styles.pipEmpty} />
          ))}
        </div>
      </div>
      {err && <div className={styles.upgradeErr}>{err}</div>}
      {!maxed ? (
        <button
          className={`btn btn-green ${styles.upgradeBtn}`}
          onClick={handleUpgrade}
          disabled={loading || !canAfford}
          style={{ opacity: canAfford ? 1 : 0.5 }}
        >
          {loading ? '...' : `Upgrade → L${currentLevel + 1}  (€${(cost / 1000).toFixed(1)}k)`}
        </button>
      ) : (
        <div className={styles.maxLevel}>MAX LEVEL</div>
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

  const [renaming, setRenaming] = useState(false)
  const [nameInput, setNameInput] = useState(myClub.name)
  const [nameErr, setNameErr] = useState('')
  const [nameLoading, setNameLoading] = useState(false)

  async function handleRename() {
    const trimmed = nameInput.trim()
    if (trimmed.length < 3 || trimmed.length > 50) { setNameErr('Name must be 3–50 characters'); return }
    setNameLoading(true); setNameErr('')
    try {
      await api.patch(`/leagues/${league.id}/name`, { name: trimmed })
      setRenaming(false)
      onRefresh()
    } catch (e: any) {
      setNameErr(e.response?.data?.error ?? 'Rename failed')
    } finally { setNameLoading(false) }
  }

  const boostCost = Math.round(league.startingBudget * BOOST_COST_PCT)
  const otherClubs = league.clubs.filter(c => c.id !== myClub.id)

  return (
    <div className={styles.root}>
      {upgradeMsg && <div className={styles.toast}>✓ {upgradeMsg}</div>}

      {/* Budget display */}
      <div className={styles.budgetBar}>
        <div>
          <div className={styles.budgetLabel}>Available Budget</div>
          <div className={styles.budgetValue}>€{(budget / 1000).toFixed(1)}k</div>
        </div>
      </div>

      {/* Club Name */}
      <div className={styles.card}>
        <div className="card-header"><span className="accent-bar" /><span className={styles.secLabel}>Club Identity</span></div>
        <div style={{ padding: '4px 0 2px' }}>
          {renaming ? (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                value={nameInput}
                onChange={e => { setNameInput(e.target.value); setNameErr('') }}
                maxLength={50}
                autoFocus
                onKeyDown={e => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') setRenaming(false) }}
                style={{
                  flex: '1 1 180px', padding: '8px 12px', fontSize: 15, fontWeight: 800,
                  fontFamily: 'var(--font-display)', letterSpacing: '0.04em', textTransform: 'uppercase',
                  background: 'var(--bg-base)', border: '2px solid var(--border-md)',
                  borderRadius: 4, color: 'var(--text-1)', outline: 'none',
                }}
              />
              <button className="btn btn-green" onClick={handleRename} disabled={nameLoading} style={{ flexShrink: 0 }}>
                {nameLoading ? '…' : 'Save'}
              </button>
              <button className="btn btn-ghost" onClick={() => { setRenaming(false); setNameInput(myClub.name); setNameErr('') }} style={{ flexShrink: 0 }}>
                Cancel
              </button>
              {nameErr && <div style={{ width: '100%', fontSize: 12, color: 'var(--red)', marginTop: 2 }}>{nameErr}</div>}
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 800, color: 'var(--text-1)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                {myClub.name}
              </span>
              <button className="btn btn-outline" style={{ fontSize: 11, padding: '4px 12px' }} onClick={() => { setRenaming(true); setNameInput(myClub.name) }}>
                Rename
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Staff */}
      <div className={styles.card}>
        <div className="card-header"><span className="accent-bar" /><span className={styles.secLabel}>Staff</span></div>
        <div className={styles.upgradeGrid}>
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
      <div className={styles.card}>
        <div className="card-header"><span className="accent-bar" /><span className={styles.secLabel}>Facilities</span></div>
        <div className={styles.upgradeGrid}>
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
        <div className={styles.card}>
          <div className="card-header"><span className="accent-bar" /><span className={styles.secLabel}>Scout Report</span></div>
          <div className={styles.reportSection}>
            <div className={styles.reportControls}>
              <select value={scoutClubId} onChange={e => setScoutClubId(e.target.value)} className={styles.reportSelect}>
                <option value="">Select opponent...</option>
                {otherClubs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <button className="btn btn-green" onClick={handleScoutReport} disabled={!scoutClubId || scoutLoading} style={{ whiteSpace: 'nowrap' }}>
                {scoutLoading ? '...' : 'Scout'}
              </button>
            </div>
            {scoutReport && (
              <div className={styles.reportJson}>
                <pre className={styles.reportPre}>{JSON.stringify(scoutReport, null, 2)}</pre>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Coach advice */}
      {clubLevels.coachLevel > 0 && (
        <div className={styles.card}>
          <div className="card-header"><span className="accent-bar" /><span className={styles.secLabel}>Coach Advice</span></div>
          <div className={styles.reportSection}>
            <button className="btn btn-green" onClick={handleCoachAdvice} disabled={coachLoading} style={{ marginBottom: 12 }}>
              {coachLoading ? '...' : 'Get Advice'}
            </button>
            {coachAdvice && (
              <div className={styles.reportJson}>
                <pre className={styles.reportPre}>{JSON.stringify(coachAdvice, null, 2)}</pre>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Stat boosts */}
      <div className={styles.card}>
        <div className="card-header"><span className="accent-bar" /><span className={styles.secLabel}>Stat Boosts · €{(boostCost / 1000).toFixed(1)}k each · 5 matchdays</span></div>
        <div className={styles.reportSection}>
          {boostMsg && <div className={styles.boostMsg} style={{ color: boostMsg.startsWith('Boost') ? 'var(--green)' : 'var(--red)' }}>{boostMsg}</div>}
          <div className={styles.boostList}>
            {myClub.squad.slice().sort((a, b) => b.player.overall - a.player.overall).map(p => (
              <div key={p.id} className={styles.boostPlayerCard}>
                <div className={styles.boostPlayerHeader}>
                  <span className={`pos ${p.player.position === 'GK' ? 'pos-gk' : ['CB','LB','RB'].includes(p.player.position) ? 'pos-def' : ['CDM','CM','CAM','LM','RM'].includes(p.player.position) ? 'pos-mid' : 'pos-att'}`} style={{ fontSize: 9, padding: '2px 5px' }}>{p.player.position}</span>
                  <span className={styles.boostPlayerName}>{p.player.name}</span>
                  <span className={styles.boostPlayerOvr}>OVR {p.player.overall}</span>
                </div>
                <div className={styles.boostButtons}>
                  {BOOST_STATS.map(stat => {
                    const active = (p.boosts ?? []).some(b => b.stat === stat)
                    const key = p.id + stat
                    return (
                      <button key={stat}
                        className={active ? styles.boostBtnActive : styles.boostBtn}
                        onClick={() => !active && handleBoost(p.id, stat)}
                        disabled={active || boostLoading === key || budget < boostCost}
                        style={{ opacity: !active && budget < boostCost ? 0.4 : 1 }}
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
        <div className={styles.cardGold}>
          <div className={`card-header ${styles.cardHeaderGold}`}><span className={`accent-bar ${styles.accentBarGold}`} /><span className={styles.secLabelGold}>Transfer Window</span></div>
          <div className={styles.windowBody}>
            <div>
              <div className={styles.windowStatus}>
                Window is currently{' '}
                <span className={(league.transferWindowOpen ?? true) ? styles.windowStatusOpen : styles.windowStatusClosed}>
                  {(league.transferWindowOpen ?? true) ? 'OPEN' : 'CLOSED'}
                </span>
              </div>
              <div className={styles.windowSubtext}>Controls whether players can be transferred between clubs</div>
            </div>
            <button
              className={`btn ${(league.transferWindowOpen ?? true) ? styles.windowCloseBtn : styles.windowOpenBtn}`}
              onClick={handleToggleWindow} disabled={windowLoading}
            >
              {windowLoading ? '...' : (league.transferWindowOpen ?? true) ? 'Close Window' : 'Open Window'}
            </button>
          </div>
          {windowMsg && <div className={styles.windowMsg}>✓ {windowMsg}</div>}
        </div>
      )}
    </div>
  )
}
