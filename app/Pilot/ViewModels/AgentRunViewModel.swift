import Foundation

@MainActor
final class AgentRunViewModel: ObservableObject {
    @Published var diff = ""
    @Published var error: String?
    let socket = WebSocketClient()

    func run(_ session: AgentSession, prompt: String) {
        guard let serverURL = KeychainService.load(for: "serverURL"),
              let token = KeychainService.load(for: "authToken") else { return }
        socket.lines = []
        socket.isDone = false
        socket.error = nil

        if session.workTaskId != nil {
            socket.subscribe(serverURL: serverURL, token: token, sessionId: session.id)
        } else {
            socket.connect(serverURL: serverURL, token: token, sessionId: session.id, prompt: prompt)
        }
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
