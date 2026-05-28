import Foundation

@MainActor
final class SessionViewModel: ObservableObject {
    @Published var sessions: [AgentSession] = []
    @Published var isLoading = false
    @Published var error: String?

    let project: Project

    init(project: Project) {
        self.project = project
    }

    func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            sessions = try await APIClient.shared.fetchSessions(projectId: project.id)
        } catch {
            self.error = error.localizedDescription
        }
    }

    func discard(sessionId: String) async {
        do {
            try await APIClient.shared.deleteSession(sessionId: sessionId)
            sessions.removeAll { $0.id == sessionId }
        } catch {
            self.error = error.localizedDescription
        }
    }
}
