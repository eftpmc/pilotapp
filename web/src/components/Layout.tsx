import { useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { sessions } from '../api/client'
import { cn } from '@/lib/utils'
import {
  Home, LayoutGrid, Users, FolderOpen, BookOpen, Wrench, Settings, LogOut,
} from 'lucide-react'

const COMPANY_NAV = [
  { label: 'Overview',  icon: Home,       path: '/',          end: true  },
  { label: 'Work',      icon: LayoutGrid, path: '/work',      end: false },
  { label: 'Employees', icon: Users,      path: '/employees', end: false },
  { label: 'Projects',  icon: FolderOpen, path: '/projects',  end: false },
  { label: 'Knowledge', icon: BookOpen,   path: '/knowledge', end: false },
  { label: 'Tools',     icon: Wrench,     path: '/tools',     end: false },
]

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
  const navigate  = useNavigate()
  const isDesktop = useIsDesktop()

  const { data: sessionList = [] } = useQuery({
    queryKey: ['sessions'],
    queryFn: () => sessions.list(),
    refetchInterval: 5000,
    staleTime: 3000,
  })

  const runningCount = sessionList.filter(s => s.status === 'running').length
  const reviewCount  = sessionList.filter(s => !s.specId && (s.status === 'done' || s.status === 'error')).length

  function badge(label: string) {
    if (label === 'Work') {
      if (runningCount > 0) return <span className="ml-auto font-mono text-[11px] tabular-nums text-green-500">{runningCount}</span>
      if (reviewCount  > 0) return <span className="ml-auto font-mono text-[11px] tabular-nums text-amber-500">{reviewCount}</span>
    }
    return null
  }

  function signOut() {
    localStorage.removeItem('token')
    navigate('/login')
  }

  return (
    <div className="h-dvh flex bg-background text-foreground overflow-hidden">

      {isDesktop && (
        <aside className="flex w-52 shrink-0 flex-col border-r border-border bg-background">
          <div className="h-14 flex items-center px-5 shrink-0">
            <button
              onClick={() => navigate('/')}
              className="font-mono font-black text-xl tracking-tighter text-foreground select-none bg-transparent border-none cursor-pointer hover:opacity-75 transition-opacity p-0"
            >
              pilot
            </button>
          </div>

          <nav className="px-3 flex flex-col gap-0.5">
            {COMPANY_NAV.map(({ label, icon: Icon, path, end }) => (
              <NavLink
                key={label}
                to={path}
                end={end}
                className={({ isActive }) => cn(
                  'flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary/10 text-primary font-semibold'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="flex-1">{label}</span>
                {badge(label)}
              </NavLink>
            ))}
          </nav>

          <div className="flex-1" />

          <div className="px-3 pb-4 flex flex-col gap-0.5 border-t border-border/70 pt-4 mt-2">
            <NavLink
              to="/settings"
              className={({ isActive }) => cn(
                'flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary/10 text-primary font-semibold'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              )}
            >
              <Settings className="h-4 w-4 shrink-0" />
              Settings
            </NavLink>
            <button
              onClick={signOut}
              className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors cursor-pointer bg-transparent border-none text-left w-full"
            >
              <LogOut className="h-4 w-4 shrink-0" />
              Sign out
            </button>
          </div>
        </aside>
      )}

      <main
        className="flex-1 min-w-0 overflow-hidden flex flex-col bg-background"
        style={{ paddingBottom: isDesktop ? 0 : 'calc(3.5rem + env(safe-area-inset-bottom, 0px))' }}
      >
        <Outlet />
      </main>

      {!isDesktop && (
        <nav
          className="fixed bottom-0 inset-x-0 z-50 bg-background border-t border-border/60 flex flex-col"
          style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        >
          <div className="flex">
            {[COMPANY_NAV[0], COMPANY_NAV[1], COMPANY_NAV[3]].map(({ label, icon: Icon, path, end }) => (
              <NavLink
                key={label}
                to={path}
                end={end}
                className={({ isActive }) => cn(
                  'flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 text-[10px] font-medium transition-colors relative',
                  isActive ? 'text-primary' : 'text-muted-foreground'
                )}
              >
                <Icon className="h-[22px] w-[22px]" />
                {label}
                {label === 'Work' && runningCount > 0 && (
                  <span className="absolute top-2 right-[calc(50%-14px)] w-1.5 h-1.5 rounded-full bg-green-500" />
                )}
                {label === 'Work' && runningCount === 0 && reviewCount > 0 && (
                  <span className="absolute top-2 right-[calc(50%-14px)] w-1.5 h-1.5 rounded-full bg-amber-400" />
                )}
              </NavLink>
            ))}
            <NavLink
              to="/settings"
              className={({ isActive }) => cn(
                'flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 text-[10px] font-medium transition-colors',
                isActive ? 'text-primary' : 'text-muted-foreground'
              )}
            >
              <Settings className="h-[22px] w-[22px]" />
              Settings
            </NavLink>
          </div>
        </nav>
      )}
    </div>
  )
}
