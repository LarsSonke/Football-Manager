import React from 'react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface KitConfig {
  primaryColor: string
  secondaryColor: string
  tertiaryColor?: string
  undershirtColor?: string
  numberColor?: string
  pattern: string
  collar: 'round' | 'v-neck' | 'polo' | 'henley'
  sleeve: 'short' | 'long' | 'short-with-undershirt'
}

// ---------------------------------------------------------------------------
// Exported constants
// ---------------------------------------------------------------------------

export const PATTERN_LABELS: Array<{ id: string; label: string }> = [
  { id: 'plain', label: 'Plain' },
  { id: 'vertical-stripes', label: 'Stripes' },
  { id: 'thin-stripes', label: 'Thin Stripes' },
  { id: 'pinstripes', label: 'Pinstripes' },
  { id: 'hoops', label: 'Hoops' },
  { id: 'thin-hoops', label: 'Thin Hoops' },
  { id: 'half-and-half', label: 'Half & Half' },
  { id: 'diagonal-sash', label: 'Sash' },
  { id: 'narrow-sash', label: 'Narrow Sash' },
  { id: 'contrasting-sleeves', label: 'Contrasting Sleeves' },
  { id: 'quarters', label: 'Quarters' },
  { id: 'chevron', label: 'Chevron' },
  { id: 'side-panels', label: 'Side Panels' },
  { id: 'shadow-stripes', label: 'Shadow Stripes' },
  { id: 'cross', label: 'Cross' },
  { id: 'checked', label: 'Checked' },
  { id: 'bird-eye', label: "Bird's Eye" },
  { id: 'collar-trim', label: 'Collar Trim' },
  { id: 'gradient', label: 'Gradient' },
  { id: 'diagonal-quarters', label: 'Diagonal' },
]

export const COLLAR_LABELS: Array<{ id: KitConfig['collar']; label: string }> = [
  { id: 'round', label: 'Round' },
  { id: 'v-neck', label: 'V-Neck' },
  { id: 'polo', label: 'Polo' },
  { id: 'henley', label: 'Henley' },
]

export const SLEEVE_LABELS: Array<{ id: KitConfig['sleeve']; label: string }> = [
  { id: 'short', label: 'Short' },
  { id: 'long', label: 'Long' },
  { id: 'short-with-undershirt', label: 'Short + Base Layer' },
]

export const DEFAULT_KIT_CONFIG: KitConfig = {
  primaryColor: '#1e3a5f',
  secondaryColor: '#ffffff',
  tertiaryColor: '#e8c84a',
  undershirtColor: '#e8e8e8',
  numberColor: '#ffffff',
  pattern: 'plain',
  collar: 'round',
  sleeve: 'short',
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function darken(hex: string, amount = 20): string {
  const n = parseInt(hex.replace('#', ''), 16)
  const r = Math.max(0, (n >> 16) - amount)
  const g = Math.max(0, ((n >> 8) & 0xff) - amount)
  const b = Math.max(0, (n & 0xff) - amount)
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

// ---------------------------------------------------------------------------
// Shirt path helpers
// ---------------------------------------------------------------------------

// Returns the SVG path string for the shirt outline based on collar + sleeve
function getShirtPath(collar: KitConfig['collar'], sleeve: KitConfig['sleeve']): string {
  const isLong = sleeve === 'long'
  const isVNeck = collar === 'v-neck'

  if (isVNeck) {
    if (isLong) {
      return 'M 38,12 L 50,26 L 62,12 L 84,23 L 92,82 L 78,82 L 78,112 L 22,112 L 22,82 L 8,82 L 16,23 Z'
    }
    return 'M 38,12 L 50,26 L 62,12 L 84,23 L 93,44 L 78,44 L 78,112 L 22,112 L 22,44 L 7,44 L 16,23 Z'
  }

  // round / polo / henley — all use the curved neckline path
  if (isLong) {
    return 'M 38,12 Q 50,6 62,12 L 84,23 L 92,82 L 78,82 L 78,112 L 22,112 L 22,82 L 8,82 L 16,23 Z'
  }
  return 'M 38,12 Q 50,6 62,12 L 84,23 L 93,44 L 78,44 L 78,112 L 22,112 L 22,44 L 7,44 L 16,23 Z'
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export const KitSvg = React.memo(function KitSvg({
  config,
  size = 60,
  uid,
}: {
  config: KitConfig | null | undefined
  size?: number
  uid: string
}) {
  const cfg: KitConfig = config ?? DEFAULT_KIT_CONFIG

  const {
    primaryColor,
    secondaryColor,
    undershirtColor = '#e8e8e8',
    pattern,
    collar,
    sleeve,
  } = cfg

  const isLong = sleeve === 'long'
  const isShortUndershirt = sleeve === 'short-with-undershirt'

  const shirtPath = getShirtPath(collar, isShortUndershirt ? 'short' : sleeve)

  const clipId = `${uid}-clip`
  const patId = `${uid}-pat`
  const gradId = `${uid}-grad`

  const width = size
  const height = size * 1.2

  // -------------------------------------------------------------------------
  // Pattern defs (only patterns that use SVG <pattern> or <linearGradient>)
  // -------------------------------------------------------------------------

  function renderPatternDef() {
    switch (pattern) {
      case 'vertical-stripes':
        return (
          <pattern id={patId} width="14" height="120" patternUnits="userSpaceOnUse" x="0" y="0">
            <rect x="0" y="0" width="7" height="120" fill={secondaryColor} />
          </pattern>
        )
      case 'thin-stripes':
        return (
          <pattern id={patId} width="8" height="120" patternUnits="userSpaceOnUse" x="0" y="0">
            <rect x="0" y="0" width="4" height="120" fill={secondaryColor} />
          </pattern>
        )
      case 'pinstripes':
        return (
          <pattern id={patId} width="10" height="120" patternUnits="userSpaceOnUse" x="0" y="0">
            <rect x="0" y="0" width="2" height="120" fill={secondaryColor} opacity="0.7" />
          </pattern>
        )
      case 'hoops':
        return (
          <pattern id={patId} width="100" height="18" patternUnits="userSpaceOnUse" x="0" y="0">
            <rect x="0" y="0" width="100" height="9" fill={secondaryColor} />
          </pattern>
        )
      case 'thin-hoops':
        return (
          <pattern id={patId} width="100" height="10" patternUnits="userSpaceOnUse" x="0" y="0">
            <rect x="0" y="0" width="100" height="5" fill={secondaryColor} />
          </pattern>
        )
      case 'shadow-stripes':
        return (
          <pattern id={patId} width="12" height="120" patternUnits="userSpaceOnUse" x="0" y="0">
            <rect x="0" y="0" width="6" height="120" fill={secondaryColor} opacity="0.15" />
          </pattern>
        )
      case 'checked':
        return (
          <pattern id={patId} width="16" height="16" patternUnits="userSpaceOnUse" x="0" y="0">
            <rect x="0" y="0" width="8" height="8" fill={secondaryColor} />
            <rect x="8" y="8" width="8" height="8" fill={secondaryColor} />
          </pattern>
        )
      case 'bird-eye':
        return (
          <pattern id={patId} width="10" height="10" patternUnits="userSpaceOnUse" x="0" y="0">
            <polygon points="5,0 10,5 5,10 0,5" fill={secondaryColor} opacity="0.8" />
          </pattern>
        )
      case 'gradient':
        return (
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={primaryColor} />
            <stop offset="100%" stopColor={secondaryColor} />
          </linearGradient>
        )
      default:
        return null
    }
  }

  // -------------------------------------------------------------------------
  // Pattern overlay (rendered after the base fill, inside the clip)
  // -------------------------------------------------------------------------

  function renderPatternOverlay() {
    const clip = `url(#${clipId})`

    switch (pattern) {
      // Patterns that use a <pattern> def — fill a full rect
      case 'vertical-stripes':
      case 'thin-stripes':
      case 'pinstripes':
      case 'hoops':
      case 'thin-hoops':
      case 'shadow-stripes':
      case 'checked':
      case 'bird-eye':
        return <rect x="0" y="0" width="100" height="120" fill={`url(#${patId})`} clipPath={clip} />

      case 'half-and-half':
        return <rect x="50" y="0" width="50" height="120" fill={secondaryColor} clipPath={clip} />

      case 'diagonal-sash':
        return (
          <polygon points="20,0 70,0 80,120 30,120" fill={secondaryColor} clipPath={clip} />
        )

      case 'narrow-sash':
        return (
          <polygon points="35,0 55,0 65,120 45,120" fill={secondaryColor} clipPath={clip} />
        )

      case 'contrasting-sleeves': {
        if (isLong) {
          return (
            <>
              <polygon points="16,23 38,12 22,82 8,82" fill={secondaryColor} clipPath={clip} />
              <polygon points="84,23 62,12 78,82 92,82" fill={secondaryColor} clipPath={clip} />
            </>
          )
        }
        // short or short-with-undershirt
        return (
          <>
            <polygon points="7,44 16,23 38,12 22,44" fill={secondaryColor} clipPath={clip} />
            <polygon points="93,44 84,23 62,12 78,44" fill={secondaryColor} clipPath={clip} />
          </>
        )
      }

      case 'quarters':
        return (
          <>
            <rect x="50" y="0" width="50" height="60" fill={secondaryColor} clipPath={clip} />
            <rect x="0" y="60" width="50" height="60" fill={secondaryColor} clipPath={clip} />
          </>
        )

      case 'chevron':
        return (
          <polygon points="0,0 100,0 50,45" fill={secondaryColor} clipPath={clip} />
        )

      case 'side-panels':
        return (
          <>
            <rect x="0" y="0" width="18" height="120" fill={secondaryColor} clipPath={clip} />
            <rect x="82" y="0" width="18" height="120" fill={secondaryColor} clipPath={clip} />
          </>
        )

      case 'cross':
        return (
          <>
            <rect x="0" y="48" width="100" height="16" fill={secondaryColor} clipPath={clip} />
            <rect x="44" y="0" width="12" height="120" fill={secondaryColor} clipPath={clip} />
          </>
        )

      case 'collar-trim':
        return (
          <>
            {/* collar trim */}
            <path
              d="M 36,10 Q 50,4 64,10 Q 50,15 36,10"
              fill={secondaryColor}
              clipPath={clip}
            />
            {/* sleeve cuff trims */}
            {isLong ? (
              <>
                <polygon points="8,78 22,78 22,82 8,82" fill={secondaryColor} clipPath={clip} />
                <polygon points="78,78 92,78 92,82 78,82" fill={secondaryColor} clipPath={clip} />
              </>
            ) : (
              <>
                <polygon points="7,40 22,40 22,44 7,44" fill={secondaryColor} clipPath={clip} />
                <polygon points="78,40 93,40 93,44 78,44" fill={secondaryColor} clipPath={clip} />
              </>
            )}
            {/* hem trim */}
            <rect x="0" y="106" width="100" height="6" fill={secondaryColor} clipPath={clip} />
          </>
        )

      case 'diagonal-quarters':
        return (
          <polygon points="0,0 100,0 0,120" fill={secondaryColor} clipPath={clip} />
        )

      // gradient: the base fill already handles it
      case 'gradient':
        return null

      // plain: no overlay
      case 'plain':
      default:
        return null
    }
  }

  // -------------------------------------------------------------------------
  // Base fill color / gradient
  // -------------------------------------------------------------------------

  function renderBaseFill() {
    const clip = `url(#${clipId})`
    if (pattern === 'gradient') {
      return <rect x="0" y="0" width="100" height="120" fill={`url(#${gradId})`} clipPath={clip} />
    }
    return <rect x="0" y="0" width="100" height="120" fill={primaryColor} clipPath={clip} />
  }

  // -------------------------------------------------------------------------
  // Sleeve cuffs (drawn on top of pattern, inside clip)
  // -------------------------------------------------------------------------

  function renderCuffs() {
    const clip = `url(#${clipId})`
    // Don't draw cuffs for contrasting-sleeves or collar-trim (they handle their own edge styling)
    if (pattern === 'contrasting-sleeves' || pattern === 'collar-trim') return null

    if (isLong) {
      return (
        <>
          <polygon points="8,78 22,78 22,82 8,82" fill={secondaryColor} clipPath={clip} />
          <polygon points="78,78 92,78 92,82 78,82" fill={secondaryColor} clipPath={clip} />
        </>
      )
    }
    // short or short-with-undershirt
    return (
      <>
        <polygon points="7,40 22,40 22,44 7,44" fill={secondaryColor} clipPath={clip} />
        <polygon points="78,40 93,40 93,44 78,44" fill={secondaryColor} clipPath={clip} />
      </>
    )
  }

  // -------------------------------------------------------------------------
  // Collar overlays
  // -------------------------------------------------------------------------

  function renderCollar() {
    switch (collar) {
      case 'round':
        return (
          <path
            d="M 38,12 Q 50,6 62,12"
            fill="none"
            stroke="rgba(0,0,0,0.2)"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
        )

      case 'v-neck':
        return (
          <path
            d="M 38,12 L 50,26 L 62,12"
            fill="none"
            stroke="rgba(0,0,0,0.2)"
            strokeWidth="1.2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )

      case 'polo':
        return (
          <>
            {/* folded collar band */}
            <path
              d="M 36,10 Q 50,4 64,10 L 64,20 Q 50,16 36,20 Z"
              fill={primaryColor}
              stroke="rgba(0,0,0,0.25)"
              strokeWidth="0.8"
            />
            {/* button strip */}
            <rect
              x="48"
              y="10"
              width="4"
              height="14"
              rx="0.5"
              fill={darken(primaryColor)}
            />
            {/* buttons */}
            <circle cx="50" cy="14" r="1.5" fill={darken(primaryColor, 35)} />
            <circle cx="50" cy="20" r="1.5" fill={darken(primaryColor, 35)} />
          </>
        )

      case 'henley':
        return (
          <>
            {/* placket strip */}
            <rect
              x="47.5"
              y="12"
              width="5"
              height="16"
              rx="1"
              fill={primaryColor}
              stroke="rgba(0,0,0,0.2)"
              strokeWidth="0.5"
            />
            {/* buttons */}
            <circle cx="50" cy="15" r="1.5" fill={darken(primaryColor, 25)} />
            <circle cx="50" cy="20" r="1.5" fill={darken(primaryColor, 25)} />
            <circle cx="50" cy="25" r="1.5" fill={darken(primaryColor, 25)} />
          </>
        )

      default:
        return null
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 100 120"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <clipPath id={clipId}>
          <path d={shirtPath} />
        </clipPath>
        {renderPatternDef()}
      </defs>

      {/* 1. Undershirt elements (drawn before the shirt) */}
      {isShortUndershirt && (
        <>
          {/* undershirt collar peek */}
          <path
            d="M 36,14 Q 50,7 64,14 Q 50,20 36,14 Z"
            fill={undershirtColor}
          />
          {/* undershirt sleeves */}
          <path d="M 7,44 L 2,64 L 16,64 L 22,44 Z" fill={undershirtColor} />
          <path d="M 93,44 L 98,64 L 84,64 L 78,44 Z" fill={undershirtColor} />
        </>
      )}

      {/* 2 + 3. Base fill (inside clip) */}
      {renderBaseFill()}

      {/* 4. Pattern overlay (inside clip) */}
      {renderPatternOverlay()}

      {/* 5. Cuff bands */}
      {renderCuffs()}

      {/* 6. Shirt outline */}
      <path
        d={shirtPath}
        fill="none"
        stroke="rgba(0,0,0,0.25)"
        strokeWidth="1"
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {/* 7. Collar overlay */}
      {renderCollar()}
    </svg>
  )
})
