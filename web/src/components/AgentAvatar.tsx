import { useState } from 'react'
import { KNOWN_FACES } from '../theme'
import type { Employee } from '../api/client'

interface Props {
  agent?: Employee
  size?: number
}

export function AgentAvatar({ agent, size = 34 }: Props) {
  const [failed, setFailed] = useState(false)
  const name  = agent?.name ?? ''
  const color = agent ? ({ claude: '#F0820B', codex: '#6366f1' }[agent.provider] ?? 'var(--primary)') : 'var(--muted-foreground)'
  const r = Math.round(size * 0.28)

  if (KNOWN_FACES.includes(name.toLowerCase()) && !failed) {
    return (
      <div style={{ width: size, height: size, borderRadius: r, background: color + '18', border: '1px solid var(--border)', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
        <img
          src={`/faces/face_${name.toLowerCase()}.png`}
          alt={name}
          onError={() => setFailed(true)}
          style={{ width: '88%', imageRendering: 'pixelated', display: 'block', marginBottom: -1 }}
        />
      </div>
    )
  }

  return (
    <div style={{ width: size, height: size, borderRadius: r, background: color + '18', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <span style={{ fontFamily: 'ui-monospace,monospace', fontSize: Math.round(size * 0.38), fontWeight: 700, color }}>
        {name[0] ?? '?'}
      </span>
    </div>
  )
}
