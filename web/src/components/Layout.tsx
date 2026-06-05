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
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent,
  SidebarHeader, SidebarMenu, SidebarMenuAction,
  SidebarMenuButton, SidebarMenuItem, SidebarMenuSub, SidebarMenuSubButton,
  SidebarMenuSubItem, SidebarProvider, SidebarInset, SidebarRail, SidebarTrigger,
} from '@/components/ui/sidebar'
import * as Collapsible from '@radix-ui/react-collapsible'
import { cn } from '@/lib/utils'
import { useEffect, useState, useCallback } from 'react'
import {
  BookOpen, ChevronRight, ChevronsUpDown, FolderOpen, Home, LogOut,
  Moon, Plus, Search, Settings, Sun, Users, Wrench,
} from 'lucide-react'

const BOTTOM_NAV = [
  { label: 'Today',    path: '/',          end: true,  icon: Home },
  { label: 'Projects', path: '/projects',  end: false, icon: FolderOpen },
  { label: 'Agents',   path: '/agents',    end: false, icon: Users },
  { label: 'Knowledge', path: '/knowledge', end: false, icon: BookOpen },
]

const NAV_ITEMS = [
  { label: 'Today',     path: '/',          end: true,  icon: Home },
  { label: 'Agents',    path: '/agents',    end: false, icon: Users },
  { label: 'Knowledge', path: '/knowledge', end: false, icon: BookOpen },
  { label: 'Tools',     path: '/tools',     end: false, icon: Wrench },
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

function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
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

// ── App sidebar ────────────────────────────────────────────────────────────────
function AppSidebar({
  reviewCount, runningCount, theme, workspaceName, userInitial,
  onOpenPalette, onToggleTheme, onSignOut,
}: {
  reviewCount: number
  runningCount: number
  theme: 'light' | 'dark'
  workspaceName: string
  userInitial: string
  onOpenPalette: () => void
  onToggleTheme: () => void
  onSignOut: () => void
}) {
  const location = useLocation()
  const navigate = useNavigate()
  const [projectsOpen, setProjectsOpen] = useState(true)

  const { data: projectList = [] } = useQuery({
    queryKey: ['projects'], queryFn: () => projects.list(),
  })

  function isActive(path: string, end = false) {
    if (path === '/projects') return location.pathname.startsWith('/projects')
    return end ? location.pathname === path : location.pathname.startsWith(path)
  }

  return (
    <Sidebar collapsible="icon" className="border-r border-[var(--rule-soft)]">
      <SidebarHeader className="h-14 justify-center">
        <SidebarMenu>
          <SidebarMenuItem className="group/sidebar-head flex w-full items-center gap-2 group-data-[collapsible=icon]:w-auto">
            <div className="flex w-full items-center gap-2 group-data-[collapsible=icon]:hidden">
              <button
                type="button"
                onClick={() => navigate('/')}
                className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 text-left text-sm font-semibold hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              >
                <span className="pilot-mark !size-7 !rounded-lg shrink-0">p</span>
                <span className="truncate">pilot</span>
              </button>
              <SidebarTrigger className="shrink-0" />
            </div>

            <div className="relative hidden size-8 group-data-[collapsible=icon]:block">
              <button
                type="button"
                onClick={() => navigate('/')}
                aria-label="pilot"
                className="absolute inset-0 grid place-items-center rounded-md transition-opacity duration-150 group-hover/sidebar-head:opacity-0"
              >
                <span className="pilot-mark !size-7 !rounded-lg">p</span>
              </button>
              <SidebarTrigger className="absolute inset-0 !h-8 !w-8 opacity-0 transition-opacity duration-150 group-hover/sidebar-head:opacity-100" />
            </div>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV_ITEMS.map(({ label, path, end, icon: Icon }) => (
                <SidebarMenuItem key={label}>
                  <SidebarMenuButton asChild isActive={isActive(path, end)} tooltip={label}>
                    <NavLink to={path} end={end}>
                      <div className="relative">
                        <Icon size={17} />
                        {label === 'Today' && reviewCount > 0 && (
                          <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-[var(--amber-dot)]" />
                        )}
                        {label === 'Today' && reviewCount === 0 && runningCount > 0 && (
                          <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-[var(--green-dot)]" />
                        )}
                      </div>
                      <span>{label}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <Collapsible.Root open={projectsOpen} onOpenChange={setProjectsOpen} className="group/collapsible">
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={isActive('/projects')} tooltip="Projects">
                    <NavLink to="/projects">
                      <FolderOpen size={17} />
                      <span>Projects</span>
                    </NavLink>
                  </SidebarMenuButton>
                  <Collapsible.Trigger asChild>
                    <SidebarMenuAction className="data-[state=open]:rotate-90">
                      <ChevronRight size={14} />
                    </SidebarMenuAction>
                  </Collapsible.Trigger>
                  <Collapsible.Content>
                    <SidebarMenuSub>
                      {projectList.map(p => (
                        <SidebarMenuSubItem key={p.id}>
                          <SidebarMenuSubButton asChild isActive={location.pathname.startsWith(`/projects/${p.id}`)}>
                            <NavLink to={`/projects/${p.id}`}>{p.name}</NavLink>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      ))}
                      {projectList.length === 0 && (
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild>
                            <NavLink to="/projects">All projects</NavLink>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      )}
                    </SidebarMenuSub>
                  </Collapsible.Content>
                </SidebarMenuItem>
              </Collapsible.Root>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="h-14 justify-center">
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="default"
                  tooltip={workspaceName || 'pilot'}
                  className="data-[state=open]:bg-sidebar-accent group-data-[collapsible=icon]:!justify-center group-data-[collapsible=icon]:!p-0"
                >
                  <div className="flex size-4 shrink-0 items-center justify-center overflow-visible group-data-[collapsible=icon]:size-8">
                    <div className="size-7 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                      <span className="text-sm font-semibold text-primary">{userInitial}</span>
                    </div>
                  </div>
                  <div className="flex flex-col leading-tight min-w-0 pl-1 opacity-100 transition-opacity duration-150 group-data-[collapsible=icon]:hidden group-data-[state=collapsed]:opacity-0">
                    <span className="font-semibold truncate">{workspaceName || 'pilot'}</span>
                    <span className="text-[11px] text-sidebar-foreground/50 truncate">Workspace</span>
                  </div>
                  <ChevronsUpDown size={14} className="ml-auto shrink-0 opacity-100 transition-opacity duration-150 group-data-[collapsible=icon]:hidden group-data-[state=collapsed]:opacity-0" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start" className="w-56 mb-1">
                <DropdownMenuItem onClick={onOpenPalette}>
                  <Search size={14} />
                  <span>Search</span>
                  <span className="ml-auto text-[11px] text-[var(--faint)] font-mono">⌘K</span>
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
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  )
}

// ── Layout ─────────────────────────────────────────────────────────────────────
export default function Layout() {
  const navigate = useNavigate()

  const [theme, setTheme]             = useState<'light' | 'dark'>(getTheme)
  const [paletteOpen, setPalette]     = useState(false)
  const [onboardingDone, setOnboarding] = useState(false)

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    applyTheme(next)
  }

  const openPalette  = useCallback(() => setPalette(true), [])
  const closePalette = useCallback(() => setPalette(false), [])

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setPalette(p => !p) }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => { applyTheme(theme) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const { data: userProfile } = useQuery({ queryKey: ['me'], queryFn: () => me.profile() })

  const { data: sessionList = [] } = useQuery({
    queryKey: ['sessions'], queryFn: () => sessions.list(),
    refetchInterval: 5000, staleTime: 3000,
  })
  const reviewCount  = sessionList.filter(s => !s.specId && (s.status === 'done' || s.status === 'error')).length
  const runningCount = sessionList.filter(s => s.status === 'running').length

  function signOut() { localStorage.removeItem('token'); navigate('/login') }

  const showOnboarding = userProfile !== undefined && !userProfile?.name && !onboardingDone

  if (showOnboarding) {
    return <CompanyOnboarding onDone={() => setOnboarding(true)} />
  }

  return (
    <SidebarProvider defaultOpen={false}>
      <AppSidebar
        reviewCount={reviewCount}
        runningCount={runningCount}
        theme={theme}
        workspaceName={userProfile?.name ?? ''}
        userInitial={(userProfile?.name || userProfile?.email || '?')[0].toUpperCase()}
        onOpenPalette={openPalette}
        onToggleTheme={toggleTheme}
        onSignOut={signOut}
      />

      <SidebarInset>
        {/* Mobile topbar */}
        <header className="mobile-topbar">
          <button className="wordmark" onClick={() => navigate('/')}>
            <span className="pilot-mark">p</span>
            pilot
          </button>
          <button className="navtool" onClick={openPalette} title="Search">
            <Search size={15} />
          </button>
        </header>

        <main className="app-main">
          <Outlet />
        </main>

        {/* Mobile tab bar */}
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
      </SidebarInset>

      <CommandPalette open={paletteOpen} onClose={closePalette} />
    </SidebarProvider>
  )
}
