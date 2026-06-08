import { NavLink, Outlet, useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { projects, sessions } from '@pilot/shared'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ArrowLeft } from 'lucide-react'

const TABS = [
  { label: 'Board',    path: ''           },
  { label: 'History',  path: '/sessions'  },
  { label: 'Plans',    path: '/plans'     },
  { label: 'Outputs',  path: '/outputs'   },
  { label: 'Settings', path: '/settings'  },
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
  const runningCount = sessionList.filter(s => s.status === 'running' || s.status === 'waiting' || s.status === 'idle').length
  // Count unique tasks in review, not raw sessions
  const reviewCount  = new Set(
    sessionList
      .filter(s => !s.specId && !s.parentSessionId && (s.status === 'done' || s.status === 'error') && s.workTaskId)
      .map(s => s.workTaskId!)
  ).size

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      <div className="shrink-0 px-6 pt-5 pb-0 bg-background border-b border-border/60">
        <Button variant="ghost" size="sm" onClick={() => navigate('/projects')} className="-ml-2 mb-3 text-muted-foreground">
          <ArrowLeft size={13} />
          Projects
        </Button>
        <div className="flex items-center justify-between gap-3 mb-4">
          <h1 className="text-2xl font-semibold tracking-tight">{project?.name ?? '…'}</h1>
        </div>
        <nav className="flex gap-0.5 -mb-px">
          {TABS.map(({ label, path }) => (
            <NavLink
              key={label}
              to={`/projects/${id}${path}`}
              end={path === ''}
              className={({ isActive }) => {
                const active = isActive
                return cn(
                  'inline-flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 transition-colors',
                  active
                    ? 'text-foreground border-primary'
                    : 'text-muted-foreground border-transparent hover:text-foreground'
                )
              }}
            >
              {label}
              {label === 'Board' && reviewCount > 0 && (
                <span className="text-[10px] font-bold leading-none bg-primary text-primary-foreground rounded px-1.5 py-0.5">{reviewCount}</span>
              )}
              {label === 'History' && runningCount > 0 && (
                <span className="text-[10px] font-bold leading-none bg-[color:var(--green-dot)] text-white rounded px-1.5 py-0.5">{runningCount}</span>
              )}
            </NavLink>
          ))}
        </nav>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        <Outlet />
      </div>
    </div>
  )
}
