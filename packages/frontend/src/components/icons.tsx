// Custom football-specific SVG icons — all use currentColor
// For standard icons (Trophy, Star, Target, etc.) import directly from lucide-react

type IconProps = { size?: number; className?: string }

/** Soccer ball — goals, training, dribbling */
export function BallIcon({ size = 14, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className} aria-hidden="true">
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5"/>
      <polygon points="8,5 10.85,7.07 9.76,10.43 6.24,10.43 5.15,7.07" fill="currentColor"/>
      <line x1="8"    y1="5"     x2="8"     y2="1.5"  stroke="currentColor" strokeWidth="1.2"/>
      <line x1="10.85" y1="7.07" x2="14.18" y2="5.99" stroke="currentColor" strokeWidth="1.2"/>
      <line x1="9.76"  y1="10.43" x2="11.82" y2="13.26" stroke="currentColor" strokeWidth="1.2"/>
      <line x1="6.24"  y1="10.43" x2="4.18"  y2="13.26" stroke="currentColor" strokeWidth="1.2"/>
      <line x1="5.15"  y1="7.07"  x2="1.82"  y2="5.99"  stroke="currentColor" strokeWidth="1.2"/>
    </svg>
  )
}

/** Football card (yellow or red) */
export function CardIcon({ color, size = 12, className }: { color: 'yellow' | 'red' } & IconProps) {
  return (
    <svg width={size} height={Math.round(size * 1.4)} viewBox="0 0 10 14" className={className} aria-hidden="true">
      <rect
        x="0.5" y="0.5" width="9" height="13" rx="1.5"
        fill={color === 'yellow' ? '#f5c400' : '#e5202f'}
        stroke={color === 'yellow' ? 'rgba(0,0,0,0.12)' : 'rgba(0,0,0,0.1)'}
        strokeWidth="0.5"
      />
    </svg>
  )
}

/** Substitution — two opposing arrows (player on ↑ / player off ↓) */
export function SubIcon({ size = 14, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M5 12V4M5 4L3 6m2-2 2 2"/>
      <path d="M11 4v8m0 0-2-2m2 2 2-2"/>
    </svg>
  )
}
