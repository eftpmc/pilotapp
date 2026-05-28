import { NavLink, Outlet, useNavigate } from 'react-router-dom'

const nav = [
  { to: '/work',     label: 'Work' },
  { to: '/agents',   label: 'Agents' },
  { to: '/projects', label: 'Projects' },
]

export default function Layout() {
  const navigate = useNavigate()

  function signOut() {
    localStorage.removeItem('token')
    navigate('/login')
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#0a0a0a] text-white">
      <header className="border-b border-white/8 px-6 h-12 flex items-center gap-6 shrink-0">
        <span className="font-semibold text-sm tracking-wide text-white">Pilot</span>
        <nav className="flex items-center gap-1 flex-1">
          {nav.map(({ to, label }) => (
            <NavLink
              key={to} to={to}
              className={({ isActive }) =>
                `px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  isActive ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white/80'
                }`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
        <NavLink to="/settings" className={({ isActive }) =>
          `text-sm transition-colors ${isActive ? 'text-white' : 'text-white/40 hover:text-white/70'}`
        }>
          Settings
        </NavLink>
        <button onClick={signOut} className="text-sm text-white/30 hover:text-white/60 transition-colors">
          Sign out
        </button>
      </header>

      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
