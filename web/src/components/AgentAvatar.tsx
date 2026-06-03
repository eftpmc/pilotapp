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
  seed: seedProp,
  size = 32,
  height: heightProp,
  running = false,
  animated = true,
  mode = 'head',
}: {
  agent?: Agent
  name?: string
  seed?: string
  size?: number
  height?: number
  running?: boolean
  animated?: boolean
  mode?: 'head' | 'cover'
}) {
  const displayName = (nameProp ?? agent?.name ?? '').trim()
  if (!displayName) return null

  const hashKey = seedProp ?? agent?.avatarSeed ?? displayName
  const bg = PALETTE[hashIndex(hashKey)]
  const w = size
  const h = heightProp ?? size
  const br = w <= 24 ? 6 : w <= 36 ? 8 : 10

  return (
    <span
      className={running ? 'av ring-green' : 'av'}
      style={{ width: w, height: h, flexShrink: 0, borderRadius: br, overflow: 'hidden', background: bg }}
    >
      <SpineAvatar name={hashKey} width={w} height={h} mode={mode} animated={animated} />
    </span>
  )
}
