import { useEffect, useState } from 'react'
import { ClubBadge } from '../../components/ClubBadge'
import { KitSvg, type KitConfig } from '../../components/KitSvg'
import { api } from '../../api/client'
import { posClass } from '../../utils/helpers'
import { PlayerPhoto } from '../../components/PlayerPhoto'
import type { StatEntry, AwardEntry, StatCategory } from './types'
import styles from './Stats.module.css'

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
    <div className={styles.pitchWrap}>
      <svg viewBox="0 0 100 62" preserveAspectRatio="none" className={styles.pitchSvg}>
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
        <div
          key={p.instanceId}
          className={styles.pitchPlayerPin}
          style={{ left: `${x}%`, top: `${y}%` }}
        >
          <PlayerPhoto url={p.photoUrl} name={p.playerName} size={44} style={{ borderRadius: '50%', border: '2.5px solid rgba(255,255,255,0.9)', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.7))' }} />
          <KitSvg config={p.clubKitConfig as KitConfig | null} size={36} uid={`totw-${p.instanceId}`} />
          <div className={styles.pitchNameplate}>
            <div className={styles.pitchLastName}>
              {p.playerName.split(' ').slice(-1)[0]}
            </div>
            <div className={styles.pitchRatingRow}>
              <span className={`${posClass(p.position)} ${styles.pitchPosLabel}`}>{p.position}</span>
              <span className={styles.pitchRating}>{p.rating.toFixed(1)}</span>
            </div>
            {(p.goals > 0 || p.assists > 0) && (
              <div className={styles.pitchContribRow}>
                {p.goals > 0 && <span className={styles.pitchGoals}>⚽{p.goals} </span>}
                {p.assists > 0 && <span className={styles.pitchAssists}>🅰{p.assists}</span>}
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

  if (loading) return <div className={styles.loadingState}>Loading…</div>

  if (status === 'SETUP' || status === 'DRAFTING') return (
    <div className={styles.setupState}>
      <div className={styles.setupIcon}>📊</div>
      <p className={styles.setupTitle}>No stats yet</p>
      <p className={styles.setupSubtitle}>Stats appear here after the first matchday.</p>
    </div>
  )

  return (
    <div className={styles.pageWrap}>

      {/* Category tabs */}
      <div className={styles.catTabs}>
        {categories.map(c => (
          <button
            key={c.key}
            onClick={() => setCat(c.key)}
            className={styles.catTab}
            data-active={String(cat === c.key)}
          >
            <span>{c.icon}</span>{c.label}
          </button>
        ))}
      </div>

      {/* Table */}
      {entries.length === 0 ? (
        <div className={styles.noData}>No match data yet.</div>
      ) : sorted.length === 0 ? (
        <div className={styles.noData}>
          {cat === 'cleanSheets' ? 'No clean sheets recorded yet.' : 'No data for this category.'}
        </div>
      ) : (
        <div className={styles.leaderboard}>
          {sorted.map((e, i) => {
            const isTop = i === 0
            const medal = i === 0 ? 'var(--gold)' : i === 1 ? '#a0a8b8' : i === 2 ? '#cd7f32' : 'var(--text-3)'
            return (
              <div
                key={e.instanceId}
                className={styles.leaderRow}
                data-top={String(isTop)}
              >
                {/* Rank */}
                <div className={styles.rankCell} data-top={String(isTop)} style={{ color: medal }}>
                  {i + 1}
                </div>

                {/* Player info */}
                <div className={styles.playerInfo}>
                  <ClubBadge name={e.clubName} size={30} logoConfig={e.clubLogoConfig} />
                  <div className={styles.playerDetails}>
                    <div className={styles.playerNameText} data-top={String(isTop)}>
                      {e.playerName}
                    </div>
                    <div className={styles.playerMeta}>
                      <span className={posClass(e.position)} style={{ fontSize: 9 }}>{e.position}</span>
                      <span className={styles.playerClub}>{e.clubName}</span>
                    </div>
                  </div>
                </div>

                {/* Stat value + secondary */}
                <div className={styles.statValueCell}>
                  <div className={styles.statPrimary} data-top={String(isTop)}>
                    {statValue(e)}
                  </div>
                  <div className={styles.statSecondary}>
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
