import type { Employee } from '../api/client'

export function AgentAvatar({
  agent,
  size = 32,
  running = false,
}: {
  agent?: Employee
  size?: number
  running?: boolean
}) {
  const initials = (agent?.name ?? '?').slice(0, 2).toUpperCase()
  const fontSize = Math.round(size * 0.38)

  return (
    <span
      className={running ? 'av ring-green' : 'av'}
      style={{ width: size, height: size, fontSize, flexShrink: 0 }}
    >
      {initials}
    </span>
  )
}
