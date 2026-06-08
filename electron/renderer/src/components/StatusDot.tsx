type Status = 'running' | 'idle' | 'error' | 'done' | 'waiting'

interface StatusDotProps {
  status: Status
  size?: number
}

export default function StatusDot({ status, size = 8 }: StatusDotProps) {
  const color =
    status === 'running' ? 'var(--green)' :
    status === 'error' ? 'var(--red)' :
    status === 'waiting' ? 'var(--amber)' :
    'var(--text-faint)'

  const glow =
    status === 'running' ? '0 0 6px rgba(0,200,150,0.7)' :
    status === 'error' ? '0 0 6px rgba(239,68,68,0.7)' :
    'none'

  return (
    <span
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        borderRadius: '50%',
        background: color,
        boxShadow: glow,
        flexShrink: 0,
      }}
    />
  )
}
