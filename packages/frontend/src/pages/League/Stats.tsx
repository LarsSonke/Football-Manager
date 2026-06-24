import { useEffect, useState } from 'react'
import { ClubBadge } from '../../components/ClubBadge'
import { KitSvg, type KitConfig } from '../../components/KitSvg'
import { api } from '../../api/client'
import { posClass, getBadgeColor } from '../../utils/helpers'
import type { StatEntry, AwardEntry, StatCategory } from './types'

// ─── TOTW Pitch ───────────────────────────────────────────────────────────────

function TOTWPitch({ players }: { players: AwardEntry[] }) {
  const posY: Record<string, number> = {
    GK: 82, CB: 65, LB: 65, RB: 65, LWB: 65, RWB: 65,
    CDM: 52, CM: 42, LM: 42, RM: 42,
    CAM: 30, LW: 20, RW: 20, CF: 20, SS: 20, ST: 14,
  }
  const getY = (pos: string) => posY[pos] ?? 42

  const rowMap: Record<number, AwardEntry[]> = {}
  for (const p of players) {
    const y = getY(p.position)
    if (!rowMap[y]) rowMap[y] = []
    rowMap[y].push(p)
  }

  const positionedPlayers: Array<{ player: AwardEntry; x: number; y: number }> = []
  for (const [yStr, row] of Object.entries(rowMap)) {
    const y = Number(yStr)
    const count = row.length
    row.forEach((p, i) => {
      const x = count === 1 ? 50 : 10 + (i / (count - 1)) * 80
      positionedPlayers.push({ player: p, x, y })
    })
  }

  return (
    <div style={{ position: 'relative', width: '100%', paddingBottom: '62%', borderRadius: 10, overflow: 'hidden', background: '#1a5c28' }}>
      <svg viewBox="0 0 100 62" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
        {[0,1,2,3,4,5].map(i => <rect key={i} x="0" y={i*10.3} width="100" height="5.2" fill="rgba(0,0,0,0.06)" />)}
        <rect x="2" y="2" width="96" height="58" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="0.5" />
        <line x1="2" y1="31" x2="98" y2="31" stroke="rgba(255,255,255,0.3)" strokeWidth="0.5" />
        <circle cx="50" cy="31" r="8" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="0.5" />
        <circle cx="50" cy="31" r="0.7" fill="rgba(255,255,255,0.4)" />
        <rect x="28" y="2" width="44" height="14" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="0.5" />
        <rect x="38" y="2" width="24" height="6" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="0.5" />
        <circle cx="50" cy="10" r="0.7" fill="rgba(255,255,255,0.3)" />
        <rect x="28" y="46" width="44" height="14" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="0.5" />
        <rect x="38" y="56" width="24" height="6" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="0.5" />
        <circle cx="50" cy="52" r="0.7" fill="rgba(255,255,255,0.3)" />
      </svg>

      {positionedPlayers.map(({ player: p, x, y }) => (
        <div key={p.instanceId} style={{
          position: 'absolute',
          left: `${x}%`, top: `${y}%`,
          transform: 'translate(-50%, -50%)',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          gap: 2, width: 72,
        }}>
          {p.photoUrl ? (
            <img src={p.photoUrl} alt="" style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover', border: '2.5px solid rgba(255,255,255,0.9)', flexShrink: 0, filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.7))' }} />
          ) : (
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: getBadgeColor(p.playerName), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 900, color: '#000', border: '2.5px solid rgba(255,255,255,0.9)', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.7))' }}>
              {p.playerName.split(' ').map(w => w[0]).slice(0, 2).join('')}
            </div>
          )}
          <KitSvg config={p.clubKitConfig as KitConfig | null} size={36} uid={`totw-${p.instanceId}`} />
          <div style={{ background: 'rgba(0,0,0,0.72)', borderRadius: 4, padding: '2px 6px', textAlign: 'center', backdropFilter: 'blur(4px)' }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', lineHeight: 1.3, maxWidth: 68, overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {p.playerName.split(' ').slice(-1)[0]}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
              <span className={posClass(p.position)} style={{ fontSize: 7, padding: '1px 3px' }}>{p.position}</span>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 900, color: 'var(--gold)', lineHeight: 1 }}>{p.rating.toFixed(1)}</span>
            </div>
            {(p.goals > 0 || p.assists > 0) && (
              <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.8)', lineHeight: 1.2 }}>
                {p.goals > 0 && <span style={{ color: '#7effa0' }}>⚽{p.goals} </span>}
                {p.assists > 0 && <span style={{ color: '#7dd3fc' }}>🅰{p.assists}</span>}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Stats ────────────────────────────────────────────────────────────────────

export default function Stats({ leagueId, status }: { leagueId: string; status: string }) {
  const [entries, setEntries] = useState<StatEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [cat, setCat] = useState<StatCategory>('goals')

  useEffect(() => {
    api.get(`/leagues/${leagueId}/stats`)
      .then(r => setEntries(r.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [leagueId])

  const categories: { key: StatCategory; label: string; icon: string }[] = [
    { key: 'goals',       label: 'Top Scorers',    icon: '⚽' },
    { key: 'assists',     label: 'Top Assists',     icon: '🎯' },
    { key: 'rating',      label: 'Best Rated',      icon: '⭐' },
    { key: 'cleanSheets', label: 'Clean Sheets',    icon: '🧤' },
    { key: 'appearances', label: 'Appearances',     icon: '🎽' },
  ]

  const sorted = [...entries].sort((a, b) => {
    if (cat === 'goals')       return b.goals       - a.goals       || b.assists - a.assists
    if (cat === 'assists')     return b.assists      - a.assists     || b.goals   - a.goals
    if (cat === 'rating')      return b.avgRating    - a.avgRating   || b.appearances - a.appearances
    if (cat === 'cleanSheets') return b.cleanSheets  - a.cleanSheets || b.avgRating - a.avgRating
    return b.appearances - a.appearances || b.goals - a.goals
  }).filter(e => {
    if (cat === 'rating')      return e.appearances >= 3
    if (cat === 'cleanSheets') return e.position === 'GK'
    return true
  }).slice(0, 20)

  function statValue(e: StatEntry): string {
    if (cat === 'goals')       return String(e.goals)
    if (cat === 'assists')     return String(e.assists)
    if (cat === 'rating')      return e.avgRating.toFixed(1)
    if (cat === 'cleanSheets') return String(e.cleanSheets)
    return String(e.appearances)
  }

  function secondaryLabel(e: StatEntry): string {
    if (cat === 'goals')       return e.assists > 0   ? `${e.assists} ast` : `${e.appearances} apps`
    if (cat === 'assists')     return e.goals > 0     ? `${e.goals} goals` : `${e.appearances} apps`
    if (cat === 'rating')      return `${e.appearances} apps`
    if (cat === 'cleanSheets') return `${e.appearances} apps`
    return `${e.goals}G ${e.assists}A`
  }

  if (loading) return <div style={{ padding: '64px 0', textAlign: 'center', color: 'var(--text-2)' }}>Loading…</div>

  if (status === 'SETUP' || status === 'DRAFTING') return (
    <div style={{ textAlign: 'center', padding: '64px 0', color: 'var(--text-2)' }}>
      <div style={{ fontSize: 36, marginBottom: 10 }}>📊</div>
      <p style={{ fontWeight: 600, marginBottom: 6 }}>No stats yet</p>
      <p style={{ fontSize: 13, color: 'var(--text-3)' }}>Stats appear here after the first matchday.</p>
    </div>
  )

  return (
    <div style={{ maxWidth: 680 }}>

      {/* Category tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {categories.map(c => (
          <button
            key={c.key}
            onClick={() => setCat(c.key)}
            style={{
              padding: '8px 14px', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
              fontSize: 13, fontWeight: cat === c.key ? 700 : 500,
              background: cat === c.key ? 'rgba(54,226,126,0.12)' : 'var(--bg-card)',
              border: `1.5px solid ${cat === c.key ? 'var(--green)' : 'var(--border)'}`,
              color: cat === c.key ? 'var(--green)' : 'var(--text-2)',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <span>{c.icon}</span>{c.label}
          </button>
        ))}
      </div>

      {/* Table */}
      {entries.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-2)' }}>No match data yet.</div>
      ) : sorted.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-2)' }}>
          {cat === 'cleanSheets' ? 'No clean sheets recorded yet.' : 'No data for this category.'}
        </div>
      ) : (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
          {sorted.map((e, i) => {
            const isTop = i === 0
            const medal = i === 0 ? 'var(--gold)' : i === 1 ? '#a0a8b8' : i === 2 ? '#cd7f32' : 'var(--text-3)'
            return (
              <div
                key={e.instanceId}
                style={{
                  display: 'grid', gridTemplateColumns: '40px 1fr auto',
                  alignItems: 'center', padding: '11px 16px',
                  borderBottom: i < sorted.length - 1 ? '1px solid var(--border)' : 'none',
                  background: isTop ? 'rgba(255,196,0,0.04)' : 'transparent',
                }}
              >
                {/* Rank */}
                <div style={{
                  fontFamily: 'var(--font-display)', fontSize: isTop ? 20 : 14,
                  fontWeight: 800, color: medal, textAlign: 'center',
                }}>
                  {i + 1}
                </div>

                {/* Player info */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <ClubBadge name={e.clubName} size={30} logoConfig={e.clubLogoConfig} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: isTop ? 700 : 600, fontSize: 14, color: 'var(--text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {e.playerName}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                      <span className={posClass(e.position)} style={{ fontSize: 9 }}>{e.position}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.clubName}</span>
                    </div>
                  </div>
                </div>

                {/* Stat value + secondary */}
                <div style={{ textAlign: 'right' }}>
                  <div style={{
                    fontFamily: 'var(--font-display)', fontSize: isTop ? 26 : 20,
                    fontWeight: 800, color: isTop ? 'var(--gold)' : 'var(--text-1)', lineHeight: 1,
                  }}>
                    {statValue(e)}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 600, marginTop: 2 }}>
                    {secondaryLabel(e)}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export { TOTWPitch }
