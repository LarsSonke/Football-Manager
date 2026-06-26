import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Star, Target } from 'lucide-react'
import { api } from '../../api/client'
import { ClubBadge } from '../../components/ClubBadge'
import { PlayerPhoto } from '../../components/PlayerPhoto'
import { KitSvg, type KitConfig } from '../../components/KitSvg'
import { BallIcon } from '../../components/icons'
import {
  posClass,
  type LeagueData, type MatchData, type ClubData, type AwardEntry, type MatchdayAwards,
  type AvailableDeal, type ActiveDeal, type Tab,
} from './types'
import styles from './Overview.module.css'

// ─── TOTWPitch ────────────────────────────────────────────────────────────────

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
    row.forEach((p, i) => {
      const x = row.length === 1 ? 50 : 10 + (i / (row.length - 1)) * 80
      positionedPlayers.push({ player: p, x, y })
    })
  }
  return (
    <div className={styles.totwPitch}>
      <svg viewBox="0 0 100 62" preserveAspectRatio="none" className={styles.totwPitchSvg}>
        {[0,1,2,3,4,5].map(i => <rect key={i} x="0" y={i*10.3} width="100" height="5.2" fill="rgba(0,0,0,0.06)" />)}
        <rect x="2" y="2" width="96" height="58" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="0.5" />
        <line x1="2" y1="31" x2="98" y2="31" stroke="rgba(255,255,255,0.3)" strokeWidth="0.5" />
        <circle cx="50" cy="31" r="8" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="0.5" />
        <rect x="28" y="2" width="44" height="14" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="0.5" />
        <rect x="38" y="2" width="24" height="6" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="0.5" />
        <rect x="28" y="46" width="44" height="14" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="0.5" />
        <rect x="38" y="56" width="24" height="6" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="0.5" />
      </svg>
      {positionedPlayers.map(({ player: p, x, y }) => (
        <div
          key={p.instanceId}
          className={styles.totwPlayerWrap}
          style={{ left: `${x}%`, top: `${y}%` }}
        >
          <PlayerPhoto url={p.photoUrl} name={p.playerName} size={44} style={{ borderRadius: '50%', border: '2.5px solid rgba(255,255,255,0.9)', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.7))' }} />
          <KitSvg config={p.clubKitConfig as KitConfig | null} size={36} uid={`totw-${p.instanceId}`} />
          <div className={styles.totwNameplate}>
            <div className={styles.totwPlayerName}>{p.playerName.split(' ').slice(-1)[0]}</div>
            <div className={styles.totwPlayerMeta}>
              <span className={`${posClass(p.position)} ${styles.totwPlayerPos}`}>{p.position}</span>
              <span className={styles.totwPlayerRating}>{p.rating.toFixed(1)}</span>
            </div>
            {(p.goals > 0 || p.assists > 0) && (
              <div className={styles.totwPlayerStats}>
                {p.goals > 0 && <span className={styles.totwGoalStat}><BallIcon size={10} />{p.goals} </span>}
                {p.assists > 0 && <span className={styles.totwAssistStat}>A{p.assists}</span>}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Overlay primitives ───────────────────────────────────────────────────────

function MangaOverlay({ title, badge, onClose, children }: {
  title: string; badge?: string; onClose: () => void; children: ReactNode
}) {
  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [onClose])

  return (
    <div className="mg-overlay" onClick={onClose}>
      <div className="mg-overlay__panel" onClick={e => e.stopPropagation()}>
        <div className="mg-overlay__header">
          <span className="mg-overlay__title">{title}</span>
          {badge && <span className={styles.overlayBadgeText}>{badge}</span>}
          <button onClick={onClose} className="mg-overlay__close">✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

function OnboardingNote({ children }: { children: ReactNode }) {
  return (
    <div className="mg-onboarding">
      <span className="mg-onboarding__icon">ℹ</span>
      <span className="mg-onboarding__text">{children}</span>
    </div>
  )
}

// ─── Overview ─────────────────────────────────────────────────────────────────

export default function Overview({ league, matches, myClub, awards, onPhysioUpgrade, onRefresh, onSwitchTab }: {
  league: LeagueData
  matches: MatchData[]
  myClub: ClubData | undefined
  awards: MatchdayAwards | null
  onPhysioUpgrade: () => void
  onRefresh: () => void
  onSwitchTab?: (tab: Tab) => void
}) {
  const clubMap = Object.fromEntries(league.clubs.map(c => [c.id, c]))

  const [sponsorData, setSponsorData] = useState<{ available: AvailableDeal[]; active: ActiveDeal[]; history: ActiveDeal[] } | null>(null)
  const [signingDeal, setSigningDeal] = useState<number | null>(null)
  const [sponsorMsg, setSponsorMsg] = useState('')
  const [overlay, setOverlay] = useState<'sponsors' | 'physio' | 'condition' | null>(null)

  useEffect(() => {
    if (!myClub || league.status !== 'ACTIVE') return
    api.get(`/leagues/${league.id}/sponsors`).then(r => setSponsorData(r.data)).catch(() => {})
  }, [league.id, league.status, myClub?.id])

  async function handleSignDeal(index: number) {
    setSigningDeal(index)
    setSponsorMsg('')
    try {
      await api.post(`/leagues/${league.id}/sponsors/sign`, { dealIndex: index })
      const r = await api.get(`/leagues/${league.id}/sponsors`)
      setSponsorData(r.data)
      setSponsorMsg('Deal signed!')
      onRefresh()
    } catch (err: any) {
      setSponsorMsg(err.response?.data?.error ?? 'Failed to sign deal')
    } finally {
      setSigningDeal(null)
    }
  }

  const nextMatch = myClub
    ? matches.filter(m => (m.homeClubId === myClub.id || m.awayClubId === myClub.id) && m.status === 'SCHEDULED')
        .sort((a, b) => a.matchday - b.matchday)[0]
    : null

  const last5 = myClub
    ? matches.filter(m => (m.homeClubId === myClub.id || m.awayClubId === myClub.id) && m.status === 'SIMULATED')
        .sort((a, b) => b.matchday - a.matchday).slice(0, 5).reverse()
    : []

  const squad = myClub?.squad ?? []
  const avgFitness = squad.length ? Math.round(squad.reduce((s, p) => s + p.fitness, 0) / squad.length) : 0
  const avgMorale  = squad.length ? Math.round(squad.reduce((s, p) => s + p.morale, 0) / squad.length) : 0
  const avgForm    = squad.length ? Math.round(squad.reduce((s, p) => s + p.form, 0) / squad.length) : 0

  const sorted = [...league.clubs].sort((a, b) =>
    b.points !== a.points ? b.points - a.points : (b.goalsFor - b.goalsAgainst) - (a.goalsFor - a.goalsAgainst)
  )
  const myPosition = myClub ? sorted.findIndex(c => c.id === myClub.id) + 1 : null
  const myOrdinal = myPosition ? ['ST','ND','RD'][myPosition - 1] ?? 'TH' : ''

  const isHome = nextMatch && myClub ? nextMatch.homeClubId === myClub.id : false

  const oppClub = nextMatch
    ? clubMap[isHome ? nextMatch.awayClubId : nextMatch.homeClubId]
    : null

  const formPts = last5.reduce((s, m) => {
    const ih = m.homeClubId === myClub?.id
    const ms = ih ? m.homeScore! : m.awayScore!
    const os = ih ? m.awayScore! : m.homeScore!
    return s + (ms > os ? 3 : ms === os ? 1 : 0)
  }, 0)

  const heroTagline = (() => {
    if (!oppClub || !myClub) return 'The next chapter begins.'
    const myPos = myPosition ?? sorted.length
    const oppPos = sorted.findIndex(c => c.id === oppClub.id) + 1
    const gapToTop = myPos > 1 ? sorted[0].points - myClub.points : 0
    if (myPos === 1) return "Top of the table. Don't let up now."
    if (gapToTop <= 3) return `${gapToTop} point${gapToTop !== 1 ? 's' : ''} off the top — win and it's alive.`
    if (oppPos <= 2) return `A clash against the ${oppPos === 1 ? 'leaders' : 'contenders'}. This is a test.`
    if (last5.length >= 3 && formPts >= 7) return "Good run of form. Don't let up now."
    if (last5.length >= 3 && formPts <= 3) return 'Backs to the wall. This side needs a result.'
    return `${isHome ? 'Home' : 'Away'} vs ${oppClub.name}. Three points change everything.`
  })()

  const statColor = (v: number) => v >= 75 ? '#2f6b46' : v >= 55 ? '#cf9438' : '#e5202f'

  return (
    <div className={styles.root}>

      {/* ══════════════════════════════ OVERLAYS ══════════════════════════════ */}

      {overlay === 'sponsors' && myClub && league.status === 'ACTIVE' && (
        <MangaOverlay
          title="SPONSORS"
          badge={sponsorData ? `${sponsorData.active.length}/3 Active` : undefined}
          onClose={() => setOverlay(null)}
        >
          <OnboardingNote>
            Sign deals with sponsors to earn bonus income. Each deal sets a target goal — reach it by the target matchday and the reward is added to your budget. Signing a deal costs a fee upfront. You can hold up to 3 active deals at once.
          </OnboardingNote>
          <div className={styles.overlayBody}>
            {sponsorData ? (
              <>
                {/* Active deals */}
                {sponsorData.active.length > 0 && (
                  <div className={styles.overlayActiveDealBlock}>
                    <div className={styles.overlaySectionLabel}>Active Deals</div>
                    {sponsorData.active.map(deal => (
                      <div key={deal.id} className={styles.overlayDealRow}>
                        <span className={styles.overlayDealEmojiActive}>{deal.sponsorEmoji}</span>
                        <div className={styles.overlayDealInfo}>
                          <div className={styles.overlayDealName}>{deal.sponsorName}</div>
                          <div className={styles.overlayDealDeadline}>Complete by Matchday {deal.targetMatchday}</div>
                        </div>
                        <div className={styles.overlayDealRight}>
                          <div className={styles.overlayDealRewardLg}>+€{(deal.reward / 1000).toFixed(1)}k</div>
                          <div className={styles.overlayDealActiveLabel}>Active</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Available deals */}
                {sponsorData.active.length < 3 && sponsorData.available.length > 0 && (
                  <div className={styles.overlayAvailDealsBlock}>
                    <div className={styles.overlaySectionLabel}>
                      Available Deals · {3 - sponsorData.active.length} slot{3 - sponsorData.active.length !== 1 ? 's' : ''} open
                    </div>
                    {sponsorData.available.map((deal, i) => (
                      <div key={i} className={styles.overlayDealRow}>
                        <span className={styles.overlayDealEmojiAvailable}>{deal.sponsorEmoji}</span>
                        <div className={styles.overlayDealInfo}>
                          <div className={styles.overlayDealName}>{deal.sponsorName}</div>
                          <div className={styles.overlayDealDeadline}>
                            Reward: +€{(deal.reward / 1000).toFixed(1)}k
                          </div>
                        </div>
                        <div className={styles.overlayDealRight}>
                          <div className={styles.overlayDealCost}>-€{(deal.cost / 1000).toFixed(1)}k</div>
                          <button
                            className={styles.overlayDealSignBtn}
                            style={{
                              color: myClub.budget < deal.cost ? 'var(--ash)' : 'var(--accent)',
                              border: `2px solid ${myClub.budget < deal.cost ? 'rgba(244,241,234,.15)' : 'var(--accent)'}`,
                              cursor: myClub.budget < deal.cost ? 'not-allowed' : 'pointer',
                            }}
                            disabled={signingDeal !== null || myClub.budget < deal.cost}
                            onClick={() => handleSignDeal(i)}
                            title={myClub.budget < deal.cost ? 'Not enough budget' : undefined}
                          >
                            {signingDeal === i ? '…' : myClub.budget < deal.cost ? "Can't afford" : 'Sign Deal'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {sponsorData.active.length >= 3 && (
                  <div className={styles.overlaySlotsLabel}>
                    All 3 deal slots filled. Complete or wait for a deal to free a slot.
                  </div>
                )}

                {sponsorMsg && (
                  <div className={`${styles.overlaySponsorMsg} ${sponsorMsg.includes('signed') ? styles.overlaySponsorMsgSuccess : styles.overlaySponsorMsgError}`}>
                    {sponsorMsg}
                  </div>
                )}

                {/* History */}
                {sponsorData.history.length > 0 && (
                  <div className={styles.overlayHistoryBlock}>
                    <div className={styles.overlaySectionLabel}>History</div>
                    {sponsorData.history.map(deal => (
                      <div key={deal.id} className={styles.overlayHistoryRow}>
                        <span className={styles.overlayHistoryEmoji}>{deal.sponsorEmoji}</span>
                        <span className={styles.overlayHistoryName}>{deal.sponsorName}</span>
                        <span className={deal.status === 'COMPLETED' ? styles.overlayHistoryCompleted : styles.overlayHistoryFailed}>
                          {deal.status === 'COMPLETED' ? `+€${(deal.reward / 1000).toFixed(1)}k` : 'Failed'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className={styles.overlayLoadingNote}>Loading sponsors…</div>
            )}
          </div>
        </MangaOverlay>
      )}

      {overlay === 'physio' && myClub && (
        <MangaOverlay
          title="PHYSIO FACILITY"
          badge={`LVL ${myClub.physioLevel} / 2`}
          onClose={() => setOverlay(null)}
        >
          <OnboardingNote>
            Your Physio Facility determines how much it costs to heal injured players and how available treatment is. <strong style={{ color: 'var(--paper)' }}>Level 1</strong> — basic treatment, standard costs. <strong style={{ color: 'var(--paper)' }}>Level 2</strong> — faster recovery, reduced fees. Injured players cannot play in matches until healed from the Squad tab.
          </OnboardingNote>
          <div className={styles.overlayBody}>
            {/* Upgrade level bar */}
            <div className={styles.physioOverlayLevelBlock}>
              <div className={styles.physioOverlayLevelHeader}>
                <span className={styles.physioOverlayLevelLabel}>Facility Level</span>
                <span className={styles.physioOverlayLevelValue}>LVL {myClub.physioLevel} / 2</span>
              </div>
              <div className={styles.physioOverlayLevelBar}>
                {[0,1].map(i => (
                  <div
                    key={i}
                    className={`${styles.physioOverlayLevelSegment} ${i < myClub.physioLevel ? styles.physioOverlayLevelSegmentActive : ''}`}
                  >
                    {i < myClub.physioLevel && <div className={styles.physioOverlaySegmentStripe} />}
                  </div>
                ))}
              </div>
              {myClub.physioLevel < 2 && (
                <div className={styles.physioOverlayUpgradeWrap}>
                  <button
                    className="btn"
                    style={{
                      background: myClub.budget >= [15_000, 30_000][myClub.physioLevel] ? 'rgba(229,32,47,0.12)' : 'transparent',
                      color: 'var(--paper)',
                      border: `2px solid ${myClub.budget >= [15_000, 30_000][myClub.physioLevel] ? 'var(--accent)' : 'rgba(244,241,234,.2)'}`,
                      width: '100%',
                      fontSize: 13,
                      letterSpacing: '.06em',
                    }}
                    onClick={() => { onPhysioUpgrade(); setOverlay(null) }}
                    disabled={myClub.budget < [15_000, 30_000][myClub.physioLevel]}
                  >
                    {myClub.budget < [15_000, 30_000][myClub.physioLevel]
                      ? `Not enough budget · Need €${[15, 30][myClub.physioLevel]}k`
                      : `Upgrade to Level ${myClub.physioLevel + 1} · €${[15, 30][myClub.physioLevel]}k`}
                  </button>
                  <div className={styles.physioOverlayUpgradeNote}>
                    {myClub.physioLevel === 0 ? 'Unlock basic treatment for injured players' : 'Unlock advanced recovery — lower costs, faster return'}
                  </div>
                </div>
              )}
              {myClub.physioLevel >= 2 && (
                <div className={styles.physioOverlayMaxLevel}>
                  ✓ Max Level — Full recovery support active
                </div>
              )}
            </div>

            {/* Treatment room */}
            <div>
              <div className={styles.physioOverlayTreatmentLabel}>
                Treatment Room · {squad.filter(p => p.injured).length} player{squad.filter(p => p.injured).length !== 1 ? 's' : ''}
              </div>
              {squad.filter(p => p.injured).length === 0 ? (
                <div className={styles.physioOverlayAllClear}>
                  ✓ All Clear — no injuries in the squad
                </div>
              ) : (
                squad.filter(p => p.injured).map(p => (
                  <div key={p.id} className={styles.physioOverlayPatientRow}>
                    <span className={styles.physioOverlayPatientBar} />
                    <span className={`${posClass(p.player.position)} ${styles.posIconSm}`}>{p.player.position}</span>
                    <div className={styles.physioOverlayPatientInfo}>
                      <div className={styles.physioOverlayPatientName}>{p.player.name}</div>
                      <div className={styles.physioOverlayPatientStatus}>Injured · Cannot play</div>
                    </div>
                    <div className={styles.physioOverlayPatientFitness}>
                      <div className={styles.physioOverlayFitnessValue}>{p.fitness}</div>
                      <div className={styles.physioOverlayFitnessLabel}>fit</div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Fitness rundown — all squad sorted by fitness */}
            <div className={styles.physioOverlayFitnessBlock}>
              <div className={styles.physioOverlayFullFitnessLabel}>
                Full Squad — Fitness
              </div>
              <div className={styles.physioOverlayFitnessRows}>
                {[...squad].sort((a, b) => a.fitness - b.fitness).map(p => {
                  const c = statColor(p.fitness)
                  return (
                    <div key={p.id} className={styles.physioOverlayFitnessRow}>
                      <span className={`${posClass(p.player.position)} ${styles.posIconSm}`}>{p.player.position}</span>
                      <div>
                        <div className={styles.physioOverlayFitnessPlayerName}>
                          {p.player.name}
                          {p.injured && <span className={styles.physioOverlayInjTag}>INJ</span>}
                        </div>
                        <div className={styles.physioOverlayBarTrack}>
                          <div className="mg-bar__fill" style={{ width: `${p.fitness}%`, background: c }} />
                        </div>
                      </div>
                      <div className={styles.physioOverlayFitnessNumber} style={{ color: c }}>{p.fitness}</div>
                    </div>
                  )
                })}
              </div>
            </div>

            <button
              onClick={() => { setOverlay(null); onSwitchTab?.('squad') }}
              className={styles.physioOverlaySquadBtn}
            >
              Go to Squad tab to heal players →
            </button>
          </div>
        </MangaOverlay>
      )}

      {overlay === 'condition' && myClub && (
        <MangaOverlay
          title="SQUAD CONDITION"
          onClose={() => setOverlay(null)}
        >
          <OnboardingNote>
            <strong style={{ color: 'var(--paper)' }}>Fitness</strong> drops after matches and recovers during rest days — players below 35 risk injury. <strong style={{ color: 'var(--paper)' }}>Morale</strong> rises with wins and drops with losses — it affects how well players perform. <strong style={{ color: 'var(--paper)' }}>Sharpness</strong> measures tactical familiarity and builds over time as your squad plays together.
          </OnboardingNote>
          <div className={styles.overlayBody}>
            {/* Header row */}
            <div className={styles.conditionOverlayHeaderRow}>
              <span />
              <span className={styles.conditionOverlayColHeader}>Player</span>
              {['Fitness', 'Morale', 'Sharp'].map(h => (
                <span key={h} className={styles.conditionOverlayColHeaderCenter}>{h}</span>
              ))}
            </div>
            {[...squad].sort((a, b) => a.fitness - b.fitness).map(p => {
              const fitC = statColor(p.fitness)
              const morC = statColor(p.morale)
              const frmC = p.form >= 75 ? '#08080a' : p.form >= 55 ? '#cf9438' : '#e5202f'
              return (
                <div key={p.id} className={styles.conditionOverlayRow}>
                  <span className={`${posClass(p.player.position)} ${styles.posIconSm}`}>{p.player.position}</span>
                  <div className={styles.conditionOverlayPlayerName}>
                    {p.player.name.split(' ').slice(-1)[0]}
                    {p.injured && <span className={styles.conditionOverlayInjTag}>INJ</span>}
                  </div>
                  {[{ v: p.fitness, c: fitC }, { v: p.morale, c: morC }, { v: p.form, c: frmC }].map(({ v, c }, idx) => (
                    <div key={idx} className={styles.conditionOverlayStatCell}>
                      <span className={styles.conditionOverlayStatValue} style={{ color: c }}>{v}</span>
                      <div className={styles.conditionOverlayBarTrack}>
                        <div className="mg-bar__fill" style={{ width: `${v}%`, background: c }} />
                      </div>
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        </MangaOverlay>
      )}

      {/* ══════════════════════════════ HERO: MATCHDAY / SEASON ══════════════════════════════ */}
      {myClub && league.status !== 'SETUP' && league.status !== 'DRAFTING' && (
        <section className={styles.heroSection}>
          <div className="hero-speed-lines" />

          {/* LEFT */}
          <div className={styles.heroContent}>
            <div>
              {/* Badge */}
              <div className={styles.heroBadge}>
                <span className={styles.heroBadgeText}>
                  {nextMatch
                    ? `Matchday ${nextMatch.matchday} · ${isHome ? 'Home' : 'Away'}`
                    : league.status === 'FINISHED' ? 'Season Complete · Final'
                    : 'All Fixtures Played'}
                </span>
              </div>
              {/* Club name */}
              <div className={styles.heroClubName}>
                {myClub.name.toUpperCase()}
              </div>
              {/* VS + opponent OR final standing */}
              {nextMatch ? (
                <div className={styles.heroVsRow}>
                  <span className={styles.heroVs}>VS</span>
                  <span className={styles.heroOpponent}>
                    {(oppClub?.name ?? '???').toUpperCase()}
                  </span>
                </div>
              ) : (
                <div className={styles.heroFinalRow}>
                  <span className={styles.heroFinalLabel}>FINAL</span>
                  <span className={styles.heroFinalPos}>{myPosition ?? '–'}</span>
                  {myPosition && <span className={styles.heroFinalOrdinal}>{myOrdinal}</span>}
                </div>
              )}
              {/* Tagline */}
              <div className={styles.heroTagline}>
                {nextMatch ? heroTagline : (() => {
                  const p = myPosition ?? sorted.length
                  if (p === 1) return 'Champions. The title is yours.'
                  if (p <= 3) return `${p}${myOrdinal} place — a strong campaign.`
                  if (p <= Math.ceil(sorted.length / 2)) return 'Mid-table finish. More to come.'
                  return 'A tough season. Regroup and come back stronger.'
                })()}
              </div>
            </div>
            {/* Buttons */}
            <div className={styles.heroButtons}>
              {nextMatch ? (
                <>
                  <Link
                    to={`/league/${league.id}/match/${nextMatch.id}`}
                    className={styles.heroBtnAccent}
                  >
                    <span className={styles.heroBtnText}>Enter Match</span>
                  </Link>
                  <button
                    onClick={() => onSwitchTab?.('tactics')}
                    className={styles.heroBtnGhost}
                  >
                    <span className={styles.heroBtnText}>Team Sheet</span>
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => onSwitchTab?.('fixtures')}
                    className={styles.heroBtnAccent}
                  >
                    <span className={styles.heroBtnText}>View Results</span>
                  </button>
                  <button
                    onClick={() => onSwitchTab?.('stats')}
                    className={styles.heroBtnGhost}
                  >
                    <span className={styles.heroBtnTextSm}>Season Stats</span>
                  </button>
                </>
              )}
            </div>
          </div>

        </section>
      )}

      {/* ══════════════════ ROW A: BUDGET (2fr) + SQUAD CONDITION (1fr) ══════════════════ */}
      {myClub && (() => {
        const wages = myClub.squad.reduce((s, p) => s + p.wage, 0)
        const mdRunway = wages > 0 ? Math.floor(myClub.budget / wages) : null
        const remaining = league.seasonLength - league.currentDay
        const isLow = mdRunway !== null && mdRunway < remaining
        const netSpend = league.startingBudget - myClub.budget
        return (
          <div className={styles.rowA}>

            {/* ── Transfer Budget ── */}
            <section className={styles.budgetPanel}>
              <div className={styles.budgetHeader}>
                <span className={styles.budgetHeaderTitle}>TRANSFER BUDGET</span>
                <span className={styles.budgetHeaderBadge}>
                  {isLow ? 'Low ↓' : 'Stable ↑'}
                </span>
              </div>
              <div className={styles.budgetBody}>
                <div className={styles.budgetMainRow}>
                  <div>
                    <div className={styles.budgetBigNumber}>
                      €{(myClub.budget / 1_000_000).toFixed(1)}<span className={styles.budgetBigNumberUnit}>M</span>
                    </div>
                    <div className={styles.budgetAvailableLabel}>Available to spend</div>
                  </div>
                  {wages > 0 && (
                    <div className={styles.budgetNetSpend}>
                      <div className={`${styles.budgetNetSpendValue} ${netSpend > 0 ? styles.budgetNetSpendPositive : styles.budgetNetSpendNegative}`}>
                        {netSpend >= 0 ? '-' : '+'}€{(Math.abs(netSpend) / 1000).toFixed(0)}k
                      </div>
                      <div className={styles.budgetNetSpendLabel}>Net spend</div>
                    </div>
                  )}
                </div>
                <div className={styles.budgetStats}>
                  {([
                    ['Transfer kitty', `€${(myClub.budget / 1_000_000).toFixed(1)}M`, Math.min(100, (myClub.budget / Math.max(league.startingBudget, 1)) * 100), 'var(--paper)'],
                    ['Wage bill / md', wages > 0 ? `€${(wages / 1000).toFixed(1)}k` : '—', wages > 0 ? Math.min(100, (wages / (myClub.budget / 10 + 1)) * 100) : 0, 'var(--ash)'],
                    ['Runway', mdRunway !== null ? `${mdRunway}md` : '—', mdRunway !== null ? Math.min(100, (mdRunway / Math.max(remaining, 1)) * 100) : 0, mdRunway !== null && mdRunway < 5 ? 'var(--accent)' : 'var(--ash)'],
                  ] as [string, string, number, string][]).map(([k, v, pct, c]) => (
                    <div key={k} className={styles.budgetStatRow}>
                      <div className={styles.budgetStatMeta}>
                        <span className={styles.budgetStatKey}>{k}</span>
                        <span className={styles.budgetStatValue}>{v}</span>
                      </div>
                      <div className="mg-bar">
                        <div className="mg-bar__fill" style={{ width: `${pct}%`, background: c }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* ── Squad Condition (clickable) ── */}
            <section
              onClick={() => setOverlay('condition')}
              className={`${styles.conditionPanel} mg-clickable`}
            >
              <div className={styles.conditionHeader}>
                <span className={styles.conditionHeaderTitle}>SQUAD CONDITION</span>
                <span className={styles.conditionHeaderBadge}>Details →</span>
              </div>
              <div className={styles.conditionBody}>
                {([
                  ['Fitness',   avgFitness, avgFitness >= 75 ? '#2f6b46' : avgFitness >= 55 ? '#cf9438' : '#e5202f'],
                  ['Morale',    avgMorale,  avgMorale  >= 75 ? '#2f6b46' : avgMorale  >= 55 ? '#cf9438' : '#e5202f'],
                  ['Sharpness', avgForm,    avgForm    >= 75 ? '#08080a' : avgForm    >= 55 ? '#cf9438' : '#e5202f'],
                ] as [string, number, string][]).map(([k, v, c]) => (
                  <div key={k} className={styles.conditionStat}>
                    <div className={styles.conditionStatMeta}>
                      <span className={styles.conditionStatKey}>{k}</span>
                      <span className={styles.conditionStatValue} style={{ color: c }}>{v}</span>
                    </div>
                    <div className={styles.conditionBarWrap}>
                      <div className="mg-bar__fill" style={{ width: `${v}%`, background: c }} />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )
      })()}

      {/* ══════════════════ ROW B: SPONSORS + PHYSIO + STANDING ══════════════════ */}
      {myClub && (
        <div className={styles.rowB}>

          {/* ── Sponsors (clickable summary) ── */}
          <section
            onClick={() => league.status === 'ACTIVE' ? setOverlay('sponsors') : undefined}
            className={`${styles.sponsorsPanel} ${league.status === 'ACTIVE' ? styles.sponsorsPanelClickable : ''}`}
          >
            <div className={styles.sponsorsPanelHeader}>
              <span className={styles.sponsorsPanelTitle}>SPONSORS</span>
              <span className={styles.sponsorsPanelBadge}>
                {league.status === 'ACTIVE' ? (sponsorData ? `${sponsorData.active.length}/3 Active` : '…') : 'Not started'}
              </span>
            </div>
            <div className={styles.sponsorsPanelBody}>
              {league.status === 'ACTIVE' ? (
                <>
                  {sponsorData ? (
                    sponsorData.active.length > 0 ? (
                      sponsorData.active.slice(0, 2).map(deal => (
                        <div key={deal.id} className={styles.sponsorDealRow}>
                          <span className={styles.sponsorDealEmoji}>{deal.sponsorEmoji}</span>
                          <div className={styles.sponsorDealInfo}>
                            <div className={styles.sponsorDealName}>{deal.sponsorName}</div>
                            <div className={styles.sponsorDealDeadline}>by MD{deal.targetMatchday}</div>
                          </div>
                          <span className={styles.sponsorDealReward}>+€{(deal.reward / 1000).toFixed(1)}k</span>
                        </div>
                      ))
                    ) : (
                      <div className={styles.sponsorsEmptyNote}>
                        No active deals — tap to browse available sponsors.
                      </div>
                    )
                  ) : (
                    <div className={styles.sponsorsLoadingNote}>Loading…</div>
                  )}
                  {sponsorData && sponsorData.available.length > 0 && sponsorData.active.length < 3 && (
                    <div className={styles.sponsorsAvailableNote}>
                      {sponsorData.available.length} deal{sponsorData.available.length !== 1 ? 's' : ''} available to sign
                    </div>
                  )}
                  <div className={styles.sponsorsManageLink}>
                    Manage →
                  </div>
                </>
              ) : (
                <div className={styles.sponsorsNotStarted}>
                  Opens once the season starts.
                </div>
              )}
            </div>
          </section>

          {/* ── Physio Facility (clickable summary) ── */}
          <section
            onClick={() => setOverlay('physio')}
            className={`${styles.physioPanel} mg-clickable`}
          >
            <div className={styles.physioPanelHeader}>
              <span className={styles.physioPanelTitle}>PHYSIO FACILITY</span>
              <span className={styles.physioPanelBadge}>LVL {myClub.physioLevel} / 2</span>
            </div>
            <div className={styles.physioPanelBody}>
              <div className={styles.physioLevelBarRow}>
                {[0, 1].map(i => (
                  <span
                    key={i}
                    className={`${styles.physioLevelSegment} ${i < myClub.physioLevel ? styles.physioLevelSegmentActive : ''}`}
                  />
                ))}
              </div>
              {squad.filter(p => p.injured).length > 0 ? (
                <>
                  <div className={styles.physioInjuredLabel}>
                    {squad.filter(p => p.injured).length} injured player{squad.filter(p => p.injured).length !== 1 ? 's' : ''}
                  </div>
                  {squad.filter(p => p.injured).slice(0, 2).map(p => (
                    <div key={p.id} className={styles.physioInjuredRow}>
                      <span className={styles.physioInjuredBar} />
                      <div className={styles.physioInjuredInfo}>
                        <div className={styles.physioInjuredName}>{p.player.name.split(' ').slice(-1)[0]}</div>
                      </div>
                      <div className={styles.physioInjuredFitness}>{p.fitness}</div>
                    </div>
                  ))}
                  {squad.filter(p => p.injured).length > 2 && (
                    <div className={styles.physioMoreNote}>+{squad.filter(p => p.injured).length - 2} more</div>
                  )}
                </>
              ) : (
                <div className={styles.physioAllClear}>✓ All Clear</div>
              )}
              {myClub.physioLevel < 2 && (
                <div className={styles.physioUpgradeNote}>
                  Upgrade available →
                </div>
              )}
              <div className={styles.physioManageLink}>
                Manage →
              </div>
            </div>
          </section>

          {/* ── Standing ── */}
          <section className={styles.standingPanel}>
            <div className={styles.standingGhostNumber}>{myPosition ?? '?'}</div>
            <div className={styles.standingLabel}>Standing</div>
            <div className={styles.standingPosRow}>
              <span className={styles.standingPosNumber}>{myPosition ?? '–'}</span>
              {myPosition && <span className={styles.standingPosOrdinal}>{myOrdinal}</span>}
            </div>
            <div className={styles.standingBarWrap}>
              <div
                className={styles.standingBarFill}
                style={{ width: `${myPosition ? (1 - (myPosition - 1) / Math.max(sorted.length - 1, 1)) * 100 : 50}%` }}
              />
            </div>
            <div className={styles.standingStatsRow}>
              {[['Pts', String(myClub.points)], ['GD', (myClub.goalsFor - myClub.goalsAgainst > 0 ? '+' : '') + (myClub.goalsFor - myClub.goalsAgainst)], ['Won', String(myClub.wins)]].map(([k, v]) => (
                <div key={k} className={styles.standingStatItem}>
                  <div className={styles.standingStatValue}>{v}</div>
                  <div className={styles.standingStatKey}>{k}</div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {/* ══════════════════════════════ RECENT ARCS ══════════════════════════════ */}
      {last5.length > 0 && myClub && (
        <div className={styles.recentArcs}>
          <div className={styles.recentArcsHeading}>
            <span className={styles.recentArcsTitle}>RECENT ARCS</span>
            <span className={styles.recentArcsRule} />
            <span className={styles.recentArcsSummary}>
              {last5.map(m => { const ih = m.homeClubId === myClub.id; const ms = ih ? m.homeScore! : m.awayScore!; const os = ih ? m.awayScore! : m.homeScore!; return ms > os ? 'W' : ms === os ? 'D' : 'L' }).join(' ')} · {formPts} pts
            </span>
          </div>
          <div
            className={styles.recentArcsGrid}
            style={{ gridTemplateColumns: `repeat(${last5.length}, 1fr)` }}
          >
            {last5.map((m, i) => {
              const ih = m.homeClubId === myClub.id
              const ms = ih ? m.homeScore! : m.awayScore!
              const os = ih ? m.awayScore! : m.homeScore!
              const r = ms > os ? 'W' : ms === os ? 'D' : 'L'
              const opp = clubMap[ih ? m.awayClubId : m.homeClubId]
              return (
                <Link
                  key={m.id}
                  to={`/league/${league.id}/match/${m.id}`}
                  state={{ tab: 'overview' }}
                  className={styles.recentArcCard}
                  data-result={r}
                  style={{ animation: `mgUp .45s ${(0.06 * i).toFixed(2)}s both` }}
                >
                  <div className={styles.recentArcCardStripe} />
                  <div className={styles.recentArcOpp}>{opp?.name ?? '?'}</div>
                  <div className={styles.recentArcScore}>{ms}–{os}</div>
                  <div className={styles.recentArcResult}>{r}</div>
                </Link>
              )
            })}
          </div>
        </div>
      )}

      {/* ══════════════════════════════ AWARDS ══════════════════════════════ */}
      {awards && (
        <div className={styles.awardsPanel}>
          <div className={styles.awardsPanelHeader}>
            <span className="accent-bar accent-bar-gold" />
            <span className={styles.awardsPanelTitle}>MATCHDAY {awards.matchday} AWARDS</span>
          </div>
          <div className={styles.awardsBody}>
            <div className={styles.awardsGrid}>
              {[
                { id: 'motm',   label: <><Star size={12} /> MOTM</>,        entry: awards.motm, value: awards.motm?.rating.toFixed(1) },
                { id: 'scorer', label: <><BallIcon size={12} /> Top Scorer</>, entry: awards.topScorer ? { ...awards.topScorer, rating: 0, goals: awards.topScorer.goals, assists: 0, position: '', clubKitConfig: null, photoUrl: null } as AwardEntry : null, value: awards.topScorer ? String(awards.topScorer.goals) : null },
                { id: 'assist', label: <><Target size={12} /> Top Assist</>,   entry: awards.topAssist ? { ...awards.topAssist, rating: 0, goals: 0, assists: awards.topAssist.assists, position: '', clubKitConfig: null, photoUrl: null } as AwardEntry : null, value: awards.topAssist ? String(awards.topAssist.assists) : null },
              ].map(item => item.entry ? (
                <div key={item.id} className={styles.awardCard}>
                  <div className={styles.awardCardLabel}>{item.label}</div>
                  <div className={styles.awardCardPhotos}>
                    <PlayerPhoto url={item.entry.photoUrl} name={item.entry.playerName} size={36} style={{ borderRadius: '50%', border: '2px solid var(--border)' }} />
                    <KitSvg config={item.entry.clubKitConfig as KitConfig | null} size={32} uid={`award-${item.id}-kit`} />
                  </div>
                  <div className={styles.awardCardName}>{item.entry.playerName}</div>
                  <div className={styles.awardCardClub}>
                    <ClubBadge name={item.entry.clubName} size={16} logoConfig={item.entry.clubLogoConfig} />
                    <span className={styles.awardCardClubName}>{item.entry.clubName}</span>
                  </div>
                  <div className={styles.awardCardValue}>{item.value}</div>
                </div>
              ) : null)}
            </div>
            {awards.teamOfTheWeek.length > 0 && (
              <>
                <div className={styles.totwLabel}>Team of the Week</div>
                <TOTWPitch players={awards.teamOfTheWeek} />
              </>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════ LEAGUE TABLE ══════════════════════════════ */}
      {myClub && (
        <div className={styles.leagueTableSection}>
          <div className={styles.leagueTableHeading}>
            <span className={styles.leagueTableTitle}>LEAGUE TABLE</span>
            <span className={styles.leagueTableRule} />
            <button
              onClick={() => onSwitchTab?.('standings')}
              className={styles.leagueTableFullBtn}
            >
              Full Table →
            </button>
          </div>
          <div className={styles.leagueTableWrap}>
            {sorted.slice(0, 6).map((club, i) => {
              const isMe = club.id === myClub.id
              const gd = club.goalsFor - club.goalsAgainst
              const posColor = i === 0 ? '#cf9438' : i < 4 ? 'var(--paper)' : 'var(--ash)'
              return (
                <Link
                  key={club.id}
                  to={`/league/${league.id}/club/${club.id}`}
                  className={styles.leagueTableRow}
                  data-me={isMe ? 'true' : 'false'}
                >
                  <div className={styles.leagueTablePos} style={{ color: posColor }}>{i + 1}</div>
                  <div className={styles.leagueTableClub}>
                    <ClubBadge name={club.name} size={20} logoConfig={club.logoConfig} />
                    {club.name}
                  </div>
                  <div className={styles.leagueTableWDL}>
                    <span className={styles.leagueTableW}>{club.wins}W</span>
                    <span className={styles.leagueTableD}>{club.draws}D</span>
                    <span className={styles.leagueTableL}>{club.losses}L</span>
                  </div>
                  <div className={styles.leagueTableGd}>{gd > 0 ? `+${gd}` : gd}</div>
                  <div className={styles.leagueTablePts}>{club.points}</div>
                </Link>
              )
            })}
            {sorted.length > 6 && (
              <button
                onClick={() => onSwitchTab?.('standings')}
                className={styles.leagueTableMoreBtn}
              >
                +{sorted.length - 6} more clubs — View full table
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
