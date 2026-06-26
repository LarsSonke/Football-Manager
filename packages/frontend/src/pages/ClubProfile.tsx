import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { Star, Target } from 'lucide-react'
import { api } from '../api/client'
import { ClubBadge, type LogoConfig } from '../components/ClubBadge'
import { BallIcon } from '../components/icons'
import { posClass } from '../utils/helpers'
import { Navbar } from '../components/Navbar'
import styles from './ClubProfile.module.css'

// ─── Types ────────────────────────────────────────────────────────────────────

interface SquadMember {
  id: string; playerId: string; name: string; nationality: string | null
  position: string; age: number; overall: number; potential: number
  morale: number; form: number; fitness: number
  injured: boolean; injuryDaysLeft: number; wage: number
}

interface RecentMatch {
  id: string; matchday: number
  homeClub: { id: string; name: string; logoConfig: LogoConfig | null }
  awayClub: { id: string; name: string; logoConfig: LogoConfig | null }
  homeScore: number | null; awayScore: number | null
}

interface TopPerformer {
  instanceId: string; name: string; position: string
  goals: number; assists: number; appearances: number; avgRating: number
}

interface ClubProfileData {
  club: {
    id: string; name: string; logoConfig: LogoConfig | null
    budget: number; wins: number; draws: number; losses: number
    goalsFor: number; goalsAgainst: number; points: number
    isAI: boolean; user: { id: string; username: string } | null
  }
  squad: SquadMember[]
  recentMatches: RecentMatch[]
  topPerformers: TopPerformer[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const POS_ORDER = ['GK', 'CB', 'LB', 'RB', 'CDM', 'CM', 'CAM', 'LM', 'RM', 'LW', 'RW', 'CF', 'ST']
const POS_GROUP: Record<string, string> = {
  GK: 'Goalkeeper', CB: 'Defenders', LB: 'Defenders', RB: 'Defenders',
  CDM: 'Midfielders', CM: 'Midfielders', CAM: 'Midfielders', LM: 'Midfielders', RM: 'Midfielders',
  LW: 'Attackers', RW: 'Attackers', CF: 'Attackers', ST: 'Attackers',
}

function ovrTier(ovr: number): string {
  if (ovr >= 85) return 'elite'
  if (ovr >= 78) return 'good'
  if (ovr >= 70) return 'decent'
  return 'poor'
}

function conditionLevel(val: number): string {
  if (val >= 75) return 'high'
  if (val >= 55) return 'mid'
  return 'low'
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ClubProfile() {
  const { id: leagueId, clubId } = useParams<{ id: string; clubId: string }>()
  const navigate = useNavigate()
  const [data, setData] = useState<ClubProfileData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!leagueId || !clubId) return
    api.get(`/leagues/${leagueId}/clubs/${clubId}/profile`)
      .then(r => setData(r.data))
      .catch(() => setError('Could not load club profile'))
      .finally(() => setLoading(false))
  }, [leagueId, clubId])

  if (loading) return (
    <div className={styles.centered}>
      <div className={styles.loadingText}>Loading…</div>
    </div>
  )

  if (error || !data) return (
    <div className={styles.centeredCol}>
      <div className={styles.errorText}>{error || 'Club not found'}</div>
      <button className="btn btn-outline" onClick={() => navigate(-1)}>Go back</button>
    </div>
  )

  const { club, squad, recentMatches, topPerformers } = data

  const gd = club.goalsFor - club.goalsAgainst
  const played = club.wins + club.draws + club.losses
  const avgOvr = squad.length ? Math.round(squad.reduce((s, p) => s + p.overall, 0) / squad.length) : 0

  // Group squad by position group
  const grouped: Record<string, SquadMember[]> = {}
  for (const p of [...squad].sort((a, b) => POS_ORDER.indexOf(a.position) - POS_ORDER.indexOf(b.position))) {
    const grp = POS_GROUP[p.position] ?? 'Other'
    if (!grouped[grp]) grouped[grp] = []
    grouped[grp].push(p)
  }
  const groupOrder = ['Goalkeeper', 'Defenders', 'Midfielders', 'Attackers', 'Other']

  return (
    <div className={styles.pageRoot}>
      {/* Nav */}
      <Navbar backTo={`/league/${leagueId}`} backLabel="← League" />

      <div className="page" style={{ maxWidth: 720 }}>

        {/* Hero */}
        <div className={styles.hero}>
          <ClubBadge name={club.name} size={72} logoConfig={club.logoConfig} />
          <div>
            <h1 className={styles.heroName}>{club.name}</h1>
            <div className={styles.heroManager}>
              {club.isAI ? 'AI Club' : club.user ? `Manager: ${club.user.username}` : '—'}
            </div>
            <div className={styles.statsRow}>
              <div className={styles.statPill}>
                <div className={`${styles.statValue} ${styles.statValueAccent}`}>{club.points}</div>
                <div className={styles.statLabel}>Pts</div>
              </div>
              <div className={styles.statPill}>
                <div className={styles.statValue}>{club.wins}</div>
                <div className={styles.statLabel}>W</div>
              </div>
              <div className={styles.statPill}>
                <div className={styles.statValue}>{club.draws}</div>
                <div className={styles.statLabel}>D</div>
              </div>
              <div className={styles.statPill}>
                <div className={styles.statValue}>{club.losses}</div>
                <div className={styles.statLabel}>L</div>
              </div>
              <div className={styles.statPill}>
                <div
                  className={styles.statValue}
                  data-ovr={gd >= 0 ? undefined : 'poor'}
                >
                  {gd > 0 ? '+' : ''}{gd}
                </div>
                <div className={styles.statLabel}>GD</div>
              </div>
              {avgOvr > 0 && (
                <div className={styles.statPill}>
                  <div className={`${styles.statValue} ${styles.statValueGold}`}>{avgOvr}</div>
                  <div className={styles.statLabel}>OVR</div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className={styles.columns}>

          {/* Left: Squad */}
          <div>
            <div className="card" style={{ padding: 0 }}>
              <div className="card-header">
                <span className="accent-bar" />
                <span className={styles.cardHeaderLabel}>
                  Squad · {squad.length} players
                </span>
              </div>
              {groupOrder.filter(g => grouped[g]?.length).map(grp => (
                <div key={grp}>
                  <div className={styles.groupHeading}>{grp}</div>
                  {grouped[grp].map((p, i) => (
                    <div
                      key={p.id}
                      className={`${styles.squadRow} ${i < grouped[grp].length - 1 ? styles.squadRowDivider : ''}`}
                    >
                      <span className={posClass(p.position)} style={{ fontSize: 9 }}>{p.position}</span>
                      <div>
                        <div className={`${styles.playerName} ${p.injured ? styles.playerNameInjured : ''}`}>
                          {p.name}
                          {p.injured && (
                            <span className={styles.injuryTag}>INJ {p.injuryDaysLeft}d</span>
                          )}
                        </div>
                        <div className={styles.playerAge}>Age {p.age}</div>
                      </div>
                      {/* Condition dots */}
                      <div className={styles.conditionDots}>
                        {[
                          { val: p.fitness, label: 'Fit' },
                          { val: p.morale, label: 'Mor' },
                          { val: p.form, label: 'Form' },
                        ].map(({ val, label }) => (
                          <div
                            key={label}
                            title={`${label}: ${val}`}
                            className={styles.conditionDot}
                            data-level={conditionLevel(val)}
                          />
                        ))}
                      </div>
                      <div className={styles.ovrValue} data-ovr={ovrTier(p.overall)}>
                        {p.overall}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
              {squad.length === 0 && (
                <div className={styles.squadEmpty}>No squad data</div>
              )}
            </div>
          </div>

          {/* Right column */}
          <div className={styles.rightCol}>

            {/* Recent form */}
            <div className="card" style={{ padding: 0 }}>
              <div className="card-header">
                <span className="accent-bar" />
                <span className={styles.cardHeaderLabel}>Recent Form</span>
              </div>
              <div className={styles.recentBody}>
                {recentMatches.length === 0 ? (
                  <div className={styles.noMatches}>No matches played yet</div>
                ) : (
                  <div className={styles.matchList}>
                    {[...recentMatches].reverse().map(m => {
                      const isHome = m.homeClub.id === clubId
                      const myScore = isHome ? m.homeScore! : m.awayScore!
                      const oppScore = isHome ? m.awayScore! : m.homeScore!
                      const opp = isHome ? m.awayClub : m.homeClub
                      const result = myScore > oppScore ? 'W' : myScore === oppScore ? 'D' : 'L'
                      return (
                        <Link
                          key={m.id}
                          to={`/league/${leagueId}/match/${m.id}`}
                          className={styles.matchRow}
                        >
                          <div className={styles.resultDot} data-result={result}>
                            {result}
                          </div>
                          <div className={styles.matchOpponent}>
                            <ClubBadge name={opp.name} size={18} logoConfig={opp.logoConfig} />
                            <span className={styles.matchOppName}>
                              {isHome ? 'vs' : '@'} {opp.name}
                            </span>
                          </div>
                          <div className={styles.matchScore}>
                            {myScore}–{oppScore}
                          </div>
                        </Link>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Top performers */}
            {topPerformers.length > 0 && (
              <div className="card" style={{ padding: 0 }}>
                <div className="card-header">
                  <span className="accent-bar-gold" />
                  <span className={styles.cardHeaderLabel}>Top Performers</span>
                </div>
                <div className={styles.performerBody}>
                  {topPerformers.map((p, i) => (
                    <div
                      key={p.instanceId}
                      className={`${styles.performerRow} ${i < topPerformers.length - 1 ? styles.performerRowDivider : ''}`}
                    >
                      <div className={`${styles.performerRank} ${i === 0 ? styles.performerRankFirst : ''}`}>
                        {i + 1}
                      </div>
                      <span className={posClass(p.position)} style={{ fontSize: 9 }}>{p.position}</span>
                      <div>
                        <div className={styles.performerName}>{p.name}</div>
                        <div className={styles.performerApps}>{p.appearances} apps · <Star size={11} style={{ verticalAlign: 'middle' }} />{p.avgRating.toFixed(1)}</div>
                      </div>
                      <div className={styles.performerStats}>
                        {p.goals > 0 && <div className={styles.performerGoals}><BallIcon size={11} /> {p.goals}</div>}
                        {p.assists > 0 && <div className={styles.performerAssists}><Target size={11} /> {p.assists}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Budget */}
            <div className="card" style={{ padding: 0 }}>
              <div className="card-header">
                <span className="accent-bar-gold" />
                <span className={styles.cardHeaderLabel}>Finances</span>
              </div>
              <div className={styles.financeBody}>
                <div className={styles.budgetValue}>
                  €{(club.budget / 1_000).toFixed(1)}M
                </div>
                <div className={styles.budgetLabel}>Available budget</div>
                {played > 0 && (
                  <div className={styles.goalsInfo}>
                    {club.goalsFor} scored · {club.goalsAgainst} conceded
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  )
}
