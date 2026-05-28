import Foundation

@MainActor
final class AgentsViewModel: ObservableObject {
    @Published var agents: [Agent] = []
    @Published var isLoading = false
    @Published var error: String?

    func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            agents = try await APIClient.shared.fetchAgents()
        } catch {
            self.error = error.localizedDescription
        }
    }

    func createAgent(name: String, provider: AgentProvider) async -> Agent? {
        do {
            let agent = try await APIClient.shared.createAgent(name: name, provider: provider)
            agents.append(agent)
            return agent
        } catch {
            self.error = error.localizedDescription
            return nil
        }
    }

    func deleteAgent(_ agent: Agent) async {
        do {
            try await APIClient.shared.deleteAgent(id: agent.id)
            agents.removeAll { $0.id == agent.id }
        } catch {
            self.error = error.localizedDescription
        }
    }
}
