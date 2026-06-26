import React, { useEffect, useRef, useState } from 'react'
import { api } from '../api/client'
import {
  KitSvg,
  KitConfig,
  PATTERN_LABELS,
  COLLAR_LABELS,
  SLEEVE_LABELS,
  DEFAULT_KIT_CONFIG,
} from './KitSvg'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isValidHex(v: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(v)
}

// ─── Color picker row ─────────────────────────────────────────────────────────

function ColorPickerRow({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (c: string) => void
}) {
  const [draft, setDraft] = useState(value)
  const nativeRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isValidHex(value)) setDraft(value)
  }, [value])

  function handleTextChange(raw: string) {
    setDraft(raw)
    if (isValidHex(raw)) onChange(raw)
  }

  function handleNativePick(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value
    setDraft(v)
    onChange(v)
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
      <div
        onClick={() => nativeRef.current?.click()}
        style={{
          width: 22, height: 22, borderRadius: 2,
          background: isValidHex(draft) ? draft : value,
          border: '2px solid rgba(244,241,234,0.20)',
          cursor: 'pointer', flexShrink: 0,
        }}
      />
      <input
        ref={nativeRef}
        type="color"
        value={isValidHex(draft) ? draft : value}
        onChange={handleNativePick}
        style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 0, height: 0 }}
        tabIndex={-1}
      />
      <input
        type="text"
        value={draft}
        onChange={e => handleTextChange(e.target.value)}
        maxLength={7}
        spellCheck={false}
        style={{
          width: 80,
          padding: '4px 8px',
          fontSize: 12,
          fontFamily: 'monospace',
          background: 'rgba(0,0,0,0.35)',
          border: `1px solid ${isValidHex(draft) ? 'rgba(244,241,234,0.25)' : '#e5202f'}`,
          borderRadius: 2,
          color: '#f4f1ea',
          outline: 'none',
        }}
      />
      <span style={{ fontSize: 12, color: 'rgba(244,241,234,0.55)', userSelect: 'none' }}>{label}</span>
    </div>
  )
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
      <span style={{ width: 3, minHeight: 14, alignSelf: 'stretch', background: '#e5202f', flexShrink: 0 }} />
      <span style={{
        fontSize: 10,
        fontFamily: 'var(--font-display)',
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        color: '#f4f1ea',
      }}>{children}</span>
    </div>
  )
}

// ─── KitDesigner ─────────────────────────────────────────────────────────────

export function KitDesigner({
  leagueId,
  clubName,
  initialConfig,
  onSaved,
  onClose,
}: {
  leagueId: string
  clubName: string
  initialConfig: KitConfig | null | undefined
  onSaved: (config: KitConfig) => void
  onClose: () => void
}) {
  const [config, setConfig] = useState<KitConfig>(initialConfig ?? DEFAULT_KIT_CONFIG)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  function update<K extends keyof KitConfig>(key: K, value: KitConfig[K]) {
    setConfig(prev => ({ ...prev, [key]: value }))
  }

  async function handleSave() {
    setSaving(true)
    setErr('')
    try {
      await api.patch(`/leagues/${leagueId}/kit`, config)
      onSaved(config)
    } catch (e: any) {
      setErr(e.response?.data?.error ?? 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const isSelected = (field: 'pattern' | 'collar' | 'sleeve', id: string) => config[field] === id

  function selectionStyle(selected: boolean): React.CSSProperties {
    return {
      background: selected ? 'rgba(229,32,47,0.10)' : 'rgba(0,0,0,0.20)',
      border: `2px solid ${selected ? '#e5202f' : 'rgba(244,241,234,0.20)'}`,
      borderRadius: 2,
      cursor: 'pointer',
      padding: 4,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 2,
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 300,
        background: 'rgba(8,8,10,0.88)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        style={{
          background: '#16161a',
          borderRadius: 2,
          border: '3px solid #f4f1ea',
          display: 'flex',
          maxWidth: 900,
          width: '90%',
          maxHeight: '90vh',
          overflow: 'hidden',
          flexDirection: 'column',
        }}
      >
        {/* ── Header ── */}
        <div
          style={{
            padding: '13px 20px',
            borderBottom: '3px solid #f4f1ea',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            flexShrink: 0,
            background: `repeating-linear-gradient(-45deg, transparent 4px, rgba(255,255,255,0.03) 4px 8px), #08080a`,
          }}
        >
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 20, letterSpacing: '0.02em', color: '#f4f1ea', flex: 1 }}>
            Kit Designer
          </span>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'rgba(244,241,234,0.7)',
              fontSize: 20,
              lineHeight: 1,
              padding: '2px 0 2px 12px',
            }}
          >
            &#x2715;
          </button>
        </div>

        {/* ── Body ── */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

          {/* ── Left panel: controls ── */}
          <div
            style={{
              width: 420,
              minWidth: 320,
              borderRight: '3px solid #f4f1ea',
              overflowY: 'auto',
              padding: '18px 20px',
              display: 'flex',
              flexDirection: 'column',
              gap: 20,
              background: '#16161a',
            }}
          >

            {/* Colors */}
            <div>
              <SectionHeader>Colors</SectionHeader>
              <ColorPickerRow
                label="Primary"
                value={config.primaryColor}
                onChange={v => update('primaryColor', v)}
              />
              <ColorPickerRow
                label="Secondary"
                value={config.secondaryColor}
                onChange={v => update('secondaryColor', v)}
              />
              <ColorPickerRow
                label="Tertiary (optional)"
                value={config.tertiaryColor ?? '#e8c84a'}
                onChange={v => update('tertiaryColor', v)}
              />
              <ColorPickerRow
                label="Undershirt"
                value={config.undershirtColor ?? '#e8e8e8'}
                onChange={v => update('undershirtColor', v)}
              />
              <ColorPickerRow
                label="Number"
                value={config.numberColor ?? '#ffffff'}
                onChange={v => update('numberColor', v)}
              />
            </div>

            {/* Pattern */}
            <div>
              <SectionHeader>Pattern</SectionHeader>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: 6,
                }}
              >
                {PATTERN_LABELS.map(p => {
                  const selected = isSelected('pattern', p.id)
                  return (
                    <button
                      key={p.id}
                      onClick={() => update('pattern', p.id)}
                      title={p.label}
                      style={{
                        ...selectionStyle(selected),
                        padding: '6px 4px',
                        transition: 'border-color 0.1s',
                      }}
                    >
                      <KitSvg
                        uid={`kd-pat-${p.id}`}
                        size={40}
                        config={{ ...config, pattern: p.id }}
                      />
                      <span
                        style={{
                          fontSize: 9,
                          fontFamily: 'var(--font-display)',
                          color: selected ? '#e5202f' : 'rgba(244,241,234,0.45)',
                          textAlign: 'center',
                          lineHeight: 1.2,
                          letterSpacing: '0.06em',
                          textTransform: 'uppercase',
                        }}
                      >
                        {p.label}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Collar */}
            <div>
              <SectionHeader>Collar</SectionHeader>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {COLLAR_LABELS.map(c => {
                  const selected = isSelected('collar', c.id)
                  return (
                    <button
                      key={c.id}
                      onClick={() => update('collar', c.id)}
                      title={c.label}
                      style={selectionStyle(selected)}
                    >
                      <KitSvg
                        uid={`kd-collar-${c.id}`}
                        size={32}
                        config={{ ...config, collar: c.id }}
                      />
                      <span
                        style={{
                          fontSize: 9,
                          fontFamily: 'var(--font-display)',
                          color: selected ? '#e5202f' : 'rgba(244,241,234,0.45)',
                          letterSpacing: '0.06em',
                          textTransform: 'uppercase',
                        }}
                      >
                        {c.label}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Sleeve */}
            <div>
              <SectionHeader>Sleeve</SectionHeader>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {SLEEVE_LABELS.map(s => {
                  const selected = isSelected('sleeve', s.id)
                  return (
                    <button
                      key={s.id}
                      onClick={() => update('sleeve', s.id)}
                      title={s.label}
                      style={selectionStyle(selected)}
                    >
                      <KitSvg
                        uid={`kd-sleeve-${s.id}`}
                        size={32}
                        config={{ ...config, sleeve: s.id }}
                      />
                      <span
                        style={{
                          fontSize: 9,
                          fontFamily: 'var(--font-display)',
                          color: selected ? '#e5202f' : 'rgba(244,241,234,0.45)',
                          textAlign: 'center',
                          maxWidth: 60,
                          lineHeight: 1.2,
                          letterSpacing: '0.06em',
                          textTransform: 'uppercase',
                        }}
                      >
                        {s.label}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

          </div>

          {/* ── Right panel: preview ── */}
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 32,
              gap: 16,
              background: 'radial-gradient(circle at 50% 40%, rgba(244,241,234,0.05) 0%, transparent 70%), #08080a',
            }}
          >
            <KitSvg uid="kd-preview" size={160} config={config} />
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#f4f1ea' }}>
                {clubName}
              </div>
              <div
                style={{
                  fontSize: 10,
                  fontFamily: 'var(--font-display)',
                  color: 'rgba(244,241,234,0.35)',
                  marginTop: 4,
                  textTransform: 'uppercase',
                  letterSpacing: '0.18em',
                }}
              >
                Home Kit
              </div>
            </div>
          </div>
        </div>

        {/* ── Footer ── */}
        <div
          style={{
            padding: '11px 18px',
            borderTop: '3px solid #f4f1ea',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexShrink: 0,
            background: '#08080a',
          }}
        >
          {err && (
            <span style={{ fontSize: 11, color: '#e5202f', fontFamily: 'var(--font-display)', letterSpacing: '0.06em', flex: 1 }}>{err}</span>
          )}
          <span style={{ flex: 1 }} />
          <button
            onClick={() => { setConfig(initialConfig ?? DEFAULT_KIT_CONFIG); setErr('') }}
            style={{
              background: 'transparent',
              border: '2px solid rgba(244,241,234,0.30)',
              borderRadius: 2,
              padding: '6px 14px',
              cursor: 'pointer',
              fontSize: 11,
              fontFamily: 'var(--font-display)',
              letterSpacing: '0.10em',
              textTransform: 'uppercase',
              color: 'rgba(244,241,234,0.60)',
            }}
          >
            Reset
          </button>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: '2px solid rgba(244,241,234,0.30)',
              borderRadius: 2,
              padding: '6px 14px',
              cursor: 'pointer',
              fontSize: 11,
              fontFamily: 'var(--font-display)',
              letterSpacing: '0.10em',
              textTransform: 'uppercase',
              color: 'rgba(244,241,234,0.60)',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              background: '#e5202f',
              color: '#f4f1ea',
              border: 'none',
              borderRadius: 2,
              padding: '7px 22px',
              fontSize: 12,
              fontFamily: 'var(--font-display)',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              cursor: saving ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? 'Saving...' : 'Save Kit'}
          </button>
        </div>
      </div>
    </div>
  )
}
