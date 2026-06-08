import { useLocation, useNavigate } from 'react-router-dom'
import { House, Monitor, FolderOpen, Users } from 'lucide-react'

const ITEMS = [
  { label: 'Home',     icon: House,       path: '/home' },
  { label: 'Office',   icon: Monitor,     path: '/office' },
  { label: 'Projects', icon: FolderOpen,  path: '/projects' },
  { label: 'Agents',   icon: Users,       path: '/agents' },
]

export default function BottomBar() {
  const { pathname } = useLocation()
  const navigate = useNavigate()

  return (
    <nav style={{
      position: 'fixed', bottom: 0, left: 0, right: 0,
      height: 'var(--bar-h)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      borderTop: '1px solid var(--rule)',
      background: 'var(--bg)',
      zIndex: 100,
    }}>
      <div style={{ display: 'flex', gap: 4 }}>
        {ITEMS.map(({ label, icon: Icon, path }) => {
          const active = pathname === path
          return (
            <button
              key={path}
              onClick={() => navigate(path)}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                gap: 3, padding: '6px 20px',
                borderRadius: 8,
                color: active ? 'var(--ember)' : 'var(--muted)',
                background: active ? 'var(--ember-dim)' : 'transparent',
                transition: 'color 120ms, background 120ms',
              }}
            >
              <Icon size={18} strokeWidth={active ? 2.2 : 1.8} />
              <span style={{ fontSize: 10, fontWeight: active ? 600 : 400, letterSpacing: '0.03em' }}>
                {label}
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
