import { useState, useRef, useEffect } from 'react'
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { projects, sessions, specs } from '../api/client'
import { cn } from '@/lib/utils'
import {
  Settings, LogOut, LayoutGrid, FileText, FolderOpen,
  ChevronsUpDown, Search, Plus, Check, Clock, SlidersHorizontal, Home,
} from 'lucide-react'

const PROJECT_COLORS = ['#f87171','#fb923c','#facc15','#4ade80','#60a5fa','#c084fc','#f472b6']

const NAV_ITEMS = [
  { label: 'Board',    icon: LayoutGrid,       path: ''          },
  { label: 'Sessions', icon: Clock,            path: '/sessions' },
  { label: 'Plans',    icon: FileText,         path: '/plans'    },
  { label: 'Files',    icon: FolderOpen,       path: '/files'    },
  { label: 'Settings', icon: SlidersHorizontal, path: '/settings'},
]

// ---------------------------------------------------------------------------
// Project switcher
// ---------------------------------------------------------------------------

function ProjectSwitcher({
  projectList,
  activeProjectId,
  onSelect,
  onNew,
}: {
  projectList: ReturnType<typeof Array.prototype.map> extends never[] ? never[] : { id: string; name: string }[]
  activeProjectId?: string
  onSelect: (id: string) => void
  onNew: () => void
}) {
  const [open, setOpen]   = useState(false)
  const [search, setSearch] = useState('')
  const wrapRef   = useRef<HTMLDivElement>(null)
  const inputRef  = useRef<HTMLInputElement>(null)

  const activeIdx   = projectList.findIndex(p => p.id === activeProjectId)
  const activeProj  = activeIdx >= 0 ? projectList[activeIdx] : null
  const filtered    = search
    ? projectList.filter(p => p.name.toLowerCase().includes(search.toLowerCase()))
    : projectList

  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => inputRef.current?.focus(), 40)
    return () => clearTimeout(t)
  }, [open])

  useEffect(() => {
    if (!open) return
    function down(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) close()
    }
    function key(e: KeyboardEvent) { if (e.key === 'Escape') close() }
    document.addEventListener('mousedown', down)
    document.addEventListener('keydown', key)
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key) }
  }, [open])

  function close() { setOpen(false); setSearch('') }

  return (
    <div ref={wrapRef} className="relative px-3">
      <button
        onClick={() => setOpen(o => !o)}
        className={cn(
          'w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer border',
          open
            ? 'bg-muted border-border/80 text-foreground shadow-sm'
            : 'bg-transparent border-border/0 hover:bg-muted/70 hover:border-border/40 text-foreground'
        )}
      >
        {activeProj ? (
          <span
            className="w-2.5 h-2.5 rounded-sm shrink-0 ring-1 ring-black/10"
            style={{ background: PROJECT_COLORS[activeIdx % PROJECT_COLORS.length] }}
          />
        ) : (
          <span className="w-2.5 h-2.5 rounded-sm shrink-0 bg-border" />
        )}
        <span className={cn('flex-1 text-left truncate', !activeProj && 'text-muted-foreground')}>
          {activeProj ? activeProj.name : 'Select project…'}
        </span>
        <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      </button>

      {open && (
        <div className="absolute left-3 right-3 top-[calc(100%+6px)] z-50 rounded-xl border border-border bg-card shadow-2xl overflow-hidden animate-in fade-in-0 zoom-in-95 duration-100">
          {/* Search */}
          <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border/60 bg-muted/30">
            <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <input
              ref={inputRef}
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Find project…"
              className="flex-1 text-[12.5px] bg-transparent border-none outline-none text-foreground placeholder:text-muted-foreground"
            />
          </div>

          {/* List */}
          <div className="max-h-[200px] overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="text-xs text-muted-foreground px-3 py-2.5 text-center">No match</p>
            ) : filtered.map(p => {
              const idx = projectList.indexOf(p)
              const active = p.id === activeProjectId
              return (
                <button
                  key={p.id}
                  onClick={() => { onSelect(p.id); close() }}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-3 py-2 text-[12.5px] font-medium transition-colors cursor-pointer border-none text-left',
                    active ? 'text-foreground bg-primary/8' : 'text-foreground/80 hover:text-foreground hover:bg-muted/60 bg-transparent'
                  )}
                >
                  <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: PROJECT_COLORS[idx % PROJECT_COLORS.length] }} />
                  <span className="flex-1 truncate">{p.name}</span>
                  {active && <Check className="h-3 w-3 text-primary shrink-0" />}
                </button>
              )
            })}
          </div>

          {/* Footer */}
          <div className="border-t border-border/60 py-1">
            <button
              onClick={() => { onNew(); close() }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-[12.5px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer bg-transparent border-none text-left"
            >
              <Plus className="h-3.5 w-3.5 shrink-0" />
              New project
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

function useIsDesktop() {
  const [yes, setYes] = useState(() => window.innerWidth >= 768)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)')
    const handler = () => setYes(mq.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  return yes
}

export default function Layout() {
  const navigate   = useNavigate()
  const location   = useLocation()
  const isDesktop  = useIsDesktop()

  const { data: projectList = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projects.list(),
  })

  const m = location.pathname.match(/^\/projects\/([^/]+)/)
  const currentProjectId = m?.[1]

  // Persist the last-known project so the sidebar stays in context when
  // navigating to /sessions/:id (which has no project ID in the URL).
  const lastProjectIdRef = useRef<string | undefined>(undefined)
  if (currentProjectId) lastProjectIdRef.current = currentProjectId
  const activeProjectId = currentProjectId ?? lastProjectIdRef.current

  const activeProject = projectList.find(p => p.id === activeProjectId)

  const { data: sessionList = [] } = useQuery({
    queryKey: ['sessions', activeProjectId],
    queryFn: () => sessions.list({ projectId: activeProjectId! }),
    enabled: !!activeProjectId,
    refetchInterval: 5000,
    staleTime: 3000,
  })
  const { data: specList = [] } = useQuery({
    queryKey: ['specs', activeProjectId],
    queryFn: () => specs.list(activeProjectId!),
    enabled: !!activeProjectId,
    refetchInterval: 8000,
    staleTime: 5000,
  })

  const reviewCount  = sessionList.filter(s => !s.specId && (s.status === 'done' || s.status === 'error')).length
  const runningCount = sessionList.filter(s => s.status === 'running').length
  const planCount    = specList.length

  function signOut() {
    localStorage.removeItem('token')
    navigate('/login')
  }

  return (
    <div className="h-dvh flex bg-background text-foreground overflow-hidden">

      {/* ── Sidebar — desktop only, not rendered in DOM on mobile ── */}
      {isDesktop && <aside className="flex w-52 shrink-0 flex-col border-r border-border bg-background">

        {/* Wordmark */}
        <div className="h-14 flex items-center px-5 shrink-0">
          <button
            onClick={() => navigate('/')}
            className="font-mono font-bold text-[15px] tracking-tight text-foreground select-none bg-transparent border-none cursor-pointer hover:opacity-70 transition-opacity p-0"
          >
            pilot
          </button>
        </div>

        {/* Project switcher */}
        <ProjectSwitcher
          projectList={projectList}
          activeProjectId={activeProjectId}
          onSelect={id => navigate(`/projects/${id}`)}
          onNew={() => navigate('/')}
        />

        {/* Project nav */}
        {activeProject && (
          <nav className="mt-5 px-3 flex flex-col gap-0.5">
            <p className="px-3 mb-1 text-[10.5px] font-semibold text-muted-foreground/70 uppercase tracking-widest">
              Project
            </p>
            {NAV_ITEMS.map(({ label, icon: Icon, path }) => (
              <NavLink
                key={label}
                to={`/projects/${activeProject.id}${path}`}
                end
                className={({ isActive }) => cn(
                  'flex items-center gap-2.5 px-3 py-2 rounded-xl text-[13px] font-medium transition-colors',
                  isActive
                    ? 'bg-primary/10 text-foreground font-semibold'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                )}
              >
                <Icon className="h-[14px] w-[14px] shrink-0" />
                <span className="flex-1">{label}</span>
                {label === 'Board'    && reviewCount  > 0 && (
                  <span className="ml-auto font-mono text-[11px] tabular-nums text-amber-500">{reviewCount}</span>
                )}
                {label === 'Sessions' && runningCount > 0 && (
                  <span className="ml-auto font-mono text-[11px] tabular-nums text-green-500">{runningCount}</span>
                )}
                {label === 'Plans'   && planCount    > 0 && (
                  <span className="ml-auto font-mono text-[11px] tabular-nums text-muted-foreground">{planCount}</span>
                )}
              </NavLink>
            ))}
          </nav>
        )}

        <div className="flex-1" />

        {/* Bottom */}
        <div className="px-3 pb-4 flex flex-col gap-0.5 border-t border-border/40 pt-3">
          <NavLink
            to="/settings"
            className={({ isActive }) => cn(
              'flex items-center gap-2.5 px-3 py-2 rounded-xl text-[13px] font-medium transition-colors',
              isActive
                ? 'bg-muted text-foreground font-semibold'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
            )}
          >
            <Settings className="h-[14px] w-[14px] shrink-0" />
            Settings
          </NavLink>

          <button
            onClick={signOut}
            className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-[13px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer bg-transparent border-none text-left w-full"
          >
            <LogOut className="h-[14px] w-[14px] shrink-0" />
            Sign out
          </button>
        </div>
      </aside>}

      {/* ── Content ── */}
      <main
        className="flex-1 min-w-0 overflow-hidden flex flex-col bg-background"
        style={{ paddingBottom: isDesktop ? 0 : 'calc(3.5rem + env(safe-area-inset-bottom, 0px))' }}
      >
        <Outlet />
      </main>

      {/* ── Mobile bottom nav ── */}
      {!isDesktop && <nav className="fixed bottom-0 inset-x-0 z-50 bg-background border-t border-border/60 flex flex-col"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        <div className="flex">
          {activeProject ? (
            <>
              {NAV_ITEMS.filter(i => i.label !== 'Settings').map(({ label, icon: Icon, path }) => (
                <NavLink key={label} to={`/projects/${activeProject.id}${path}`} end
                  className={({ isActive }) => cn(
                    'flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 text-[10px] font-medium transition-colors relative',
                    isActive ? 'text-primary' : 'text-muted-foreground'
                  )}>
                  <Icon className="h-[22px] w-[22px]" />
                  {label}
                  {label === 'Board'    && reviewCount  > 0 && <span className="absolute top-2 right-[calc(50%-14px)] w-1.5 h-1.5 rounded-full bg-amber-400" />}
                  {label === 'Sessions' && runningCount > 0 && <span className="absolute top-2 right-[calc(50%-14px)] w-1.5 h-1.5 rounded-full bg-green-500" />}
                </NavLink>
              ))}
              <NavLink to="/settings"
                className={({ isActive }) => cn(
                  'flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 text-[10px] font-medium transition-colors',
                  isActive ? 'text-primary' : 'text-muted-foreground'
                )}>
                <Settings className="h-[22px] w-[22px]" />
                Settings
              </NavLink>
            </>
          ) : (
            <>
              <NavLink to="/" end
                className={({ isActive }) => cn('flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 text-[10px] font-medium', isActive ? 'text-primary' : 'text-muted-foreground')}>
                <Home className="h-[22px] w-[22px]" />
                Projects
              </NavLink>
              <NavLink to="/settings"
                className={({ isActive }) => cn('flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 text-[10px] font-medium', isActive ? 'text-primary' : 'text-muted-foreground')}>
                <Settings className="h-[22px] w-[22px]" />
                Settings
              </NavLink>
            </>
          )}
        </div>
      </nav>}
    </div>
  )
}
