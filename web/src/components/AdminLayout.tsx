import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { LogOut, Moon, Server, Smile, Sun, Users } from 'lucide-react'
import { cn } from '@/lib/utils'

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

const NAV = [
  { label: 'Users',      path: '/admin/users',      icon: Users  },
  { label: 'Characters', path: '/admin/characters',  icon: Smile  },
  { label: 'Server',     path: '/admin/server',      icon: Server },
]

export default function AdminLayout() {
  const navigate = useNavigate()
  const [theme, setTheme] = useState<'light' | 'dark'>(getTheme)

  useEffect(() => { applyTheme(theme) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    applyTheme(next)
  }

  function signOut() {
    localStorage.removeItem('token')
    localStorage.removeItem('pilot.role')
    navigate('/login')
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <button className="wordmark" onClick={() => navigate('/admin')}>
            <span className="pilot-mark">p</span>
            pilot
            <span className="ml-1.5 text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50 border border-border/50 rounded px-1 py-px">
              admin
            </span>
          </button>
        </div>

        <nav className="sidebar-nav">
          {NAV.map(({ label, path, icon: Icon }) => (
            <NavLink key={label} to={path} className={({ isActive }) => cn('side-link', isActive && 'active')}>
              <Icon size={15} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
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

      <main className="app-main">
        <Outlet />
      </main>
    </div>
  )
}
