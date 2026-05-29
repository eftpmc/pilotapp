import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useTheme } from '../theme'

export default function Layout() {
  const { T } = useTheme()
  const navigate = useNavigate()

  function signOut() {
    localStorage.removeItem('token')
    navigate('/login')
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: T.bg, fontFamily: T.sans, color: T.text }}>
      <header style={{ height: 52, background: T.card, borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: 20, padding: '0 20px', flexShrink: 0 }}>
        <Link to="/" style={{ fontFamily: T.mono, fontWeight: 700, fontSize: 15, letterSpacing: '-0.02em', color: T.text, textDecoration: 'none' }}>
          pilot
        </Link>
        <div style={{ flex: 1 }} />
        <NavLink to="/settings" style={({ isActive }) => ({
          fontFamily: T.sans, fontSize: 13, fontWeight: isActive ? 600 : 400,
          color: isActive ? T.text : T.muted, textDecoration: 'none',
          background: isActive ? T.surface2 : 'transparent',
          padding: '4px 10px', borderRadius: 7,
        })}>
          Settings
        </NavLink>
        <button onClick={signOut} style={{ fontFamily: T.sans, fontSize: 13, color: T.faint, background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px 0 4px 4px' }}>
          Sign out
        </button>
      </header>
      <main style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <Outlet />
      </main>
    </div>
  )
}
