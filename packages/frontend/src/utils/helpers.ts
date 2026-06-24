// posClass — position badge CSS class
export function posClass(pos: string): string {
  if (pos === 'GK') return 'pos pos-gk'
  if (['CB','LB','RB'].includes(pos)) return 'pos pos-def'
  if (['CDM','CM','CAM','LM','RM'].includes(pos)) return 'pos pos-mid'
  return 'pos pos-att'
}

// getBadgeColor — deterministic color from club/player name
export function getBadgeColor(name: string): string {
  const palette = ['#27cdff','#36e27e','#e9c46a','#e8806a','#f97316','#a78bfa','#34d399','#fbbf24']
  let h = 0
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  return palette[Math.abs(h) % palette.length]
}

// ratingColor — color for match player ratings
export function ratingColor(r: number): string {
  if (r >= 8.5) return '#36e27e'
  if (r >= 7.5) return '#a8e36b'
  if (r >= 6.5) return '#e9c46a'
  if (r >= 6.0) return '#f0a26a'
  return '#e8806a'
}

// ovrColor — color for overall ratings
export function ovrColor(v: number): string {
  if (v >= 85) return 'var(--gold)'
  if (v >= 75) return 'var(--green)'
  if (v >= 65) return 'var(--text-2)'
  return 'var(--text-3)'
}

// formatBudget — € budget formatting
export function formatBudget(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `€${(v / 1_000_000).toFixed(1)}M`
  if (Math.abs(v) >= 1_000) return `€${(v / 1_000).toFixed(1)}k`
  return `€${v}`
}
