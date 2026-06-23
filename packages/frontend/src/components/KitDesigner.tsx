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

  // Keep draft in sync when parent changes (e.g. reset)
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
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginBottom: 6,
      }}
    >
      {/* Colored swatch — clicking opens native color picker */}
      <div
        onClick={() => nativeRef.current?.click()}
        style={{
          width: 20,
          height: 20,
          borderRadius: 4,
          background: isValidHex(draft) ? draft : value,
          border: '1px solid rgba(255,255,255,0.18)',
          cursor: 'pointer',
          flexShrink: 0,
        }}
      />
      {/* Hidden native color input */}
      <input
        ref={nativeRef}
        type="color"
        value={isValidHex(draft) ? draft : value}
        onChange={handleNativePick}
        style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 0, height: 0 }}
        tabIndex={-1}
      />
      {/* Hex text input */}
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
          background: 'var(--bg-base)',
          border: `1px solid ${isValidHex(draft) ? 'var(--border)' : 'var(--red, #e63946)'}`,
          borderRadius: 'var(--radius-sm)',
          color: 'var(--text-1)',
          outline: 'none',
        }}
      />
      {/* Label */}
      <span style={{ fontSize: 12, color: 'var(--text-2)', userSelect: 'none' }}>{label}</span>
    </div>
  )
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 800,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        color: 'var(--text-2)',
        marginBottom: 8,
      }}
    >
      {children}
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
      background: selected ? 'rgba(54,226,126,0.12)' : 'var(--bg-base)',
      border: `1.5px solid ${selected ? 'var(--green)' : 'var(--border)'}`,
      borderRadius: 'var(--radius-sm)',
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
        background: 'rgba(0,0,0,0.88)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        style={{
          background: 'var(--bg-card)',
          borderRadius: 16,
          border: '1px solid var(--border)',
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
            padding: '14px 20px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            flexShrink: 0,
          }}
        >
          <span style={{ fontWeight: 800, fontSize: 15, flex: 1 }}>Kit Designer</span>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-2)',
              fontSize: 18,
              lineHeight: 1,
              padding: '2px 6px',
            }}
          >
            ✕
          </button>
        </div>

        {/* ── Body ── */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

          {/* ── Left panel: controls ── */}
          <div
            style={{
              width: 420,
              minWidth: 320,
              borderRight: '1px solid var(--border)',
              overflowY: 'auto',
              padding: '18px 20px',
              display: 'flex',
              flexDirection: 'column',
              gap: 20,
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
                          fontWeight: 600,
                          color: selected ? 'var(--green)' : 'var(--text-3)',
                          textAlign: 'center',
                          lineHeight: 1.2,
                          letterSpacing: '0.02em',
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
                          fontWeight: 600,
                          color: selected ? 'var(--green)' : 'var(--text-3)',
                          letterSpacing: '0.02em',
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
                          fontWeight: 600,
                          color: selected ? 'var(--green)' : 'var(--text-3)',
                          letterSpacing: '0.02em',
                          textAlign: 'center',
                          maxWidth: 60,
                          lineHeight: 1.2,
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
              background: 'var(--bg-base)',
            }}
          >
            <KitSvg uid="kd-preview" size={160} config={config} />
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--text-1)' }}>
                {clubName}
              </div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: 'var(--text-3)',
                  marginTop: 4,
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
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
            padding: '12px 20px',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            flexShrink: 0,
          }}
        >
          {err && (
            <span style={{ fontSize: 12, color: 'var(--red, #e63946)', flex: 1 }}>{err}</span>
          )}
          <span style={{ flex: 1 }} />
          <button
            onClick={() => { setConfig(initialConfig ?? DEFAULT_KIT_CONFIG); setErr('') }}
            style={{
              background: 'none',
              border: '1px solid var(--border)',
              borderRadius: 6,
              padding: '7px 14px',
              cursor: 'pointer',
              fontSize: 12,
              color: 'var(--text-2)',
            }}
          >
            Reset
          </button>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: '1px solid var(--border)',
              borderRadius: 6,
              padding: '7px 14px',
              cursor: 'pointer',
              fontSize: 12,
              color: 'var(--text-2)',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              background: 'var(--green)',
              color: '#000',
              border: 'none',
              borderRadius: 6,
              padding: '8px 20px',
              fontSize: 13,
              fontWeight: 700,
              cursor: saving ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? 'Saving…' : 'Save Kit'}
          </button>
        </div>
      </div>
    </div>
  )
}
