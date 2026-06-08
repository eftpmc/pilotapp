import { NavLink, Outlet, useLocation, useNavigate, Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { sessions, agents, projects, tasks, me } from '@pilot/shared'
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
  BookOpen, FolderOpen, Home, LogOut,
  Monitor, Moon, Plus, Search, Settings, Sun, Users, Wrench,
} from 'lucide-react'
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
              <CommandItem onSelect={() => go('/office')} keywords={['office', 'home', '3d']}>
                <Home size={14} className="text-[var(--muted)]" />
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

  const save = useCallback(async (n: string) => {
    const profile = await me.update({ name: n })
    qc.setQueryData(['me'], profile)
    onDone()
  }, [qc, onDone])

  function submit() {
    const trimmed = name.trim()
    if (!trimmed) return
    save(trimmed)
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
          <Button onClick={submit} disabled={!name.trim()} className="w-full" size="lg">
            Get started →
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Layout ─────────────────────────────────────────────────────────────────────
export default function Layout() {
  const navigate = useNavigate()
  const location = useLocation()
  const isOffice = location.pathname === '/office'

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
        setPalette(p => { if (!p) setPaletteMode('search'); return !p })
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => { applyTheme(theme) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    function onTheme(e: Event) { setTheme((e as CustomEvent<'light' | 'dark'>).detail) }
    window.addEventListener('pilot-theme', onTheme)
    return () => window.removeEventListener('pilot-theme', onTheme)
  }, [])

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
  if (showOnboarding) return <CompanyOnboarding onDone={() => setOnboarding(true)} />

  const workspaceName = userProfile?.name ?? ''
  const userInitial   = (userProfile?.name || userProfile?.email || '?')[0].toUpperCase()

  return (
    <div className="h-screen overflow-hidden office-shell">
      {/* Fixed left — logo + title (hidden on office) */}
      {!isOffice && (
        <div className="hud-left">
          <button
            type="button"
            onClick={() => navigate('/today')}
            className="hud-pill flex items-center gap-2.5"
          >
            <span className="pilot-mark-lg">p</span>
            <span className="hud-title">{workspaceName || 'pilot'}</span>
          </button>
        </div>
      )}

      {/* Fixed right — controls (hidden on office) */}
      {!isOffice && <div className="hud-right">
        <Button size="sm" onClick={handleNewTask} className="h-8 gap-1.5 hidden sm:flex">
          <Plus size={13} />
          New task
        </Button>

        {!isOffice && (
          <a
            href="/office"
            target="_blank"
            rel="noopener noreferrer"
            className="hud-pill flex items-center gap-2 px-3 h-8 text-[var(--muted)] hover:text-[var(--ink)] transition-colors hidden sm:flex"
            title="Open Office"
          >
            <Monitor size={13} className="shrink-0" />
            <span className="text-xs">Office</span>
          </a>
        )}

        <button
          type="button"
          onClick={openPalette}
          className="hud-pill flex items-center gap-2 px-3 h-8 text-[var(--muted)] hover:text-[var(--ink)] transition-colors"
          aria-label="Search"
        >
          <Search size={13} className="shrink-0" />
          <span className="text-xs hidden sm:block">Search</span>
          <kbd className="hidden sm:flex items-center gap-0.5 text-[10px] text-[var(--faint)] ml-1 font-sans">
            <span>⌘</span><span>K</span>
          </kbd>
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="hud-pill !p-0 w-8 h-8 flex items-center justify-center text-xs font-bold" style={{ color: 'var(--ember)', borderColor: 'rgba(255,107,53,0.25)' }} title={workspaceName || 'pilot'}>
              {userInitial}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="bottom" align="end" className="w-52 mt-1">
            <DropdownMenuItem asChild>
              <NavLink to="/knowledge"><BookOpen size={14} /><span>Knowledge</span></NavLink>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <NavLink to="/tools"><Wrench size={14} /><span>Tools</span></NavLink>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <NavLink to="/settings"><Settings size={14} /><span>Settings</span></NavLink>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={toggleTheme}>
              {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
              <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={signOut} className="destructive">
              <LogOut size={14} /><span>Sign out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>}

      {/* Office route — fullscreen, no panel */}
      {isOffice && <Outlet />}

      {/* Panel — nav links centered at top */}
      {!isOffice && (
        <div className="office-panel fixed inset-0 z-10 flex flex-col">
          <nav className="panel-nav">
            <NavLink to="/today" className={({ isActive }) => cn('navlink', isActive && 'active')}>
              Today
              {reviewCount > 0 && <span className="badge">{reviewCount}</span>}
              {reviewCount === 0 && runningCount > 0 && (
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--green-dot)] animate-pulse" />
              )}
            </NavLink>
            <NavLink to="/projects" className={({ isActive }) => cn('navlink', isActive && 'active')}>
              Projects
            </NavLink>
            <NavLink to="/agents" className={({ isActive }) => cn('navlink', isActive && 'active')}>
              Agents
            </NavLink>
          </nav>

          <main
            key={location.pathname.split('/')[1]}
            className="flex-1 min-h-0 flex flex-col overflow-y-auto panel-page-enter"
          >
            <Outlet />
          </main>
        </div>
      )}

      <CommandPalette open={paletteOpen} initialMode={paletteMode} onClose={closePalette} />
    </div>
  )
}
