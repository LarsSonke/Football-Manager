import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../api/client'
import { ClubBadge } from '../../components/ClubBadge'
import { KitSvg, type KitConfig } from '../../components/KitSvg'
import {
  useIsMobile, getBadgeColor, posClass, squadAvgOvr,
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

// ─── SectionHeader ────────────────────────────────────────────────────────────

function SectionHeader({ title, right }: { title: string; right?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
      <span style={{ fontFamily: 'var(--font-display)', fontSize: 20, letterSpacing: '.02em', whiteSpace: 'nowrap' }}>{title}</span>
      <span style={{ flex: 1, height: 2, background: 'var(--paper)' }} />
      {right && <span style={{ fontFamily: 'var(--font-narrow)', fontSize: 11, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--accent)', whiteSpace: 'nowrap' }}>{right}</span>}
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

  const topPlayer = squad.length > 0 ? [...squad].sort((a, b) => b.player.overall - a.player.overall)[0] : null

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

      {/* ══════════════════════════════ HERO: NEXT MATCHDAY ══════════════════════════════ */}
      {myClub && nextMatch && league.status === 'ACTIVE' && (
        <section style={{ position: 'relative', border: '3px solid var(--paper)', background: 'var(--steel)', overflow: 'hidden', display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.32fr 1fr', minHeight: 380, animation: 'mgSlam .5s cubic-bezier(.2,.8,.3,1) both' }}>
          {/* Speed lines burst */}
          <div className="hero-speed-lines" />

          {/* LEFT: headline + buttons */}
          <div style={{ position: 'relative', padding: '28px 30px 26px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', zIndex: 2 }}>
            <div>
              <div style={{ display: 'inline-flex', alignItems: 'center', background: 'var(--accent)', padding: '5px 13px', transform: 'skewX(-9deg)' }}>
                <span style={{ fontFamily: 'var(--font-narrow)', fontSize: 11, fontWeight: 700, letterSpacing: '.24em', textTransform: 'uppercase', transform: 'skewX(9deg)', color: '#fff' }}>
                  Matchday {nextMatch.matchday} · {isHome ? 'Home' : 'Away'}
                </span>
              </div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 74, lineHeight: .82, marginTop: 16, letterSpacing: '-.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {myClub.name.toUpperCase()}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 6, overflow: 'hidden' }}>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: 26, color: 'var(--accent)', transform: 'skewX(-8deg)', flexShrink: 0 }}>VS</span>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: 48, lineHeight: .82, WebkitTextStroke: '2px var(--paper)', color: 'transparent', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {(oppClub?.name ?? '???').toUpperCase()}
                </span>
              </div>
              <div style={{ fontFamily: 'var(--font-narrow)', fontSize: 12, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ash)', marginTop: 16, lineHeight: 1.55, maxWidth: 400 }}>
                {heroTagline}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'stretch', gap: 10, marginTop: 22 }}>
              <Link
                to={`/league/${league.id}/match/${nextMatch.id}`}
                style={{ display: 'flex', alignItems: 'center', padding: '14px 24px', textDecoration: 'none', background: 'var(--accent)', color: '#fff', clipPath: 'polygon(0 0, 100% 0, 92% 100%, 0 100%)', transition: 'transform .2s' }}
                onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.transform = 'translateX(4px)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.transform = '' }}
              >
                <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 900, letterSpacing: '.1em', textTransform: 'uppercase' }}>Next Match</span>
              </Link>
              <button
                onClick={() => onSwitchTab?.('tactics')}
                style={{ display: 'flex', alignItems: 'center', padding: '14px 20px', background: 'transparent', border: '2px solid var(--paper)', color: 'var(--paper)', cursor: 'pointer', transition: 'background .2s, color .2s' }}
                onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background = 'var(--paper)'; b.style.color = 'var(--ink)' }}
                onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background = 'transparent'; b.style.color = 'var(--paper)' }}
              >
                <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 900, letterSpacing: '.1em', textTransform: 'uppercase' }}>Team Sheet</span>
              </button>
            </div>
          </div>

          {/* RIGHT: top player portrait */}
          <div style={{ position: 'relative', borderLeft: isMobile ? 'none' : '3px solid var(--paper)', borderTop: isMobile ? '3px solid var(--paper)' : 'none', background: 'var(--ink)', overflow: 'hidden', minHeight: isMobile ? 220 : 'auto' }}>
            {topPlayer?.player.photoUrl && (
              <div style={{ position: 'absolute', inset: 0, transform: 'skewX(-3deg) scale(1.06)', transformOrigin: 'top right' }}>
                <img src={topPlayer.player.photoUrl} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center', filter: 'grayscale(1) contrast(1.15)' }} />
              </div>
            )}
            {/* Ghost opponent name when no photo */}
            {!topPlayer?.player.photoUrl && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 20px', overflow: 'hidden' }}>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: 56, color: 'rgba(244,241,234,.05)', textAlign: 'center', lineHeight: .88, wordBreak: 'break-word' }}>
                  {(oppClub?.name ?? '').toUpperCase()}
                </span>
              </div>
            )}
            {/* Gradient overlay */}
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(120deg, rgba(8,8,10,.8), transparent 42%, transparent 70%, rgba(8,8,10,.9))' }} />
            {/* Accent corner triangle */}
            <div style={{ position: 'absolute', right: 0, top: 0, width: 0, height: 0, borderTop: '90px solid var(--accent)', borderLeft: '90px solid transparent' }} />
            {/* Big OVR */}
            <div style={{ position: 'absolute', left: 18, top: 18, zIndex: 1 }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 68, lineHeight: .78, color: 'var(--paper)' }}>
                {topPlayer?.player.overall ?? squadAvgOvr(myClub) ?? '–'}
              </div>
              <div style={{ fontFamily: 'var(--font-narrow)', fontSize: 11, letterSpacing: '.3em', textTransform: 'uppercase', color: 'var(--accent)', marginTop: 2 }}>Overall</div>
            </div>
            {/* Name tag */}
            {topPlayer && (
              <div style={{ position: 'absolute', left: 0, bottom: 18, background: 'var(--paper)', color: 'var(--ink)', padding: '8px 20px 8px 14px', clipPath: 'polygon(0 0, 100% 0, 90% 100%, 0 100%)', zIndex: 1 }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 26, lineHeight: .84 }}>
                  {topPlayer.player.name.split(' ').slice(-1)[0].toUpperCase()}
                </div>
                <div style={{ fontFamily: 'var(--font-narrow)', fontSize: 10, letterSpacing: '.2em', textTransform: 'uppercase', color: 'var(--accent)', fontWeight: 700 }}>
                  {topPlayer.player.position} · OVR {topPlayer.player.overall}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ══════════════════════ SECOND ROW: stats / rival / standing ══════════════════════ */}
      {myClub && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : '1.1fr 1.1fr .9fr',
          gap: 14,
          animation: 'mgUp .4s .1s both',
        }}>

          {/* ── My Club Stats (ink-on-paper card) ── */}
          <section style={{ border: '3px solid var(--paper)', background: 'var(--paper)', color: 'var(--ink)', overflow: 'hidden' }}>
            <div style={{ background: 'var(--ink)', color: 'var(--paper)', padding: '9px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 17, letterSpacing: '.02em' }}>{myClub.name.toUpperCase()}</span>
              <span style={{ fontFamily: 'var(--font-narrow)', fontSize: 10, letterSpacing: '.2em', textTransform: 'uppercase', color: 'var(--accent)' }}>
                {myClub.wins}W {myClub.draws}D {myClub.losses}L
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
              {[
                ['Points',   String(myClub.points),                          'var(--ink)'],
                ['GD',       String(myClub.goalsFor - myClub.goalsAgainst > 0 ? '+' : '') + (myClub.goalsFor - myClub.goalsAgainst), myClub.goalsFor > myClub.goalsAgainst ? '#1a5c28' : myClub.goalsFor < myClub.goalsAgainst ? '#7f1d1d' : 'var(--ink)'],
                ['Squad OVR', String(squadAvgOvr(myClub) ?? '–'),            'var(--ink)'],
                ['Goals',    String(myClub.goalsFor),                        'var(--ink)'],
              ].map(([k, v, c]) => (
                <div key={k} style={{ padding: '14px 16px', borderBottom: '2px solid rgba(8,8,10,.08)', borderRight: '2px solid rgba(8,8,10,.08)' }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 38, lineHeight: .82, color: c }}>{v}</div>
                  <div style={{ fontFamily: 'var(--font-narrow)', fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase', color: 'rgba(8,8,10,.5)', marginTop: 4 }}>{k}</div>
                </div>
              ))}
            </div>
            <div style={{ padding: '0 16px 14px' }}>
              <div style={{ background: 'var(--ink)', color: 'var(--paper)', padding: '9px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: 14, color: 'var(--accent)' }}>"</span>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, fontStyle: 'italic', fontWeight: 700 }}>
                  {myClub.wins > myClub.losses ? 'Good form. Keep the momentum.' : myClub.wins === myClub.losses ? 'It could go either way — stay sharp.' : 'Time to turn it around.'}
                </span>
              </div>
            </div>
          </section>

          {/* ── Rival Watch (diagonal VS split) ── */}
          <section style={{ border: '3px solid var(--paper)', overflow: 'hidden' }}>
            <div style={{ background: 'var(--ink)', padding: '9px 16px', borderBottom: '3px solid var(--paper)' }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 17, letterSpacing: '.02em' }}>RIVAL WATCH</span>
            </div>
            {oppClub ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', position: 'relative', minHeight: 170 }}>
                {/* diagonal divider */}
                <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 3, background: 'var(--paper)', transform: 'translateX(-50%) skewX(-9deg)', zIndex: 3 }} />
                {/* VS badge */}
                <div style={{
                  position: 'absolute', left: '50%', top: '50%',
                  transform: 'translate(-50%,-50%) skewX(-9deg)',
                  background: 'var(--accent)', color: '#fff',
                  zIndex: 4, width: 40, height: 40,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 15, transform: 'skewX(9deg)' }}>VS</span>
                </div>
                {/* My side */}
                <div style={{ background: 'var(--steel)', padding: '14px 16px', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                  <div style={{ fontFamily: 'var(--font-narrow)', fontSize: 10, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 4 }}>Ours</div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, lineHeight: .88, marginBottom: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{myClub.name.toUpperCase()}</div>
                  <div style={{ display: 'flex', gap: 14 }}>
                    <div>
                      <div style={{ fontFamily: 'var(--font-display)', fontSize: 22 }}>{myClub.wins}</div>
                      <div style={{ fontFamily: 'var(--font-narrow)', fontSize: 9, letterSpacing: '.14em', color: 'var(--ash)', textTransform: 'uppercase' }}>Wins</div>
                    </div>
                    <div>
                      <div style={{ fontFamily: 'var(--font-display)', fontSize: 22 }}>{myClub.goalsFor}</div>
                      <div style={{ fontFamily: 'var(--font-narrow)', fontSize: 9, letterSpacing: '.14em', color: 'var(--ash)', textTransform: 'uppercase' }}>Goals</div>
                    </div>
                  </div>
                </div>
                {/* Opponent side */}
                <div style={{ background: '#101013', padding: '14px 16px', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'flex-end', textAlign: 'right' }}>
                  <div style={{ fontFamily: 'var(--font-narrow)', fontSize: 10, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--ash)', marginBottom: 4 }}>Theirs</div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, lineHeight: .88, color: 'var(--ash)', marginBottom: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>{oppClub.name.toUpperCase()}</div>
                  <div style={{ display: 'flex', gap: 14, flexDirection: 'row-reverse' }}>
                    <div>
                      <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: 'var(--ash)' }}>{oppClub.wins}</div>
                      <div style={{ fontFamily: 'var(--font-narrow)', fontSize: 9, letterSpacing: '.14em', color: '#5a5a62', textTransform: 'uppercase' }}>Wins</div>
                    </div>
                    <div>
                      <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: 'var(--ash)' }}>{oppClub.goalsFor}</div>
                      <div style={{ fontFamily: 'var(--font-narrow)', fontSize: 9, letterSpacing: '.14em', color: '#5a5a62', textTransform: 'uppercase' }}>Goals</div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ padding: '28px 20px', textAlign: 'center' }}>
                <div style={{ fontFamily: 'var(--font-narrow)', fontSize: 11, color: 'var(--text-2)', letterSpacing: '.14em', textTransform: 'uppercase' }}>
                  {league.status === 'ACTIVE' ? 'Season complete — no more fixtures' : 'No fixtures scheduled yet'}
                </div>
              </div>
            )}
          </section>

          {/* ── Table Standing (accent card) ── */}
          <section style={{ border: '3px solid var(--accent)', background: 'var(--accent)', color: '#fff', position: 'relative', overflow: 'hidden', padding: '18px 18px 16px' }}>
            {/* ghost position number */}
            <div style={{ position: 'absolute', right: -12, bottom: -20, opacity: .15, fontFamily: 'var(--font-display)', fontSize: 180, lineHeight: .7, pointerEvents: 'none', userSelect: 'none' }}>
              {myPosition ?? '?'}
            </div>
            <div style={{ fontFamily: 'var(--font-narrow)', fontSize: 10, letterSpacing: '.24em', textTransform: 'uppercase', position: 'relative', opacity: .85 }}>Standing</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, position: 'relative', marginTop: 2 }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 72, lineHeight: .82 }}>{myPosition ?? '–'}</span>
              {myPosition && <span style={{ fontFamily: 'var(--font-display)', fontSize: 26, marginBottom: 10 }}>{myOrdinal}</span>}
            </div>
            {/* progress bar */}
            <div style={{ height: 3, background: 'rgba(255,255,255,.35)', margin: '10px 0 14px', position: 'relative', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${myPosition ? (1 - (myPosition - 1) / Math.max(sorted.length - 1, 1)) * 100 : 50}%`, background: '#fff', transformOrigin: 'left', animation: 'mgGrow .9s .3s cubic-bezier(.2,.8,.3,1) both' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', position: 'relative' }}>
              {[['Pts', String(myClub?.points ?? 0)], ['GD', myClub ? String(myClub.goalsFor - myClub.goalsAgainst > 0 ? '+' : '') + (myClub.goalsFor - myClub.goalsAgainst) : '0'], ['Won', String(myClub?.wins ?? 0)]].map(([k, v]) => (
                <div key={k}>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, lineHeight: 1 }}>{v}</div>
                  <div style={{ fontFamily: 'var(--font-narrow)', fontSize: 9, letterSpacing: '.14em', textTransform: 'uppercase', opacity: .85 }}>{k}</div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {/* ══════════════════════════════ FORM STRIP ══════════════════════════════ */}
      {last5.length > 0 && myClub && (
        <div style={{ animation: 'mgUp .4s .18s both' }}>
          <SectionHeader
            title="RECENT FORM"
            right={`${last5.length} matches · ${formPts} pts`}
          />
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${last5.length}, 1fr)`, gap: 10 }}>
            {last5.map((m, i) => {
              const ih = m.homeClubId === myClub.id
              const ms = ih ? m.homeScore! : m.awayScore!
              const os = ih ? m.awayScore! : m.homeScore!
              const r = ms > os ? 'W' : ms === os ? 'D' : 'L'
              const opp = clubMap[ih ? m.awayClubId : m.homeClubId]
              const bg  = r === 'W' ? 'var(--paper)' : r === 'D' ? 'var(--steel)' : 'var(--accent)'
              const fg  = r === 'W' ? 'var(--ink)' : 'var(--paper)'
              return (
                <Link
                  key={m.id}
                  to={`/league/${league.id}/match/${m.id}`}
                  state={{ tab: 'overview' }}
                  style={{ textDecoration: 'none', position: 'relative', border: '3px solid var(--paper)', background: bg, color: fg, padding: '14px 14px', overflow: 'hidden', animation: `mgUp .4s ${(.06 * i).toFixed(2)}s both` }}
                >
                  {/* hatching overlay */}
                  <div style={{ position: 'absolute', inset: 0, opacity: .08, background: 'repeating-linear-gradient(115deg, currentColor 0 2px, transparent 2px 9px)', pointerEvents: 'none' }} />
                  <div style={{ fontFamily: 'var(--font-narrow)', fontSize: 9, letterSpacing: '.16em', textTransform: 'uppercase', opacity: .7, position: 'relative' }}>
                    {opp?.name ?? '?'}
                  </div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 30, lineHeight: .88, marginTop: 5, position: 'relative' }}>
                    {ms}–{os}
                  </div>
                  <div style={{ fontFamily: 'var(--font-display)', position: 'absolute', right: 10, bottom: 6, fontSize: 26, opacity: .9 }}>{r}</div>
                </Link>
              )
            })}
          </div>
        </div>
      )}

      {/* ══════════════════════════ DETAIL SECTIONS ══════════════════════════════ */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 340px', gap: 16, alignItems: 'start' }}>

        {/* Left: awards + standings */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {awards && (
            <div style={{ border: '2px solid rgba(244,241,234,0.14)', background: 'var(--steel)', overflow: 'hidden' }}>
              <div style={{ background: 'var(--bg-card-2)', padding: '9px 16px', borderBottom: '2px solid rgba(244,241,234,0.08)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="accent-bar accent-bar-gold" />
                <span style={{ fontFamily: 'var(--font-narrow)', fontSize: 11, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--text-2)' }}>Matchday {awards.matchday} Awards</span>
              </div>
              <div style={{ padding: 20 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
                  {[
                    { label: '⭐ MOTM',       entry: awards.motm, value: awards.motm?.rating.toFixed(1), unit: 'rating' },
                    { label: '⚽ Top Scorer', entry: awards.topScorer ? { ...awards.topScorer, rating: 0, goals: awards.topScorer.goals, assists: 0, position: '', clubKitConfig: null, photoUrl: null } as AwardEntry : null, value: awards.topScorer ? String(awards.topScorer.goals) : null, unit: 'goals' },
                    { label: '🎯 Top Assist', entry: awards.topAssist ? { ...awards.topAssist, rating: 0, goals: 0, assists: awards.topAssist.assists, position: '', clubKitConfig: null, photoUrl: null } as AwardEntry : null, value: awards.topAssist ? String(awards.topAssist.assists) : null, unit: 'assists' },
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

          {/* League Table */}
          <div>
            <SectionHeader title="LEAGUE TABLE" />
            <div style={{ border: '2px solid rgba(244,241,234,0.14)', background: 'var(--steel)', overflow: 'hidden' }}>
              {sorted.slice(0, 6).map((club, i) => {
                const isMe = club.id === myClub?.id
                const gd = club.goalsFor - club.goalsAgainst
                const posColor = i === 0 ? 'var(--gold)' : i < 4 ? 'var(--green)' : 'var(--text-2)'
                return (
                  <Link
                    key={club.id}
                    to={`/league/${league.id}/club/${club.id}`}
                    style={{
                      textDecoration: 'none', display: 'grid',
                      gridTemplateColumns: '32px auto 1fr auto 44px',
                      alignItems: 'center', gap: 10, padding: '10px 14px',
                      background: isMe ? 'rgba(229,32,47,0.08)' : 'transparent',
                      borderLeft: isMe ? '3px solid var(--accent)' : '3px solid transparent',
                      borderBottom: '1px solid rgba(244,241,234,0.06)',
                      transition: 'background .12s',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.background = isMe ? 'rgba(229,32,47,0.14)' : 'rgba(244,241,234,0.03)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.background = isMe ? 'rgba(229,32,47,0.08)' : 'transparent' }}
                  >
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, color: posColor, textAlign: 'center' }}>{i + 1}</div>
                    <ClubBadge name={club.name} size={22} logoConfig={club.logoConfig} />
                    <div style={{ fontSize: 13, fontWeight: isMe ? 700 : 500, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{club.name}</div>
                    <div style={{ fontFamily: 'var(--font-narrow)', fontSize: 11, color: gd >= 0 ? 'var(--green)' : 'var(--accent)', fontWeight: 700 }}>{gd > 0 ? `+${gd}` : gd}</div>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: isMe ? 'var(--accent)' : 'var(--text-1)', textAlign: 'right' }}>{club.points}</div>
                  </Link>
                )
              })}
              {sorted.length > 6 && (
                <div style={{ fontFamily: 'var(--font-narrow)', fontSize: 11, color: 'var(--text-2)', textAlign: 'center', padding: '10px', borderTop: '1px solid rgba(244,241,234,0.06)', letterSpacing: '.08em' }}>
                  +{sorted.length - 6} more clubs
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: budget + squad + physio + sponsors */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Budget — ink-on-paper protagonist panel */}
          {myClub && (() => {
            const wages = myClub.squad.reduce((s, p) => s + p.wage, 0)
            const mdRunway = wages > 0 ? Math.floor(myClub.budget / wages) : null
            const remaining = league.seasonLength - league.currentDay
            const isLow = mdRunway !== null && mdRunway < remaining
            const netSpend = league.startingBudget - myClub.budget
            const topEarners = [...myClub.squad].filter(p => p.wage > 0).sort((a, b) => b.wage - a.wage).slice(0, 5)
            const runwayMsg = mdRunway === null ? 'No wage bill yet.' : mdRunway < 5 ? `Only ${mdRunway} matchdays of funds. Critical.` : isLow ? `${mdRunway} matchdays of funds. Watch spending.` : `${mdRunway} matchdays of funds. Stable.`
            return (
              <section style={{ border: '3px solid var(--paper)', background: 'var(--paper)', color: 'var(--ink)', overflow: 'hidden' }}>
                <div style={{ background: 'var(--ink)', color: 'var(--paper)', padding: '9px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 17, letterSpacing: '.02em' }}>BUDGET</span>
                  <span style={{ fontFamily: 'var(--font-narrow)', fontSize: 10, letterSpacing: '.2em', textTransform: 'uppercase', color: 'var(--accent)' }}>
                    {isLow ? 'Low ↓' : 'Stable ↑'}
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
                  {([
                    ['Available', `€${(myClub.budget / 1000).toFixed(1)}M`, myClub.budget < league.startingBudget * 0.2 ? '#7f1d1d' : '#1a5c28'],
                    ['Net Spend', `${netSpend >= 0 ? '-' : '+'}€${(Math.abs(netSpend) / 1000).toFixed(0)}k`, netSpend > 0 ? '#7f1d1d' : '#1a5c28'],
                    ['Wage/md', wages > 0 ? `€${(wages / 1000).toFixed(1)}k` : '—', 'var(--ink)'],
                    ['Runway', mdRunway !== null ? `${mdRunway}md` : '—', mdRunway !== null && mdRunway < 5 ? '#7f1d1d' : mdRunway !== null && isLow ? '#7f6200' : 'var(--ink)'],
                  ] as [string, string, string][]).map(([k, v, c]) => (
                    <div key={k} style={{ padding: '12px 14px', borderBottom: '2px solid rgba(8,8,10,.08)', borderRight: '2px solid rgba(8,8,10,.08)' }}>
                      <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, lineHeight: .84, color: c }}>{v}</div>
                      <div style={{ fontFamily: 'var(--font-narrow)', fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase', color: 'rgba(8,8,10,.5)', marginTop: 4 }}>{k}</div>
                    </div>
                  ))}
                </div>
                <div style={{ padding: '0 16px 12px' }}>
                  <div style={{ background: 'var(--ink)', color: 'var(--paper)', padding: '9px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontFamily: 'var(--font-display)', fontSize: 14, color: 'var(--accent)', flexShrink: 0 }}>"</span>
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, fontStyle: 'italic', fontWeight: 700 }}>{runwayMsg}</span>
                  </div>
                </div>
                {topEarners.length > 0 && (
                  <div style={{ padding: '0 16px 14px' }}>
                    <div style={{ fontFamily: 'var(--font-narrow)', fontSize: 10, fontWeight: 700, color: 'rgba(8,8,10,.45)', textTransform: 'uppercase', letterSpacing: '.18em', marginBottom: 8 }}>Top Earners</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      {topEarners.map(p => (
                        <div key={p.id} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', alignItems: 'center', gap: 8 }}>
                          <span className={posClass(p.player.position)} style={{ fontSize: 9 }}>{p.player.position}</span>
                          <div style={{ fontSize: 12, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}>{p.player.name}</div>
                          <div style={{ fontFamily: 'var(--font-display)', fontSize: 13, color: '#7f6200' }}>€{(p.wage / 1000).toFixed(1)}k</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </section>
            )
          })()}

          {/* Squad condition */}
          {myClub && squad.length > 0 && (
            <section style={{ border: '3px solid var(--paper)', background: 'var(--paper)', color: 'var(--ink)', overflow: 'hidden' }}>
              <div style={{ background: 'var(--ink)', color: 'var(--paper)', padding: '9px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: 17, letterSpacing: '.02em' }}>SQUAD CONDITION</span>
                <span style={{ fontFamily: 'var(--font-narrow)', fontSize: 10, letterSpacing: '.2em', textTransform: 'uppercase', color: 'var(--accent)' }}>
                  {squad.filter(p => p.injured).length > 0 ? `${squad.filter(p => p.injured).length} Injured` : 'All Fit'}
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', borderBottom: '2px solid rgba(8,8,10,.08)' }}>
                {([
                  ['Fitness', avgFitness, avgFitness >= 75 ? '#1a5c28' : avgFitness >= 55 ? '#b45309' : '#7f1d1d'],
                  ['Morale',  avgMorale,  avgMorale  >= 75 ? '#1a3a5f' : avgMorale  >= 55 ? '#b45309' : '#7f1d1d'],
                  ['Form',    avgForm,    avgForm    >= 75 ? '#1a5c28' : avgForm    >= 55 ? '#b45309' : '#7f1d1d'],
                ] as [string, number, string][]).map(([k, v, c]) => (
                  <div key={k} style={{ padding: '14px 12px', borderRight: '2px solid rgba(8,8,10,.08)', textAlign: 'center' }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 40, lineHeight: .82, color: c }}>{v}</div>
                    <div style={{ fontFamily: 'var(--font-narrow)', fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase', color: 'rgba(8,8,10,.5)', marginTop: 4 }}>{k}</div>
                  </div>
                ))}
              </div>
              <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {[...squad].sort((a, b) => b.player.overall - a.player.overall).slice(0, 6).map(p => (
                  <div key={p.id} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr 80px auto', alignItems: 'center', gap: 8 }}>
                    <span className={posClass(p.player.position)} style={{ fontSize: 9 }}>{p.player.position}</span>
                    <div style={{ fontSize: 12, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}>{p.player.name.split(' ').slice(-1)[0]}</div>
                    <div style={{ height: 3, background: 'rgba(8,8,10,.1)', overflow: 'hidden' }}>
                      <div style={{ width: `${p.fitness}%`, height: '100%', background: p.fitness >= 70 ? '#1a5c28' : p.fitness >= 50 ? '#b45309' : '#7f1d1d' }} />
                    </div>
                    {p.injured
                      ? <span style={{ fontFamily: 'var(--font-narrow)', fontSize: 9, color: 'var(--accent)', fontWeight: 700 }}>INJ</span>
                      : <span style={{ fontFamily: 'var(--font-display)', fontSize: 12, color: 'var(--ink)' }}>{p.fitness}</span>
                    }
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Physio */}
          {myClub && (
            <section style={{ border: '3px solid var(--accent)', background: 'var(--accent)', color: '#fff', position: 'relative', overflow: 'hidden', padding: '18px 18px 16px' }}>
              <div style={{ position: 'absolute', right: -10, bottom: -18, opacity: .13, fontFamily: 'var(--font-display)', fontSize: 160, lineHeight: .7, pointerEvents: 'none', userSelect: 'none' }}>
                {myClub.physioLevel}
              </div>
              <div style={{ fontFamily: 'var(--font-narrow)', fontSize: 10, letterSpacing: '.24em', textTransform: 'uppercase', position: 'relative', opacity: .85 }}>Physio Facility</div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, position: 'relative', marginTop: 2 }}>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: 52, lineHeight: .82 }}>Lv {myClub.physioLevel}</span>
                <span style={{ fontFamily: 'var(--font-narrow)', fontSize: 14, fontWeight: 700, marginBottom: 6, opacity: .85 }}>{['None', 'Basic', 'Advanced'][myClub.physioLevel]}</span>
              </div>
              <div style={{ fontFamily: 'var(--font-narrow)', fontSize: 11, opacity: .85, marginTop: 6, position: 'relative' }}>
                {myClub.physioLevel === 0 && '1 day recovery/day · full heal cost'}
                {myClub.physioLevel === 1 && '1 day recovery/day · 40% heal discount'}
                {myClub.physioLevel >= 2 && '2 days recovery/day · 70% heal discount'}
              </div>
              <div style={{ height: 3, background: 'rgba(255,255,255,.3)', margin: '10px 0 14px', position: 'relative', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${(myClub.physioLevel / 2) * 100}%`, background: '#fff', transformOrigin: 'left', animation: 'mgGrow .9s .3s cubic-bezier(.2,.8,.3,1) both' }} />
              </div>
              {myClub.physioLevel < 2 ? (
                <button
                  className="btn"
                  style={{ background: 'transparent', color: '#fff', border: '2px solid rgba(255,255,255,.65)', width: '100%', fontSize: 11, position: 'relative' }}
                  onClick={onPhysioUpgrade}
                  disabled={myClub.budget < [15_000, 30_000][myClub.physioLevel]}
                >
                  Upgrade to Level {myClub.physioLevel + 1} · €{[15, 30][myClub.physioLevel]}k
                </button>
              ) : (
                <div style={{ fontFamily: 'var(--font-narrow)', fontSize: 11, textAlign: 'center', padding: '6px 0', fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', position: 'relative', opacity: .85 }}>Max Level Reached</div>
              )}
            </section>
          )}

          {/* Sponsors */}
          {myClub && league.status === 'ACTIVE' && (
            <section style={{ border: '3px solid var(--paper)', overflow: 'hidden' }}>
              <div style={{ background: 'var(--ink)', color: 'var(--paper)', padding: '9px 16px', borderBottom: '3px solid var(--paper)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: 17, letterSpacing: '.02em' }}>SPONSORS</span>
                {sponsorData && <span style={{ fontFamily: 'var(--font-narrow)', fontSize: 10, letterSpacing: '.2em', textTransform: 'uppercase', color: 'var(--accent)' }}>{sponsorData.active.length}/3 Active</span>}
              </div>
              <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10, background: 'var(--steel)' }}>
                {sponsorData && sponsorData.active.length > 0 && (
                  <>
                    <div style={{ fontFamily: 'var(--font-narrow)', fontSize: 10, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '.16em' }}>Active Missions</div>
                    {sponsorData.active.map(deal => (
                      <div key={deal.id} style={{ position: 'relative', border: '3px solid var(--paper)', background: '#1a4a28', color: 'var(--paper)', padding: '10px 14px', overflow: 'hidden' }}>
                        <div style={{ position: 'absolute', inset: 0, opacity: .06, background: 'repeating-linear-gradient(115deg, currentColor 0 2px, transparent 2px 9px)', pointerEvents: 'none' }} />
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'relative' }}>
                          <span style={{ fontSize: 16 }}>{deal.sponsorEmoji}</span>
                          <span style={{ fontFamily: 'var(--font-display)', fontSize: 14 }}>{deal.sponsorName.toUpperCase()}</span>
                          <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-display)', fontSize: 16, color: 'var(--green)' }}>+€{(deal.reward / 1000).toFixed(1)}k</span>
                        </div>
                        <div style={{ fontSize: 11, opacity: .85, marginTop: 4, position: 'relative' }}>{deal.mission}</div>
                        <div style={{ fontFamily: 'var(--font-narrow)', fontSize: 9, opacity: .6, marginTop: 3, letterSpacing: '.1em', textTransform: 'uppercase', position: 'relative' }}>by Matchday {deal.targetMatchday}</div>
                      </div>
                    ))}
                  </>
                )}
                {sponsorData && sponsorData.active.length < 3 && sponsorData.available.length > 0 && (
                  <>
                    <div style={{ fontFamily: 'var(--font-narrow)', fontSize: 10, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '.16em' }}>Available Deals</div>
                    {sponsorData.available.map((deal, i) => (
                      <div key={i} style={{ border: '2px solid rgba(244,241,234,0.18)', background: 'var(--bg-card-2)', padding: '10px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <span style={{ fontSize: 16 }}>{deal.sponsorEmoji}</span>
                          <span style={{ fontFamily: 'var(--font-narrow)', fontSize: 12, fontWeight: 700, color: 'var(--text-1)' }}>{deal.sponsorName}</span>
                          <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-display)', fontSize: 14, color: 'var(--green)' }}>+€{(deal.reward / 1000).toFixed(1)}k</span>
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-2)', marginBottom: 8 }}>{deal.mission}</div>
                        <button
                          className="btn btn-outline"
                          style={{ width: '100%', fontSize: 11 }}
                          disabled={signingDeal !== null || myClub.budget < deal.cost}
                          onClick={() => handleSignDeal(i)}
                        >
                          {signingDeal === i ? 'Signing...' : `Sign · -€${(deal.cost / 1000).toFixed(1)}k`}
                        </button>
                      </div>
                    ))}
                  </>
                )}
                {sponsorData && sponsorData.active.length >= 3 && (
                  <div style={{ fontFamily: 'var(--font-narrow)', fontSize: 11, color: 'var(--text-2)', textAlign: 'center', padding: '4px 0', letterSpacing: '.06em' }}>Max 3 active deals. Complete missions to unlock more.</div>
                )}
                {!sponsorData && (
                  <div style={{ fontFamily: 'var(--font-narrow)', fontSize: 11, color: 'var(--text-2)', textAlign: 'center', padding: '8px 0' }}>Loading...</div>
                )}
                {sponsorMsg && (
                  <div style={{ fontSize: 12, textAlign: 'center', color: sponsorMsg.includes('signed') ? 'var(--green)' : 'var(--accent)' }}>{sponsorMsg}</div>
                )}
                {sponsorData && sponsorData.history.length > 0 && (
                  <>
                    <div style={{ height: 2, background: 'rgba(244,241,234,.07)' }} />
                    <div style={{ fontFamily: 'var(--font-narrow)', fontSize: 10, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '.16em' }}>Recent Results</div>
                    {sponsorData.history.slice(0, 3).map(deal => (
                      <div key={deal.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 14 }}>{deal.sponsorEmoji}</span>
                        <span style={{ fontFamily: 'var(--font-narrow)', fontSize: 11, color: 'var(--text-2)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{deal.sponsorName}</span>
                        <span style={{ fontFamily: 'var(--font-display)', fontSize: 13, color: deal.status === 'COMPLETED' ? 'var(--green)' : 'var(--accent)' }}>
                          {deal.status === 'COMPLETED' ? `+€${(deal.reward / 1000).toFixed(1)}k` : 'Failed'}
                        </span>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
