import { NavLink, Outlet, useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { projects, sessions } from '../api/client'
import { cn } from '@/lib/utils'
import { ArrowLeft } from 'lucide-react'

const TABS = [
  { label: 'Board',    path: ''          },
  { label: 'Sessions', path: '/sessions' },
  { label: 'Plans',    path: '/plans'    },
  { label: 'Outputs',  path: '/outputs'  },
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

  const project      = projectList.find(p => p.id === id)
  const runningCount = sessionList.filter(s => s.status === 'running').length
  const reviewCount  = sessionList.filter(s => !s.specId && (s.status === 'done' || s.status === 'error')).length

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div className="proj-header">
        <button className="proj-back" onClick={() => navigate('/projects')}>
          <ArrowLeft size={13} />
          Projects
        </button>
        <div className="proj-title-row">
          <h1 className="proj-name">{project?.name ?? '…'}</h1>
        </div>
        <nav className="proj-tabs">
          {TABS.map(({ label, path }) => (
            <NavLink
              key={label}
              to={`/projects/${id}${path}`}
              end={path === ''}
              className={({ isActive }) => cn('proj-tab', isActive && 'active')}
            >
              {label}
              {label === 'Board' && reviewCount > 0 && (
                <span className="badge">{reviewCount}</span>
              )}
              {label === 'Sessions' && runningCount > 0 && (
                <span className="badge green">{runningCount}</span>
              )}
            </NavLink>
          ))}
        </nav>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        <Outlet />
      </div>
    </div>
  )
}
