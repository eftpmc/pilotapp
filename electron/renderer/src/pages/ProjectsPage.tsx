import { useQuery } from '@tanstack/react-query'
import { projects, sessions } from '@/api'
import GameCard from '@/components/GameCard'
import type { Session, Project } from '@/api'
import { Plus } from 'lucide-react'

function Skeleton({ height }: { height: number }) {
  return <div className="skeleton" style={{ width: '100%', height, borderRadius: 'var(--radius-lg)' }} />
}

export default function ProjectsPage() {
  const { data: projectList, isLoading: loadingProjects } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projects.list(),
  })
  const { data: sessionList } = useQuery({
    queryKey: ['sessions'],
    queryFn: () => sessions.list(),
  })

  return (
    <div className="page">
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 24,
        }}
      >
        <h1
          style={{
            fontSize: 28,
            fontWeight: 800,
            letterSpacing: '-0.02em',
            color: 'var(--text)',
          }}
        >
          Projects
        </h1>
      </div>

      {loadingProjects ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {[1, 2, 3, 4].map(i => (
            <div key={i} style={{ aspectRatio: '1.6' }}>
              <Skeleton height={0} />
            </div>
          ))}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {(projectList ?? []).map((project: Project) => {
            const projectSessions = (sessionList ?? []).filter((s: Session) => s.projectId === project.id)
            const running = projectSessions.filter((s: Session) => s.status === 'running').length
            const idle = projectSessions.length - running
            return (
              <GameCard
                key={project.id}
                name={project.name}
                lastActivity={project.createdAt ? new Date(project.createdAt).toLocaleDateString() : undefined}
                idleCount={idle}
                runningCount={running}
              />
            )
          })}

          {/* New project card */}
          <button
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              background: 'transparent',
              border: '1px dashed var(--border)',
              borderRadius: 'var(--radius-lg)',
              aspectRatio: '1.6',
              cursor: 'pointer',
              color: 'var(--text-faint)',
              transition: 'border-color 200ms, color 200ms',
              width: '100%',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = 'var(--border-accent)'
              e.currentTarget.style.color = 'var(--accent)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = 'var(--border)'
              e.currentTarget.style.color = 'var(--text-faint)'
            }}
          >
            <Plus size={24} strokeWidth={1.5} />
            <span style={{ fontSize: 13, fontWeight: 500 }}>New project</span>
          </button>
        </div>
      )}
    </div>
  )
}
