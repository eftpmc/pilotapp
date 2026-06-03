import type { Agent } from '../api/client'
import { SpineAvatar } from './SpineAvatar'

const PALETTE = [
  '#4B7EC8', '#3EA87A', '#C8784B', '#8B5BC8',
  '#3AACAC', '#C85A5A', '#8B8340', '#5C5CC8',
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
  agent?: Agent
  name?: string
  size?: number
  running?: boolean
}) {
  const displayName = (nameProp ?? agent?.name ?? '').trim()
  if (!displayName) return null

  const bg = PALETTE[hashIndex(displayName)]
  const br = size <= 24 ? 6 : size <= 36 ? 8 : 10

  return (
    <span
      className={running ? 'av ring-green' : 'av'}
      style={{ width: size, height: size, flexShrink: 0, borderRadius: br, overflow: 'hidden', background: bg }}
    >
      <SpineAvatar name={displayName} width={size} height={size} mode="head" />
    </span>
  )
}
