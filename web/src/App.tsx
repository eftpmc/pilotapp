import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import LoginPage from './pages/LoginPage'
import Layout from './components/Layout'
import ProjectLayout from './components/ProjectLayout'
import OverviewPage from './pages/OverviewPage'
import AgentsPage from './pages/AgentsPage'
import KnowledgePage from './pages/KnowledgePage'
import ProjectsPage from './pages/ProjectsPage'
import ProjectDetailPage from './pages/ProjectDetailPage'
import SessionsPage from './pages/SessionsPage'
import PlansPage from './pages/PlansPage'
import FilesPage from './pages/FilesPage'
import ProjectSettingsPage from './pages/ProjectSettingsPage'
import SessionPage from './pages/SessionPage'
import SettingsPage from './pages/SettingsPage'
import ToolsPage from './pages/ToolsPage'

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
            <Route index                element={<OverviewPage />} />
            <Route path="work"          element={<Navigate to="/" replace />} />
            <Route path="agents"        element={<AgentsPage />} />
            <Route path="projects"      element={<ProjectsPage />} />
            <Route path="knowledge"     element={<KnowledgePage />} />
            <Route path="tools"         element={<ToolsPage />} />
            <Route path="settings"      element={<SettingsPage />} />
            <Route path="sessions/:id"  element={<SessionPage />} />
            <Route path="projects/:id"  element={<ProjectLayout />}>
              <Route index              element={<ProjectDetailPage />} />
              <Route path="sessions"    element={<SessionsPage />} />
              <Route path="plans"       element={<PlansPage />} />
              <Route path="files"       element={<FilesPage />} />
              <Route path="settings"    element={<ProjectSettingsPage />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
