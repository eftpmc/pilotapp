import SwiftUI

struct AgentsView: View {
    @Environment(AppState.self) private var appState
    @State private var agents: [Agent] = []
    @State private var sessions: [Session] = []
    @State private var isLoading = false

    var body: some View {
        NavigationStack {
            ZStack {
                Color.bg.ignoresSafeArea()

                if isLoading && agents.isEmpty {
                    ProgressView().tint(Color.ember)
                } else if agents.isEmpty {
                    VStack(spacing: 10) {
                        Image(systemName: "person.2.slash")
                            .font(.system(size: 36))
                            .foregroundStyle(Color.muted)
                        Text("No agents yet")
                            .font(.footnote)
                            .foregroundStyle(Color.muted)
                        Text("Add agents in the web UI under Settings.")
                            .font(.caption2)
                            .foregroundStyle(Color.muted.opacity(0.7))
                            .multilineTextAlignment(.center)
                    }
                    .padding(40)
                } else {
                    List(agents) { agent in
                        AgentRow(agent: agent, sessions: sessions.filter { $0.agentId == agent.id })
                            .listRowBackground(Color.panel)
                            .listRowSeparatorTint(Color.rule)
                    }
                    .listStyle(.plain)
                    .scrollContentBackground(.hidden)
                    .refreshable { await load() }
                }
            }
            .navigationTitle("Agents")
            .navigationBarTitleDisplayMode(.large)
            .toolbarBackground(Color.bg, for: .navigationBar)
            .toolbarColorScheme(.dark, for: .navigationBar)
        }
        .task { await load() }
        .task(id: appState.socket?.refreshTick) {
            guard (appState.socket?.refreshTick ?? 0) > 0 else { return }
            await load()
        }
    }

    private func load() async {
        guard let client = appState.client else { return }
        isLoading = true
        defer { isLoading = false }
        async let a = client.agents()
        async let s = client.sessions()
        do { (agents, sessions) = try await (a, s) } catch {}
    }
}

private struct AgentRow: View {
    let agent: Agent
    let sessions: [Session]

    private var activeSession: Session? { sessions.first { $0.statusEnum == .running || $0.statusEnum == .idle } }
    private var reviewCount: Int { sessions.filter { $0.statusEnum == .done || $0.statusEnum == .error }.count }

    var body: some View {
        HStack(spacing: 12) {
            AgentAvatar(agent: agent, size: 40, running: activeSession?.statusEnum == .running)

            VStack(alignment: .leading, spacing: 4) {
                Text(agent.name)
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(Color.ink)

                HStack(spacing: 6) {
                    Text(agent.provider)
                        .font(.caption2)
                        .foregroundStyle(Color.muted)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(Color.panel2, in: Capsule())

                    if agent.role == "lead" {
                        Text("lead")
                            .font(.caption2)
                            .foregroundStyle(Color.ember)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Color.ember.opacity(0.1), in: Capsule())
                    }
                }
            }

            Spacer()

            VStack(alignment: .trailing, spacing: 4) {
                if let s = activeSession {
                    HStack(spacing: 4) {
                        Circle().fill(Color.green).frame(width: 6, height: 6)
                        Text(s.statusEnum.label)
                            .font(.caption2)
                            .foregroundStyle(Color.green)
                    }
                } else if reviewCount > 0 {
                    Text("\(reviewCount) to review")
                        .font(.caption2)
                        .foregroundStyle(Color(hex: "#C8A04B"))
                } else {
                    Text("Idle")
                        .font(.caption2)
                        .foregroundStyle(Color.muted)
                }
            }
        }
        .padding(.vertical, 6)
    }
}
