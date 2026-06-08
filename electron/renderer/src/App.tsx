import { useEffect } from 'react'
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { auth } from '@pilot/shared'
import { getServerUrl, saveServerUrl } from '@/api'
import { addServer, getServers } from '@/pages/ServersPage'
import HUD from '@/components/HUD'
import ServersPage from '@/pages/ServersPage'
import ConnectPage from '@/pages/ConnectPage'
import LoginPage from '@/pages/LoginPage'
import OfficePage from '@/pages/OfficePage'

async function applyPair(serverUrl: string, pairToken: string, navigate: (path: string, opts?: object) => void) {
  try {
    saveServerUrl(serverUrl)
    addServer(serverUrl)
    const { token } = await auth.pair(serverUrl, pairToken, 'Pilot Desktop')
    localStorage.setItem('token', token)
    navigate('/office', { replace: true })
  } catch (e) {
    console.error('Quick connect failed:', e)
    navigate('/login', { replace: true })
  }
}

function AppShell() {
  const location = useLocation()
  const navigate = useNavigate()
  const path = location.pathname
  const isAuth = path === '/servers' || path === '/connect' || path === '/login'
  const isOffice = path === '/office'

  // Check for a pending deep link pair on startup
  useEffect(() => {
    window.electron?.getPendingPair?.().then(pending => {
      if (pending) applyPair(pending.serverUrl, pending.pairToken, navigate)
    })
    window.electron?.onDeepLinkPair?.(({ serverUrl, pairToken }) => {
      applyPair(serverUrl, pairToken, navigate)
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isAuth) return
    const servers = getServers()
    if (servers.length === 0) { navigate('/connect', { replace: true }); return }
    if (!getServerUrl()) { navigate('/servers', { replace: true }); return }
    if (!localStorage.getItem('token')) { navigate('/login', { replace: true }); return }
  }, [path, navigate, isAuth])

  return (
    <div style={{ position: 'relative', height: '100vh', overflow: 'hidden' }}>
      {!isAuth && !isOffice && <HUD />}
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
