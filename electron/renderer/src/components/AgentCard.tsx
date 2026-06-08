import StatusDot from './StatusDot'

type AgentStatus = 'running' | 'idle' | 'error'

interface AgentCardProps {
  name: string
  role?: string
  status?: AgentStatus
  currentTask?: string
}

export default function AgentCard({
  name,
  role,
  status = 'idle',
  currentTask,
}: AgentCardProps) {
  const barColor =
    status === 'running' ? 'var(--green)' :
    status === 'error' ? 'var(--red)' :
    'var(--text-faint)'

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'stretch',
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        overflow: 'hidden',
        padding: '14px 16px',
        gap: 12,
        position: 'relative',
      }}
    >
      {/* Left color bar */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: 4,
          background: barColor,
          opacity: status === 'idle' ? 0.3 : 1,
          boxShadow: status === 'running' ? '0 0 8px rgba(0,200,150,0.5)' : 'none',
        }}
      />

      {/* Content */}
      <div style={{ flex: 1, paddingLeft: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{name}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <StatusDot status={status} />
            <span
              style={{
                fontSize: 11,
                fontWeight: 500,
                color:
                  status === 'running' ? 'var(--green)' :
                  status === 'error' ? 'var(--red)' :
                  'var(--text-faint)',
                textTransform: 'capitalize',
              }}
            >
              {status}
            </span>
          </div>
        </div>

        {role && (
          <span
            style={{
              display: 'inline-block',
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'var(--text-faint)',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              borderRadius: 4,
              padding: '2px 6px',
              marginBottom: currentTask ? 8 : 0,
            }}
          >
            {role}
          </span>
        )}

        {currentTask && (
          <div
            style={{
              fontSize: 12,
              color: 'var(--text-muted)',
              marginTop: 6,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {currentTask}
          </div>
        )}
      </div>
    </div>
  )
}
