import SwiftUI

// Bundles session + prompt together so navigationDestination always has both atomically
struct PendingRun: Identifiable, Hashable {
    let session: AgentSession
    let prompt: String?
    var id: String { session.id }
}

struct WorkView: View {
    @EnvironmentObject var vm: WorkViewModel
    @State private var showingNewTask = false
    @State private var pendingRun: PendingRun?
    @State private var isRunningQueue = false

    private var pendingTasks: [WorkTask] {
        vm.tasks.filter { $0.status == .pending }.sorted { $0.createdAt < $1.createdAt }
    }

    private var activeRuns: [AgentSession] {
        vm.runs.filter { $0.status == .running || $0.status == .idle }
    }

    private var recentRuns: [AgentSession] {
        vm.runs.filter { $0.status == .done || $0.status == .error }.prefix(20).map { $0 }
    }

    var body: some View {
        NavigationStack {
            ZStack {
                Theme.bg.ignoresSafeArea()

                Group {
                    if vm.isLoading && vm.runs.isEmpty && vm.tasks.isEmpty {
                        ProgressView().tint(Theme.green)
                    } else if vm.runs.isEmpty && vm.tasks.isEmpty {
                        emptyState
                    } else {
                        content
                    }
                }
            }
            .navigationTitle("Pilot")
            .toolbarBackground(Theme.bg, for: .navigationBar)
            .toolbarColorScheme(.dark, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button { showingNewTask = true } label: {
                        Image(systemName: "plus").fontWeight(.semibold).foregroundStyle(Theme.green)
                    }
                    .disabled(vm.agents.isEmpty || vm.projects.isEmpty)
                }
            }
            .sheet(isPresented: $showingNewTask) {
                NewTaskView { run, prompt in
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
    }

    // MARK: - Content

    private var content: some View {
        ScrollView {
            VStack(spacing: 0) {
                if !pendingTasks.isEmpty {
                    queueSection
                }

                if !activeRuns.isEmpty {
                    sectionHeader("Active")
                    LazyVStack(spacing: 10) {
                        ForEach(activeRuns) { run in
                            RunCard(
                                run: run,
                                agentName: vm.agent(for: run)?.name,
                                agentProvider: vm.agent(for: run)?.provider,
                                projectName: vm.project(for: run)?.name,
                                taskTitle: vm.task(for: run)?.title,
                                isIdle: run.status == .idle
                            )
                            .onTapGesture { open(run) }
                        }
                    }
                    .padding(.horizontal, 20).padding(.bottom, 10)
                }

                if !recentRuns.isEmpty {
                    sectionHeader("Recent")
                    LazyVStack(spacing: 10) {
                        ForEach(recentRuns) { run in
                            RunCard(
                                run: run,
                                agentName: vm.agent(for: run)?.name,
                                agentProvider: vm.agent(for: run)?.provider,
                                projectName: vm.project(for: run)?.name,
                                taskTitle: vm.task(for: run)?.title,
                                isIdle: false
                            )
                            .onTapGesture { open(run) }
                            .contextMenu {
                                Button(role: .destructive) {
                                    Task { await vm.deleteRun(run) }
                                } label: {
                                    Label("Discard", systemImage: "trash")
                                }
                            }
                        }
                    }
                    .padding(.horizontal, 20).padding(.bottom, 20)
                }
            }
        }
    }

    // MARK: - Open run (resolves prompt from linked task if idle)

    private func open(_ run: AgentSession) {
        let prompt: String?
        if run.status == .idle, let taskId = run.workTaskId {
            prompt = vm.tasks.first { $0.id == taskId }?.prompt
        } else {
            prompt = nil
        }
        pendingRun = PendingRun(session: run, prompt: prompt)
    }

    // MARK: - Queue section

    private var queueSection: some View {
        VStack(spacing: 0) {
            HStack(alignment: .center) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Queue")
                        .font(.system(.caption2, weight: .semibold))
                        .foregroundStyle(Theme.muted).textCase(.uppercase).tracking(1.2)
                    Text("\(pendingTasks.count) pending · \(vm.idleAgentCount) idle")
                        .font(.system(.caption))
                        .foregroundStyle(Theme.muted.opacity(0.7))
                }
                Spacer()
                if vm.idleAgentCount > 0 && !pendingTasks.isEmpty {
                    Button {
                        Task {
                            isRunningQueue = true
                            let dispatched = await vm.runQueue()
                            isRunningQueue = false
                            // Navigate to first dispatched session
                            if let first = dispatched.first {
                                pendingRun = PendingRun(session: first.session, prompt: first.task.prompt)
                            }
                        }
                    } label: {
                        HStack(spacing: 5) {
                            if isRunningQueue {
                                ProgressView().scaleEffect(0.7).tint(.black)
                            } else {
                                Image(systemName: "play.fill").font(.system(size: 10, weight: .bold))
                                Text("Run Queue").font(.system(.caption, weight: .semibold))
                            }
                        }
                        .foregroundStyle(.black)
                        .padding(.horizontal, 12).padding(.vertical, 6)
                        .background(Theme.green)
                        .clipShape(Capsule())
                    }
                    .disabled(isRunningQueue)
                }
            }
            .padding(.horizontal, 20).padding(.top, 16).padding(.bottom, 10)

            LazyVStack(spacing: 8) {
                ForEach(pendingTasks.prefix(5)) { task in
                    QueueTaskRow(
                        task: task,
                        projectName: vm.projects.first { $0.id == task.projectId }?.name,
                        eligibleAgents: vm.projects.first { $0.id == task.projectId }
                            .map { vm.eligibleAgents(for: $0) } ?? []
                    ) { agent in
                        Task {
                            if let run = await vm.assignTask(task, to: agent) {
                                pendingRun = PendingRun(session: run, prompt: task.prompt)
                            }
                        }
                    }
                }
                if pendingTasks.count > 5 {
                    Text("+ \(pendingTasks.count - 5) more in queue")
                        .font(.caption).foregroundStyle(Theme.muted).padding(.vertical, 4)
                }
            }
            .padding(.horizontal, 20).padding(.bottom, 12)

            Divider().background(Theme.border).padding(.horizontal, 20).padding(.bottom, 4)
        }
    }

    private func sectionHeader(_ title: String) -> some View {
        Text(title)
            .font(.system(.caption2, weight: .semibold))
            .foregroundStyle(Theme.muted).textCase(.uppercase).tracking(1.2)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 20).padding(.top, 14).padding(.bottom, 8)
    }

    // MARK: - Empty state

    private var emptyState: some View {
        VStack(spacing: 20) {
            ZStack {
                Circle().fill(Theme.surface).frame(width: 72, height: 72)
                Image(systemName: "bolt").font(.system(size: 28)).foregroundStyle(Theme.muted)
            }
            VStack(spacing: 6) {
                Text("Nothing yet").font(.system(.headline, weight: .semibold)).foregroundStyle(.white)
                if vm.agents.isEmpty || vm.projects.isEmpty {
                    Text("Hire agents and add projects in the Setup tab")
                        .font(.subheadline).foregroundStyle(Theme.muted).multilineTextAlignment(.center)
                } else {
                    Text("Add tasks to a project, then run the queue")
                        .font(.subheadline).foregroundStyle(Theme.muted).multilineTextAlignment(.center)
                }
            }
        }
        .padding(40)
    }
}

// MARK: - Queue task row

private struct QueueTaskRow: View {
    let task: WorkTask
    let projectName: String?
    let eligibleAgents: [Agent]
    var onAssign: (Agent) -> Void

    var body: some View {
        HStack(spacing: 12) {
            Circle().fill(Theme.muted.opacity(0.3)).frame(width: 7, height: 7)
            VStack(alignment: .leading, spacing: 2) {
                Text(task.title)
                    .font(.system(.subheadline, weight: .medium)).foregroundStyle(.white).lineLimit(1)
                if let proj = projectName {
                    Text(proj).font(.caption).foregroundStyle(Theme.muted)
                }
            }
            Spacer()
            if !eligibleAgents.isEmpty {
                Menu {
                    ForEach(eligibleAgents) { agent in
                        Button(agent.name) { onAssign(agent) }
                    }
                } label: {
                    Text("Assign")
                        .font(.system(.caption, weight: .semibold))
                        .foregroundStyle(Theme.green)
                        .padding(.horizontal, 10).padding(.vertical, 5)
                        .background(Theme.green.opacity(0.1))
                        .clipShape(Capsule())
                        .overlay(Capsule().strokeBorder(Theme.green.opacity(0.3), lineWidth: 0.5))
                }
            }
        }
        .padding(.horizontal, 14).padding(.vertical, 10)
        .background(Theme.card)
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(Theme.border, lineWidth: 0.5))
    }
}

// MARK: - Run card

private struct RunCard: View {
    let run: AgentSession
    let agentName: String?
    let agentProvider: AgentProvider?
    let projectName: String?
    let taskTitle: String?
    let isIdle: Bool

    private var provider: AgentProvider { agentProvider ?? .claude }

    private var statusIcon: String {
        switch run.status {
        case .running: "bolt.fill"
        case .done:    "checkmark.circle.fill"
        case .error:   "xmark.circle.fill"
        case .idle:    "play.circle.fill"
        }
    }

    var body: some View {
        HStack(spacing: 14) {
            ZStack {
                RoundedRectangle(cornerRadius: 10).fill(provider.color.opacity(0.12)).frame(width: 44, height: 44)
                Image(systemName: provider.icon).font(.system(size: 16, weight: .semibold)).foregroundStyle(provider.color)
            }
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 5) {
                    if let name = agentName {
                        Text(name).font(.system(.subheadline, weight: .semibold)).foregroundStyle(.white)
                    }
                    if let proj = projectName {
                        Text("·").foregroundStyle(Theme.border)
                        Text(proj).font(.system(.subheadline)).foregroundStyle(Theme.muted).lineLimit(1)
                    }
                }
                if let title = taskTitle {
                    Text(title).font(.caption).foregroundStyle(Theme.muted).lineLimit(1)
                } else {
                    Text(run.branch).font(.system(.caption, design: .monospaced)).foregroundStyle(Theme.muted.opacity(0.7)).lineLimit(1)
                }
            }
            Spacer()
            if isIdle {
                HStack(spacing: 4) {
                    Image(systemName: "play.circle.fill")
                        .font(.system(size: 13)).foregroundStyle(Theme.green)
                    Text("Tap to start")
                        .font(.system(.caption, weight: .medium)).foregroundStyle(Theme.green)
                }
                .padding(.horizontal, 8).padding(.vertical, 4)
                .background(Theme.green.opacity(0.1))
                .clipShape(Capsule())
            } else {
                StatusPill(status: run.status)
            }
        }
        .pilotCard()
    }
}
