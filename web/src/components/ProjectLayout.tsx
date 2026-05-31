import { NavLink, Outlet, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { projects, sessions } from '../api/client'
import { cn } from '@/lib/utils'
import { LayoutGrid, Clock, FileText, FolderOpen, SlidersHorizontal } from 'lucide-react'

const PROJECT_COLORS = ['#f87171','#fb923c','#facc15','#4ade80','#60a5fa','#c084fc','#f472b6']

const TABS = [
  { label: 'Board',    icon: LayoutGrid,        path: ''          },
  { label: 'Sessions', icon: Clock,              path: '/sessions' },
  { label: 'Plans',    icon: FileText,           path: '/plans'    },
  { label: 'Files',    icon: FolderOpen,         path: '/files'    },
  { label: 'Settings', icon: SlidersHorizontal,  path: '/settings' },
]

export default function ProjectLayout() {
  const { id } = useParams<{ id: string }>()

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

  const project   = projectList.find(p => p.id === id)
  const projIndex = projectList.findIndex(p => p.id === id)
  const color     = PROJECT_COLORS[projIndex % PROJECT_COLORS.length] ?? 'var(--primary)'

  const runningCount = sessionList.filter(s => s.status === 'running').length
  const reviewCount  = sessionList.filter(s => !s.specId && (s.status === 'done' || s.status === 'error')).length

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      {/* Project header + tabs */}
      <div className="shrink-0 border-b border-border/60 bg-background">
        <div className="flex items-center gap-0 px-4">
          {/* Identity */}
          <div className="flex items-center gap-2 mr-4 py-2.5">
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: color }} />
            <span className="text-sm font-semibold text-foreground truncate max-w-[160px]">
              {project?.name ?? '…'}
            </span>
          </div>

          {/* Tabs */}
          <div className="flex gap-0 flex-1">
            {TABS.map(({ label, path }) => (
              <NavLink
                key={label}
                to={`/projects/${id}${path}`}
                end={path === ''}
                className={({ isActive }) => cn(
                  'flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 transition-colors -mb-px',
                  isActive
                    ? 'border-primary text-foreground font-semibold'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                )}
              >
                {label}
                {label === 'Board'    && reviewCount  > 0 && (
                  <span className="font-mono text-[10px] tabular-nums text-amber-500">{reviewCount}</span>
                )}
                {label === 'Sessions' && runningCount > 0 && (
                  <span className="font-mono text-[10px] tabular-nums text-green-500">{runningCount}</span>
                )}
              </NavLink>
            ))}
          </div>
        </div>
      </div>

      <Outlet />
    </div>
  )
}
