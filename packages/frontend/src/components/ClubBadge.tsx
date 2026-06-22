import React, { useId, useState } from 'react'
import { api } from '../api/client'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LogoConfig {
  shape:  'shield' | 'circle' | 'hexagon' | 'rounded'
  bg:     string
  accent: string
  emblem: 'none' | 'star' | 'bolt' | 'crown' | 'diamond' | 'cross' | 'chevron' | 'ring'
  text:   string
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const BADGE_COLORS = [
  '#0d1117', '#1a1a2e', '#0f3460', '#2d1b69',
  '#7a0c0c', '#5c3a00', '#0a4a0a', '#003a4a',
  '#e63946', '#e8823e', '#e9c46a', '#36e27e',
  '#27cdff', '#7b68ee', '#e879c6', '#d0d0d0',
]

const SHAPE_PATHS: Record<LogoConfig['shape'], string> = {
  shield:  'M50,4 L94,20 L94,58 Q94,82 50,97 Q6,82 6,58 L6,20 Z',
  circle:  'M96,50 A46,46 0 1,1 4,50 A46,46 0 1,1 96,50 Z',
  hexagon: 'M50,4 L90,27 L90,73 L50,96 L10,73 L10,27 Z',
  rounded: 'M22,4 L78,4 Q96,4 96,22 L96,78 Q96,96 78,96 L22,96 Q4,96 4,78 L4,22 Q4,4 22,4 Z',
}

// Emblem paths — drawn in the upper 65% of the badge (band starts at y=68)
const EMBLEM_PATHS: Partial<Record<LogoConfig['emblem'], string>> = {
  star:    'M50,13 L55.3,28.7 L71.9,28.9 L58.6,38.8 L63.5,54.6 L50,45 L36.5,54.6 L41.4,38.8 L28.1,28.9 L44.7,28.7 Z',
  bolt:    'M62,10 L44,44 L56,44 L38,66 L64,40 L52,40 Z',
  crown:   'M18,64 L18,44 L30,56 L50,28 L70,56 L82,44 L82,64 Z',
  diamond: 'M50,12 L82,36 L50,62 L18,36 Z',
  cross:   'M43,12 L57,12 L57,29 L82,29 L82,43 L57,43 L57,62 L43,62 L43,43 L18,43 L18,29 L43,29 Z',
  chevron: 'M14,63 L50,14 L86,63 L76,63 L50,28 L24,63 Z',
}

const EMBLEM_LABELS: Record<LogoConfig['emblem'], string> = {
  none: '–', star: '★', bolt: '⚡', crown: '♛',
  diamond: '◆', cross: '✚', chevron: '∧', ring: '◯',
}

const SHAPE_LABELS: Record<LogoConfig['shape'], string> = {
  shield: 'Shield', circle: 'Circle', hexagon: 'Hexagon', rounded: 'Square',
}

// ─── Fallback color for clubs without logos ───────────────────────────────────

export function getBadgeColor(name: string): string {
  const palette = ['#27cdff','#36e27e','#e9c46a','#e8806a','#7b68ee','#20b2aa','#ff6b6b','#48cae4']
  let h = 0
  for (const c of name) h = Math.imul(31, h) + c.charCodeAt(0) | 0
  return palette[Math.abs(h) % palette.length]
}

// ─── SVG badge renderer ───────────────────────────────────────────────────────

function SvgBadge({ config, size }: { config: LogoConfig; size: number }) {
  const uid = useId().replace(/[^a-z0-9]/gi, '')
  const { shape, bg, accent, emblem, text } = config
  const path     = SHAPE_PATHS[shape]
  const hasGlyph = emblem !== 'none'
  const safeText = (text || '?').toUpperCase().slice(0, 3)

  return (
    <svg
      width={size} height={size} viewBox="0 0 100 100"
      style={{ flexShrink: 0, display: 'block' }}
      aria-label="Club badge"
    >
      <defs>
        <clipPath id={`cb${uid}`}>
          <path d={path} />
        </clipPath>
      </defs>

      {/* Background shape */}
      <path d={path} fill={bg} />

      <g clipPath={`url(#cb${uid})`}>
        {/* Emblem */}
        {emblem === 'ring'
          ? <circle cx="50" cy="36" r="22" fill="none" stroke={accent} strokeWidth="9" />
          : hasGlyph && EMBLEM_PATHS[emblem] && (
              <path d={EMBLEM_PATHS[emblem]} fill={accent} />
            )
        }

        {/* Bottom accent band — only when there's a glyph emblem */}
        {hasGlyph && <rect x="0" y="68" width="100" height="32" fill={accent} />}

        {/* Text */}
        <text
          x="50"
          y={hasGlyph ? 84 : 52}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={safeText.length > 2 ? (hasGlyph ? 15 : 20) : (hasGlyph ? 18 : 26)}
          fontWeight="900"
          fontFamily="system-ui, -apple-system, sans-serif"
          fill="white"
          stroke={hasGlyph ? accent : bg}
          strokeWidth="3"
          style={{ paintOrder: 'stroke fill' } as React.CSSProperties}
          letterSpacing="1"
        >
          {safeText}
        </text>
      </g>

      {/* Shape border */}
      <path d={path} fill="none" stroke={accent} strokeWidth="3" />
    </svg>
  )
}

// ─── Public ClubBadge ─────────────────────────────────────────────────────────

export function ClubBadge({
  name, size = 40, logoConfig,
}: {
  name: string
  size?: number
  logoConfig?: LogoConfig | null
}) {
  if (logoConfig) return <SvgBadge config={logoConfig} size={size} />

  const initials = name.split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('')
  return (
    <div style={{
      width: size, height: size,
      borderRadius: Math.round(size * 0.18),
      background: getBadgeColor(name),
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'var(--font-display)', fontWeight: 800,
      fontSize: Math.round(size * 0.33), color: '#000',
      flexShrink: 0, letterSpacing: 0.5,
    }}>
      {initials}
    </div>
  )
}

// ─── Logo Maker modal ─────────────────────────────────────────────────────────

function defaultConfig(clubName: string): LogoConfig {
  const initials = clubName.split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('')
  return { shape: 'shield', bg: '#1a1a2e', accent: '#36e27e', emblem: 'star', text: initials }
}

export function LogoMaker({
  leagueId, clubName, initialConfig, onSaved, onClose,
}: {
  leagueId: string
  clubName: string
  initialConfig: LogoConfig | null
  onSaved: (config: LogoConfig) => void
  onClose: () => void
}) {
  const [cfg, setCfg] = useState<LogoConfig>(initialConfig ?? defaultConfig(clubName))
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  function set<K extends keyof LogoConfig>(k: K, v: LogoConfig[K]) {
    setCfg(prev => ({ ...prev, [k]: v }))
  }

  async function handleSave() {
    setSaving(true)
    setErr('')
    try {
      await api.patch(`/leagues/${leagueId}/logo`, cfg)
      onSaved(cfg)
    } catch (e: any) {
      setErr(e.response?.data?.error ?? 'Save failed')
      setSaving(false)
    }
  }

  const secLabel: React.CSSProperties = {
    fontSize: 10, fontWeight: 800, color: 'var(--text-3)',
    textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8,
  }

  function ColorRow({ value, onChange }: { value: string; onChange: (c: string) => void }) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 4 }}>
        {BADGE_COLORS.map(c => (
          <button
            key={c}
            onClick={() => onChange(c)}
            style={{
              width: '100%', aspectRatio: '1', borderRadius: 4, cursor: 'pointer',
              background: c,
              border: value === c ? '2.5px solid var(--green)' : '1.5px solid rgba(255,255,255,0.12)',
              boxShadow: value === c ? '0 0 0 1px var(--green)' : 'none',
              padding: 0,
            }}
            title={c}
          />
        ))}
      </div>
    )
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
        width: '100%', maxWidth: 600, maxHeight: '92vh', overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontWeight: 800, fontSize: 15, flex: 1 }}>Customize Club Logo</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-2)', fontSize: 18, lineHeight: 1 }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 24, alignItems: 'start' }}>

          {/* Left: preview */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, position: 'sticky', top: 0 }}>
            <SvgBadge config={cfg} size={120} />
            <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600 }}>{clubName}</div>
          </div>

          {/* Right: controls */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

            {/* Shape */}
            <div>
              <div style={secLabel}>Shape</div>
              <div style={{ display: 'flex', gap: 8 }}>
                {(Object.keys(SHAPE_PATHS) as LogoConfig['shape'][]).map(s => (
                  <button
                    key={s}
                    onClick={() => set('shape', s)}
                    title={SHAPE_LABELS[s]}
                    style={{
                      width: 44, height: 44, padding: 0, cursor: 'pointer',
                      background: cfg.shape === s ? 'rgba(54,226,126,0.1)' : 'var(--bg-base)',
                      border: `1.5px solid ${cfg.shape === s ? 'var(--green)' : 'var(--border)'}`,
                      borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <svg width="26" height="26" viewBox="0 0 100 100">
                      <path d={SHAPE_PATHS[s]} fill={cfg.shape === s ? 'var(--green)' : 'var(--text-2)'} />
                    </svg>
                  </button>
                ))}
              </div>
            </div>

            {/* Background color */}
            <div>
              <div style={secLabel}>Background</div>
              <ColorRow value={cfg.bg} onChange={v => set('bg', v)} />
            </div>

            {/* Accent color */}
            <div>
              <div style={secLabel}>Accent</div>
              <ColorRow value={cfg.accent} onChange={v => set('accent', v)} />
            </div>

            {/* Emblem */}
            <div>
              <div style={secLabel}>Emblem</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {(Object.keys(EMBLEM_LABELS) as LogoConfig['emblem'][]).map(e => (
                  <button
                    key={e}
                    onClick={() => set('emblem', e)}
                    title={e}
                    style={{
                      width: 40, height: 40, fontSize: 16, cursor: 'pointer',
                      background: cfg.emblem === e ? 'rgba(54,226,126,0.1)' : 'var(--bg-base)',
                      border: `1.5px solid ${cfg.emblem === e ? 'var(--green)' : 'var(--border)'}`,
                      borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: cfg.emblem === e ? 'var(--green)' : 'var(--text-2)',
                      fontWeight: 700,
                    }}
                  >
                    {EMBLEM_LABELS[e]}
                  </button>
                ))}
              </div>
            </div>

            {/* Text */}
            <div>
              <div style={secLabel}>Club Text (1–3 chars)</div>
              <input
                value={cfg.text}
                maxLength={3}
                onChange={e => set('text', e.target.value.toUpperCase())}
                placeholder="e.g. MU"
                style={{
                  width: 72, padding: '7px 10px', fontSize: 14, fontWeight: 700, letterSpacing: 2,
                  background: 'var(--bg-base)', border: '1px solid var(--border)',
                  borderRadius: 6, color: 'var(--text-1)', outline: 'none',
                  textTransform: 'uppercase',
                }}
              />
            </div>

          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
          {err && <span style={{ fontSize: 12, color: 'var(--red)', flex: 1 }}>{err}</span>}
          <span style={{ flex: 1 }} />
          <button
            onClick={() => { setCfg(defaultConfig(clubName)); setErr('') }}
            style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '7px 14px', cursor: 'pointer', fontSize: 12, color: 'var(--text-2)' }}
          >
            Reset
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              background: 'var(--green)', color: '#000', border: 'none',
              borderRadius: 6, padding: '8px 20px', fontSize: 13, fontWeight: 700,
              cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? 'Saving…' : 'Save Logo'}
          </button>
        </div>
      </div>
    </div>
  )
}
