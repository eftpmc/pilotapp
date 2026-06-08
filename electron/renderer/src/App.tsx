import { useEffect } from 'react'
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { getServerUrl } from '@/api'
import { getServers } from '@/pages/ServersPage'
import HUD from '@/components/HUD'
import ServersPage from '@/pages/ServersPage'
import ConnectPage from '@/pages/ConnectPage'
import LoginPage from '@/pages/LoginPage'
import OfficePage from '@/pages/OfficePage'

function AppShell() {
  const location = useLocation()
  const navigate = useNavigate()
  const path = location.pathname
  const isAuth = path === '/servers' || path === '/connect' || path === '/login'

  useEffect(() => {
    if (isAuth) return
    const servers = getServers()
    if (servers.length === 0) { navigate('/connect', { replace: true }); return }
    if (!getServerUrl()) { navigate('/servers', { replace: true }); return }
    if (!localStorage.getItem('token')) { navigate('/login', { replace: true }); return }
  }, [path, navigate, isAuth])

  return (
    <div style={{ position: 'relative', height: '100vh', overflow: 'hidden' }}>
      {!isAuth && <HUD />}
      <Routes>
        <Route path="/servers" element={<ServersPage />} />
        <Route path="/connect" element={<ConnectPage />} />
        <Route path="/login"   element={<LoginPage />} />
        <Route path="/"        element={<Navigate to="/office" replace />} />
        <Route path="/office"  element={<OfficePage />} />
      </Routes>
    </div>
  )
}

export default function App() {
  return <AppShell />
}
