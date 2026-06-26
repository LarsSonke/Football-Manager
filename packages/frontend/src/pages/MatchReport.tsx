import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useParams, Link, useLocation, useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { ClubBadge, type LogoConfig } from '../components/ClubBadge'
import { getBadgeColor, ratingColor, posClass } from '../utils/helpers'
import { BallIcon, CardIcon, SubIcon } from '../components/icons'
import styles from './MatchReport.module.css'

// ─── Types ────────────────────────────────────────────────────────────────────

interface TeamStats {
  shots: number
  shotsOnTarget: number
  xG: number
  possession: number
  yellowCards: number
  redCards: number
}

interface MatchEvent {
  id: string
  minute: number
  type: string
  team: 'home' | 'away' | null
  playerName: string | null
  assistName: string | null
  xg: number | null
}

interface PlayerPerf {
  instanceId: string
  playerName: string
  position: string
  positionPlayed: string | null
  rating: number
  goals: number
  assists: number
  minutesPlayed: number
}

interface MatchDetail {
  id: string
  matchday: number
  status: string
  simulatedAt: string | null
  homeClub: { id: string; name: string; logoConfig?: LogoConfig | null }
  awayClub: { id: string; name: string; logoConfig?: LogoConfig | null }
  homeScore: number | null
  awayScore: number | null
  stats: { home: TeamStats; away: TeamStats } | null
  events: MatchEvent[]
  performances: { home: PlayerPerf[]; away: PlayerPerf[] }
}

// ─── Small helpers ────────────────────────────────────────────────────────────

function SectionHeader({ label, gold }: { label: string; gold?: boolean }) {
  return (
    <div className={styles.secHeader}>
      <div className={styles.secHeaderBar} />
      <span className={gold ? styles.secLabelGold : styles.secLabel}>{label}</span>
    </div>
  )
}

function StatRow({ label, home, away, format = (n: number) => String(n) }: {
  label: string; home: number; away: number; format?: (n: number) => string
}) {
  const total = home + away || 1
  const homePct = (home / total) * 100
  return (
    <div className={styles.statRowWrap}>
      <div className={styles.statRowLabels}>
        <span className={styles.statRowValue}>{format(home)}</span>
        <span className={styles.statRowLabel}>{label}</span>
        <span className={styles.statRowValue}>{format(away)}</span>
      </div>
      <div className={styles.statBarTrack}>
        <div className={styles.statBarFill} style={{ width: `${homePct}%` }} />
      </div>
    </div>
  )
}

// ─── Replay Ticker ────────────────────────────────────────────────────────────

const REPLAY_SPEEDS = [
  { label: '1×', ms: 120 },
  { label: '4×', ms: 30 },
  { label: '16×', ms: 8 },
]
const TOTAL_MINUTES = 90

function ReplayTicker({ match, onClose }: { match: MatchDetail; onClose: () => void }) {
  const allEvents = [...match.events].sort((a, b) => a.minute - b.minute)
  const [currentMinute, setCurrentMinute] = useState(0)
  const [running, setRunning] = useState(true)
  const [speedIdx, setSpeedIdx] = useState(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const feedRef = useRef<HTMLDivElement>(null)

  const visibleEvents = allEvents.filter(e => e.minute <= currentMinute)
  const goals = visibleEvents.filter(e => e.type === 'GOAL')
  const homeScore = goals.filter(e => e.team === 'home').length
  const awayScore = goals.filter(e => e.team === 'away').length
  const done = currentMinute >= TOTAL_MINUTES

  useEffect(() => {
    if (!running || done) return
    timerRef.current = setTimeout(() => setCurrentMinute(m => m + 1), REPLAY_SPEEDS[speedIdx].ms)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [running, currentMinute, speedIdx, done])

  // Auto-scroll feed to bottom as new events appear
  useEffect(() => {
    if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight
  }, [visibleEvents.length])

  function eventIcon(type: string): ReactNode {
    if (type === 'GOAL' || type === 'OWN_GOAL') return <BallIcon size={14} />
    if (type === 'YELLOW_CARD') return <CardIcon color="yellow" size={14} />
    if (type === 'RED_CARD') return <CardIcon color="red" size={14} />
    if (type === 'SUBSTITUTION') return <SubIcon size={14} />
    if (type === 'PENALTY_MISS') return '✗'
    return '•'
  }

  return (
    <div
      className={styles.replayOverlay}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className={styles.replayPanel}>
        {/* Header */}
        <div className={styles.replayHeader}>
          <span className={styles.replayTitle}>Match Replay</span>
          <button onClick={onClose} className={styles.replayCloseBtn}>✕</button>
        </div>

        {/* Score + progress */}
        <div className={styles.replayScore}>
          <div className={styles.replayScoreGrid}>
            <div className={styles.replayTeamHome}>{match.homeClub.name}</div>
            <div className={styles.replayScoreValue}>
              {homeScore}<span className={styles.replayScoreSep}>–</span>{awayScore}
            </div>
            <div className={styles.replayTeamAway}>{match.awayClub.name}</div>
          </div>
          <div className={styles.replayProgressWrap}>
            <div className={styles.replayProgressBar} style={{ width: `${(currentMinute / TOTAL_MINUTES) * 100}%` }} />
          </div>
          <div className={styles.replayMinute}>
            {done ? 'Full Time' : `${currentMinute}'`}
          </div>
        </div>

        {/* Events feed — chronological, scrolls to latest */}
        <div className={styles.replayFeed} ref={feedRef}>
          <div className={styles.replayKickoff}>Kick off!</div>
          {visibleEvents.map((e) => {
            const isHome = e.team === 'home'
            const isSub = e.type === 'SUBSTITUTION'
            const isGoal = e.type === 'GOAL' || e.type === 'OWN_GOAL'
            const rowClass = isGoal ? styles.replayEventLatestGoal : styles.replayEventLatest
            const sideClass = isGoal ? styles.replayEventGoal : styles.replayEventNormal
            return (
              <div key={e.id} className={rowClass}>
                {isHome ? (
                  <div className={`${styles.replayEventHome} ${sideClass}`}>
                    <span>{e.playerName ?? '?'}</span>
                    {isSub && <span className={styles.replaySubArrow}>▶</span>}
                    {isSub && <span className={styles.replaySubIn}>{e.assistName ?? '?'}</span>}
                  </div>
                ) : <div />}
                <div className={styles.replayCenter}>
                  <div>{eventIcon(e.type)}</div>
                  <div>{e.minute}'</div>
                </div>
                {!isHome ? (
                  <div className={`${styles.replayEventAway} ${sideClass}`}>
                    {isSub && <span className={styles.replaySubIn}>{e.assistName ?? '?'}</span>}
                    {isSub && <span className={styles.replaySubArrow}>▶</span>}
                    <span>{e.playerName ?? '?'}</span>
                  </div>
                ) : <div />}
              </div>
            )
          })}
          {done && allEvents.length === 0 && (
            <div className={styles.replayNoEvents}>No events recorded.</div>
          )}
        </div>

        {/* Controls */}
        <div className={styles.replayControls}>
          {!done ? (
            <button onClick={() => setRunning(r => !r)} className={styles.replayPlayBtn}>
              {running ? '⏸' : '▶'}
            </button>
          ) : (
            <button
              onClick={() => { setCurrentMinute(0); setRunning(true) }}
              className={styles.replayRestartBtn}
            >
              ↺ Replay
            </button>
          )}
          <div className={styles.speedBtns}>
            {REPLAY_SPEEDS.map((s, i) => (
              <button
                key={s.label}
                onClick={() => setSpeedIdx(i)}
                className={speedIdx === i ? styles.speedBtnActive : styles.speedBtn}
              >
                {s.label}
              </button>
            ))}
          </div>
          <span className={styles.replayControlsSpacer} />
          {done && <span className={styles.replayFtLabel}>Full Time</span>}
        </div>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function MatchReport() {
  const { id: leagueId, matchId } = useParams<{ id: string; matchId: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const backTab: string = (location.state as any)?.tab ?? 'fixtures'
  const [match, setMatch] = useState<MatchDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [siblingIds, setSiblingIds] = useState<string[]>([])
  const [showReplay, setShowReplay] = useState(false)

  useEffect(() => {
    if (!leagueId || !matchId) return
    api.get(`/leagues/${leagueId}/matches/${matchId}`)
      .then((r: { data: MatchDetail }) => setMatch(r.data))
      .catch(() => setError('Match not found'))
      .finally(() => setLoading(false))
  }, [leagueId, matchId])

  useEffect(() => {
    if (!leagueId) return
    api.get(`/leagues/${leagueId}/matches`)
      .then((r: { data: Array<{ id: string; matchday: number; status: string }> }) => {
        const ids = r.data
          .filter(m => m.status === 'SIMULATED')
          .sort((a, b) => a.matchday - b.matchday || a.id.localeCompare(b.id))
          .map(m => m.id)
        setSiblingIds(ids)
      })
      .catch(() => {})
  }, [leagueId])

  if (loading) return <div className={styles.loadingState}>Loading match…</div>
  if (error || !match) return <div className={styles.errorState}>{error || 'Match not found'}</div>

  const h = match.homeScore ?? 0
  const a = match.awayScore ?? 0
  const homeWin = h > a, awayWin = a > h

  const goals    = match.events.filter(e => e.type === 'GOAL')
  const cards    = match.events.filter(e => e.type === 'YELLOW_CARD' || e.type === 'RED_CARD')
  const subs     = match.events.filter(e => e.type === 'SUBSTITUTION')
  const timeline = [...goals, ...cards, ...subs].sort((a, b) => a.minute - b.minute)

  const homeGoals = goals.filter(e => e.team === 'home')
  const awayGoals = goals.filter(e => e.team === 'away')

  function goalLines(evts: MatchEvent[]) {
    const map: Record<string, number[]> = {}
    for (const e of evts) {
      const name = e.playerName ?? '?'
      ;(map[name] ??= []).push(e.minute)
    }
    return Object.entries(map).map(([name, mins]) => `${name} ${mins.map(m => `${m}'`).join(' ')}`)
  }

  const allPerfs = [...match.performances.home, ...match.performances.away]
  const motm = allPerfs.length ? allPerfs.reduce((best, p) => p.rating > best.rating ? p : best) : null
  const motmTeam = motm && match.performances.home.find(p => p.instanceId === motm.instanceId)
    ? match.homeClub.name
    : match.awayClub.name

  return (
    <div className={styles.page}>
      {showReplay && <ReplayTicker match={match} onClose={() => setShowReplay(false)} />}
      <div className={styles.inner}>

        {/* ── Nav ──────────────────────────────────────────── */}
        <div className={styles.nav}>
          <Link to={`/league/${leagueId}?tab=${backTab}`} className={styles.backLink}>
            ← Back to league
          </Link>
          <div className={styles.navRight}>
            <button onClick={() => setShowReplay(true)} className={styles.replayBtn}>
              ▶ Replay
            </button>
            {siblingIds.length > 1 && (() => {
              const idx = siblingIds.indexOf(matchId ?? '')
              const prevId = idx > 0 ? siblingIds[idx - 1] : null
              const nextId = idx < siblingIds.length - 1 ? siblingIds[idx + 1] : null
              return (
                <>
                  <button
                    onClick={() => prevId && navigate(`/league/${leagueId}/match/${prevId}`, { state: { tab: backTab } })}
                    disabled={!prevId}
                    className={prevId ? styles.prevNextBtn : styles.prevNextBtnDisabled}
                  >
                    ‹ Prev
                  </button>
                  <button
                    onClick={() => nextId && navigate(`/league/${leagueId}/match/${nextId}`, { state: { tab: backTab } })}
                    disabled={!nextId}
                    className={nextId ? styles.prevNextBtn : styles.prevNextBtnDisabled}
                  >
                    Next ›
                  </button>
                </>
              )
            })()}
          </div>
        </div>

        {/* ── Score hero ────────────────────────────────────── */}
        <div className={styles.scoreCard}>
          <div className={styles.matchday}>
            Matchday {match.matchday} · Full Time
          </div>

          <div className={styles.scoreGrid}>
            {/* Home team */}
            <div className={styles.homeTeam}>
              <ClubBadge name={match.homeClub.name} size={80} logoConfig={match.homeClub.logoConfig} />
              <div className={homeWin ? styles.homeTeamNameWinner : styles.homeTeamNameLoser}>
                {match.homeClub.name}
              </div>
              <div className={styles.teamSideLabel}>Home</div>
              <div className={styles.goalLines}>
                {goalLines(homeGoals).map(line => (
                  <div key={line} className={styles.goalLine}><BallIcon size={12} /> {line}</div>
                ))}
              </div>
            </div>

            {/* Score */}
            <div className={styles.scoreCol}>
              <div className={styles.scoreDisplay}>
                {h}<span className={styles.scoreSep}>–</span>{a}
              </div>
              <div className={homeWin ? styles.resultBadgeHomeWin : awayWin ? styles.resultBadgeAwayWin : styles.resultBadgeDraw}>
                {homeWin ? `${match.homeClub.name} Win` : awayWin ? `${match.awayClub.name} Win` : 'Draw'}
              </div>
              {match.simulatedAt && (
                <div className={styles.matchDate}>
                  {new Date(match.simulatedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                </div>
              )}
            </div>

            {/* Away team */}
            <div className={styles.awayTeam}>
              <ClubBadge name={match.awayClub.name} size={80} logoConfig={match.awayClub.logoConfig} />
              <div className={awayWin ? styles.awayTeamNameWinner : styles.awayTeamNameLoser}>
                {match.awayClub.name}
              </div>
              <div className={styles.teamSideLabel}>Away</div>
              <div className={styles.awayGoalLines}>
                {goalLines(awayGoals).map(line => (
                  <div key={line} className={styles.goalLine}><BallIcon size={12} /> {line}</div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── Man of the Match ──────────────────────────────── */}
        {motm && (
          <div className={styles.motmCard}>
            <SectionHeader label="Man of the Match" gold />
            <div className={styles.motmBody}>
              <div
                className={styles.motmAvatar}
                style={{ background: getBadgeColor(motm.playerName) }}
              >
                {motm.playerName.split(' ').map(w => w[0]).slice(0, 2).join('')}
              </div>
              <div className={styles.motmInfo}>
                <div className={styles.motmName}>{motm.playerName}</div>
                <div className={styles.motmMeta}>
                  <span className={`${posClass(motm.positionPlayed ?? motm.position)} ${styles.motmPosTag}`}>{motm.positionPlayed ?? motm.position}</span>
                  {motm.positionPlayed && motm.positionPlayed !== motm.position && (
                    <span className={styles.motmNatPos} title="Natural position">{motm.position}</span>
                  )}
                  <span className={styles.motmMetaItem}>{motmTeam}</span>
                  {motm.goals > 0 && <span className={styles.motmMetaItem}><BallIcon size={12} /> {motm.goals}</span>}
                  {motm.assists > 0 && <span className={styles.motmMetaItem}>A{motm.assists}</span>}
                  <span className={styles.motmMetaItem}>{motm.minutesPlayed}'</span>
                </div>
              </div>
              <div className={styles.motmRating} style={{ color: ratingColor(motm.rating) }}>
                {motm.rating.toFixed(1)}
              </div>
            </div>
          </div>
        )}

        {/* ── Timeline + Stats side by side ─────────────────── */}
        <div className={styles.twoCol}>

          {/* Timeline */}
          <div className={styles.card}>
            <SectionHeader label="Timeline" />
            {timeline.length === 0 ? (
              <div className={styles.timelineEmpty}>No events recorded.</div>
            ) : (
              <div className={styles.timeline}>
                {timeline.map(e => {
                  const isHome = e.team === 'home'
                  const isSub = e.type === 'SUBSTITUTION'
                  const isYellow = e.type === 'YELLOW_CARD'
                  const isRed = e.type === 'RED_CARD'
                  const icon: ReactNode = isSub ? <SubIcon size={12} /> : isYellow ? <CardIcon color="yellow" size={12} /> : isRed ? <CardIcon color="red" size={12} /> : <BallIcon size={12} />

                  const nameBlock = isSub ? (
                    <span>
                      <span className={styles.subOut}>{e.playerName ?? '?'}</span>
                      <span className={styles.subArrow}>▶</span>
                      <span className={styles.subIn}>{e.assistName ?? '?'}</span>
                    </span>
                  ) : (
                    <span>
                      <span className={styles.eventScorer}>{e.playerName ?? '?'}</span>
                      {e.assistName && <span className={styles.eventAssist}> ({e.assistName})</span>}
                    </span>
                  )

                  return (
                    <div key={e.id} className={styles.timelineRow}>
                      {isHome
                        ? <div className={styles.timelineHome}>{nameBlock}</div>
                        : <div />}
                      <div className={styles.timelineCenter}>
                        {icon} {e.minute}'
                      </div>
                      {!isHome
                        ? <div className={styles.timelineAway}>{nameBlock}</div>
                        : <div />}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Stats */}
          {match.stats ? (
            <div className={styles.statsCard}>
              <SectionHeader label="Match Stats" />
              <div className={styles.statsTeamRow}>
                <span>{match.homeClub.name}</span>
                <span>{match.awayClub.name}</span>
              </div>
              <StatRow
                label="Possession"
                home={match.stats.home.possession}
                away={match.stats.away.possession}
                format={n => `${n}%`}
              />
              <StatRow label="Shots" home={match.stats.home.shots} away={match.stats.away.shots} />
              <StatRow label="On Target" home={match.stats.home.shotsOnTarget} away={match.stats.away.shotsOnTarget} />
              <StatRow
                label="xG"
                home={match.stats.home.xG}
                away={match.stats.away.xG}
                format={n => n.toFixed(2)}
              />
              <StatRow label="Yellow Cards" home={match.stats.home.yellowCards} away={match.stats.away.yellowCards} />
              {(match.stats.home.redCards > 0 || match.stats.away.redCards > 0) && (
                <StatRow label="Red Cards" home={match.stats.home.redCards} away={match.stats.away.redCards} />
              )}
            </div>
          ) : <div />}
        </div>

        {/* ── Player ratings ─────────────────────────────────── */}
        {allPerfs.length > 0 && (
          <div className={styles.ratingsGrid}>
            {([
              { club: match.homeClub, perfs: match.performances.home },
              { club: match.awayClub, perfs: match.performances.away },
            ] as const).map(({ club, perfs }) => (
              <div key={club.id} className={styles.ratingsCard}>
                <div className={styles.ratingsTeamLabel}>{club.name}</div>
                <div className={styles.ratingsList}>
                  {perfs.map(p => {
                    const displayPos = p.positionPlayed ?? p.position
                    const isCrossRole = p.positionPlayed && p.positionPlayed !== p.position
                    return (
                      <div key={p.instanceId} className={p === motm ? styles.ratingRowMotm : styles.ratingRowNormal}>
                        <div className={styles.ratingPosCol}>
                          <span className={`${posClass(displayPos)} ${styles.ratingPosTag}`}>{displayPos}</span>
                          {isCrossRole && (
                            <span className={styles.ratingNatPos} title="Natural position">{p.position}</span>
                          )}
                        </div>
                        <span className={p.goals > 0 ? styles.ratingNameScorer : styles.ratingName}>
                          {p.playerName}
                        </span>
                        <div className={styles.ratingMeta}>
                          {p.goals > 0   && <span className={styles.ratingIcon}><BallIcon size={11} />{p.goals}</span>}
                          {p.assists > 0 && <span className={styles.ratingIcon}>A{p.assists}</span>}
                          {p.minutesPlayed < 90 && (
                            <span className={styles.ratingMins}>{p.minutesPlayed}'</span>
                          )}
                          <span className={styles.ratingValue} style={{ color: ratingColor(p.rating) }}>
                            {p.rating.toFixed(1)}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  )
}
