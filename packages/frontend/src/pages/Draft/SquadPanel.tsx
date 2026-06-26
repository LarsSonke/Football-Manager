import type { ReactNode } from 'react'
import { Zap, Target, Share2, ShieldCheck, Dumbbell } from 'lucide-react'
import { BallIcon } from '../../components/icons'
import type { PlayerData, PickRecord, PickedPlayer, ClubInfo, DraftSession } from './types'

// ─── Constants ────────────────────────────────────────────────────────────────

const IDEAL_FORMATION: Record<string, number> = {
  GK: 1, CB: 2, LB: 1, RB: 1, CDM: 1, CM: 2, CAM: 1, LW: 1, RW: 1, ST: 2,
}

const STAT_LABELS: [string, keyof PlayerData, ReactNode][] = [
  ['Speed',       'pace',      <Zap size={12} />],
  ['Attack',      'shooting',  <Target size={12} />],
  ['Passing',     'passing',   <Share2 size={12} />],
  ['Dribbling',   'dribbling', <BallIcon size={12} />],
  ['Defence',     'defending', <ShieldCheck size={12} />],
  ['Physicality', 'physical',  <Dumbbell size={12} />],
]

// ─── Squad Analysis ───────────────────────────────────────────────────────────

function SquadAnalysis({ myPicks, pickedPlayerMap }: {
  myPicks: PickRecord[]
  pickedPlayerMap: Record<string, PickedPlayer & Partial<PlayerData>>
}) {
  const squad = myPicks.map(p => pickedPlayerMap[p.playerId]).filter(Boolean) as (PickedPlayer & Partial<PlayerData>)[]
  if (squad.length === 0) return (
    <div style={{ fontSize: 12, color: 'var(--text-2)', textAlign: 'center', padding: '12px 0' }}>No players drafted yet</div>
  )

  // Position counts
  const posCounts: Record<string, number> = {}
  squad.forEach(p => { posCounts[p.position] = (posCounts[p.position] ?? 0) + 1 })

  // Missing positions (based on ideal)
  const gaps: string[] = []
  Object.entries(IDEAL_FORMATION).forEach(([pos, needed]) => {
    const have = posCounts[pos] ?? 0
    if (have < needed) gaps.push(`${pos} (${needed - have} more)`)
  })

  // Average stats (only players with full stats)
  const withStats = squad.filter(p => p.pace !== undefined) as PlayerData[]
  const avgStats = withStats.length === 0 ? null : STAT_LABELS.map(([label, key, icon]) => {
    const avg = Math.round(withStats.reduce((s, p) => s + (p[key] as number), 0) / withStats.length)
    return { label, icon, avg }
  })

  // Weakest areas
  const weakAreas = avgStats ? [...avgStats].sort((a, b) => a.avg - b.avg).slice(0, 2) : []

  return (
    <div>
      {/* Average stats */}
      {avgStats && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.5, color: 'var(--text-2)', textTransform: 'uppercase', marginBottom: 8 }}>Squad Averages</div>
          {avgStats.map(({ label, icon, avg }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
              <div style={{ width: 70, fontSize: 11, color: 'var(--text-2)' }}>{icon} {label}</div>
              <div style={{ flex: 1, height: 5, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ width: `${avg}%`, height: '100%', background: avg >= 78 ? 'var(--green)' : avg >= 70 ? 'var(--blue)' : 'var(--red)', borderRadius: 3 }} />
              </div>
              <div style={{ width: 24, fontSize: 12, fontWeight: 700, color: avg >= 78 ? 'var(--green)' : avg >= 70 ? 'var(--blue)' : 'var(--red)', fontFamily: 'var(--font-display)' }}>{avg}</div>
            </div>
          ))}
        </div>
      )}

      {/* Missing positions */}
      {gaps.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.5, color: 'var(--text-2)', textTransform: 'uppercase', marginBottom: 6 }}>Positions Needed</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {gaps.map(g => (
              <span key={g} className="badge" style={{ background: 'rgba(232,128,106,0.12)', color: 'var(--red)', border: '1px solid rgba(232,128,106,0.3)', fontSize: 10 }}>{g}</span>
            ))}
          </div>
        </div>
      )}

      {/* Weak areas suggestion */}
      {weakAreas.length > 0 && (
        <div style={{ padding: '10px 12px', background: 'rgba(233,196,106,0.08)', border: '1px solid rgba(233,196,106,0.2)', borderRadius: 'var(--radius-sm)' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>⚠ Look For</div>
          <div style={{ fontSize: 11, color: 'var(--text-1)' }}>
            Strong in <span style={{ color: 'var(--gold)', fontWeight: 600 }}>{weakAreas.map(w => w.label).join(' & ')}</span> — your squad averages are below 70 in these areas.
          </div>
        </div>
      )}
    </div>
  )
}

// ─── SquadPanel ───────────────────────────────────────────────────────────────

interface SquadPanelProps {
  myClub: ClubInfo
  myPicks: PickRecord[]
  pickedPlayerMap: Record<string, PickedPlayer & Partial<PlayerData>>
  session: DraftSession
}

export function SquadPanel({ myClub, myPicks, pickedPlayerMap, session }: SquadPanelProps) {
  return (
    <div className="card" style={{ padding: 0 }}>
      <div className="card-header">
        <span className="accent-bar" />
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' }}>My Squad</span>
      </div>
      <div style={{ padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div />
          <div>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 800, color: 'var(--text-1)' }}>{myPicks.length}</span>
            <span style={{ fontSize: 12, color: 'var(--text-2)', marginLeft: 4 }}>/ {session.roundsTotal}</span>
          </div>
        </div>
        <div style={{ marginBottom: 12 }}>
          <div className="stat-bar-wrap">
            <div className="stat-bar-fill" style={{ width: `${(myPicks.length / session.roundsTotal) * 100}%`, background: 'var(--green)' }} />
          </div>
          <div style={{ textAlign: 'right', fontSize: 11, color: 'var(--green)', marginTop: 3, fontFamily: 'var(--font-display)', fontWeight: 700 }}>
            €{(myClub.budget / 1_000).toFixed(0)}M left
          </div>
        </div>
        <SquadAnalysis myPicks={myPicks} pickedPlayerMap={pickedPlayerMap} />
      </div>
    </div>
  )
}
