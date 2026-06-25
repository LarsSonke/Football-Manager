import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../api/client'
import { ClubBadge } from '../../components/ClubBadge'
import { KitSvg, type KitConfig } from '../../components/KitSvg'
import {
  useIsMobile, getBadgeColor, posClass,
  type LeagueData, type MatchData, type ClubData, type AwardEntry, type MatchdayAwards,
  type AvailableDeal, type ActiveDeal, type Tab,
} from './types'

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
    <div style={{ position: 'relative', width: '100%', paddingBottom: '62%', overflow: 'hidden', background: '#1a5c28' }}>
      <svg viewBox="0 0 100 62" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
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
        <div key={p.instanceId} style={{ position: 'absolute', left: `${x}%`, top: `${y}%`, transform: 'translate(-50%, -50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, width: 72 }}>
          {p.photoUrl ? (
            <img src={p.photoUrl} alt="" style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover', border: '2.5px solid rgba(255,255,255,0.9)', flexShrink: 0, filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.7))' }} />
          ) : (
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: getBadgeColor(p.playerName), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 900, color: '#000', border: '2.5px solid rgba(255,255,255,0.9)', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.7))' }}>
              {p.playerName.split(' ').map(w => w[0]).slice(0, 2).join('')}
            </div>
          )}
          <KitSvg config={p.clubKitConfig as KitConfig | null} size={36} uid={`totw-${p.instanceId}`} />
          <div style={{ background: 'rgba(0,0,0,0.72)', padding: '2px 6px', textAlign: 'center', backdropFilter: 'blur(4px)' }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', lineHeight: 1.3, maxWidth: 68, overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.playerName.split(' ').slice(-1)[0]}</div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
              <span className={posClass(p.position)} style={{ fontSize: 7, padding: '1px 3px' }}>{p.position}</span>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 11, color: 'var(--gold)', lineHeight: 1 }}>{p.rating.toFixed(1)}</span>
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
  const isMobile = useIsMobile()
  const clubMap = Object.fromEntries(league.clubs.map(c => [c.id, c]))

  const [sponsorData, setSponsorData] = useState<{ available: AvailableDeal[]; active: ActiveDeal[]; history: ActiveDeal[] } | null>(null)
  const [signingDeal, setSigningDeal] = useState<number | null>(null)
  const [sponsorMsg, setSponsorMsg] = useState('')

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

  // Rival opponent for rival watch panel
  const oppClub = nextMatch
    ? clubMap[isHome ? nextMatch.awayClubId : nextMatch.homeClubId]
    : null

  // Form points
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ══════════════════════════════ HERO: MATCHDAY / SEASON ══════════════════════════════ */}
      {myClub && league.status !== 'SETUP' && league.status !== 'DRAFTING' && (
        <section style={{ position: 'relative', border: '3px solid var(--paper)', background: 'var(--steel)', overflow: 'hidden', minHeight: 340, animation: 'mgSlam .5s cubic-bezier(.2,.8,.3,1) both' }}>
          <div className="hero-speed-lines" />

          {/* LEFT */}
          <div style={{ position: 'relative', padding: '30px 30px 28px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', zIndex: 2 }}>
            <div>
              {/* Badge */}
              <div style={{ display: 'inline-flex', alignItems: 'center', background: 'var(--accent)', padding: '5px 13px', transform: 'skewX(-9deg)' }}>
                <span style={{ fontFamily: 'var(--font-narrow)', fontSize: 11, fontWeight: 700, letterSpacing: '.24em', textTransform: 'uppercase', transform: 'skewX(9deg)', color: '#fff' }}>
                  {nextMatch
                    ? `Matchday ${nextMatch.matchday} · ${isHome ? 'Home' : 'Away'}`
                    : league.status === 'FINISHED' ? 'Season Complete · Final'
                    : 'All Fixtures Played'}
                </span>
              </div>
              {/* Club name — 88px matching manga */}
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 88, lineHeight: .82, marginTop: 18, letterSpacing: '-.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {myClub.name.toUpperCase()}
              </div>
              {/* VS + opponent OR final standing */}
              {nextMatch ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 2, overflow: 'hidden' }}>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 34, color: 'var(--accent)', transform: 'skewX(-8deg)', flexShrink: 0 }}>VS</span>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 62, lineHeight: .82, WebkitTextStroke: '2px var(--paper)', color: 'transparent', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {(oppClub?.name ?? '???').toUpperCase()}
                  </span>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, marginTop: 2 }}>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 34, color: 'var(--accent)', transform: 'skewX(-8deg)', flexShrink: 0 }}>FINAL</span>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 78, lineHeight: .82 }}>{myPosition ?? '–'}</span>
                  {myPosition && <span style={{ fontFamily: 'var(--font-display)', fontSize: 34, marginBottom: 10 }}>{myOrdinal}</span>}
                </div>
              )}
              {/* Tagline */}
              <div style={{ fontFamily: 'var(--font-narrow)', fontSize: 13, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--ash)', marginTop: 16, lineHeight: 1.5, maxWidth: 420 }}>
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
            <div style={{ display: 'flex', alignItems: 'stretch', gap: 12, marginTop: 24 }}>
              {nextMatch ? (
                <>
                  <Link
                    to={`/league/${league.id}/match/${nextMatch.id}`}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--accent)', color: '#fff', padding: '15px 24px', textDecoration: 'none', clipPath: 'polygon(0 0, 100% 0, 92% 100%, 0 100%)', transition: 'transform .2s' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.transform = 'translateX(4px)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.transform = '' }}
                  >
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 900, letterSpacing: '.1em', textTransform: 'uppercase' }}>Enter Match</span>
                  </Link>
                  <button
                    onClick={() => onSwitchTab?.('tactics')}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, border: '2px solid var(--paper)', padding: '15px 22px', background: 'transparent', color: 'var(--paper)', cursor: 'pointer', transition: 'background .2s, color .2s' }}
                    onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background = 'var(--paper)'; b.style.color = 'var(--ink)' }}
                    onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background = 'transparent'; b.style.color = 'var(--paper)' }}
                  >
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 900, letterSpacing: '.1em', textTransform: 'uppercase' }}>Team Sheet</span>
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => onSwitchTab?.('fixtures')}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--accent)', color: '#fff', padding: '15px 24px', border: 'none', clipPath: 'polygon(0 0, 100% 0, 92% 100%, 0 100%)', cursor: 'pointer', transition: 'transform .2s' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'translateX(4px)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = '' }}
                  >
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 900, letterSpacing: '.1em', textTransform: 'uppercase' }}>View Results</span>
                  </button>
                  <button
                    onClick={() => onSwitchTab?.('stats')}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, border: '2px solid var(--paper)', padding: '15px 22px', background: 'transparent', color: 'var(--paper)', cursor: 'pointer', transition: 'background .2s, color .2s' }}
                    onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background = 'var(--paper)'; b.style.color = 'var(--ink)' }}
                    onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background = 'transparent'; b.style.color = 'var(--paper)' }}
                  >
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 900, letterSpacing: '.1em', textTransform: 'uppercase' }}>Season Stats</span>
                  </button>
                </>
              )}
            </div>
          </div>

        </section>
      )}

      {/* ══════════════════════ ROW A: BUDGET (2fr) + SQUAD CONDITION (1fr) ══════════════════════ */}
      {myClub && (() => {
        const wages = myClub.squad.reduce((s, p) => s + p.wage, 0)
        const mdRunway = wages > 0 ? Math.floor(myClub.budget / wages) : null
        const remaining = league.seasonLength - league.currentDay
        const isLow = mdRunway !== null && mdRunway < remaining
        const netSpend = league.startingBudget - myClub.budget
        return (
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '2fr 1fr', gap: 14, animation: 'mgInL .5s .1s both' }}>

            {/* ── Transfer Budget ── */}
            <section style={{ border: '3px solid var(--paper)', background: 'var(--steel)', overflow: 'hidden' }}>
              <div style={{ background: 'var(--ink)', padding: '9px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '3px solid var(--paper)' }}>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, letterSpacing: '.02em' }}>TRANSFER BUDGET</span>
                <span style={{ fontFamily: 'var(--font-narrow)', fontSize: 10, letterSpacing: '.2em', textTransform: 'uppercase', color: 'var(--accent)' }}>
                  {isLow ? 'Low ↓' : 'Stable ↑'}
                </span>
              </div>
              <div style={{ padding: 18 }}>
                <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 60, lineHeight: .8 }}>
                      €{(myClub.budget / 1_000_000).toFixed(1)}<span style={{ fontSize: 32 }}>M</span>
                    </div>
                    <div style={{ fontFamily: 'var(--font-narrow)', fontSize: 10, letterSpacing: '.2em', textTransform: 'uppercase', color: 'var(--ash)', marginTop: 6 }}>Available to spend</div>
                  </div>
                  {wages > 0 && (
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, color: netSpend > 0 ? 'var(--accent)' : '#2f6b46', lineHeight: .9 }}>
                        {netSpend >= 0 ? '-' : '+'}€{(Math.abs(netSpend) / 1000).toFixed(0)}k
                      </div>
                      <div style={{ fontFamily: 'var(--font-narrow)', fontSize: 10, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--ash)' }}>Net spend</div>
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 18 }}>
                  {([
                    ['Transfer kitty', `€${(myClub.budget / 1_000_000).toFixed(1)}M`, Math.min(100, (myClub.budget / Math.max(league.startingBudget, 1)) * 100), 'var(--paper)'],
                    ['Wage bill / md', wages > 0 ? `€${(wages / 1000).toFixed(1)}k` : '—', wages > 0 ? Math.min(100, (wages / (myClub.budget / 10 + 1)) * 100) : 0, 'var(--ash)'],
                    ['Runway', mdRunway !== null ? `${mdRunway}md` : '—', mdRunway !== null ? Math.min(100, (mdRunway / Math.max(remaining, 1)) * 100) : 0, mdRunway !== null && mdRunway < 5 ? 'var(--accent)' : 'var(--ash)'],
                  ] as [string, string, number, string][]).map(([k, v, pct, c]) => (
                    <div key={k}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                        <span style={{ fontFamily: 'var(--font-narrow)', fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ash)' }}>{k}</span>
                        <span style={{ fontFamily: 'var(--font-display)', fontSize: 17 }}>{v}</span>
                      </div>
                      <div style={{ height: 6, background: '#0c0c0e' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: c, transformOrigin: 'left', animation: 'mgGrow 1s .3s cubic-bezier(.2,.8,.3,1) both' }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* ── Squad Condition ── */}
            <section style={{ border: '3px solid var(--paper)', background: 'var(--paper)', color: 'var(--ink)', overflow: 'hidden' }}>
              <div style={{ background: 'var(--ink)', color: 'var(--paper)', padding: '9px 16px', borderBottom: '3px solid var(--paper)' }}>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, letterSpacing: '.02em' }}>SQUAD CONDITION</span>
              </div>
              <div style={{ padding: '16px 18px 18px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                {([
                  ['Fitness',   avgFitness, avgFitness >= 75 ? '#2f6b46' : avgFitness >= 55 ? '#cf9438' : '#e5202f'],
                  ['Morale',    avgMorale,  avgMorale  >= 75 ? '#cf9438' : avgMorale  >= 55 ? '#cf9438' : '#e5202f'],
                  ['Sharpness', avgForm,    avgForm    >= 75 ? '#08080a' : avgForm    >= 55 ? '#cf9438' : '#e5202f'],
                ] as [string, number, string][]).map(([k, v, c]) => (
                  <div key={k}>
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 5 }}>
                      <span style={{ fontFamily: 'var(--font-narrow)', fontSize: 11, letterSpacing: '.16em', textTransform: 'uppercase', color: '#666' }}>{k}</span>
                      <span style={{ fontFamily: 'var(--font-display)', fontSize: 30, lineHeight: .8, color: c }}>{v}</span>
                    </div>
                    <div style={{ height: 6, background: 'rgba(8,8,10,.12)' }}>
                      <div style={{ height: '100%', width: `${v}%`, background: c, transformOrigin: 'left', animation: 'mgGrow 1s .3s cubic-bezier(.2,.8,.3,1) both' }} />
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
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.15fr 1.15fr .9fr', gap: 14, animation: 'mgUp .5s .14s both' }}>

          {/* ── Sponsors ── */}
          <section style={{ border: '3px solid var(--paper)', background: 'var(--steel)', overflow: 'hidden' }}>
            <div style={{ background: 'var(--ink)', padding: '9px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '3px solid var(--paper)' }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 18 }}>SPONSORS</span>
              {sponsorData && <span style={{ fontFamily: 'var(--font-narrow)', fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--accent)' }}>{sponsorData.active.length}/3 Active</span>}
            </div>
            <div style={{ padding: '14px 16px 16px' }}>
              {league.status === 'ACTIVE' ? (
                <>
                  {sponsorData?.active.map(deal => (
                    <div key={deal.id} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '11px 0', borderBottom: '2px solid rgba(244,241,234,.08)' }}>
                      <span style={{ width: 30, height: 30, flexShrink: 0, background: 'var(--accent)', clipPath: 'polygon(0 0,100% 0,100% 100%,22% 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>
                        {deal.sponsorEmoji}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 800, textTransform: 'uppercase', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{deal.sponsorName}</div>
                        <div style={{ fontFamily: 'var(--font-narrow)', fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--ash)' }}>by MD{deal.targetMatchday} · Active</div>
                      </div>
                      <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, flexShrink: 0, color: '#2f6b46' }}>+€{(deal.reward / 1000).toFixed(1)}k</span>
                    </div>
                  ))}
                  {sponsorData && sponsorData.active.length < 3 && sponsorData.available.slice(0, 3 - sponsorData.active.length).map((deal, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '11px 0', borderBottom: '2px solid rgba(244,241,234,.08)', opacity: .6 }}>
                      <span style={{ width: 30, height: 30, flexShrink: 0, background: '#2a2a2e', clipPath: 'polygon(0 0,100% 0,100% 100%,22% 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>
                        {deal.sponsorEmoji}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 800, textTransform: 'uppercase', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{deal.sponsorName}</div>
                        <div style={{ fontFamily: 'var(--font-narrow)', fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--ash)' }}>Available · -€{(deal.cost / 1000).toFixed(1)}k</div>
                      </div>
                      <button
                        style={{ fontFamily: 'var(--font-display)', fontSize: 13, color: '#2f6b46', background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0, padding: 0 }}
                        disabled={signingDeal !== null || myClub.budget < deal.cost}
                        onClick={() => handleSignDeal(sponsorData.available.indexOf(deal))}
                      >
                        {signingDeal === sponsorData.available.indexOf(deal) ? '…' : 'Sign'}
                      </button>
                    </div>
                  ))}
                  {!sponsorData && <div style={{ fontFamily: 'var(--font-narrow)', fontSize: 11, color: 'var(--ash)', padding: '8px 0' }}>Loading...</div>}
                  {sponsorData && sponsorData.active.length >= 3 && (
                    <div style={{ fontFamily: 'var(--font-narrow)', fontSize: 11, color: 'var(--ash)', padding: '8px 0', letterSpacing: '.08em', textTransform: 'uppercase' }}>3/3 slots filled.</div>
                  )}
                  {sponsorMsg && <div style={{ fontSize: 12, textAlign: 'center', marginTop: 8, color: sponsorMsg.includes('signed') ? '#2f6b46' : 'var(--accent)' }}>{sponsorMsg}</div>}
                  {sponsorData && sponsorData.history.length > 0 && (
                    <div style={{ marginTop: 10, paddingTop: 10, borderTop: '2px solid rgba(244,241,234,.08)' }}>
                      <div style={{ fontFamily: 'var(--font-narrow)', fontSize: 10, fontWeight: 700, color: 'var(--ash)', textTransform: 'uppercase', letterSpacing: '.14em', marginBottom: 6 }}>Recent</div>
                      {sponsorData.history.slice(0, 2).map(deal => (
                        <div key={deal.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0' }}>
                          <span style={{ fontSize: 13 }}>{deal.sponsorEmoji}</span>
                          <span style={{ fontFamily: 'var(--font-narrow)', fontSize: 11, color: 'var(--ash)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{deal.sponsorName}</span>
                          <span style={{ fontFamily: 'var(--font-display)', fontSize: 13, color: deal.status === 'COMPLETED' ? '#2f6b46' : 'var(--accent)' }}>
                            {deal.status === 'COMPLETED' ? `+€${(deal.reward / 1000).toFixed(1)}k` : 'Failed'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div style={{ fontFamily: 'var(--font-narrow)', fontSize: 11, color: 'var(--ash)', letterSpacing: '.1em', textTransform: 'uppercase', padding: '8px 0' }}>
                  Opens once the season starts.
                </div>
              )}
            </div>
          </section>

          {/* ── Physio Facility ── */}
          <section style={{ border: '3px solid var(--paper)', background: 'var(--steel)', overflow: 'hidden' }}>
            <div style={{ background: 'var(--ink)', padding: '9px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '3px solid var(--paper)' }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 18 }}>PHYSIO FACILITY</span>
              <span style={{ fontFamily: 'var(--font-narrow)', fontSize: 10, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--accent)' }}>LVL {myClub.physioLevel} / 2</span>
            </div>
            <div style={{ padding: '14px 16px 16px' }}>
              <div style={{ display: 'flex', gap: 5, marginBottom: 14 }}>
                {[0, 1].map(i => (
                  <span key={i} style={{ flex: 1, height: 8, background: i < myClub.physioLevel ? 'var(--accent)' : '#2a2a2e' }} />
                ))}
              </div>
              {squad.filter(p => p.injured).length > 0 ? (
                <>
                  <div style={{ fontFamily: 'var(--font-narrow)', fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--ash)', marginBottom: 8 }}>
                    Treatment Room · {squad.filter(p => p.injured).length}
                  </div>
                  {squad.filter(p => p.injured).slice(0, 3).map(p => (
                    <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 0', borderBottom: '2px solid rgba(244,241,234,.08)' }}>
                      <span style={{ width: 7, height: 26, flexShrink: 0, background: 'var(--accent)' }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 800, textTransform: 'uppercase', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.player.name.split(' ').slice(-1)[0]}</div>
                        <div style={{ fontFamily: 'var(--font-narrow)', fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--ash)' }}>Injured</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--accent)', lineHeight: .9 }}>{p.fitness}</div>
                        <div style={{ fontFamily: 'var(--font-narrow)', fontSize: 8, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ash)' }}>fit</div>
                      </div>
                    </div>
                  ))}
                </>
              ) : (
                <div style={{ fontFamily: 'var(--font-narrow)', fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ash)', marginBottom: 8 }}>All Clear</div>
              )}
              {myClub.physioLevel < 2 ? (
                <button
                  className="btn"
                  style={{ background: 'transparent', color: 'var(--paper)', border: '2px solid rgba(244,241,234,.4)', width: '100%', fontSize: 11, marginTop: 10 }}
                  onClick={onPhysioUpgrade}
                  disabled={myClub.budget < [15_000, 30_000][myClub.physioLevel]}
                >
                  Upgrade Lv {myClub.physioLevel + 1} · €{[15, 30][myClub.physioLevel]}k
                </button>
              ) : (
                <div style={{ fontFamily: 'var(--font-narrow)', fontSize: 11, textAlign: 'center', padding: '6px 0', fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--ash)' }}>Max Level</div>
              )}
            </div>
          </section>

          {/* ── Standing ── */}
          <section style={{ border: '3px solid var(--accent)', background: 'var(--accent)', color: '#fff', position: 'relative', overflow: 'hidden', padding: '18px 18px 16px' }}>
            <div style={{ position: 'absolute', right: -20, bottom: -30, opacity: .18, fontFamily: 'var(--font-display)', fontSize: 200, lineHeight: .7, pointerEvents: 'none', userSelect: 'none' }}>
              {myPosition ?? '?'}
            </div>
            <div style={{ fontFamily: 'var(--font-narrow)', fontSize: 10, letterSpacing: '.24em', textTransform: 'uppercase', position: 'relative' }}>Standing</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, position: 'relative', marginTop: 2 }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 78, lineHeight: .78 }}>{myPosition ?? '–'}</span>
              {myPosition && <span style={{ fontFamily: 'var(--font-display)', fontSize: 30, marginBottom: 12 }}>{myOrdinal}</span>}
            </div>
            <div style={{ height: 3, background: 'rgba(255,255,255,.4)', margin: '8px 0 12px', position: 'relative', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${myPosition ? (1 - (myPosition - 1) / Math.max(sorted.length - 1, 1)) * 100 : 50}%`, background: '#fff', transformOrigin: 'left', animation: 'mgGrow 1s .4s cubic-bezier(.2,.8,.3,1) both' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', position: 'relative' }}>
              {[['Pts', String(myClub.points)], ['GD', (myClub.goalsFor - myClub.goalsAgainst > 0 ? '+' : '') + (myClub.goalsFor - myClub.goalsAgainst)], ['Won', String(myClub.wins)]].map(([k, v]) => (
                <div key={k}>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, lineHeight: 1 }}>{v}</div>
                  <div style={{ fontFamily: 'var(--font-narrow)', fontSize: 9, letterSpacing: '.14em', textTransform: 'uppercase', opacity: .85 }}>{k}</div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {/* ══════════════════════════════ RECENT ARCS ══════════════════════════════ */}
      {last5.length > 0 && myClub && (
        <div style={{ animation: 'mgUp .4s .18s both' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 22 }}>RECENT ARCS</span>
            <span style={{ flex: 1, height: 3, background: 'var(--paper)' }} />
            <span style={{ fontFamily: 'var(--font-narrow)', fontSize: 11, letterSpacing: '.2em', textTransform: 'uppercase', color: 'var(--accent)' }}>
              {last5.map(m => { const ih = m.homeClubId === myClub.id; const ms = ih ? m.homeScore! : m.awayScore!; const os = ih ? m.awayScore! : m.homeScore!; return ms > os ? 'W' : ms === os ? 'D' : 'L' }).join(' ')} · {formPts} pts
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${last5.length}, 1fr)`, gap: 12, marginTop: 13 }}>
            {last5.map((m, i) => {
              const ih = m.homeClubId === myClub.id
              const ms = ih ? m.homeScore! : m.awayScore!
              const os = ih ? m.awayScore! : m.homeScore!
              const r = ms > os ? 'W' : ms === os ? 'D' : 'L'
              const opp = clubMap[ih ? m.awayClubId : m.homeClubId]
              const bg = r === 'W' ? 'var(--paper)' : r === 'D' ? 'var(--steel)' : 'var(--accent)'
              const fg = r === 'W' ? 'var(--ink)' : 'var(--paper)'
              return (
                <Link
                  key={m.id}
                  to={`/league/${league.id}/match/${m.id}`}
                  state={{ tab: 'overview' }}
                  style={{ textDecoration: 'none', position: 'relative', border: '3px solid var(--paper)', background: bg, color: fg, padding: '15px 16px', overflow: 'hidden', animation: `mgUp .45s ${(0.06 * i).toFixed(2)}s both` }}
                >
                  <div style={{ position: 'absolute', inset: 0, opacity: .1, background: 'repeating-linear-gradient(115deg, currentColor 0 2px, transparent 2px 9px)', pointerEvents: 'none' }} />
                  <div style={{ fontFamily: 'var(--font-narrow)', fontSize: 9, letterSpacing: '.16em', textTransform: 'uppercase', opacity: .75, position: 'relative' }}>{opp?.name ?? '?'}</div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 34, lineHeight: .84, marginTop: 5, position: 'relative' }}>{ms}–{os}</div>
                  <div style={{ fontFamily: 'var(--font-display)', position: 'absolute', right: 10, bottom: 6, fontSize: 30, opacity: .9 }}>{r}</div>
                </Link>
              )
            })}
          </div>
        </div>
      )}

      {/* ══════════════════════════════ AWARDS ══════════════════════════════ */}
      {awards && (
        <div style={{ border: '2px solid rgba(244,241,234,0.14)', background: 'var(--steel)', overflow: 'hidden' }}>
          <div style={{ background: 'var(--bg-card-2)', padding: '9px 16px', borderBottom: '2px solid rgba(244,241,234,0.08)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="accent-bar accent-bar-gold" />
            <span style={{ fontFamily: 'var(--font-narrow)', fontSize: 11, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--text-2)' }}>Matchday {awards.matchday} Awards</span>
          </div>
          <div style={{ padding: 20 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
              {[
                { label: '⭐ MOTM',       entry: awards.motm, value: awards.motm?.rating.toFixed(1) },
                { label: '⚽ Top Scorer', entry: awards.topScorer ? { ...awards.topScorer, rating: 0, goals: awards.topScorer.goals, assists: 0, position: '', clubKitConfig: null, photoUrl: null } as AwardEntry : null, value: awards.topScorer ? String(awards.topScorer.goals) : null },
                { label: '🎯 Top Assist', entry: awards.topAssist ? { ...awards.topAssist, rating: 0, goals: 0, assists: awards.topAssist.assists, position: '', clubKitConfig: null, photoUrl: null } as AwardEntry : null, value: awards.topAssist ? String(awards.topAssist.assists) : null },
              ].map(item => item.entry ? (
                <div key={item.label} style={{ background: 'var(--bg-card-2)', border: '2px solid rgba(244,241,234,0.10)', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' }}>
                  <div style={{ fontFamily: 'var(--font-narrow)', fontSize: 9, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.12em' }}>{item.label}</div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {item.entry.photoUrl ? (
                      <img src={item.entry.photoUrl} alt="" style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--border)', flexShrink: 0 }} />
                    ) : (
                      <div style={{ width: 36, height: 36, borderRadius: '50%', background: getBadgeColor(item.entry.playerName), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 900, color: '#000', flexShrink: 0 }}>
                        {item.entry.playerName.split(' ').map(w => w[0]).slice(0, 2).join('')}
                      </div>
                    )}
                    <KitSvg config={item.entry.clubKitConfig as KitConfig | null} size={32} uid={`award-${item.label}-kit`} />
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)', lineHeight: 1.3 }}>{item.entry.playerName}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <ClubBadge name={item.entry.clubName} size={16} logoConfig={item.entry.clubLogoConfig} />
                    <span style={{ fontSize: 10, color: 'var(--text-2)' }}>{item.entry.clubName}</span>
                  </div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: 'var(--gold)' }}>{item.value}</div>
                </div>
              ) : null)}
            </div>
            {awards.teamOfTheWeek.length > 0 && (
              <>
                <div style={{ fontFamily: 'var(--font-narrow)', fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.12em', marginBottom: 10 }}>Team of the Week</div>
                <TOTWPitch players={awards.teamOfTheWeek} />
              </>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════ LEAGUE TABLE ══════════════════════════════ */}
      {myClub && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 22 }}>LEAGUE TABLE</span>
            <span style={{ flex: 1, height: 3, background: 'var(--paper)' }} />
          </div>
          <div style={{ border: '3px solid var(--paper)', background: 'var(--steel)', overflow: 'hidden' }}>
            {sorted.slice(0, 6).map((club, i) => {
              const isMe = club.id === myClub.id
              const gd = club.goalsFor - club.goalsAgainst
              const posColor = i === 0 ? '#cf9438' : i < 4 ? 'var(--paper)' : 'var(--ash)'
              return (
                <Link
                  key={club.id}
                  to={`/league/${league.id}/club/${club.id}`}
                  style={{
                    textDecoration: 'none', display: 'grid',
                    gridTemplateColumns: '40px 1fr 70px 60px 50px',
                    gap: 10, alignItems: 'center', padding: '10px 12px',
                    background: isMe ? 'rgba(229,32,47,.12)' : 'transparent',
                    borderBottom: '2px solid rgba(244,241,234,.06)',
                    transition: 'background .12s',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.background = isMe ? 'rgba(229,32,47,0.2)' : 'rgba(244,241,234,0.03)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.background = isMe ? 'rgba(229,32,47,.12)' : 'transparent' }}
                >
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: posColor, textAlign: 'center' }}>{i + 1}</div>
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.01em', color: isMe ? 'var(--accent)' : 'var(--paper)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{club.name}</div>
                  <div style={{ fontFamily: 'var(--font-narrow)', fontSize: 12, color: 'var(--ash)', textAlign: 'center' }}>{gd > 0 ? `+${gd}` : gd}</div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, textAlign: 'right', color: isMe ? 'var(--accent)' : 'var(--paper)' }}>{club.points}</div>
                </Link>
              )
            })}
            {sorted.length > 6 && (
              <div style={{ fontFamily: 'var(--font-narrow)', fontSize: 11, color: 'var(--ash)', textAlign: 'center', padding: '10px', borderTop: '1px solid rgba(244,241,234,0.06)', letterSpacing: '.08em', textTransform: 'uppercase' }}>
                +{sorted.length - 6} more clubs
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
