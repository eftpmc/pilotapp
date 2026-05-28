import SwiftUI

struct AgentDetailView: View {
    let agent: Agent
    @EnvironmentObject var vm: WorkViewModel
    @State private var showingNewTask = false
    @State private var pendingRun: PendingRun?

    private var agentRuns: [AgentSession] {
        vm.runs.filter { $0.agentId == agent.id }
    }

    var body: some View {
        ZStack(alignment: .bottom) {
            Theme.bg.ignoresSafeArea()

            VStack(spacing: 0) {
                if vm.isLoading && agentRuns.isEmpty {
                    Spacer()
                    ProgressView().tint(Theme.green)
                    Spacer()
                } else if agentRuns.isEmpty {
                    emptyState
                } else {
                    runsList
                }
            }

            if !vm.agents.isEmpty {
                Button { showingNewTask = true } label: {
                    Label("New Task", systemImage: "plus.circle.fill")
                        .font(.system(.body, weight: .semibold))
                        .foregroundStyle(.black)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 16)
                        .background(Theme.green)
                        .clipShape(RoundedRectangle(cornerRadius: 14))
                }
                .padding(.horizontal, 24)
                .padding(.bottom, 32)
                .background(
                    LinearGradient(colors: [Theme.bg.opacity(0), Theme.bg], startPoint: .top, endPoint: .bottom)
                        .frame(height: 96).ignoresSafeArea(),
                    alignment: .bottom
                )
            }
        }
        .navigationTitle(agent.name)
        .navigationBarTitleDisplayMode(.large)
        .toolbarBackground(Theme.bg, for: .navigationBar)
        .toolbarColorScheme(.dark, for: .navigationBar)
        .sheet(isPresented: $showingNewTask) {
            NewTaskView(preselectedAgentId: agent.id) { run, prompt in
                pendingRun = PendingRun(session: run, prompt: prompt)
            }
            .environmentObject(vm)
        }
        .navigationDestination(item: $pendingRun) { pending in
            SessionRunView(
                session: pending.session,
                projectName: vm.project(for: pending.session)?.name,
                initialPrompt: pending.prompt,
                onDeleted: {
                    vm.runs.removeAll { $0.id == pending.session.id }
                    pendingRun = nil
                }
            )
        }
        .refreshable { await vm.load() }
    }

    private var runsList: some View {
        ScrollView {
            LazyVStack(spacing: 10) {
                ForEach(agentRuns) { run in
                    RunCard(run: run, projectName: vm.project(for: run)?.name)
                        .onTapGesture {
                            let prompt = run.status == .idle ? vm.task(for: run)?.prompt : nil
                            pendingRun = PendingRun(session: run, prompt: prompt)
                        }
                        .contextMenu {
                            Button(role: .destructive) {
                                Task { await vm.deleteRun(run) }
                            } label: {
                                Label("Discard", systemImage: "trash")
                            }
                        }
                }
            }
            .padding(.horizontal, 20).padding(.vertical, 12).padding(.bottom, 80)
        }
    }

    private var emptyState: some View {
        VStack(spacing: 20) {
            Spacer()
            ZStack {
                Circle().fill(agent.provider.color.opacity(0.1)).frame(width: 72, height: 72)
                Image(systemName: agent.provider.icon)
                    .font(.system(size: 28, weight: .semibold))
                    .foregroundStyle(agent.provider.color)
            }
            VStack(spacing: 6) {
                Text(agent.name + " has no runs yet")
                    .font(.system(.headline, weight: .semibold)).foregroundStyle(.white)
                if vm.projects.isEmpty {
                    Text("Add a project in Setup first")
                        .font(.subheadline).foregroundStyle(Theme.muted)
                } else {
                    Text("Dispatch a task from the Work tab or tap New Task")
                        .font(.subheadline).foregroundStyle(Theme.muted).multilineTextAlignment(.center)
                }
            }
            Spacer()
        }
        .padding(40)
    }
}

private struct RunCard: View {
    let run: AgentSession
    let projectName: String?

    private var statusIcon: String {
        switch run.status {
        case .running: "bolt.fill"
        case .done:    "checkmark.circle.fill"
        case .error:   "xmark.circle.fill"
        case .idle:    "clock"
        }
    }

    var body: some View {
        HStack(spacing: 14) {
            ZStack {
                RoundedRectangle(cornerRadius: 8).fill(run.status.color.opacity(0.1)).frame(width: 36, height: 36)
                Image(systemName: statusIcon)
                    .font(.system(size: 14, weight: .semibold)).foregroundStyle(run.status.color)
            }
            VStack(alignment: .leading, spacing: 3) {
                if let name = projectName {
                    Text(name).font(.system(.subheadline, weight: .semibold)).foregroundStyle(.white).lineLimit(1)
                }
                Text(run.branch).font(.system(.caption, design: .monospaced)).foregroundStyle(Theme.muted).lineLimit(1)
            }
            Spacer()
            StatusPill(status: run.status)
        }
        .pilotCard()
    }
}
