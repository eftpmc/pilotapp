import { useState } from 'react'
import StatusDot from './StatusDot'

interface GameCardProps {
  name: string
  lastActivity?: string
  idleCount?: number
  runningCount?: number
  onClick?: () => void
}

export default function GameCard({
  name,
  lastActivity,
  idleCount = 0,
  runningCount = 0,
  onClick,
}: GameCardProps) {
  const [hovered, setHovered] = useState(false)
  const isActive = runningCount > 0

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        background: 'var(--bg-card)',
        border: `1px solid ${hovered ? 'var(--border-accent)' : 'var(--border)'}`,
        borderRadius: 'var(--radius-lg)',
        padding: '20px',
        aspectRatio: '1.6',
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'border-color 200ms ease, box-shadow 200ms ease',
        boxShadow: hovered ? 'var(--accent-glow)' : 'none',
        position: 'relative',
        overflow: 'hidden',
        width: '100%',
      }}
    >
      {/* Subtle gradient overlay */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: hovered
            ? 'radial-gradient(ellipse at top left, rgba(26,110,245,0.06) 0%, transparent 60%)'
            : 'none',
          pointerEvents: 'none',
          transition: 'background 200ms ease',
        }}
      />

      {/* Top: project name */}
      <div>
        <div
          style={{
            fontSize: 18,
            fontWeight: 700,
            color: 'var(--text)',
            letterSpacing: '-0.01em',
            marginBottom: 6,
          }}
        >
          {name}
        </div>
        {lastActivity && (
          <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>
            {lastActivity}
          </div>
        )}
      </div>

      {/* Bottom: status badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <StatusDot status={isActive ? 'running' : 'idle'} />
        <span
          style={{
            fontSize: 12,
            fontWeight: 500,
            color: isActive ? 'var(--green)' : 'var(--text-faint)',
          }}
        >
          {isActive
            ? `${runningCount} running`
            : idleCount > 0
            ? `${idleCount} agent${idleCount !== 1 ? 's' : ''}`
            : 'No agents'}
        </span>
      </div>
    </button>
  )
}
