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
                    EmptyPanel(text: "No agents yet.")
                        .padding(.horizontal, 24)
                } else {
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: 28) {
                            Text(summary)
                                .font(.system(size: 14))
                                .foregroundStyle(Color.muted)
                                .padding(.top, 4)

                            agentSection(title: "Roster", agents: agents)
                        }
                        .padding(.horizontal, 24)
                        .padding(.bottom, 32)
                    }
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

    private var summary: String {
        let running = sessions.filter { $0.statusEnum == .running }.count
        let review = sessions.filter { $0.statusEnum == .done || $0.statusEnum == .error }.count
        var parts: [String] = ["\(agents.count) agent\(agents.count == 1 ? "" : "s")"]
        if running > 0 { parts.append("\(running) working") }
        if review > 0 { parts.append("\(review) to review") }
        return parts.joined(separator: " · ")
    }

    private func agentSection(title: String, agents: [Agent]) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            PilotSectionHeader(title: title, count: agents.count)
            VStack(spacing: 0) {
                ForEach(Array(agents.enumerated()), id: \.element.id) { index, agent in
                    AgentRow(agent: agent, sessions: sessions.filter { $0.agentId == agent.id })
                        .padding(.horizontal, 14)
                        .padding(.vertical, 12)
                    if index < agents.count - 1 { Divider().background(Color.rule) }
                }
            }
            .pilotCard(radius: 12)
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
    }
}
