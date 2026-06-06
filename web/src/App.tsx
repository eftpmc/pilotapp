import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TooltipProvider } from '@/components/ui/tooltip'
import LoginPage from './pages/LoginPage'
import Layout from './components/Layout'
import AdminLayout from './components/AdminLayout'
import ProjectLayout from './components/ProjectLayout'
import OverviewPage from './pages/OverviewPage'
import AgentsPage from './pages/AgentsPage'
import AgentPage from './pages/AgentPage'
import NewAgentPage from './pages/NewAgentPage'
import HireRosterPage from './pages/HireRosterPage'
import HireAgentPage from './pages/HireAgentPage'
import KnowledgePage from './pages/KnowledgePage'
import ProjectsPage from './pages/ProjectsPage'
import ProjectDetailPage from './pages/ProjectDetailPage'
import SessionsPage from './pages/SessionsPage'
import PlansPage from './pages/PlansPage'
import ProjectOutputsPage from './pages/ProjectOutputsPage'
import ProjectSettingsPage from './pages/ProjectSettingsPage'
import SessionPage from './pages/SessionPage'
import SettingsPage from './pages/SettingsPage'
import ToolsPage from './pages/ToolsPage'
import AdminUsersPage from './pages/AdminUsersPage'
import AdminServerPage from './pages/AdminServerPage'
import AdminCharactersPage from './pages/AdminCharactersPage'
import DepartmentPage from './pages/DepartmentPage'
import TaskPage from './pages/TaskPage'
import OfficePage from './pages/OfficePage'
import OfficeLabPage from './pages/OfficeLabPage'

const qc = new QueryClient({ defaultOptions: { queries: { staleTime: 10_000 } } })

function RequireAdmin({ children }: { children: React.ReactNode }) {
  if (!localStorage.getItem('token')) return <Navigate to="/login" replace />
  if (localStorage.getItem('pilot.role') !== 'admin') return <Navigate to="/" replace />
  return <>{children}</>
}

function RequireUser({ children }: { children: React.ReactNode }) {
  if (!localStorage.getItem('token')) return <Navigate to="/login" replace />
  if (localStorage.getItem('pilot.role') === 'admin') return <Navigate to="/admin" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <TooltipProvider delayDuration={300}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          {/* Admin shell */}
          <Route path="/admin" element={<RequireAdmin><AdminLayout /></RequireAdmin>}>
            <Route index                  element={<Navigate to="/admin/users" replace />} />
            <Route path="users"           element={<AdminUsersPage />} />
            <Route path="characters"      element={<AdminCharactersPage />} />
            <Route path="server"          element={<AdminServerPage />} />
          </Route>

          {/* User shell */}
          <Route path="/" element={<RequireUser><Layout /></RequireUser>}>
            <Route index                element={<OfficeLabPage />} />
            <Route path="today"         element={<OverviewPage />} />
            <Route path="agents"              element={<AgentsPage />} />
            <Route path="agents/new"          element={<NewAgentPage />} />
            <Route path="agents/hire"         element={<HireRosterPage />} />
            <Route path="agents/hire/:presetId" element={<HireAgentPage />} />
            <Route path="agents/:id"          element={<AgentPage />} />
            <Route path="departments/:id"     element={<DepartmentPage />} />
            <Route path="office"        element={<OfficePage />} />
            <Route path="projects"      element={<ProjectsPage />} />
            <Route path="knowledge"     element={<KnowledgePage />} />
            <Route path="tools"         element={<ToolsPage />} />
            <Route path="settings"      element={<SettingsPage />} />
            <Route path="sessions/:id"              element={<SessionPage />} />
            <Route path="projects/:id/tasks/:taskId" element={<TaskPage />} />
            <Route path="projects/:id"  element={<ProjectLayout />}>
              <Route index              element={<ProjectDetailPage />} />
              <Route path="sessions"    element={<SessionsPage />} />
              <Route path="plans"       element={<PlansPage />} />
              <Route path="outputs"     element={<ProjectOutputsPage />} />
              <Route path="settings"    element={<ProjectSettingsPage />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  )
}
