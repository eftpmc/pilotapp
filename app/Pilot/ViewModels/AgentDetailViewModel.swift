import Foundation

@MainActor
final class AgentDetailViewModel: ObservableObject {
    @Published var runs: [AgentSession] = []
    @Published var projects: [Project] = []
    @Published var isLoading = false
    @Published var error: String?

    let agent: Agent

    init(agent: Agent) {
        self.agent = agent
    }

    func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            async let r = APIClient.shared.fetchSessions(agentId: agent.id)
            async let p = APIClient.shared.fetchProjects()
            (runs, projects) = try await (r, p)
        } catch {
            self.error = error.localizedDescription
        }
    }

    func project(for run: AgentSession) -> Project? {
        projects.first { $0.id == run.projectId }
    }

    func assignTask(projectId: String, baseBranch: String?) async -> AgentSession? {
        do {
            let run = try await APIClient.shared.createSession(
                agentId: agent.id,
                projectId: projectId,
                baseBranch: baseBranch
            )
            runs.insert(run, at: 0)
            return run
        } catch {
            self.error = error.localizedDescription
            return nil
        }
    }

    func deleteRun(_ run: AgentSession) async {
        do {
            try await APIClient.shared.deleteSession(sessionId: run.id)
            runs.removeAll { $0.id == run.id }
        } catch {
            self.error = error.localizedDescription
        }
    }
}
