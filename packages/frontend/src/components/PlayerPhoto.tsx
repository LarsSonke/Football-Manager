import { useState } from 'react'
import { getBadgeColor } from '../utils/helpers'

interface PlayerPhotoProps {
  url: string | null | undefined
  name: string
  size?: number
  style?: React.CSSProperties
}

export function PlayerPhoto({ url, name, size = 40, style }: PlayerPhotoProps) {
  const [failed, setFailed] = useState(false)

  const initials = name.split(' ').slice(-2).map(w => w[0]?.toUpperCase() ?? '').join('')

  if (!url || failed) {
    return (
      <div style={{
        width: size, height: size,
        background: getBadgeColor(name),
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: Math.round(size * 0.33), fontWeight: 900, color: '#000',
        flexShrink: 0,
        ...style,
      }}>
        {initials}
      </div>
    )
  }

  return (
    <img
      src={url}
      alt={name}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      style={{ width: size, height: size, objectFit: 'cover', objectPosition: 'top', flexShrink: 0, ...style }}
    />
  )
}
