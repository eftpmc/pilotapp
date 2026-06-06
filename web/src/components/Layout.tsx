import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { sessions, agents, projects, tasks, me } from '../api/client'
import { Button } from '@/components/ui/button'
import {
  CommandDialog, CommandInput, CommandList, CommandEmpty,
  CommandGroup, CommandItem, CommandSeparator, CommandShortcut,
} from '@/components/ui/command'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { useEffect, useState, useCallback } from 'react'
import {
  BookOpen, Building2, FolderOpen, Home, LogOut,
  Moon, Plus, Search, Settings, Sun, Users, Wrench,
} from 'lucide-react'

const BOTTOM_NAV = [
  { label: 'Office',    path: '/',          end: true,  icon: Building2 },
  { label: 'Today',     path: '/today',     end: false, icon: Home },
  { label: 'Projects',  path: '/projects',  end: false, icon: FolderOpen },
  { label: 'Agents',    path: '/agents',    end: false, icon: Users },
]

const NAV_ITEMS = [
  { label: 'Office',    path: '/',          end: true,  icon: Building2 },
  { label: 'Today',     path: '/today',     end: false, icon: Home },
  { label: 'Projects',  path: '/projects',  end: false, icon: FolderOpen },
  { label: 'Agents',    path: '/agents',    end: false, icon: Users },
]

// ── Theme ──────────────────────────────────────────────────────────────────────
function getTheme(): 'light' | 'dark' {
  const stored = localStorage.getItem('pilot.theme')
  if (stored === 'light' || stored === 'dark') return stored
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}
function applyTheme(t: 'light' | 'dark') {
  document.documentElement.classList.toggle('dark', t === 'dark')
  document.documentElement.classList.toggle('light', t === 'light')
  localStorage.setItem('pilot.theme', t)
}

// ── Command palette ────────────────────────────────────────────────────────────
type PaletteMode = 'search' | 'pick-project'

function CommandPalette({ open, initialMode, onClose }: {
  open: boolean
  initialMode: PaletteMode
  onClose: () => void
}) {
  const navigate = useNavigate()
  const [mode, setMode] = useState<PaletteMode>('search')

  const { data: projectList = [] } = useQuery({ queryKey: ['projects'], queryFn: () => projects.list() })
  const { data: agentList   = [] } = useQuery({ queryKey: ['agents'],   queryFn: () => agents.list() })
  const { data: sessionList = [] } = useQuery({ queryKey: ['sessions'], queryFn: () => sessions.list() })
  const { data: taskList    = [] } = useQuery({ queryKey: ['tasks'],    queryFn: () => tasks.list() })

  const taskTitleFor = (id?: string) => id ? taskList.find(t => t.id === id)?.title : undefined
  const agentNameFor = (id: string)  => agentList.find(e => e.id === id)?.name ?? ''

  function handleNewTask() {
    if (projectList.length === 0) { navigate('/projects'); onClose(); return }
    if (projectList.length === 1) { navigate(`/projects/${projectList[0].id}?new=1`); onClose(); return }
    setMode('pick-project')
  }

  function go(path: string) { navigate(path); onClose() }

  const review  = sessionList.filter(s => !s.specId && (s.status === 'done' || s.status === 'error'))
  const running = sessionList.filter(s => s.status === 'running')

  useEffect(() => {
    if (open) setMode(initialMode)
  }, [initialMode, open])

  return (
    <CommandDialog open={open} onOpenChange={o => !o && onClose()}>
      <CommandInput placeholder={mode === 'pick-project' ? 'Pick a project…' : 'Search or jump to…'} autoFocus />
      <CommandList>
        <CommandEmpty>Nothing found.</CommandEmpty>

        {mode === 'pick-project' ? (
          <CommandGroup heading="New task — pick a project">
            {projectList.map(p => (
              <CommandItem key={p.id} onSelect={() => go(`/projects/${p.id}?new=1`)}>
                <FolderOpen size={14} className="text-[var(--muted)]" />
                <span>{p.name}</span>
                {p.repoPath && <span className="text-[var(--faint)] text-xs ml-1">{p.repoPath.split('/').pop()}</span>}
              </CommandItem>
            ))}
            <CommandItem onSelect={() => setMode('search')}>
              <span className="text-[var(--muted)]">← Back</span>
            </CommandItem>
          </CommandGroup>
        ) : (
          <>
            <CommandGroup heading="Actions">
              <CommandItem onSelect={handleNewTask} keywords={['create', 'add', 'task']}>
                <Plus size={14} className="text-[var(--ember)]" />
                <span className="font-medium" style={{ color: 'var(--ember)' }}>New task</span>
                <CommandShortcut>⌘N</CommandShortcut>
              </CommandItem>
            </CommandGroup>

            <CommandSeparator />
            <CommandGroup heading="Go to">
              <CommandItem onSelect={() => go('/')} keywords={['office', 'home', '3d']}>
                <Building2 size={14} className="text-[var(--muted)]" />
                <span>Office</span>
              </CommandItem>
              <CommandItem onSelect={() => go('/today')} keywords={['home', 'overview']}>
                <Home size={14} className="text-[var(--muted)]" />
                <span>Today</span>
              </CommandItem>
              <CommandItem onSelect={() => go('/projects')} keywords={['repos', 'code']}>
                <FolderOpen size={14} className="text-[var(--muted)]" />
                <span>Projects</span>
              </CommandItem>
              <CommandItem onSelect={() => go('/agents')} keywords={['team', 'crew']}>
                <Users size={14} className="text-[var(--muted)]" />
                <span>Agents</span>
              </CommandItem>
              <CommandItem onSelect={() => go('/knowledge')} keywords={['docs', 'notes']}>
                <BookOpen size={14} className="text-[var(--muted)]" />
                <span>Knowledge</span>
              </CommandItem>
              <CommandItem onSelect={() => go('/settings')} keywords={['config', 'connections']}>
                <Settings size={14} className="text-[var(--muted)]" />
                <span>Settings</span>
              </CommandItem>
            </CommandGroup>

            {review.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading="Needs review">
                  {review.map(s => (
                    <CommandItem key={s.id} onSelect={() => go(`/sessions/${s.id}`)} keywords={['review', 'done', 'error']}>
                      <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', s.status === 'error' ? 'bg-destructive' : 'bg-[var(--amber-dot)]')} />
                      <span className="flex-1 truncate">{taskTitleFor(s.workTaskId) ?? s.branch ?? s.id.slice(0, 8)}</span>
                      <span className="text-[var(--faint)] text-xs">{agentNameFor(s.agentId)}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}

            {running.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading="In progress">
                  {running.map(s => (
                    <CommandItem key={s.id} onSelect={() => go(`/sessions/${s.id}`)} keywords={['running', 'active']}>
                      <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-[var(--green-dot)] animate-pulse" />
                      <span className="flex-1 truncate">{taskTitleFor(s.workTaskId) ?? s.branch ?? s.id.slice(0, 8)}</span>
                      <span className="text-[var(--faint)] text-xs">{agentNameFor(s.agentId)}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}

            {projectList.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading="Projects">
                  {projectList.map(p => (
                    <CommandItem key={p.id} onSelect={() => go(`/projects/${p.id}`)}>
                      <FolderOpen size={14} className="text-[var(--muted)]" />
                      <span>{p.name}</span>
                      {p.repoPath && <span className="text-[var(--faint)] text-xs">{p.repoPath.split('/').pop()}</span>}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}

            {agentList.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading="Agents">
                  {agentList.map(e => (
                    <CommandItem key={e.id} onSelect={() => go(`/agents/${e.id}`)}>
                      <Users size={14} className="text-[var(--muted)]" />
                      <span>{e.name}</span>
                      <span className="text-[var(--faint)] text-xs">{e.provider}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </>
        )}
      </CommandList>

      <div className="flex items-center gap-4 px-4 py-2.5 border-t border-[var(--rule-soft)]">
        <span className="text-[11px] text-[var(--faint)]">↑↓ navigate</span>
        <span className="text-[11px] text-[var(--faint)]">↵ select</span>
        <span className="text-[11px] text-[var(--faint)]">esc close</span>
      </div>
    </CommandDialog>
  )
}

// ── Company onboarding ─────────────────────────────────────────────────────────
function CompanyOnboarding({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('')
  const qc = useQueryClient()

  const save = useMutation({
    mutationFn: (n: string) => me.update({ name: n }),
    onSuccess: (profile) => { qc.setQueryData(['me'], profile); onDone() },
  })

  function submit() {
    const trimmed = name.trim()
    if (!trimmed || save.isPending) return
    save.mutate(trimmed)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
      <div className="w-full max-w-sm px-6 flex flex-col gap-8">
        <div>
          <div className="flex items-center gap-2 mb-6">
            <span className="pilot-mark">p</span>
            <span className="text-sm font-medium text-muted-foreground">pilot</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight mb-2">Welcome.</h1>
          <p className="text-sm text-muted-foreground">What should we call your office?</p>
        </div>
        <div className="flex flex-col gap-3">
          <input
            autoFocus
            className="w-full bg-card border border-border rounded-xl px-4 py-3 text-lg font-semibold text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary transition-colors"
            placeholder="e.g. Acme Labs"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') submit() }}
          />
          {save.isError && <p className="text-xs text-destructive">{save.error.message}</p>}
          <Button onClick={submit} disabled={!name.trim() || save.isPending} className="w-full" size="lg">
            {save.isPending ? 'Saving…' : 'Get started →'}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Desktop app bar ────────────────────────────────────────────────────────────
function AppTopBar({
  reviewCount, runningCount, theme, workspaceName, userInitial,
  onNewTask, onOpenPalette, onToggleTheme, onSignOut,
}: {
  reviewCount: number; runningCount: number
  theme: 'light' | 'dark'; workspaceName: string; userInitial: string
  onNewTask: () => void; onOpenPalette: () => void; onToggleTheme: () => void; onSignOut: () => void
}) {
  const location = useLocation()
  const navigate = useNavigate()

  function isActive(path: string, end = false) {
    return end ? location.pathname === path : location.pathname.startsWith(path)
  }

  return (
    <header className="hidden md:flex h-14 shrink-0 items-center gap-4 border-b border-[var(--rule-soft)] bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <button
        type="button"
        onClick={() => navigate('/')}
        className="flex min-w-0 items-center gap-2 rounded-md px-1.5 py-1 text-sm font-semibold hover:bg-accent"
      >
        <span className="pilot-mark !size-7 !rounded-lg">p</span>
        <span className="truncate">{workspaceName || 'pilot'}</span>
      </button>

      <nav className="flex min-w-0 flex-1 items-center gap-1">
        {NAV_ITEMS.map(({ label, path, end, icon: Icon }) => (
          <NavLink
            key={label}
            to={path}
            end={end}
            className={() => cn(
              'relative inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium transition-colors',
              isActive(path, end)
                ? 'bg-accent text-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground'
            )}
          >
            <Icon size={15} strokeWidth={1.8} />
            <span>{label}</span>
            {label === 'Today' && reviewCount > 0 && (
              <span className="ml-0.5 h-1.5 w-1.5 rounded-full bg-[var(--amber-dot)]" />
            )}
            {label === 'Today' && reviewCount === 0 && runningCount > 0 && (
              <span className="ml-0.5 h-1.5 w-1.5 rounded-full bg-[var(--green-dot)]" />
            )}
          </NavLink>
        ))}
      </nav>

      <div className="flex items-center gap-2">
        <Button size="sm" onClick={onNewTask} className="h-8 gap-1.5">
          <Plus size={14} />
          New task
        </Button>
        <button
          type="button"
          onClick={onOpenPalette}
          className="hidden lg:flex h-8 items-center gap-2 rounded-md border border-border bg-card px-2.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <Search size={13} />
          <span className="font-mono text-[10px] text-[var(--faint)]">⌘K</span>
        </button>
        <button
          type="button"
          onClick={onOpenPalette}
          className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground lg:hidden"
          title="Search"
        >
          <Search size={15} />
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary hover:bg-primary/20"
              title={workspaceName || 'pilot'}
            >
              {userInitial}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="bottom" align="end" className="w-56 mt-1">
            <DropdownMenuItem asChild>
              <NavLink to="/knowledge">
                <BookOpen size={14} />
                <span>Knowledge</span>
              </NavLink>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <NavLink to="/tools">
                <Wrench size={14} />
                <span>Tools</span>
              </NavLink>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <NavLink to="/settings">
                <Settings size={14} />
                <span>Settings</span>
              </NavLink>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onToggleTheme}>
              {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
              <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onSignOut} className="destructive">
              <LogOut size={14} />
              <span>Sign out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}

function MobileMenu({
  theme, userInitial, workspaceName, onNewTask, onToggleTheme, onSignOut,
}: {
  theme: 'light' | 'dark'
  userInitial: string
  workspaceName: string
  onNewTask: () => void
  onToggleTheme: () => void
  onSignOut: () => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary hover:bg-primary/20"
          title={workspaceName || 'Account'}
        >
          {userInitial}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="bottom" align="end" className="w-52 mt-1">
        <DropdownMenuItem onClick={onNewTask}>
          <Plus size={14} />
          <span>New task</span>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <NavLink to="/knowledge">
            <BookOpen size={14} />
            <span>Knowledge</span>
          </NavLink>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <NavLink to="/tools">
            <Wrench size={14} />
            <span>Tools</span>
          </NavLink>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <NavLink to="/settings">
            <Settings size={14} />
            <span>Settings</span>
          </NavLink>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onToggleTheme}>
          {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
          <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onSignOut} className="destructive">
          <LogOut size={14} />
          <span>Sign out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ── Layout ─────────────────────────────────────────────────────────────────────
export default function Layout() {
  const navigate = useNavigate()

  const [theme, setTheme]               = useState<'light' | 'dark'>(getTheme)
  const [paletteOpen, setPalette]       = useState(false)
  const [paletteMode, setPaletteMode]   = useState<PaletteMode>('search')
  const [onboardingDone, setOnboarding] = useState(false)

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    applyTheme(next)
  }

  const openPalette  = useCallback(() => { setPaletteMode('search'); setPalette(true) }, [])
  const closePalette = useCallback(() => setPalette(false), [])

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setPalette(p => {
          if (!p) setPaletteMode('search')
          return !p
        })
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => { applyTheme(theme) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const { data: userProfile } = useQuery({ queryKey: ['me'], queryFn: () => me.profile() })
  const { data: projectList = [] } = useQuery({ queryKey: ['projects'], queryFn: () => projects.list() })

  const { data: sessionList = [] } = useQuery({
    queryKey: ['sessions'], queryFn: () => sessions.list(),
    refetchInterval: 5000, staleTime: 3000,
  })
  const reviewCount  = sessionList.filter(s => !s.specId && (s.status === 'done' || s.status === 'error')).length
  const runningCount = sessionList.filter(s => s.status === 'running').length

  function signOut() { localStorage.removeItem('token'); navigate('/login') }

  function handleNewTask() {
    if (projectList.length === 0) { navigate('/projects'); return }
    if (projectList.length === 1) { navigate(`/projects/${projectList[0].id}?new=1`); return }
    setPaletteMode('pick-project')
    setPalette(true)
  }

  const showOnboarding = userProfile !== undefined && !userProfile?.name && !onboardingDone

  if (showOnboarding) {
    return <CompanyOnboarding onDone={() => setOnboarding(true)} />
  }

  return (
    <div className="h-screen overflow-hidden bg-background flex flex-col">
      <AppTopBar
        reviewCount={reviewCount}
        runningCount={runningCount}
        theme={theme}
        workspaceName={userProfile?.name ?? ''}
        userInitial={(userProfile?.name || userProfile?.email || '?')[0].toUpperCase()}
        onNewTask={handleNewTask}
        onOpenPalette={openPalette}
        onToggleTheme={toggleTheme}
        onSignOut={signOut}
      />

      <header className="mobile-topbar">
        <button className="wordmark" onClick={() => navigate('/')}>
          <span className="pilot-mark">p</span>
          pilot
        </button>
        <div className="mobile-topbar-actions">
          <button className="navtool" onClick={openPalette} title="Search">
            <Search size={15} />
          </button>
          <MobileMenu
            theme={theme}
            userInitial={(userProfile?.name || userProfile?.email || '?')[0].toUpperCase()}
            workspaceName={userProfile?.name ?? ''}
            onNewTask={handleNewTask}
            onToggleTheme={toggleTheme}
            onSignOut={signOut}
          />
        </div>
      </header>

      <main className="app-main min-h-0">
        <Outlet />
      </main>

      <nav className="mobile-tabbar">
        {BOTTOM_NAV.map(({ label, path, end, icon: Icon }) => (
          <NavLink
            key={label}
            to={path}
            end={end}
            className={({ isActive }) => cn('mobile-tab', isActive && 'active')}
          >
            <div className="mobile-tab-icon">
              <Icon size={20} />
              {label === 'Today' && reviewCount > 0 && <span className="mobile-tab-badge" />}
            </div>
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      <CommandPalette open={paletteOpen} initialMode={paletteMode} onClose={closePalette} />
    </div>
  )
}
