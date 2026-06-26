import React, { useEffect, useId, useRef, useState } from 'react'
import { api } from '../api/client'

// ─── Types ────────────────────────────────────────────────────────────────────

export type EmblemKey =
  'none' | 'star' | 'bolt' | 'crown' | 'diamond' | 'cross' | 'chevron' | 'ring' |
  'flames' | 'sword' | 'castle' | 'wings' | 'arrow' | 'trident'

export type DivisionKey = 'none' | 'half-v' | 'half-h' | 'sash' | 'quarters'

export interface LogoConfig {
  shape:      'shield' | 'circle' | 'hexagon' | 'rounded'
  bg:         string
  accent:     string
  textColor?: string
  emblem:     EmblemKey
  text:       string
  division?:  DivisionKey
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

const EMBLEM_PATHS: Partial<Record<EmblemKey, string>> = {
  star:    'M50,13 L55.3,28.7 L71.9,28.9 L58.6,38.8 L63.5,54.6 L50,45 L36.5,54.6 L41.4,38.8 L28.1,28.9 L44.7,28.7 Z',
  bolt:    'M62,10 L44,44 L56,44 L38,66 L64,40 L52,40 Z',
  crown:   'M18,64 L18,44 L30,56 L50,28 L70,56 L82,44 L82,64 Z',
  diamond: 'M50,12 L82,36 L50,62 L18,36 Z',
  cross:   'M43,12 L57,12 L57,29 L82,29 L82,43 L57,43 L57,62 L43,62 L43,43 L18,43 L18,29 L43,29 Z',
  chevron: 'M14,63 L50,14 L86,63 L76,63 L50,28 L24,63 Z',
  flames:  'M50,64 C38,58 32,46 38,34 C30,42 28,56 36,62 C22,48 28,24 42,16 C36,28 40,36 44,32 C40,20 46,10 50,10 C54,10 60,20 56,32 C60,36 64,28 58,16 C72,24 78,48 64,62 C72,56 70,42 62,34 C68,46 62,58 50,64Z',
  sword:   'M47,65 L47,28 L43,20 L50,10 L57,20 L53,28 L53,65Z',
  castle:  'M18,65 L18,46 L26,46 L26,36 L34,36 L34,46 L42,46 L42,36 L58,36 L58,46 L66,46 L66,36 L74,36 L74,46 L82,46 L82,65Z',
  wings:   'M50,42 C46,36 36,28 18,32 C26,24 38,22 46,26 C38,18 24,18 14,28 C18,16 32,10 46,18 C40,10 50,8 50,8 C50,8 60,10 54,18 C68,10 82,16 86,28 C76,18 62,18 54,26 C62,22 74,24 82,32 C64,28 54,36 50,42Z M46,42 L46,65 L54,65 L54,42Z',
  arrow:   'M50,10 L72,38 L62,38 L62,65 L38,65 L38,38 L28,38Z',
  trident: 'M44,65 L44,34 L36,26 L36,10 L40,10 L40,24 L44,24 L44,10 L56,10 L56,24 L60,24 L60,10 L64,10 L64,26 L56,34 L56,65Z',
}

const EMBLEM_LABELS: Record<EmblemKey, string> = {
  none: '—', star: '★', bolt: '↯', crown: '♛',
  diamond: '◆', cross: '✚', chevron: '∧', ring: '◯',
  flames: '≋', sword: '|', castle: '⌂', wings: '~',
  arrow: '▲', trident: 'Ψ',
}

const SHAPE_LABELS: Record<LogoConfig['shape'], string> = {
  shield: 'Shield', circle: 'Circle', hexagon: 'Hex', rounded: 'Square',
}

const DIVISION_LABELS: Record<DivisionKey, string> = {
  none: 'Solid', 'half-v': 'Split V', 'half-h': 'Split H', sash: 'Sash', quarters: 'Quarters',
}

const PRESET_COMBOS: { name: string; bg: string; accent: string }[] = [
  { name: 'Navy',    bg: '#0f3460', accent: '#e9c46a' },
  { name: 'Forest',  bg: '#0a4a0a', accent: '#36e27e' },
  { name: 'Blaze',   bg: '#1a1a1a', accent: '#e63946' },
  { name: 'Steel',   bg: '#16161a', accent: '#27cdff' },
  { name: 'Royal',   bg: '#1a0f3a', accent: '#7b68ee' },
  { name: 'Crimson', bg: '#7a0c0c', accent: '#e9c46a' },
  { name: 'Arctic',  bg: '#003a4a', accent: '#d0d0d0' },
  { name: 'Ember',   bg: '#1a0a00', accent: '#e8823e' },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function getBadgeColor(name: string): string {
  const palette = ['#27cdff','#36e27e','#e9c46a','#e8806a','#7b68ee','#20b2aa','#ff6b6b','#48cae4']
  let h = 0
  for (const c of name) h = Math.imul(31, h) + c.charCodeAt(0) | 0
  return palette[Math.abs(h) % palette.length]
}

const DEFAULT_BG_COLORS    = ['#0d1117','#1a1a2e','#0f3460','#2d1b69','#7a0c0c','#5c3a00','#0a4a0a','#003a4a']
const DEFAULT_ACCENT_COLORS = ['#e63946','#e8823e','#e9c46a','#36e27e','#27cdff','#7b68ee','#e879c6','#d0d0d0']
const DEFAULT_EMBLEMS: EmblemKey[] = ['star','bolt','crown','diamond','cross','chevron','flames','castle','wings','arrow','trident','ring']

function generateDefaultConfig(name: string): LogoConfig {
  function h(seed: number): number {
    let v = seed
    for (const c of name) v = Math.imul(31, v) + c.charCodeAt(0) | 0
    return Math.abs(v)
  }
  const shapes: LogoConfig['shape'][] = ['shield', 'circle', 'hexagon', 'rounded']
  const initials = name.split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('')
  return {
    shape:     shapes[h(3) % shapes.length],
    bg:        DEFAULT_BG_COLORS[h(1) % DEFAULT_BG_COLORS.length],
    accent:    DEFAULT_ACCENT_COLORS[h(7) % DEFAULT_ACCENT_COLORS.length],
    emblem:    DEFAULT_EMBLEMS[h(5) % DEFAULT_EMBLEMS.length],
    text:      initials,
    textColor: '#ffffff',
    division:  'none',
  }
}

function isValidHex(v: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(v)
}

function renderDivision(div: DivisionKey, color: string): React.ReactElement | null {
  switch (div) {
    case 'half-v':   return <rect x="50" y="0" width="50" height="100" fill={color} />
    case 'half-h':   return <rect x="0" y="50" width="100" height="50" fill={color} />
    case 'sash':     return <polygon points="60,0 100,0 100,40 40,100 0,100 0,60" fill={color} />
    case 'quarters': return <><rect x="0" y="0" width="50" height="50" fill={color} /><rect x="50" y="50" width="50" height="50" fill={color} /></>
    default:         return null
  }
}

// ─── SVG badge renderer ───────────────────────────────────────────────────────

function SvgBadge({ config, size }: { config: LogoConfig; size: number }) {
  const uid = useId().replace(/[^a-z0-9]/gi, '')
  const { shape, bg, accent, emblem, text, textColor, division } = config
  const path       = SHAPE_PATHS[shape]
  const hasGlyph   = emblem !== 'none'
  const safeText   = (text || '?').toUpperCase().slice(0, 3)
  const divMode    = division ?? 'none'
  const hasDivision = divMode !== 'none'
  const textFill   = textColor ?? '#ffffff'
  const emblemFill = hasDivision ? textFill : accent
  const showBand   = hasGlyph && !hasDivision
  const textY      = hasGlyph ? 80 : 52
  const fontSize   = safeText.length > 2 ? (hasGlyph ? 13 : 20) : (hasGlyph ? 17 : 26)
  const textStroke = hasDivision ? 'rgba(0,0,0,0.55)' : (showBand ? accent : bg)

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

      {/* Base fill (outside clip so no edge artifacts) */}
      <path d={path} fill={bg} />

      <g clipPath={`url(#cb${uid})`}>
        {/* Division pattern */}
        {hasDivision && renderDivision(divMode, accent)}

        {/* Emblem */}
        {emblem === 'ring'
          ? <circle cx="50" cy="36" r="22" fill="none" stroke={emblemFill} strokeWidth="9" />
          : hasGlyph && EMBLEM_PATHS[emblem] && (
              <path d={EMBLEM_PATHS[emblem]} fill={emblemFill} />
            )
        }

        {/* Bottom accent band (only when no division) */}
        {showBand && <rect x="0" y="68" width="100" height="32" fill={accent} />}

        {/* Text */}
        <text
          x="50" y={textY}
          textAnchor="middle" dominantBaseline="middle"
          fontSize={fontSize} fontWeight="900"
          fontFamily="system-ui, -apple-system, sans-serif"
          fill={textFill} stroke={textStroke} strokeWidth="3"
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
  const config = logoConfig ?? generateDefaultConfig(name)
  return <SvgBadge config={config} size={size} />
}

// ─── Logo Maker modal ─────────────────────────────────────────────────────────

function defaultConfig(clubName: string): LogoConfig {
  const initials = clubName.split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('')
  return { shape: 'shield', bg: '#1a1a2e', accent: '#36e27e', emblem: 'star', text: initials, division: 'none', textColor: '#ffffff' }
}

// ─── Color Picker Field ───────────────────────────────────────────────────────

function ColorPickerField({ label, value, onChange }: {
  label: string; value: string; onChange: (c: string) => void
}) {
  const [draft, setDraft] = useState(value)
  const nativeRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isValidHex(value)) setDraft(value)
  }, [value])

  function handleText(raw: string) {
    setDraft(raw)
    if (isValidHex(raw)) onChange(raw)
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <div
          onClick={() => nativeRef.current?.click()}
          style={{
            width: 26, height: 26, borderRadius: 2, flexShrink: 0, cursor: 'pointer',
            background: isValidHex(draft) ? draft : value,
            border: '2px solid rgba(244,241,234,0.3)',
          }}
        />
        <input
          ref={nativeRef} type="color"
          value={isValidHex(draft) ? draft : value}
          onChange={e => { setDraft(e.target.value); onChange(e.target.value) }}
          style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 0, height: 0 }}
          tabIndex={-1}
        />
        <input
          type="text" value={draft} spellCheck={false} maxLength={7}
          onChange={e => handleText(e.target.value)}
          style={{
            width: 80, padding: '4px 8px', fontSize: 12, fontFamily: 'monospace',
            background: 'rgba(0,0,0,0.35)',
            border: `1px solid ${isValidHex(draft) ? 'rgba(244,241,234,0.25)' : '#e5202f'}`,
            borderRadius: 2, color: '#f4f1ea', outline: 'none',
          }}
        />
        <span style={{ fontSize: 11, color: 'rgba(244,241,234,0.5)', userSelect: 'none' }}>{label}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 3, marginBottom: 2 }}>
        {BADGE_COLORS.map(c => (
          <button
            key={c}
            onClick={() => { onChange(c); setDraft(c) }}
            style={{
              width: '100%', aspectRatio: '1', padding: 0, cursor: 'pointer', borderRadius: 2,
              background: c,
              border: value === c ? '2px solid #e5202f' : '1px solid rgba(244,241,234,0.12)',
            }}
            title={c}
          />
        ))}
      </div>
    </div>
  )
}

// ─── Section label ────────────────────────────────────────────────────────────

function SecLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
      <span style={{ width: 3, minHeight: 14, alignSelf: 'stretch', background: '#e5202f', flexShrink: 0 }} />
      <span style={{ fontSize: 10, fontFamily: 'var(--font-display)', letterSpacing: '0.14em', textTransform: 'uppercase', color: '#f4f1ea' }}>
        {children}
      </span>
    </div>
  )
}

// ─── LogoMaker ────────────────────────────────────────────────────────────────

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

  const btnSel: React.CSSProperties = {
    padding: '6px', cursor: 'pointer',
    background: 'rgba(229,32,47,0.10)',
    border: '2px solid #e5202f',
    borderRadius: 2,
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
  }
  const btnUnsel: React.CSSProperties = {
    padding: '6px', cursor: 'pointer',
    background: 'rgba(0,0,0,0.20)',
    border: '2px solid rgba(244,241,234,0.20)',
    borderRadius: 2,
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
  }
  const labelSel: React.CSSProperties = {
    fontSize: 8, fontFamily: 'var(--font-display)', letterSpacing: '0.08em',
    textTransform: 'uppercase', color: '#e5202f',
  }
  const labelUnsel: React.CSSProperties = {
    fontSize: 8, fontFamily: 'var(--font-display)', letterSpacing: '0.08em',
    textTransform: 'uppercase', color: 'rgba(244,241,234,0.45)',
  }

  const DIVISIONS = (Object.keys(DIVISION_LABELS) as DivisionKey[])
  const SHAPES    = (Object.keys(SHAPE_PATHS) as LogoConfig['shape'][])
  const EMBLEMS   = (Object.keys(EMBLEM_LABELS) as EmblemKey[])

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(8,8,10,0.88)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: '#16161a', border: '3px solid #f4f1ea', borderRadius: 2,
        width: '100%', maxWidth: 700, maxHeight: '94vh', overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
      }}>

        {/* ── Header ── */}
        <div style={{
          padding: '13px 20px', borderBottom: '3px solid #f4f1ea', flexShrink: 0,
          display: 'flex', alignItems: 'center', gap: 12,
          background: `repeating-linear-gradient(-45deg, transparent 4px, rgba(255,255,255,0.03) 4px 8px), #08080a`,
        }}>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 20, letterSpacing: '0.02em', color: '#f4f1ea', flex: 1 }}>
            Club Logo Designer
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(244,241,234,0.7)', fontSize: 20, lineHeight: 1, padding: '0 0 0 12px' }}>
            &#x2715;
          </button>
        </div>

        {/* ── Body ── */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', minHeight: 0 }}>

          {/* Left: controls */}
          <div style={{
            width: 340, minWidth: 270, overflowY: 'auto', padding: '16px 16px',
            display: 'flex', flexDirection: 'column', gap: 16,
            borderRight: '3px solid #f4f1ea', background: '#16161a',
          }}>

            {/* Shape */}
            <div>
              <SecLabel>Shape</SecLabel>
              <div style={{ display: 'flex', gap: 6 }}>
                {SHAPES.map(s => (
                  <button key={s} onClick={() => set('shape', s)} style={cfg.shape === s ? btnSel : btnUnsel}>
                    <SvgBadge config={{ ...cfg, shape: s }} size={38} />
                    <span style={cfg.shape === s ? labelSel : labelUnsel}>{SHAPE_LABELS[s]}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Division */}
            <div>
              <SecLabel>Division</SecLabel>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                {DIVISIONS.map(d => (
                  <button key={d} onClick={() => set('division', d)} style={cfg.division === d ? btnSel : btnUnsel}>
                    <SvgBadge config={{ ...cfg, division: d, emblem: 'none' }} size={32} />
                    <span style={cfg.division === d ? labelSel : labelUnsel}>{DIVISION_LABELS[d]}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Colors */}
            <div>
              <SecLabel>Colors</SecLabel>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <ColorPickerField label="Background" value={cfg.bg} onChange={v => set('bg', v)} />
                <ColorPickerField label="Accent" value={cfg.accent} onChange={v => set('accent', v)} />
                <ColorPickerField label="Text / Emblem" value={cfg.textColor ?? '#ffffff'} onChange={v => set('textColor', v)} />
              </div>
            </div>

            {/* Emblem */}
            <div>
              <SecLabel>Emblem</SecLabel>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 5 }}>
                {EMBLEMS.map(e => (
                  <button key={e} onClick={() => set('emblem', e)} style={{ ...(cfg.emblem === e ? btnSel : btnUnsel), padding: '5px 4px 3px' }}>
                    <SvgBadge config={{ ...cfg, emblem: e }} size={34} />
                    <span style={cfg.emblem === e ? labelSel : { ...labelUnsel, fontSize: 7 }}>{e}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Club Text */}
            <div>
              <SecLabel>Club Text (1–3 chars)</SecLabel>
              <input
                value={cfg.text}
                maxLength={3}
                onChange={e => set('text', e.target.value.toUpperCase())}
                placeholder="e.g. MU"
                style={{
                  width: 80, padding: '8px 10px', fontSize: 18, fontWeight: 900, letterSpacing: 4,
                  background: 'rgba(0,0,0,0.35)', border: '2px solid rgba(244,241,234,0.25)',
                  borderRadius: 2, color: '#f4f1ea', outline: 'none', textTransform: 'uppercase',
                  fontFamily: 'var(--font-display)',
                }}
              />
            </div>

            {/* Quick Presets */}
            <div>
              <SecLabel>Quick Presets</SecLabel>
              <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 }}>
                {PRESET_COMBOS.map(p => (
                  <button
                    key={p.name}
                    onClick={() => setCfg(prev => ({ ...prev, bg: p.bg, accent: p.accent }))}
                    style={{ flexShrink: 0, padding: '5px 5px 3px', cursor: 'pointer', background: 'rgba(0,0,0,0.2)', border: '2px solid rgba(244,241,234,0.15)', borderRadius: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}
                  >
                    <SvgBadge config={{ ...cfg, bg: p.bg, accent: p.accent }} size={38} />
                    <span style={{ fontSize: 7, fontFamily: 'var(--font-display)', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(244,241,234,0.4)' }}>
                      {p.name}
                    </span>
                  </button>
                ))}
              </div>
            </div>

          </div>

          {/* Right: preview */}
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            padding: 28, gap: 20,
            background: 'radial-gradient(circle at 50% 38%, rgba(244,241,234,0.05) 0%, transparent 68%), #08080a',
          }}>
            <SvgBadge config={cfg} size={164} />
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#f4f1ea' }}>
                {clubName}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 18, alignItems: 'center', opacity: 0.75 }}>
              <SvgBadge config={cfg} size={64} />
              <SvgBadge config={cfg} size={36} />
              <SvgBadge config={cfg} size={22} />
            </div>
          </div>

        </div>

        {/* ── Footer ── */}
        <div style={{
          padding: '11px 18px', borderTop: '3px solid #f4f1ea', flexShrink: 0,
          display: 'flex', alignItems: 'center', gap: 8, background: '#08080a',
        }}>
          {err && <span style={{ fontSize: 11, color: '#e5202f', fontFamily: 'var(--font-display)', letterSpacing: '0.06em', flex: 1 }}>{err}</span>}
          <span style={{ flex: 1 }} />
          <button
            onClick={() => { setCfg(defaultConfig(clubName)); setErr('') }}
            style={{ background: 'transparent', border: '2px solid rgba(244,241,234,0.30)', borderRadius: 2, padding: '6px 14px', cursor: 'pointer', fontSize: 11, fontFamily: 'var(--font-display)', letterSpacing: '0.10em', textTransform: 'uppercase', color: 'rgba(244,241,234,0.6)' }}
          >
            Reset
          </button>
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: '2px solid rgba(244,241,234,0.30)', borderRadius: 2, padding: '6px 14px', cursor: 'pointer', fontSize: 11, fontFamily: 'var(--font-display)', letterSpacing: '0.10em', textTransform: 'uppercase', color: 'rgba(244,241,234,0.6)' }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{ background: '#e5202f', color: '#f4f1ea', border: 'none', borderRadius: 2, padding: '7px 22px', fontSize: 12, fontFamily: 'var(--font-display)', letterSpacing: '0.12em', textTransform: 'uppercase', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1 }}
          >
            {saving ? 'Saving...' : 'Save Logo'}
          </button>
        </div>

      </div>
    </div>
  )
}
