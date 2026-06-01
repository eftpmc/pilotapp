import { NavLink, Outlet, useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { projects, sessions } from '../api/client'
import { cn } from '@/lib/utils'
import { ArrowLeft } from 'lucide-react'

const TABS = [
  { label: 'Board',    path: ''          },
  { label: 'History',  path: '/sessions' },
  { label: 'Plans',    path: '/plans'    },
  { label: 'Files',    path: '/files'    },
  { label: 'Settings', path: '/settings' },
]

export default function ProjectLayout() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const { data: projectList = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projects.list(),
  })
  const { data: sessionList = [] } = useQuery({
    queryKey: ['sessions', id],
    queryFn: () => sessions.list({ projectId: id! }),
    enabled: !!id,
    refetchInterval: 5000,
  })

  const project     = projectList.find(p => p.id === id)
  const runningCount = sessionList.filter(s => s.status === 'running').length
  const reviewCount  = sessionList.filter(s => !s.specId && (s.status === 'done' || s.status === 'error')).length

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{
        padding: '28px 32px 0',
        borderBottom: '1px solid var(--rule)',
        background: 'var(--bg)',
      }}>
        {/* Back */}
        <button
          onClick={() => navigate('/projects')}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            fontSize: '13px', fontWeight: 500, color: 'var(--muted)',
            background: 'none', border: 'none', cursor: 'pointer',
            padding: 0, marginBottom: '18px',
            transition: 'color .12s',
          }}
          onMouseOver={e => (e.currentTarget.style.color = 'var(--ink)')}
          onMouseOut={e => (e.currentTarget.style.color = 'var(--muted)')}
        >
          <ArrowLeft size={14} />
          Projects
        </button>

        {/* Project name */}
        <h1 style={{
          fontFamily: '"Space Grotesk Variable", "Geist Variable", system-ui, sans-serif',
          fontWeight: 400, fontSize: '32px', letterSpacing: 0,
          lineHeight: 1.1, color: 'var(--ink)', margin: '0 0 20px',
        }}>
          {project?.name ?? '…'}
        </h1>

        {/* Tab bar */}
        <div className="tabs" style={{ margin: 0 }}>
          {TABS.map(({ label, path }) => (
            <NavLink
              key={label}
              to={`/projects/${id}${path}`}
              end={path === ''}
              className={({ isActive }) => cn('tab', isActive && 'active')}
              style={{ textDecoration: 'none' }}
            >
              {label}
              {label === 'Board' && reviewCount > 0 && (
                <span className="badge" style={{ marginLeft: '5px' }}>{reviewCount}</span>
              )}
              {label === 'History' && runningCount > 0 && (
                <span className="badge" style={{
                  marginLeft: '5px',
                  background: 'color-mix(in srgb, var(--green-dot) 15%, transparent)',
                  color: 'var(--green)',
                }}>{runningCount}</span>
              )}
            </NavLink>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        <Outlet />
      </div>
    </div>
  )
}
