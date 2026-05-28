import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import LoginPage from './pages/LoginPage'
import Layout from './components/Layout'
import WorkPage from './pages/WorkPage'
import AgentsPage from './pages/AgentsPage'
import ProjectsPage from './pages/ProjectsPage'
import SessionPage from './pages/SessionPage'
import SettingsPage from './pages/SettingsPage'

const qc = new QueryClient({ defaultOptions: { queries: { staleTime: 10_000 } } })

function RequireAuth({ children }: { children: React.ReactNode }) {
  return localStorage.getItem('token') ? <>{children}</> : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<RequireAuth><Layout /></RequireAuth>}>
            <Route index element={<Navigate to="/work" replace />} />
            <Route path="work" element={<WorkPage />} />
            <Route path="agents" element={<AgentsPage />} />
            <Route path="projects" element={<ProjectsPage />} />
            <Route path="sessions/:id" element={<SessionPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
