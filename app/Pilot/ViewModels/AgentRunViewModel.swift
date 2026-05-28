import Foundation

@MainActor
final class AgentRunViewModel: ObservableObject {
    @Published var diff = ""
    @Published var error: String?
    let socket = WebSocketClient()

    func run(_ session: AgentSession, prompt: String) {
        guard let serverURL = KeychainService.load(for: "serverURL"),
              let token = KeychainService.load(for: "authToken") else { return }
        guard let apiKey = KeychainService.load(for: "apiKey_agent_\(session.agentId)") else {
            error = "No API key configured for this agent"
            return
        }
        socket.lines = []
        socket.isDone = false
        socket.error = nil
        socket.connect(serverURL: serverURL, token: token, sessionId: session.id, prompt: prompt, apiKey: apiKey)
    }

    func loadDiff(sessionId: String) async {
        do {
            diff = try await APIClient.shared.fetchDiff(sessionId: sessionId).diff
        } catch {
            self.error = error.localizedDescription
        }
    }

    func merge(sessionId: String) async throws {
        try await APIClient.shared.mergeSession(sessionId: sessionId)
    }

    func discard(sessionId: String) async throws {
        try await APIClient.shared.deleteSession(sessionId: sessionId)
    }
}
