import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { io, type Socket } from 'socket.io-client'
import { effectiveRating, tacticFitScore } from '@football/shared'
import { useAuth } from '../stores/auth.store'
import { api } from '../api/client'
import { flagUrl } from '../utils/flagCodes'

// ─── Types ────────────────────────────────────────────────────────────────────

interface PlayerData {
  id: string; name: string; nationality: string | null; position: string
  age: number; overall: number; pace: number; shooting: number; passing: number
  dribbling: number; defending: number; physical: number
  preferredRoles: string[]; baseValue: number
  photoUrl: string | null
}

interface SquadPlayer {
  id: string; playerId: string; player: PlayerData
  morale: number; form: number; fitness: number; injured: boolean; injuryDaysLeft: number
  trainedPosition: string | null; wage: number
}

interface LineupSlot { instanceId: string; position: string }
interface TacticData {
  formation: string
  style: 'possession' | 'counter' | 'pressing' | 'lowblock'
  pressingIntensity: number
  defensiveLine: number
  width: number
  lineup: LineupSlot[]
}

interface ClubData {
  id: string; name: string; budget: number; isAI: boolean
  wins: number; draws: number; losses: number
  goalsFor: number; goalsAgainst: number; points: number
  physioLevel: number
  user: { id: string; username: string } | null
  squad: SquadPlayer[]
  tactic: TacticData | null
}

interface LeagueData {
  id: string; name: string; status: string
  currentDay: number; seasonLength: number; startingBudget: number
  maxClubs: number; matchTime: string; squadSize: number
  clubs: ClubData[]
  draftSession: { id: string; status: string; currentRound: number; roundsTotal: number; pickOrder: string[]; currentPick: number } | null
}

interface MatchData {
  id: string; matchday: number; status: string
  homeClubId: string; awayClubId: string
  homeScore: number | null; awayScore: number | null
  homeClub: { id: string; name: string }
  awayClub: { id: string; name: string }
}

type Tab = 'overview' | 'squad' | 'fixtures' | 'standings' | 'tactics' | 'manage'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function posClass(pos: string): string {
  if (pos === 'GK') return 'pos pos-gk'
  if (['CB','LB','RB'].includes(pos)) return 'pos pos-def'
  if (['CDM','CM','CAM','LM','RM'].includes(pos)) return 'pos pos-mid'
  return 'pos pos-att'
}

const POS_ORDER = ['GK','CB','LB','RB','CDM','CM','CAM','LM','RM','LW','RW','CF','ST']

function getBadgeColor(name: string): string {
  const palette = ['#27cdff', '#36e27e', '#e9c46a', '#e8806a', '#7b68ee', '#20b2aa', '#ff6b6b', '#48cae4']
  let h = 0
  for (const c of name) h = Math.imul(31, h) + c.charCodeAt(0) | 0
  return palette[Math.abs(h) % palette.length]
}

function squadAvgOvr(club: ClubData): number | null {
  if (!club.squad?.length) return null
  const top = [...club.squad].sort((a, b) => b.player.overall - a.player.overall).slice(0, 11)
  return Math.round(top.reduce((s, p) => s + p.player.overall, 0) / top.length)
}

// ─── ClubBadge ────────────────────────────────────────────────────────────────

function ClubBadge({ name, size = 40 }: { name: string; size?: number }) {
  const initials = name.split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('')
  const bg = getBadgeColor(name)
  const radius = Math.round(size * 0.18)
  return (
    <div style={{ width: size, height: size, borderRadius: radius, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: Math.round(size * 0.33), color: '#000', flexShrink: 0, letterSpacing: 0.5 }}>
      {initials}
    </div>
  )
}

// ─── CircleGauge ─────────────────────────────────────────────────────────────

function CircleGauge({ value, label, color }: { value: number; label: string; color: string }) {
  const r = 28, circ = 2 * Math.PI * r
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ position: 'relative', width: 70, height: 70, display: 'inline-block' }}>
        <svg width="70" height="70" style={{ transform: 'rotate(-90deg)' }}>
          <circle cx="35" cy="35" r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="5" />
          <circle cx="35" cy="35" r={r} fill="none" stroke={color} strokeWidth="5"
            strokeDasharray={`${circ}`}
            strokeDashoffset={`${circ - (value / 100) * circ}`}
            strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 0.8s ease' }}
          />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 800, color: 'var(--text-1)' }}>{value}</div>
      </div>
      <div style={{ fontSize: 10, color: 'var(--text-2)', marginTop: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
    </div>
  )
}

// ─── OvrBadge ────────────────────────────────────────────────────────────────

function OvrBadge({ value, label }: { value: number; label: string }) {
  const color = value >= 85 ? 'var(--gold)' : value >= 75 ? 'var(--green)' : value >= 65 ? 'var(--text-2)' : 'var(--text-3)'
  return (
    <div style={{ textAlign: 'center', lineHeight: 1 }}>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 800, color }}>{Math.round(value)}</div>
      <div style={{ fontSize: 10, color: 'var(--text-2)', marginTop: 3, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
    </div>
  )
}

// ─── StatBar (for squad cards) ────────────────────────────────────────────────

function StatBar({ label, value }: { label: string; value: number }) {
  const barColor = value >= 75 ? 'var(--green)' : value >= 50 ? 'var(--gold)' : 'var(--red)'
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
        <span style={{ color: 'var(--text-2)' }}>{label}</span>
        <span style={{ color: 'var(--text-1)', fontWeight: 600 }}>{value}</span>
      </div>
      <div className="stat-bar-wrap">
        <div className="stat-bar-fill" style={{ width: `${value}%`, background: barColor }} />
      </div>
    </div>
  )
}

// ─── Overview ─────────────────────────────────────────────────────────────────

function Overview({ league, matches, myClub, onPhysioUpgrade }: { league: LeagueData; matches: MatchData[]; myClub: ClubData | undefined; onPhysioUpgrade: () => void }) {
  const clubMap = Object.fromEntries(league.clubs.map(c => [c.id, c]))

  // Next match
  const nextMatch = myClub ? matches
    .filter(m => (m.homeClubId === myClub.id || m.awayClubId === myClub.id) && m.status === 'SCHEDULED')
    .sort((a, b) => a.matchday - b.matchday)[0] : null

  // Last 5 results
  const last5 = myClub ? matches
    .filter(m => (m.homeClubId === myClub.id || m.awayClubId === myClub.id) && m.status === 'SIMULATED')
    .sort((a, b) => b.matchday - a.matchday)
    .slice(0, 5)
    .reverse() : []

  // Squad averages
  const squad = myClub?.squad ?? []
  const avgFitness = squad.length ? Math.round(squad.reduce((s, p) => s + p.fitness, 0) / squad.length) : 0
  const avgMorale  = squad.length ? Math.round(squad.reduce((s, p) => s + p.morale, 0) / squad.length) : 0
  const avgForm    = squad.length ? Math.round(squad.reduce((s, p) => s + p.form, 0) / squad.length) : 0

  // Standings
  const sorted = [...league.clubs].sort((a, b) => b.points !== a.points ? b.points - a.points : (b.goalsFor - b.goalsAgainst) - (a.goalsFor - a.goalsAgainst))

  const cardStyle = { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' as const }
  const cardBody = { padding: 20 }
  const secLabel = { fontSize: 11, fontWeight: 800 as const, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: 'var(--text-2)', marginBottom: 8 }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16, alignItems: 'start' }}>
      {/* Left column */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Next match */}
        <div style={cardStyle}>
          <div className="card-header">
            <span className="accent-bar" />
            <span style={secLabel}>Next Match{nextMatch ? ` · Matchday ${nextMatch.matchday}` : ''}</span>
          </div>
          <div style={cardBody}>
          {nextMatch && myClub ? (() => {
            const isHome = nextMatch.homeClubId === myClub.id
            const homeClub = clubMap[nextMatch.homeClubId]
            const awayClub = clubMap[nextMatch.awayClubId]
            const homeOvr = homeClub ? squadAvgOvr(homeClub) : null
            const awayOvr = awayClub ? squadAvgOvr(awayClub) : null

            return (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 1fr', alignItems: 'center', gap: 16, marginBottom: 16 }}>
                  {/* Home */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8 }}>
                    <ClubBadge name={homeClub?.name ?? ''} size={52} />
                    <div style={{ fontWeight: 700, fontSize: 14, color: isHome ? 'var(--green)' : 'var(--text-1)' }}>{homeClub?.name}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-2)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Home</div>
                    {homeOvr !== null && <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 800, color: homeOvr >= 82 ? 'var(--gold)' : homeOvr >= 75 ? 'var(--blue)' : 'var(--text-1)' }}>{homeOvr} <span style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 400 }}>OVR</span></div>}
                  </div>
                  <div style={{ textAlign: 'center', fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 800, color: 'var(--text-2)' }}>VS</div>
                  {/* Away */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
                    <ClubBadge name={awayClub?.name ?? ''} size={52} />
                    <div style={{ fontWeight: 700, fontSize: 14, color: !isHome ? 'var(--green)' : 'var(--text-1)', textAlign: 'right' }}>{awayClub?.name}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-2)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Away</div>
                    {awayOvr !== null && <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 800, color: awayOvr >= 82 ? 'var(--gold)' : awayOvr >= 75 ? 'var(--blue)' : 'var(--text-1)', textAlign: 'right' }}>{awayOvr} <span style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 400 }}>OVR</span></div>}
                  </div>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-2)', borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                  Simulated daily at <strong style={{ color: 'var(--text-1)' }}>{league.matchTime} UTC</strong>
                </div>
              </div>
            )
          })() : (
            <div style={{ color: 'var(--text-2)', fontSize: 13, padding: '20px 0', textAlign: 'center' }}>
              {league.status === 'SETUP' ? 'Season starts after the draft.' : league.status === 'DRAFTING' ? 'Season starts after the draft completes.' : 'No more fixtures this season.'}
            </div>
          )}
          </div>
        </div>

        {/* Team form */}
        {myClub && (
          <div style={cardStyle}>
            <div className="card-header">
              <span className="accent-bar" />
              <span style={secLabel}>Team Form</span>
            </div>
            <div style={cardBody}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div />
              {last5.length > 0 && (
                <div style={{ fontSize: 11, color: 'var(--text-2)' }}>
                  Last {last5.length} · {last5.reduce((s, m) => {
                    const ih = m.homeClubId === myClub.id
                    const ms = ih ? m.homeScore! : m.awayScore!
                    const os = ih ? m.awayScore! : m.homeScore!
                    return s + (ms > os ? 3 : ms === os ? 1 : 0)
                  }, 0)} pts
                </div>
              )}
            </div>
            {last5.length === 0 ? (
              <div style={{ color: 'var(--text-2)', fontSize: 12 }}>No results yet — season hasn't started.</div>
            ) : (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {last5.map(m => {
                  const isHome = m.homeClubId === myClub.id
                  const ms = isHome ? m.homeScore! : m.awayScore!
                  const os = isHome ? m.awayScore! : m.homeScore!
                  const r = ms > os ? 'W' : ms === os ? 'D' : 'L'
                  const opp = clubMap[isHome ? m.awayClubId : m.homeClubId]
                  const colors: Record<string, string> = { W: 'var(--green)', D: 'var(--gold)', L: 'var(--red)' }
                  return (
                    <div key={m.id} title={`MD${m.matchday}: vs ${opp?.name} ${ms}–${os}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 36, height: 36, borderRadius: '50%', background: colors[r], display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 14, color: '#000' }}>{r}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-2)' }}>{ms}–{os}</div>
                    </div>
                  )
                })}
              </div>
            )}
            </div>
          </div>
        )}

        {/* Mini standings */}
        <div style={cardStyle}>
          <div className="card-header">
            <span className="accent-bar" />
            <span style={secLabel}>League Table</span>
          </div>
          <div style={cardBody}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {sorted.slice(0, 5).map((club, i) => {
              const isMe = club.id === myClub?.id
              const gd = club.goalsFor - club.goalsAgainst
              const posColor = i === 0 ? 'var(--gold)' : i < 4 ? 'var(--green)' : 'var(--text-2)'
              return (
                <div key={club.id} style={{
                  display: 'grid', gridTemplateColumns: '28px auto 1fr auto 36px',
                  alignItems: 'center', gap: 10, padding: '8px 10px',
                  background: isMe ? 'rgba(54,226,126,0.06)' : 'transparent',
                  borderRadius: 'var(--radius-sm)',
                  borderLeft: isMe ? '2px solid var(--green)' : '2px solid transparent',
                }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 800, color: posColor, textAlign: 'center' }}>{i + 1}</div>
                  <ClubBadge name={club.name} size={22} />
                  <div style={{ fontSize: 13, fontWeight: isMe ? 700 : 500, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{club.name}</div>
                  <div style={{ fontSize: 11, color: gd >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>{gd > 0 ? `+${gd}` : gd}</div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 800, color: isMe ? 'var(--green)' : 'var(--text-1)', textAlign: 'right' }}>{club.points}</div>
                </div>
              )
            })}
          </div>
          {sorted.length > 5 && (
            <div style={{ fontSize: 11, color: 'var(--text-2)', textAlign: 'center', marginTop: 10 }}>+{sorted.length - 5} more clubs</div>
          )}
          </div>
        </div>
      </div>

      {/* Right column */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Budget */}
        {myClub && (
          <div style={cardStyle}>
            <div className="card-header">
              <span className="accent-bar-gold" />
              <span style={secLabel}>Budget</span>
            </div>
            <div style={cardBody}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 800, color: 'var(--green)', lineHeight: 1, marginBottom: 4 }}>
              €{(myClub.budget / 1_000).toFixed(1)}M
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-2)', marginBottom: 12 }}>Available funds</div>
            <div className="stat-bar-wrap">
              <div className="stat-bar-fill" style={{ width: `${Math.min(100, (myClub.budget / league.startingBudget) * 100)}%`, background: myClub.budget < league.startingBudget * 0.2 ? 'var(--red)' : 'var(--green)' }} />
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 5 }}>Started at €{(league.startingBudget / 1_000).toFixed(0)}M</div>
            </div>
          </div>
        )}

        {/* Squad condition */}
        {myClub && squad.length > 0 && (
          <div style={cardStyle}>
            <div className="card-header">
              <span className="accent-bar" />
              <span style={secLabel}>Squad Condition</span>
            </div>
            <div style={cardBody}>
            <div style={{ display: 'flex', justifyContent: 'space-around', marginBottom: 20 }}>
              <CircleGauge value={avgFitness} label="Fitness" color={avgFitness >= 75 ? 'var(--green)' : avgFitness >= 55 ? 'var(--gold)' : 'var(--red)'} />
              <CircleGauge value={avgMorale}  label="Morale"  color={avgMorale  >= 75 ? 'var(--blue)'  : avgMorale  >= 55 ? 'var(--gold)' : 'var(--red)'} />
              <CircleGauge value={avgForm}    label="Form"    color={avgForm    >= 75 ? 'var(--green)' : avgForm    >= 55 ? 'var(--gold)' : 'var(--red)'} />
            </div>
            {/* Top players by overall with fitness bar */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[...squad]
                .sort((a, b) => b.player.overall - a.player.overall)
                .slice(0, 8)
                .map(p => (
                  <div key={p.id} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr 80px auto', alignItems: 'center', gap: 8 }}>
                    <span className={posClass(p.player.position)} style={{ fontSize: 9 }}>{p.player.position}</span>
                    <div style={{ fontSize: 12, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.player.name.split(' ').slice(-1)[0]}</div>
                    <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ width: `${p.fitness}%`, height: '100%', background: p.fitness >= 70 ? 'var(--green)' : p.fitness >= 50 ? 'var(--gold)' : 'var(--red)', borderRadius: 2 }} />
                    </div>
                    {p.injured && <span style={{ fontSize: 9, color: 'var(--red)', fontWeight: 700 }}>INJ</span>}
                    {!p.injured && <span style={{ fontSize: 11, color: 'var(--text-2)', width: 18, textAlign: 'right' }}>{p.fitness}</span>}
                  </div>
                ))
              }
            </div>
            </div>
          </div>
        )}

        {myClub && squad.length === 0 && (
          <div style={{ ...cardStyle, textAlign: 'center', padding: 28, color: 'var(--text-2)', fontSize: 12 }}>
            Your squad will appear here after the draft.
          </div>
        )}

        {/* Physio */}
        {myClub && (
          <div style={cardStyle}>
            <div className="card-header">
              <span className="accent-bar" />
              <span style={secLabel}>Physio Facility</span>
            </div>
            <div style={cardBody}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 800, color: 'var(--text-1)' }}>Level {myClub.physioLevel} <span style={{ fontSize: 13, fontWeight: 400, color: myClub.physioLevel === 0 ? 'var(--text-3)' : myClub.physioLevel === 1 ? 'var(--gold)' : 'var(--green)' }}>{['None', 'Basic', 'Advanced'][myClub.physioLevel]}</span></div>
                  <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 4 }}>
                    {myClub.physioLevel === 0 && '1 day recovery/day · full heal cost'}
                    {myClub.physioLevel === 1 && '1 day recovery/day · 40% heal discount'}
                    {myClub.physioLevel >= 2 && '2 days recovery/day · 70% heal discount'}
                  </div>
                </div>
              </div>
              {myClub.physioLevel < 2 ? (
                <button
                  className="btn btn-outline"
                  style={{ width: '100%', fontSize: 12 }}
                  onClick={onPhysioUpgrade}
                  disabled={myClub.budget < [15_000, 30_000][myClub.physioLevel]}
                  title={myClub.budget < [15_000, 30_000][myClub.physioLevel] ? 'Insufficient budget' : undefined}
                >
                  Upgrade to Level {myClub.physioLevel + 1} · €{[15, 30][myClub.physioLevel]}k
                </button>
              ) : (
                <div style={{ fontSize: 11, color: 'var(--green)', textAlign: 'center', padding: '6px 0', fontWeight: 700 }}>Max level reached</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Standings ────────────────────────────────────────────────────────────────

function Standings({ clubs, myClubId }: { clubs: ClubData[]; myClubId: string | undefined }) {
  const sorted = [...clubs].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points
    return (b.goalsFor - b.goalsAgainst) - (a.goalsFor - a.goalsAgainst)
  })

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            {['#','Club','P','W','D','L','GF','GA','GD','Pts'].map(h => (
              <th key={h} style={{ padding: '10px 12px', textAlign: h === 'Club' ? 'left' : 'center', fontSize: 11, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((club, i) => {
            const isMe = club.id === myClubId
            const gd = club.goalsFor - club.goalsAgainst
            const played = club.wins + club.draws + club.losses
            const posColor = i === 0 ? 'var(--gold)' : i < 4 ? 'var(--green)' : i >= sorted.length - 3 ? 'var(--red)' : 'var(--text-2)'
            return (
              <tr key={club.id} style={{ borderBottom: '1px solid var(--border)', background: isMe ? 'rgba(54,226,126,0.05)' : 'transparent', borderLeft: isMe ? '3px solid var(--green)' : '3px solid transparent' }}>
                <td style={{ padding: '12px', textAlign: 'center' }}>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 800, color: posColor }}>{i + 1}</span>
                </td>
                <td style={{ padding: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <ClubBadge name={club.name} size={26} />
                    <div>
                      <div style={{ fontWeight: isMe ? 700 : 500, fontSize: 14, color: 'var(--text-1)' }}>{club.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 1 }}>{club.isAI ? 'AI' : club.user?.username}</div>
                    </div>
                  </div>
                </td>
                <td style={{ padding: '12px', textAlign: 'center', color: 'var(--text-2)', fontSize: 13 }}>{played}</td>
                <td style={{ padding: '12px', textAlign: 'center', color: 'var(--green)', fontWeight: 700, fontFamily: 'var(--font-display)', fontSize: 15 }}>{club.wins}</td>
                <td style={{ padding: '12px', textAlign: 'center', color: 'var(--text-2)', fontSize: 13 }}>{club.draws}</td>
                <td style={{ padding: '12px', textAlign: 'center', color: 'var(--red)', fontSize: 13 }}>{club.losses}</td>
                <td style={{ padding: '12px', textAlign: 'center', fontSize: 13 }}>{club.goalsFor}</td>
                <td style={{ padding: '12px', textAlign: 'center', fontSize: 13 }}>{club.goalsAgainst}</td>
                <td style={{ padding: '12px', textAlign: 'center', fontSize: 13, color: gd > 0 ? 'var(--green)' : gd < 0 ? 'var(--red)' : 'var(--text-2)' }}>{gd > 0 ? `+${gd}` : gd}</td>
                <td style={{ padding: '12px', textAlign: 'center' }}>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 800, color: isMe ? 'var(--green)' : 'var(--text-1)' }}>{club.points}</span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <div style={{ display: 'flex', gap: 20, marginTop: 16, fontSize: 11, color: 'var(--text-2)', paddingLeft: 4 }}>
        {[['var(--gold)','Champion'],['var(--green)','Top 4'],['var(--red)','Bottom 3']].map(([c, l]) => (
          <span key={l} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 8, height: 8, background: c, borderRadius: '50%', display: 'inline-block' }} /> {l}
          </span>
        ))}
      </div>
    </div>
  )
}

// ─── Squad helpers ────────────────────────────────────────────────────────────

const ALL_POSITIONS = ['GK','CB','LB','RB','CDM','CM','CAM','LM','RM','LW','RW','CF','ST']

function posGroup(pos: string): number {
  if (pos === 'GK') return 0
  if (['CB','LB','RB'].includes(pos)) return 1
  if (['CDM','CM','CAM','LM','RM'].includes(pos)) return 2
  return 3
}

function calcTrainCost(from: string, to: string): number | null {
  const fg = posGroup(from), tg = posGroup(to)
  if (fg === 0 || tg === 0) return null
  if (fg === tg) return 3_000
  if (Math.abs(fg - tg) === 1) return 7_000
  return 12_000
}

function calcHealCost(daysLeft: number, physioLevel: number): number {
  const discount = physioLevel >= 2 ? 0.3 : physioLevel >= 1 ? 0.6 : 1.0
  return Math.round(daysLeft * 1_000 * discount)
}

// ─── Squad ────────────────────────────────────────────────────────────────────

function Squad({ squad, physioLevel, budget, onHeal, onTrain }: {
  squad: SquadPlayer[]
  physioLevel: number
  budget: number
  onHeal: (instanceId: string) => void
  onTrain: (instanceId: string, position: string) => void
}) {
  const [trainingFor, setTrainingFor] = useState<string | null>(null)

  if (squad.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '64px 0', color: 'var(--text-2)' }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>👕</div>
        <p>No players drafted yet</p>
      </div>
    )
  }

  const sorted = [...squad].sort((a, b) => {
    const ai = POS_ORDER.indexOf(a.player.position)
    const bi = POS_ORDER.indexOf(b.player.position)
    return ai !== bi ? ai - bi : b.player.overall - a.player.overall
  })

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
      {sorted.map(inst => {
        const effRating = effectiveRating(
          { overall: inst.player.overall, morale: inst.morale, form: inst.form, fitness: inst.fitness, injured: inst.injured },
          0.8,
        )
        const delta = Math.round(effRating - inst.player.overall)
        const cardBorderColor = inst.injured ? 'rgba(232,128,106,0.45)' : inst.player.overall >= 85 ? 'rgba(233,196,106,0.35)' : inst.player.overall >= 75 ? 'rgba(54,226,126,0.15)' : 'rgba(255,255,255,0.06)'
        const flagSrc = flagUrl(inst.player.nationality)
        const healCost = calcHealCost(inst.injuryDaysLeft, physioLevel)
        const isTraining = trainingFor === inst.id

        return (
          <div key={inst.id} style={{ background: 'linear-gradient(160deg, var(--bg-card-2) 0%, var(--bg-card) 100%)', border: `1px solid ${cardBorderColor}`, borderRadius: 'var(--radius)', padding: '14px 16px', position: 'relative', overflow: 'hidden' }}>
            {inst.player.overall >= 85 && !inst.injured && <div style={{ position: 'absolute', top: -20, right: -20, width: 80, height: 80, background: 'radial-gradient(circle, rgba(245,166,35,0.08) 0%, transparent 70%)', pointerEvents: 'none' }} />}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
              <div style={{ display: 'flex', gap: 10, flex: 1, minWidth: 0 }}>
                <div style={{ width: 52, height: 60, borderRadius: 6, overflow: 'hidden', background: 'var(--bg-base)', flexShrink: 0 }}>
                  {inst.player.photoUrl
                    ? <img src={inst.player.photoUrl} alt="" referrerPolicy="no-referrer" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }} onError={e => { const el = e.currentTarget as HTMLImageElement; el.style.display = 'none'; const p = el.parentElement; if (p) p.setAttribute('data-failed', '1') }} />
                    : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)', fontSize: 24 }}>👤</div>
                  }
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 5, flexWrap: 'wrap' }}>
                    <span className={posClass(inst.player.position)}>{inst.player.position}</span>
                    {inst.trainedPosition && (
                      <span style={{ fontSize: 9, padding: '2px 5px', background: 'rgba(39,205,255,0.12)', color: 'var(--cyan)', borderRadius: 4, fontWeight: 700, border: '1px solid rgba(39,205,255,0.25)' }}>
                        +{inst.trainedPosition}
                      </span>
                    )}
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{inst.player.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 2 }}>{flagSrc && <img src={flagSrc} alt="" style={{ width: 16, height: 12, verticalAlign: 'middle', borderRadius: 1, marginRight: 3 }} />}{inst.player.nationality} · {inst.player.age}y</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, flexShrink: 0, marginLeft: 8 }}>
                <OvrBadge value={inst.player.overall} label="OVR" />
                <div style={{ width: 1, background: 'var(--border)' }} />
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 800, color: delta >= 0 ? 'var(--green)' : 'var(--red)', lineHeight: 1 }}>{Math.round(effRating)}</div>
                  <div style={{ fontSize: 10, color: delta >= 0 ? 'var(--green)' : 'var(--red)', marginTop: 3, fontWeight: 700 }}>{delta > 0 ? `+${delta}` : delta === 0 ? '±0' : delta} EFF</div>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
              <StatBar label="Morale"   value={inst.morale} />
              <StatBar label="Form"     value={inst.form} />
              <StatBar label="Fitness"  value={inst.fitness} />
            </div>

            {/* Injury row */}
            {inst.injured && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 10px', background: 'rgba(232,128,106,0.1)', border: '1px solid rgba(232,128,106,0.3)', borderRadius: 'var(--radius-xs)', marginBottom: 8 }}>
                <div>
                  <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--red)' }}>INJURED</span>
                  <span style={{ fontSize: 11, color: 'var(--text-2)', marginLeft: 6 }}>{inst.injuryDaysLeft} day{inst.injuryDaysLeft !== 1 ? 's' : ''} left</span>
                </div>
                <button
                  className="btn"
                  style={{ fontSize: 11, padding: '4px 10px', background: budget >= healCost ? 'var(--red)' : 'rgba(232,128,106,0.15)', color: '#fff', border: 'none', opacity: budget >= healCost ? 1 : 0.5 }}
                  disabled={budget < healCost}
                  onClick={() => onHeal(inst.id)}
                  title={`Heal for €${(healCost / 1000).toFixed(1)}k`}
                >
                  Heal €{(healCost / 1000).toFixed(1)}k
                </button>
              </div>
            )}

            {/* Train position */}
            {!isTraining ? (
              <button
                className="btn btn-ghost"
                style={{ width: '100%', fontSize: 11, padding: '5px 0' }}
                onClick={() => setTrainingFor(inst.id)}
              >
                {inst.trainedPosition ? `Retrain (${inst.trainedPosition})` : 'Train position'}
              </button>
            ) : (
              <div style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xs)', padding: 10 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Train to position</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                  {ALL_POSITIONS.filter(p => p !== inst.player.position).map(p => {
                    const cost = calcTrainCost(inst.player.position, p)
                    const canAfford = cost !== null && budget >= cost
                    return (
                      <button
                        key={p}
                        disabled={cost === null || !canAfford}
                        onClick={() => { onTrain(inst.id, p); setTrainingFor(null) }}
                        style={{
                          padding: '4px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700, cursor: cost !== null && canAfford ? 'pointer' : 'not-allowed',
                          background: inst.trainedPosition === p ? 'rgba(39,205,255,0.2)' : 'var(--bg-card)',
                          color: cost === null ? 'var(--text-3)' : !canAfford ? 'var(--text-3)' : inst.trainedPosition === p ? 'var(--cyan)' : 'var(--text-1)',
                          border: `1px solid ${inst.trainedPosition === p ? 'rgba(39,205,255,0.4)' : 'var(--border)'}`,
                          opacity: cost === null ? 0.4 : 1,
                        }}
                        title={cost === null ? 'GK restriction' : `€${(cost / 1000).toFixed(0)}k`}
                      >
                        {p}{cost !== null ? ` €${(cost / 1000).toFixed(0)}k` : ' —'}
                      </button>
                    )
                  })}
                </div>
                <button className="btn btn-ghost" style={{ width: '100%', fontSize: 11, padding: '4px 0' }} onClick={() => setTrainingFor(null)}>Cancel</button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function Fixtures({ matches, clubs, myClubId, currentDay, leagueId }: { matches: MatchData[]; clubs: ClubData[]; myClubId: string | undefined; currentDay: number; leagueId: string }) {
  const clubMap = Object.fromEntries(clubs.map(c => [c.id, c.name]))
  const grouped = matches.reduce<Record<number, MatchData[]>>((acc, m) => {
    acc[m.matchday] = acc[m.matchday] ?? []
    acc[m.matchday].push(m)
    return acc
  }, {})

  const days = Object.keys(grouped).map(Number).sort((a, b) => a - b)
  const [visibleFrom, setVisibleFrom] = useState(() => Math.max(1, currentDay - 1))
  const WINDOW = 5
  const visibleDays = days.filter(d => d >= visibleFrom && d < visibleFrom + WINDOW)

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, alignItems: 'center' }}>
        <button className="btn btn-outline" style={{ fontSize: 12, padding: '6px 12px' }} onClick={() => setVisibleFrom(v => Math.max(1, v - WINDOW))} disabled={visibleFrom <= 1}>← Earlier</button>
        <span style={{ fontSize: 13, color: 'var(--text-2)', flex: 1, textAlign: 'center' }}>Matchdays {visibleFrom} – {Math.min(visibleFrom + WINDOW - 1, days[days.length - 1] ?? 1)}</span>
        <button className="btn btn-outline" style={{ fontSize: 12, padding: '6px 12px' }} onClick={() => setVisibleFrom(v => v + WINDOW)} disabled={visibleFrom + WINDOW > (days[days.length - 1] ?? 1)}>Later →</button>
      </div>

      {visibleDays.map(day => (
        <div key={day} style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, color: 'var(--text-2)', letterSpacing: 0.5, textTransform: 'uppercase' }}>Matchday {day}</span>
            {day === currentDay && <span className="badge badge-active">Latest</span>}
            {day === currentDay + 1 && <span className="badge badge-drafting">Next</span>}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {grouped[day].map(match => {
              const isMyMatch = match.homeClubId === myClubId || match.awayClubId === myClubId
              const simulated = match.status === 'SIMULATED'
              const h = match.homeScore ?? 0, a = match.awayScore ?? 0
              const homeWin = simulated && h > a, awayWin = simulated && a > h, isDraw = simulated && h === a
              let myResult: 'W'|'D'|'L'|null = null
              if (isMyMatch && simulated) {
                const iAmHome = match.homeClubId === myClubId
                myResult = isDraw ? 'D' : (iAmHome ? homeWin : awayWin) ? 'W' : 'L'
              }
              const resultColors: Record<string, string> = { W: 'var(--green)', D: 'var(--gold)', L: 'var(--red)' }

              const rowContent = (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
                    <div style={{ textAlign: 'right', fontSize: 13, fontWeight: match.homeClubId === myClubId ? 700 : homeWin ? 600 : 400, color: simulated && !homeWin && !isDraw ? 'var(--text-2)' : 'var(--text-1)' }}>{clubMap[match.homeClubId] ?? match.homeClub.name}</div>
                    <ClubBadge name={match.homeClub.name} size={22} />
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    {simulated ? (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                        {myResult && <span style={{ fontSize: 10, fontWeight: 800, color: resultColors[myResult], width: 16, textAlign: 'center' }}>{myResult}</span>}
                        <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 800, letterSpacing: 1, color: 'var(--text-1)' }}>{h} – {a}</span>
                        {myResult && <span style={{ width: 16 }} />}
                      </div>
                    ) : (
                      <span style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 600 }}>vs</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <ClubBadge name={match.awayClub.name} size={22} />
                    <div style={{ fontSize: 13, fontWeight: match.awayClubId === myClubId ? 700 : awayWin ? 600 : 400, color: simulated && !awayWin && !isDraw ? 'var(--text-2)' : 'var(--text-1)' }}>{clubMap[match.awayClubId] ?? match.awayClub.name}</div>
                  </div>
                </>
              )
              const rowStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 90px 1fr', alignItems: 'center', padding: '10px 14px', background: isMyMatch ? 'rgba(54,226,126,0.05)' : 'var(--bg-card)', border: `1px solid ${isMyMatch ? 'rgba(54,226,126,0.2)' : 'var(--border)'}`, borderRadius: 'var(--radius-sm)', gap: 8 }
              return simulated ? (
                <Link key={match.id} to={`/league/${leagueId}/match/${match.id}`} style={{ ...rowStyle, textDecoration: 'none', cursor: 'pointer' }}>
                  {rowContent}
                </Link>
              ) : (
                <div key={match.id} style={rowStyle}>
                  {rowContent}
                </div>
              )
            })}
          </div>
        </div>
      ))}
      {visibleDays.length === 0 && <p style={{ color: 'var(--text-2)', textAlign: 'center', padding: '32px 0' }}>No fixtures in this range.</p>}
    </div>
  )
}

// ─── Manage ───────────────────────────────────────────────────────────────────

function Manage({ league, onUpdate, onDelete }: { league: LeagueData; onUpdate: (data: Partial<LeagueData>) => void; onDelete: () => void }) {
  const canEdit = league.status === 'SETUP'
  const canDelete = league.status === 'SETUP' || league.status === 'DRAFTING'
  const [name, setName] = useState(league.name)
  const [budget, setBudget] = useState(String(league.startingBudget))
  const [maxClubs, setMaxClubs] = useState(String(league.maxClubs ?? 18))
  const [seasonLength, setSeasonLength] = useState(String(league.seasonLength))
  const [matchTime, setMatchTime] = useState(league.matchTime ?? '20:00')
  const [squadSize, setSquadSize] = useState(String(league.squadSize ?? 25))
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const [kickingId, setKickingId] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [formError, setFormError] = useState('')

  async function handleSave() {
    setFormError('')
    setSaving(true)
    try {
      const res = await api.patch(`/leagues/${league.id}`, { name: name.trim(), startingBudget: parseInt(budget), maxClubs: parseInt(maxClubs), seasonLength: parseInt(seasonLength), matchTime, squadSize: parseInt(squadSize) })
      onUpdate(res.data)
      setSaveMsg('Saved!')
      setTimeout(() => setSaveMsg(''), 2500)
    } catch (err: any) {
      setFormError(err.response?.data?.error ?? 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function handleKick(clubId: string) {
    setKickingId(clubId)
    try {
      await api.delete(`/leagues/${league.id}/clubs/${clubId}`)
      onUpdate({ clubs: league.clubs.filter(c => c.id !== clubId) } as any)
    } catch (err: any) {
      setFormError(err.response?.data?.error ?? 'Failed to remove club')
    } finally {
      setKickingId(null)
    }
  }

  async function handleDelete() {
    setDeleting(true)
    try {
      await api.delete(`/leagues/${league.id}`)
      onDelete()
    } catch (err: any) {
      setFormError(err.response?.data?.error ?? 'Failed to delete league')
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  const field: React.CSSProperties = { width: '100%', padding: '9px 12px', background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-1)', fontSize: 13 }
  const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 5, display: 'block' }

  return (
    <div style={{ maxWidth: 600 }}>
      {formError && <p className="error-text" style={{ marginBottom: 14 }}>{formError}</p>}

      <div className="card" style={{ marginBottom: 16, padding: 0 }}>
        <div className="card-header">
          <span className="accent-bar" />
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' }}>League Settings</span>
        </div>
        <div style={{ padding: 20 }}>
        {!canEdit && <div style={{ padding: '10px 14px', background: 'rgba(245,166,35,0.08)', border: '1px solid rgba(245,166,35,0.2)', borderRadius: 'var(--radius-sm)', marginBottom: 16, fontSize: 12, color: 'var(--gold)' }}>Settings are locked once the draft has started.</div>}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
          <div style={{ gridColumn: '1 / -1' }}><label style={lbl}>League Name</label><input style={field} value={name} onChange={e => setName(e.target.value)} disabled={!canEdit} /></div>
          <div><label style={lbl}>Starting Budget (€)</label><input style={field} type="number" value={budget} onChange={e => setBudget(e.target.value)} disabled={!canEdit} /></div>
          <div><label style={lbl}>Max Clubs</label><input style={field} type="number" min={2} max={18} value={maxClubs} onChange={e => setMaxClubs(e.target.value)} disabled={!canEdit} /></div>
          <div><label style={lbl}>Season Length</label><input style={field} type="number" min={10} max={40} value={seasonLength} onChange={e => setSeasonLength(e.target.value)} disabled={!canEdit} /></div>
          <div><label style={lbl}>Match Time (UTC)</label><input style={field} type="time" value={matchTime} onChange={e => setMatchTime(e.target.value)} disabled={!canEdit} /></div>
          <div><label style={lbl}>Squad Size (players per club)</label><input style={field} type="number" min={11} max={30} value={squadSize} onChange={e => setSquadSize(e.target.value)} disabled={!canEdit} /></div>
        </div>
        {canEdit && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button className="btn btn-green" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</button>
            {saveMsg && <span style={{ fontSize: 12, color: 'var(--green)' }}>✓ {saveMsg}</span>}
          </div>
        )}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16, padding: 0 }}>
        <div className="card-header">
          <span className="accent-bar" />
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Members ({league.clubs.filter(c => !c.isAI).length} / {league.maxClubs ?? 18})</span>
        </div>
        <div style={{ padding: 20 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {league.clubs.filter(c => !c.isAI).map((club, i) => (
            <div key={club.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'var(--bg-card-2)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
              <ClubBadge name={club.name} size={32} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-1)' }}>{club.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 2 }}>{club.user?.username}{i === 0 ? <span style={{ color: 'var(--gold)', fontWeight: 700, marginLeft: 6 }}>★ Creator</span> : null}</div>
              </div>
              {canEdit && i !== 0 && (
                <button className="btn btn-ghost" style={{ fontSize: 11, padding: '5px 10px', color: 'var(--red)', borderColor: 'rgba(232,128,106,0.3)' }} disabled={kickingId === club.id} onClick={() => handleKick(club.id)}>
                  {kickingId === club.id ? '...' : 'Kick'}
                </button>
              )}
            </div>
          ))}
        </div>
        </div>
      </div>

      {canDelete && (
        <div className="card" style={{ padding: 0, border: '1px solid rgba(232,128,106,0.25)', background: 'rgba(232,128,106,0.04)', overflow: 'hidden' }}>
          <div className="card-header" style={{ background: 'rgba(232,128,106,0.06)', borderRadius: '16px 16px 0 0', borderColor: 'rgba(232,128,106,0.15)' }}>
            <span className="accent-bar" style={{ background: 'var(--red)' }} />
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--red)' }}>Danger Zone</span>
          </div>
          <div style={{ padding: 20 }}>
          {!confirmDelete ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>Delete this league</div>
                <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 2 }}>Permanently removes all data. Cannot be undone.</div>
              </div>
              <button className="btn" style={{ background: 'rgba(232,128,106,0.15)', color: 'var(--red)', border: '1px solid rgba(232,128,106,0.4)', whiteSpace: 'nowrap', flexShrink: 0 }} onClick={() => setConfirmDelete(true)}>Delete League</button>
            </div>
          ) : (
            <div style={{ padding: 14, background: 'rgba(232,128,106,0.1)', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(232,128,106,0.3)' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--red)', marginBottom: 12 }}>Delete <strong>{league.name}</strong>? This cannot be undone.</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn" style={{ background: 'var(--red)', color: '#fff', border: 'none' }} onClick={handleDelete} disabled={deleting}>{deleting ? 'Deleting...' : 'Yes, Delete Forever'}</button>
                <button className="btn btn-ghost" onClick={() => setConfirmDelete(false)}>Cancel</button>
              </div>
            </div>
          )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Tactics ──────────────────────────────────────────────────────────────────

const FORMATION_SLOTS: Record<string, { position: string; x: number; y: number }[]> = {
  '4-4-2': [
    { position: 'GK', x: 50, y: 8 },
    { position: 'LB', x: 14, y: 27 }, { position: 'CB', x: 36, y: 23 }, { position: 'CB', x: 64, y: 23 }, { position: 'RB', x: 86, y: 27 },
    { position: 'LM', x: 14, y: 52 }, { position: 'CM', x: 38, y: 50 }, { position: 'CM', x: 62, y: 50 }, { position: 'RM', x: 86, y: 52 },
    { position: 'ST', x: 36, y: 77 }, { position: 'ST', x: 64, y: 77 },
  ],
  '4-3-3': [
    { position: 'GK', x: 50, y: 8 },
    { position: 'LB', x: 14, y: 27 }, { position: 'CB', x: 36, y: 23 }, { position: 'CB', x: 64, y: 23 }, { position: 'RB', x: 86, y: 27 },
    { position: 'CM', x: 25, y: 52 }, { position: 'CM', x: 50, y: 50 }, { position: 'CM', x: 75, y: 52 },
    { position: 'LW', x: 14, y: 76 }, { position: 'ST', x: 50, y: 82 }, { position: 'RW', x: 86, y: 76 },
  ],
  '4-2-3-1': [
    { position: 'GK', x: 50, y: 8 },
    { position: 'LB', x: 14, y: 27 }, { position: 'CB', x: 36, y: 23 }, { position: 'CB', x: 64, y: 23 }, { position: 'RB', x: 86, y: 27 },
    { position: 'CDM', x: 36, y: 44 }, { position: 'CDM', x: 64, y: 44 },
    { position: 'LW', x: 14, y: 65 }, { position: 'CAM', x: 50, y: 67 }, { position: 'RW', x: 86, y: 65 },
    { position: 'ST', x: 50, y: 84 },
  ],
  '3-5-2': [
    { position: 'GK', x: 50, y: 8 },
    { position: 'CB', x: 24, y: 24 }, { position: 'CB', x: 50, y: 21 }, { position: 'CB', x: 76, y: 24 },
    { position: 'LM', x: 10, y: 50 }, { position: 'CM', x: 32, y: 50 }, { position: 'CDM', x: 50, y: 47 }, { position: 'CM', x: 68, y: 50 }, { position: 'RM', x: 90, y: 50 },
    { position: 'ST', x: 36, y: 77 }, { position: 'ST', x: 64, y: 77 },
  ],
  '5-3-2': [
    { position: 'GK', x: 50, y: 8 },
    { position: 'LB', x: 10, y: 30 }, { position: 'CB', x: 28, y: 24 }, { position: 'CB', x: 50, y: 21 }, { position: 'CB', x: 72, y: 24 }, { position: 'RB', x: 90, y: 30 },
    { position: 'CM', x: 25, y: 55 }, { position: 'CM', x: 50, y: 52 }, { position: 'CM', x: 75, y: 55 },
    { position: 'ST', x: 36, y: 78 }, { position: 'ST', x: 64, y: 78 },
  ],
  '4-1-4-1': [
    { position: 'GK', x: 50, y: 8 },
    { position: 'LB', x: 14, y: 27 }, { position: 'CB', x: 36, y: 23 }, { position: 'CB', x: 64, y: 23 }, { position: 'RB', x: 86, y: 27 },
    { position: 'CDM', x: 50, y: 42 },
    { position: 'LM', x: 14, y: 60 }, { position: 'CM', x: 36, y: 58 }, { position: 'CM', x: 64, y: 58 }, { position: 'RM', x: 86, y: 60 },
    { position: 'ST', x: 50, y: 82 },
  ],
}

const STYLE_LABELS: Record<string, string> = {
  possession: 'Possession',
  counter:    'Counter',
  pressing:   'Pressing',
  lowblock:   'Low Block',
}
const STYLE_DESC: Record<string, string> = {
  possession: 'Control play with short passes, high press to regain ball quickly',
  counter:    'Sit deep and exploit pace on the break',
  pressing:   'High-intensity press to force turnovers in dangerous areas',
  lowblock:   'Compact defense, absorb pressure, hit on transitions',
}

function autoAssign(
  formation: string,
  squad: SquadPlayer[],
): LineupSlot[] {
  const slots = FORMATION_SLOTS[formation]
  if (!slots) return []
  const healthy = [...squad.filter(p => !p.injured)].sort(
    (a, b) => b.player.overall - a.player.overall,
  )
  const used = new Set<string>()
  const lineup: (string | null)[] = new Array(slots.length).fill(null)

  // Pass 1: exact position match
  for (let i = 0; i < slots.length; i++) {
    const match = healthy.find(p => !used.has(p.id) && p.player.position === slots[i].position)
    if (match) { lineup[i] = match.id; used.add(match.id) }
  }
  // Pass 2: adjacent position (fit ≥ 0.7)
  for (let i = 0; i < slots.length; i++) {
    if (lineup[i]) continue
    const match = healthy.find(p => !used.has(p.id) && tacticFitScore(p.player.position, slots[i].position) >= 0.7)
    if (match) { lineup[i] = match.id; used.add(match.id) }
  }
  // Pass 3: fill remaining with best available
  for (let i = 0; i < slots.length; i++) {
    if (lineup[i]) continue
    const match = healthy.find(p => !used.has(p.id))
    if (match) { lineup[i] = match.id; used.add(match.id) }
  }

  return lineup.map((instanceId, i) => ({
    instanceId: instanceId ?? '',
    position: slots[i].position,
  }))
}

type TacticStyle = 'possession' | 'counter' | 'pressing' | 'lowblock'

function Tactics({ leagueId, myClub, onSaved }: {
  leagueId: string
  myClub: ClubData
  onSaved: (tactic: TacticData) => void
}) {
  const saved = myClub.tactic
  const [formation, setFormation] = useState(saved?.formation ?? '4-3-3')
  const [style, setStyle] = useState<TacticStyle>(saved?.style ?? 'possession')
  const [pressing, setPressing] = useState(saved?.pressingIntensity ?? 55)
  const [defLine, setDefLine] = useState(saved?.defensiveLine ?? 50)
  const [width, setWidth] = useState(saved?.width ?? 50)
  const [lineup, setLineup] = useState<LineupSlot[]>(() =>
    saved?.lineup?.length === 11 ? saved.lineup : autoAssign(saved?.formation ?? '4-3-3', myClub.squad)
  )
  const [swapSlot, setSwapSlot] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')

  function changeFormation(f: string) {
    setFormation(f)
    setLineup(autoAssign(f, myClub.squad))
    setSwapSlot(null)
  }

  function handleSlotClick(slotIndex: number) {
    if (swapSlot === null) {
      setSwapSlot(slotIndex)
    } else if (swapSlot === slotIndex) {
      setSwapSlot(null)
    } else {
      // Swap two slots
      const next = [...lineup]
      const tmp = next[swapSlot]
      next[swapSlot] = { ...next[swapSlot], instanceId: next[slotIndex].instanceId }
      next[slotIndex] = { ...next[slotIndex], instanceId: tmp.instanceId }
      setLineup(next)
      setSwapSlot(null)
    }
  }

  async function handleSave() {
    setSaving(true)
    try {
      const payload: TacticData = { formation, style, pressingIntensity: pressing, defensiveLine: defLine, width, lineup }
      await api.patch(`/leagues/${leagueId}/tactic`, payload)
      onSaved(payload)
      setSaveMsg('Saved!')
      setTimeout(() => setSaveMsg(''), 2500)
    } catch {
      setSaveMsg('Save failed')
    } finally {
      setSaving(false)
    }
  }

  const slots = FORMATION_SLOTS[formation] ?? []
  const instanceMap = Object.fromEntries(myClub.squad.map(p => [p.id, p]))
  const startingIds = new Set(lineup.map(s => s.instanceId))
  const bench = myClub.squad.filter(p => !startingIds.has(p.id)).sort((a, b) => b.player.overall - a.player.overall)

  const PITCH_H = 480

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 20, alignItems: 'start' }}>

      {/* Left: pitch */}
      <div>
        {/* Formation picker */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
          {Object.keys(FORMATION_SLOTS).map(f => (
            <button key={f} onClick={() => changeFormation(f)} style={{
              padding: '6px 14px', borderRadius: 20, fontSize: 13, fontWeight: 700,
              cursor: 'pointer', border: 'none', fontFamily: 'var(--font-display)',
              background: formation === f ? 'var(--green)' : 'var(--bg-card)',
              color: formation === f ? '#000' : 'var(--text-2)',
              transition: 'all 0.15s',
            }}>{f}</button>
          ))}
          <button onClick={() => { setLineup(autoAssign(formation, myClub.squad)); setSwapSlot(null) }} style={{ padding: '6px 14px', borderRadius: 20, fontSize: 12, cursor: 'pointer', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-2)', marginLeft: 'auto' }}>↺ Auto-assign</button>
        </div>

        {swapSlot !== null && (
          <div style={{ padding: '8px 14px', background: 'rgba(54,226,126,0.08)', border: '1px solid rgba(54,226,126,0.3)', borderRadius: 'var(--radius-sm)', marginBottom: 12, fontSize: 12, color: 'var(--green)' }}>
            Click another slot to swap players, or click the same slot to cancel.
          </div>
        )}

        {/* Pitch */}
        <div style={{
          position: 'relative', width: '100%', height: PITCH_H,
          background: 'linear-gradient(180deg, #1a4a1a 0%, #1e5c1e 50%, #1a4a1a 100%)',
          borderRadius: 12, overflow: 'hidden',
          border: '2px solid rgba(255,255,255,0.1)',
        }}>
          {/* Pitch markings */}
          <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} viewBox="0 0 100 100" preserveAspectRatio="none">
            {/* Center line */}
            <line x1="0" y1="50" x2="100" y2="50" stroke="rgba(255,255,255,0.15)" strokeWidth="0.3" />
            {/* Center circle */}
            <circle cx="50" cy="50" r="10" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="0.3" />
            <circle cx="50" cy="50" r="0.5" fill="rgba(255,255,255,0.3)" />
            {/* Own goal box (bottom) */}
            <rect x="30" y="82" width="40" height="16" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="0.3" />
            <rect x="38" y="90" width="24" height="8" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="0.3" />
            {/* Opp goal box (top) */}
            <rect x="30" y="2" width="40" height="16" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="0.3" />
            <rect x="38" y="2" width="24" height="8" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="0.3" />
            {/* Outer border */}
            <rect x="2" y="2" width="96" height="96" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="0.4" />
          </svg>

          {/* Player slots */}
          {slots.map((slot, i) => {
            const entry = lineup[i]
            const player = entry?.instanceId ? instanceMap[entry.instanceId] : null
            const isSelected = swapSlot === i
            const fit = player ? tacticFitScore(player.player.position, slot.position, player.trainedPosition) : 0
            const fitColor = fit >= 1 ? 'var(--green)' : fit >= 0.7 ? 'var(--gold)' : 'var(--red)'
            const CARD_W = 72, CARD_H = player ? 52 : 36

            return (
              <div
                key={i}
                onClick={() => handleSlotClick(i)}
                style={{
                  position: 'absolute',
                  left: `${slot.x}%`, top: `${slot.y}%`,
                  transform: 'translate(-50%, -50%)',
                  width: CARD_W, minHeight: CARD_H,
                  background: isSelected ? 'rgba(54,226,126,0.25)' : player ? 'rgba(0,0,0,0.72)' : 'rgba(0,0,0,0.45)',
                  border: `1.5px solid ${isSelected ? 'var(--green)' : player ? fitColor : 'rgba(255,255,255,0.25)'}`,
                  borderRadius: 7,
                  cursor: 'pointer',
                  padding: '4px 5px',
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  gap: 2, zIndex: 10,
                  transition: 'border-color 0.15s, background 0.15s',
                  backdropFilter: 'blur(4px)',
                }}
              >
                <span style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: 0.3 }}>{slot.position}</span>
                {player ? (
                  <>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#fff', textAlign: 'center', lineHeight: 1.2, maxWidth: 62, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {player.player.name.split(' ').slice(-1)[0]}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 800, color: fitColor }}>{player.player.overall}</span>
                      {fit < 1 && <span style={{ fontSize: 8, color: fitColor, fontWeight: 600 }}>{fit >= 0.7 ? '~' : '!'}</span>}
                    </div>
                  </>
                ) : (
                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>Empty</span>
                )}
              </div>
            )
          })}
        </div>

        {/* Bench */}
        {bench.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Bench ({bench.length})</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {bench.slice(0, 14).map(p => (
                <div key={p.id} style={{ padding: '4px 8px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 5, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className={posClass(p.player.position)} style={{ fontSize: 9 }}>{p.player.position}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-1)' }}>{p.player.name.split(' ').slice(-1)[0]}</span>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 700, color: 'var(--text-2)' }}>{p.player.overall}</span>
                </div>
              ))}
              {bench.length > 14 && <span style={{ fontSize: 11, color: 'var(--text-2)', padding: '4px 8px' }}>+{bench.length - 14} more</span>}
            </div>
          </div>
        )}
      </div>

      {/* Right: settings */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Tactical style */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
          <div className="card-header">
            <span className="accent-bar" />
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Tactical Style</span>
          </div>
          <div style={{ padding: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {(Object.keys(STYLE_LABELS) as TacticStyle[]).map(s => (
              <button key={s} onClick={() => setStyle(s)} title={STYLE_DESC[s]} style={{
                padding: '8px 6px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                border: `1.5px solid ${style === s ? 'var(--green)' : 'var(--border)'}`,
                background: style === s ? 'rgba(54,226,126,0.1)' : 'transparent',
                color: style === s ? 'var(--green)' : 'var(--text-2)',
                textAlign: 'center', transition: 'all 0.15s',
              }}>{STYLE_LABELS[s]}</button>
            ))}
          </div>
          <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-2)', lineHeight: 1.5 }}>{STYLE_DESC[style]}</div>
          </div>
        </div>

        {/* Sliders */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
          <div className="card-header">
            <span className="accent-bar" />
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Settings</span>
          </div>
          <div style={{ padding: 16 }}>
          {([
            ['Pressing Intensity', pressing, setPressing, 'How aggressively your team presses without the ball'],
            ['Defensive Line', defLine, setDefLine, 'High line pushes up for offside traps; low line protects space behind'],
            ['Width', width, setWidth, 'Wide play stretches opposition; narrow play overloads the middle'],
          ] as [string, number, (v: number) => void, string][]).map(([label, val, setter, desc]) => (
            <div key={label} style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                <span style={{ fontSize: 12, color: 'var(--text-1)', fontWeight: 600 }}>{label}</span>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 800, color: 'var(--text-1)' }}>{val}</span>
              </div>
              <input type="range" min={0} max={100} value={val}
                onChange={e => setter(Number(e.target.value))}
                style={{ width: '100%', padding: 0, height: 4, background: 'none', border: 'none', boxShadow: 'none', cursor: 'pointer' }}
              />
              <div style={{ fontSize: 10, color: 'var(--text-2)', marginTop: 4 }}>{desc}</div>
            </div>
          ))}
          </div>
        </div>

        {/* Fit legend */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
          <div className="card-header">
            <span className="accent-bar" />
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Position Fit</span>
          </div>
          <div style={{ padding: 14 }}>
          {[['var(--green)', 'Natural position — full rating'], ['var(--gold)', '~ Adjacent position — slight penalty'], ['var(--red)', '! Wrong position — large penalty']].map(([c, l]) => (
            <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, fontSize: 11, color: 'var(--text-2)' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: c, flexShrink: 0, display: 'inline-block' }} />
              {l}
            </div>
          ))}
          </div>
        </div>

        {/* Save */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className="btn btn-green" style={{ flex: 1 }} onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save Tactics'}
          </button>
          {saveMsg && <span style={{ fontSize: 12, color: saveMsg === 'Save failed' ? 'var(--red)' : 'var(--green)' }}>{saveMsg}</span>}
        </div>
      </div>
    </div>
  )
}

// ─── Nav items ────────────────────────────────────────────────────────────────

const NAV: { key: Tab; label: string; icon: string }[] = [
  { key: 'overview',   label: 'Overview',   icon: '◈' },
  { key: 'squad',      label: 'Squad',      icon: '◉' },
  { key: 'fixtures',   label: 'Fixtures',   icon: '▦' },
  { key: 'standings',  label: 'Standings',  icon: '≡' },
]

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function League() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [league, setLeague] = useState<LeagueData | null>(null)
  const [matches, setMatches] = useState<MatchData[]>([])
  const [tab, setTab] = useState<Tab>('overview')
  const [notification, setNotification] = useState<string | null>(null)
  const [startingDraft, setStartingDraft] = useState(false)
  const [error, setError] = useState('')

  const refresh = useCallback(() => {
    if (!id) return
    Promise.all([api.get(`/leagues/${id}`), api.get(`/leagues/${id}/matches`)]).then(([lr, mr]) => {
      setLeague(lr.data)
      setMatches(mr.data)
    })
  }, [id])

  useEffect(() => { refresh() }, [refresh])

  useEffect(() => {
    if (!id) return
    const socket: Socket = io()
    socket.emit('join:league', id)
    socket.on('matchday:complete', (data: { matchday: number }) => {
      setNotification(`Matchday ${data.matchday} results are in!`)
      setTimeout(() => setNotification(null), 6000)
      refresh()
    })
    socket.on('season:finished', () => {
      setNotification('The season is over! Final standings are set.')
      refresh()
    })
    return () => { socket.disconnect() }
  }, [id, refresh])

  async function handleStartDraft() {
    setError('')
    setStartingDraft(true)
    try {
      await api.post(`/leagues/${id}/draft/start`)
      refresh()
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Failed to start draft')
    } finally {
      setStartingDraft(false)
    }
  }

  async function handlePhysioUpgrade() {
    setError('')
    try {
      const res = await api.post(`/leagues/${id}/physio/upgrade`)
      setLeague(prev => prev ? { ...prev, clubs: prev.clubs.map(c => c.id === res.data.id ? { ...c, physioLevel: res.data.physioLevel, budget: res.data.budget } : c) } : prev)
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Upgrade failed')
    }
  }

  async function handleHeal(instanceId: string) {
    setError('')
    try {
      await api.post(`/leagues/${id}/heal/${instanceId}`)
      refresh()
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Heal failed')
    }
  }

  async function handleTrain(instanceId: string, position: string) {
    setError('')
    try {
      await api.post(`/leagues/${id}/train/${instanceId}`, { position })
      refresh()
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Training failed')
    }
  }

  if (!league) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg-base)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: 'var(--text-2)' }}>Loading...</div>
      </div>
    )
  }

  const myClub = league.clubs.find(c => c.user?.id === user?.id)
  const isCreator = league.clubs.filter(c => !c.isAI)[0]?.user?.id === user?.id
  const navItems = [
    ...NAV,
    ...(myClub ? [{ key: 'tactics' as Tab, label: 'Tactics', icon: '⊞' }] : []),
    ...(isCreator ? [{ key: 'manage' as Tab, label: 'Manage', icon: '⊛' }] : []),
  ]

  const PAGE_TITLES: Record<Tab, string> = {
    overview: 'Overview',
    squad: 'My Squad',
    fixtures: 'Fixtures',
    standings: 'League Table',
    tactics: 'Tactics & Lineup',
    manage: 'Manage League',
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-base)' }}>

      {/* ── Sidebar ──────────────────────────────────────────────────────── */}
      <aside style={{
        width: 220, background: 'var(--bg-card)', borderRight: '1px solid var(--border)',
        position: 'fixed', top: 0, bottom: 0, left: 0,
        display: 'flex', flexDirection: 'column', zIndex: 50,
      }}>
        {/* Logo */}
        <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border)' }}>
          <div className="nav-logo"><img src="/logo.png" alt="Football Manager" style={{ height: 28, display: 'block' }} /></div>
        </div>

        {/* Club identity */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          {myClub ? (
            <>
              <ClubBadge name={myClub.name} size={44} />
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-1)', marginTop: 10, lineHeight: 1.3 }}>{myClub.name}</div>
              <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 3 }}>{league.name}</div>
              <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className={`badge badge-${league.status.toLowerCase()}`} style={{ fontSize: 9 }}>{league.status}</span>
                {(league.status === 'ACTIVE' || league.status === 'FINISHED') && (
                  <span style={{ fontSize: 10, color: 'var(--text-2)' }}>MD {league.currentDay}/{league.seasonLength}</span>
                )}
              </div>
            </>
          ) : (
            <>
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-1)', lineHeight: 1.3 }}>{league.name}</div>
              <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 4 }}>Spectating</div>
            </>
          )}
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '8px 12px', overflowY: 'auto' }}>
          {navItems.map(item => {
            const active = tab === item.key
            return (
              <button key={item.key} onClick={() => setTab(item.key)} style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 12px', marginBottom: 2,
                background: active ? 'rgba(54,226,126,0.1)' : 'transparent',
                border: 'none', borderRadius: 'var(--radius-sm)',
                borderLeft: `3px solid ${active ? 'var(--green)' : 'transparent'}`,
                color: active ? 'var(--green)' : 'var(--text-2)',
                cursor: 'pointer', textAlign: 'left', fontSize: 13, fontWeight: active ? 700 : 500,
                transition: 'all 0.15s',
              }}
                onMouseEnter={e => { if (!active) { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-1)'; (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.04)' } }}
                onMouseLeave={e => { if (!active) { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-2)'; (e.currentTarget as HTMLButtonElement).style.background = 'transparent' } }}
              >
                <span style={{ fontFamily: 'monospace', fontSize: 15, lineHeight: 1, opacity: active ? 1 : 0.6 }}>{item.icon}</span>
                {item.label}
              </button>
            )
          })}
        </nav>

        {/* Budget */}
        {myClub && (
          <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 }}>Budget</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 800, color: 'var(--green)' }}>€{(myClub.budget / 1_000).toFixed(1)}M</div>
          </div>
        )}

        {/* User + back */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <button className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 8px' }} onClick={() => navigate('/')}>← Back</button>
          <span style={{ flex: 1 }} />
          <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{user?.username}</span>
        </div>
      </aside>

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <main style={{ marginLeft: 220, flex: 1, display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>

        {/* Top bar */}
        <div style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border)', padding: '16px 28px', display: 'flex', alignItems: 'center', gap: 16, position: 'sticky', top: 0, zIndex: 40 }}>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 800, letterSpacing: 0.5, margin: 0, color: 'var(--text-1)' }}>
            {PAGE_TITLES[tab]}
          </h1>
          <div style={{ flex: 1 }} />

          {error && <span className="error-text" style={{ fontSize: 12 }}>{error}</span>}

          {notification && (
            <div style={{ padding: '7px 14px', background: 'var(--green-glow)', border: '1px solid var(--green)', borderRadius: 'var(--radius-sm)', fontSize: 12, color: 'var(--green)', display: 'flex', alignItems: 'center', gap: 8 }}>
              {notification}
              <button onClick={() => setNotification(null)} style={{ background: 'none', border: 'none', color: 'var(--green)', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>×</button>
            </div>
          )}

          {league.status === 'SETUP' && isCreator && (
            <button className="btn btn-green" onClick={handleStartDraft} disabled={startingDraft}>
              {startingDraft ? 'Starting...' : 'Start Draft'}
            </button>
          )}
          {league.status === 'DRAFTING' && (
            <button className="btn btn-gold" onClick={() => navigate(`/league/${id}/draft`)}>
              Go to Draft →
            </button>
          )}
          <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => navigator.clipboard.writeText(league.id)} title="Copy invite ID">
            Copy invite ID
          </button>
        </div>

        {/* Page content */}
        <div style={{ padding: '24px 28px', flex: 1 }}>
          {tab === 'overview'  && <Overview league={league} matches={matches} myClub={myClub} onPhysioUpgrade={handlePhysioUpgrade} />}
          {tab === 'squad'     && (myClub ? <Squad squad={myClub.squad} physioLevel={myClub.physioLevel} budget={myClub.budget} onHeal={handleHeal} onTrain={handleTrain} /> : <p style={{ color: 'var(--text-2)' }}>You don't have a club in this league.</p>)}
          {tab === 'fixtures'  && (matches.length === 0 ? <div style={{ textAlign: 'center', padding: '64px 0', color: 'var(--text-2)' }}><div style={{ fontSize: 36, marginBottom: 10 }}>📅</div><p>Fixtures will appear after the draft.</p></div> : <Fixtures matches={matches} clubs={league.clubs} myClubId={myClub?.id} currentDay={league.currentDay} leagueId={league.id} />)}
          {tab === 'standings' && <Standings clubs={league.clubs} myClubId={myClub?.id} />}
          {tab === 'tactics'   && myClub && (
            myClub.squad.length === 0
              ? <div style={{ textAlign: 'center', padding: '64px 0', color: 'var(--text-2)' }}><div style={{ fontSize: 36, marginBottom: 10 }}>⊞</div><p>Set your tactics after the draft.</p></div>
              : <Tactics leagueId={id!} myClub={myClub} onSaved={tactic => setLeague(prev => {
                  if (!prev) return prev
                  return { ...prev, clubs: prev.clubs.map(c => c.id === myClub.id ? { ...c, tactic } : c) }
                })} />
          )}
          {tab === 'manage'    && isCreator && <Manage league={league} onUpdate={updated => setLeague(prev => prev ? { ...prev, ...updated } : prev)} onDelete={() => navigate('/')} />}
        </div>
      </main>
    </div>
  )
}
