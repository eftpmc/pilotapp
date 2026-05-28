import SwiftUI

struct AgentsView: View {
    @StateObject private var vm = AgentsViewModel()
    @StateObject private var github = GitHubService()
    @State private var showingNewAgent = false

    var body: some View {
        NavigationStack {
            ZStack {
                Theme.bg.ignoresSafeArea()

                Group {
                    if vm.isLoading && vm.agents.isEmpty {
                        ProgressView().tint(Theme.green)
                    } else if vm.agents.isEmpty {
                        emptyState
                    } else {
                        agentList
                    }
                }
            }
            .navigationTitle("Agents")
            .toolbarBackground(Theme.bg, for: .navigationBar)
            .toolbarColorScheme(.dark, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    NavigationLink {
                        SettingsView(github: github)
                    } label: {
                        Image(systemName: "gear").foregroundStyle(Theme.muted)
                    }
                }
                ToolbarItem(placement: .primaryAction) {
                    Button { showingNewAgent = true } label: {
                        Image(systemName: "plus")
                            .fontWeight(.semibold)
                            .foregroundStyle(Theme.green)
                    }
                }
            }
            .sheet(isPresented: $showingNewAgent) {
                NewAgentView { name, provider in
                    Task { await vm.createAgent(name: name, provider: provider) }
                }
            }
            .task { await vm.load() }
            .refreshable { await vm.load() }
            .alert("Error", isPresented: .init(
                get: { vm.error != nil },
                set: { if !$0 { vm.error = nil } }
            )) {
                Button("OK", role: .cancel) { vm.error = nil }
            } message: {
                Text(vm.error ?? "")
            }
        }
    }

    private var agentList: some View {
        ScrollView {
            LazyVStack(spacing: 10) {
                ForEach(vm.agents) { agent in
                    NavigationLink(destination: AgentDetailView(agent: agent)) {
                        AgentCard(agent: agent)
                    }
                    .buttonStyle(.plain)
                    .contextMenu {
                        Button(role: .destructive) {
                            Task { await vm.deleteAgent(agent) }
                        } label: {
                            Label("Remove Agent", systemImage: "trash")
                        }
                    }
                }
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 12)
        }
    }

    private var emptyState: some View {
        VStack(spacing: 20) {
            ZStack {
                Circle()
                    .fill(Theme.surface)
                    .frame(width: 72, height: 72)
                Image(systemName: "cpu")
                    .font(.system(size: 28))
                    .foregroundStyle(Theme.muted)
            }
            VStack(spacing: 6) {
                Text("No agents yet")
                    .font(.system(.headline, weight: .semibold))
                    .foregroundStyle(.white)
                Text("Hire an agent to get started")
                    .font(.subheadline)
                    .foregroundStyle(Theme.muted)
            }
            Button("Hire Agent") { showingNewAgent = true }
                .font(.system(.subheadline, weight: .semibold))
                .foregroundStyle(.black)
                .padding(.horizontal, 24)
                .padding(.vertical, 12)
                .background(Theme.green)
                .clipShape(RoundedRectangle(cornerRadius: 12))
        }
        .padding(40)
    }
}

private struct AgentCard: View {
    let agent: Agent

    var body: some View {
        HStack(spacing: 14) {
            ZStack {
                RoundedRectangle(cornerRadius: 10)
                    .fill(agent.provider.color.opacity(0.12))
                    .frame(width: 44, height: 44)
                Image(systemName: agent.provider.icon)
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(agent.provider.color)
            }

            VStack(alignment: .leading, spacing: 3) {
                Text(agent.name)
                    .font(.system(.subheadline, weight: .semibold))
                    .foregroundStyle(.white)
                Text(agent.provider.rawValue.capitalized)
                    .font(.system(.caption))
                    .foregroundStyle(Theme.muted)
            }

            Spacer()

            Image(systemName: "chevron.right")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(Theme.border)
        }
        .pilotCard()
    }
}
