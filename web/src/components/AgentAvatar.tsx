import type { Employee } from '../api/client'

const PALETTE = [
  { bg: '#4B7EC8', fg: '#fff' },
  { bg: '#3EA87A', fg: '#fff' },
  { bg: '#C8784B', fg: '#fff' },
  { bg: '#8B5BC8', fg: '#fff' },
  { bg: '#3AACAC', fg: '#fff' },
  { bg: '#C85A5A', fg: '#fff' },
  { bg: '#8B8340', fg: '#fff' },
  { bg: '#5C5CC8', fg: '#fff' },
]

function hashIndex(str: string): number {
  let h = 5381
  for (let i = 0; i < str.length; i++) h = (((h << 5) + h) ^ str.charCodeAt(i)) >>> 0
  return h % PALETTE.length
}

export function AgentAvatar({
  agent,
  name: nameProp,
  size = 32,
  running = false,
}: {
  agent?: Employee
  name?: string
  size?: number
  running?: boolean
}) {
  const displayName = (nameProp ?? agent?.name ?? '').trim()
  const initials = displayName.length > 0 ? displayName.slice(0, 2).toUpperCase() : '?'
  const fontSize = Math.round(size * 0.38)
  const br = size <= 24 ? 6 : size <= 36 ? 8 : 10
  const { bg, fg } = PALETTE[displayName.length > 0 ? hashIndex(displayName) : 0]

  return (
    <span
      className={running ? 'av ring-green' : 'av'}
      style={{ width: size, height: size, fontSize, flexShrink: 0, background: bg, color: fg, borderRadius: br }}
    >
      {initials}
    </span>
  )
}
