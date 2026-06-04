import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { sessions, agents, projects, tasks } from '../api/client'
import { cn } from '@/lib/utils'
import { useEffect, useRef, useState, useCallback } from 'react'
import {
  BookOpen, ChevronRight, FolderOpen, Home, LogOut, Moon, Plus, Search,
  Settings, Sun, Users, Wrench,
} from 'lucide-react'

const BOTTOM_NAV = [
  { label: 'Today',    path: '/',          end: true,  icon: Home },
  { label: 'Projects', path: '/projects',  end: false, icon: FolderOpen },
  { label: 'Agents',   path: '/agents', end: false, icon: Users },
  { label: 'Settings', path: '/settings',  end: false, icon: Settings },
]

const NAV = [
  { label: 'Today',    path: '/',          end: true,  icon: Home },
  { label: 'Agents',   path: '/agents', end: false, icon: Users },
  { label: 'Knowledge', path: '/knowledge', end: false, icon: BookOpen },
  { label: 'Tools', path: '/tools', end: false, icon: Wrench },
  { label: 'Settings', path: '/settings', end: false, icon: Settings },
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

type CmdEntry =
  | { type: 'section'; label: string }
  | { type: 'item'; label: string; sub?: string; dot?: string; dotPulse?: boolean; icon?: React.ReactNode; action: () => void; terms?: string[] }

function CommandPalette({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const [mode, setMode]   = useState<PaletteMode>('search')
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef  = useRef<HTMLDivElement>(null)

  const { data: projectList  = [] } = useQuery({ queryKey: ['projects'],  queryFn: () => projects.list() })
  const { data: agentList = [] } = useQuery({ queryKey: ['agents'], queryFn: () => agents.list() })
  const { data: sessionList  = [] } = useQuery({ queryKey: ['sessions'],  queryFn: () => sessions.list() })
  const { data: taskList     = [] } = useQuery({ queryKey: ['tasks'],     queryFn: () => tasks.list() })

  const taskTitleFor  = (id?: string) => id ? taskList.find(t => t.id === id)?.title : undefined
  const agentNameFor  = (id: string)  => agentList.find(e => e.id === id)?.name ?? ''

  function handleNewTask() {
    if (projectList.length === 0) { navigate('/projects'); onClose(); return }
    if (projectList.length === 1) { navigate(`/projects/${projectList[0].id}?new=1`); onClose(); return }
    setMode('pick-project')
    setQuery('')
  }

  function buildEntries(): CmdEntry[] {
    const result: CmdEntry[] = []

    if (mode === 'pick-project') {
      for (const p of projectList) {
        result.push({ type: 'item', label: p.name, sub: p.repoPath?.split('/').pop(),
          action: () => { navigate(`/projects/${p.id}?new=1`); onClose() } })
      }
      return result
    }

    // Actions
    result.push({ type: 'section', label: 'Actions' })
    result.push({ type: 'item', label: 'New task', sub: '⌘N',
      icon: <Plus size={13} style={{ color: 'var(--ember)', flexShrink: 0 }} />,
      action: handleNewTask, terms: ['create', 'add', 'task'] })

    // Needs review
    const review = sessionList.filter(s => !s.specId && (s.status === 'done' || s.status === 'error'))
    if (review.length > 0) {
      result.push({ type: 'section', label: 'Needs review' })
      for (const s of review) {
        result.push({ type: 'item',
          label: taskTitleFor(s.workTaskId) ?? s.branch ?? s.id.slice(0, 8),
          sub: agentNameFor(s.agentId),
          dot: s.status === 'error' ? 'red' : 'amber',
          action: () => { navigate(`/sessions/${s.id}`); onClose() },
          terms: ['review', 'done', 'error'] })
      }
    }

    // In progress
    const running = sessionList.filter(s => s.status === 'running')
    if (running.length > 0) {
      result.push({ type: 'section', label: 'In progress' })
      for (const s of running) {
        result.push({ type: 'item',
          label: taskTitleFor(s.workTaskId) ?? s.branch ?? s.id.slice(0, 8),
          sub: agentNameFor(s.agentId),
          dot: 'green', dotPulse: true,
          action: () => { navigate(`/sessions/${s.id}`); onClose() },
          terms: ['running', 'active'] })
      }
    }

    // Projects
    if (projectList.length > 0) {
      result.push({ type: 'section', label: 'Projects' })
      for (const p of projectList) {
        result.push({ type: 'item', label: p.name, sub: p.repoPath?.split('/').pop(),
          action: () => { navigate(`/projects/${p.id}`); onClose() } })
      }
    }

    // Agents
    if (agentList.length > 0) {
      result.push({ type: 'section', label: 'Agents' })
      for (const e of agentList) {
        result.push({ type: 'item', label: e.name, sub: e.provider,
          action: () => { navigate(`/agents/${e.id}`); onClose() } })
      }
    }

    return result
  }

  const allEntries = buildEntries()

  // When searching, flatten to items only and filter
  const q = query.toLowerCase().trim()
  const displayEntries: CmdEntry[] = q
    ? allEntries.filter((e): e is Extract<CmdEntry, { type: 'item' }> =>
        e.type === 'item' && (
          e.label.toLowerCase().includes(q) ||
          (e.sub ?? '').toLowerCase().includes(q) ||
          (e.terms ?? []).some(t => t.includes(q))
        ))
    : allEntries

  // Selectable items only (for keyboard nav)
  const selectables = displayEntries.filter(e => e.type === 'item') as Extract<CmdEntry, { type: 'item' }>[]

  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 0) }, [mode])
  useEffect(() => { setActive(0) }, [query, mode])

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, selectables.length - 1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setActive(a => Math.max(a - 1, 0)) }
    if (e.key === 'Enter')     { selectables[active]?.action() }
    if (e.key === 'Escape')    {
      if (mode === 'pick-project') { setMode('search'); setQuery('') }
      else onClose()
    }
  }

  // Keep active item scrolled into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-sel="${active}"]`) as HTMLElement | null
    el?.scrollIntoView({ block: 'nearest' })
  }, [active])

  let selIdx = -1

  return (
    <div className="cmdk-overlay" onClick={onClose}>
      <div className="cmdk" onClick={e => e.stopPropagation()}>

        <div className="cmdk-header">
          {mode === 'pick-project' && (
            <button className="cmdk-back" onClick={() => { setMode('search'); setQuery('') }}>←</button>
          )}
          <input
            ref={inputRef}
            className="cmdk-input"
            placeholder={mode === 'pick-project' ? 'Pick a project…' : 'Search or run a command…'}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onKey}
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        {mode === 'pick-project' && (
          <div className="cmdk-context">New task · pick a project</div>
        )}

        <div className="cmdk-list" ref={listRef}>
          {displayEntries.length === 0 ? (
            <div className="cmdk-empty">Nothing found</div>
          ) : displayEntries.map((entry, i) => {
            if (entry.type === 'section') {
              return <div key={`s-${i}`} className="cmdk-section">{entry.label}</div>
            }
            selIdx++
            const myIdx = selIdx
            return (
              <div
                key={`i-${i}`}
                data-sel={myIdx}
                className={cn('cmdk-item', myIdx === active && 'active')}
                onMouseEnter={() => setActive(myIdx)}
                onClick={() => entry.action()}
              >
                {entry.icon
                  ? entry.icon
                  : entry.dot && <span className={cn('dot', entry.dot, entry.dotPulse && 'pulse')} style={{ flexShrink: 0 }} />
                }
                <span className="cmdk-label" style={entry.icon ? { color: 'var(--ember)', fontWeight: 600 } : undefined}>
                  {entry.label}
                </span>
                {entry.sub && <span className="cmdk-sub">{entry.sub}</span>}
              </div>
            )
          })}
        </div>

        <div className="cmdk-foot">
          <span>↑↓ navigate</span>
          <span>↵ select</span>
          <span>esc {mode === 'pick-project' ? 'back' : 'close'}</span>
        </div>
      </div>
    </div>
  )
}

// ── Layout ─────────────────────────────────────────────────────────────────────
export default function Layout() {
  const navigate = useNavigate()
  const location = useLocation()

  const [theme, setTheme]     = useState<'light' | 'dark'>(getTheme)
  const [paletteOpen, setPalette] = useState(false)
  const [projectsOpen, setProjectsOpen] = useState(() => localStorage.getItem('pilot.sidebar.projects') !== 'closed')

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    applyTheme(next)
  }

  const openPalette  = useCallback(() => setPalette(true), [])
  const closePalette = useCallback(() => setPalette(false), [])

  // ⌘K / ctrl+K global shortcut
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setPalette(p => !p)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  // Apply saved theme on mount
  useEffect(() => { applyTheme(theme) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const { data: sessionList = [] } = useQuery({
    queryKey: ['sessions'],
    queryFn: () => sessions.list(),
    refetchInterval: 5000,
    staleTime: 3000,
  })
  const { data: projectList = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projects.list(),
  })
  const { data: taskList = [] } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => tasks.list(),
    refetchInterval: 8000,
  })

  const reviewCount = sessionList.filter(
    s => !s.specId && (s.status === 'done' || s.status === 'error')
  ).length
  const runningCount = sessionList.filter(s => s.status === 'running').length

  function toggleProjects() {
    setProjectsOpen(open => {
      const next = !open
      localStorage.setItem('pilot.sidebar.projects', next ? 'open' : 'closed')
      return next
    })
  }

  function projectStats(projectId: string) {
    const running = sessionList.filter(s => s.projectId === projectId && s.status === 'running').length
    const review = sessionList.filter(s => s.projectId === projectId && !s.specId && (s.status === 'done' || s.status === 'error')).length
    const queued = taskList.filter(t => t.projectId === projectId && t.status === 'pending').length
    return { running, review, queued }
  }

  function signOut() {
    localStorage.removeItem('token')
    navigate('/login')
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <button className="wordmark" onClick={() => navigate('/')}>
            <span className="pilot-mark">p</span>
            pilot
          </button>
        </div>

        <nav className="sidebar-nav">
          {NAV.map(({ label, path, end, icon: Icon }) => (
            <NavLink key={label} to={path} end={end} className={({ isActive }) => cn('side-link', isActive && 'active')}>
              <Icon size={15} />
              <span>{label}</span>
              {label === 'Today' && reviewCount > 0 && <span className="side-count amber">{reviewCount}</span>}
              {label === 'Today' && reviewCount === 0 && runningCount > 0 && <span className="side-count green">{runningCount}</span>}
            </NavLink>
          ))}

          <div className="side-group">
            <button
              className={cn('side-link side-disclosure', (location.pathname === '/projects' || location.pathname.startsWith('/projects/')) && 'active')}
              onClick={toggleProjects}
            >
              <FolderOpen size={15} />
              <span>Projects</span>
              {projectList.length > 0 && <span className="side-count">{projectList.length}</span>}
              <ChevronRight size={14} className={cn('side-caret', projectsOpen && 'open')} />
            </button>

            {projectsOpen && (
              <div className="project-list">
                <NavLink to="/projects" end className={({ isActive }) => cn('project-link', isActive && 'active')}>
                  All projects
                </NavLink>
                {projectList.map(project => {
                  const stats = projectStats(project.id)
                  return (
                    <NavLink key={project.id} to={`/projects/${project.id}`} className={({ isActive }) => cn('project-link', isActive && 'active')}>
                      <span className="project-name">{project.name}</span>
                      <span className="project-pips">
                        {stats.running > 0 && <span className="mini-dot green" title={`${stats.running} running`} />}
                        {stats.review > 0 && <span className="mini-dot amber" title={`${stats.review} to review`} />}
                        {stats.queued > 0 && <span className="mini-dot idle" title={`${stats.queued} queued`} />}
                      </span>
                    </NavLink>
                  )
                })}
              </div>
            )}
          </div>
        </nav>

        <div className="sidebar-footer">
          <button className="side-link" onClick={openPalette}>
            <Search size={15} />
            <span>Search</span>
            <span className="kbd">⌘K</span>
          </button>
          <button className="side-link" onClick={toggleTheme}>
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
            <span>{theme === 'dark' ? 'Light' : 'Dark'} mode</span>
          </button>
          <button className="side-link" onClick={signOut}>
            <LogOut size={15} />
            <span>Sign out</span>
          </button>
        </div>
      </aside>

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

      {paletteOpen && <CommandPalette onClose={closePalette} />}
    </div>
  )
}
