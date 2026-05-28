import SwiftUI

struct ProjectDetailView: View {
    let project: Project
    @EnvironmentObject var vm: WorkViewModel
    @Environment(\.dismiss) private var dismiss
    @State private var showingAddTask = false
    @State private var showingDeleteConfirm = false
    @State private var selectedRun: AgentSession?
    @State private var pendingPrompt: String?

    private var projectTasks: [WorkTask] {
        vm.tasks(for: project).sorted { $0.createdAt > $1.createdAt }
    }

    var body: some View {
        ZStack(alignment: .bottom) {
            Theme.bg.ignoresSafeArea()

            VStack(spacing: 0) {
                if projectTasks.isEmpty {
                    emptyState
                } else {
                    taskList
                }
            }

            addTaskButton
                .padding(.horizontal, 24)
                .padding(.bottom, 32)
                .background(
                    LinearGradient(colors: [Theme.bg.opacity(0), Theme.bg], startPoint: .top, endPoint: .bottom)
                        .frame(height: 96).ignoresSafeArea(),
                    alignment: .bottom
                )
        }
        .navigationTitle(project.name)
        .navigationBarTitleDisplayMode(.large)
        .toolbarBackground(Theme.bg, for: .navigationBar)
        .toolbarColorScheme(.dark, for: .navigationBar)
        .toolbar {
            ToolbarItem(placement: .principal) {
                roleBadge
            }
            ToolbarItem(placement: .destructiveAction) {
                Button(role: .destructive) {
                    showingDeleteConfirm = true
                } label: {
                    Image(systemName: "trash")
                        .foregroundStyle(Theme.danger)
                }
            }
        }
        .confirmationDialog("Remove \"\(project.name)\"?", isPresented: $showingDeleteConfirm, titleVisibility: .visible) {
            Button("Remove from Pilot", role: .destructive) {
                Task {
                    await deleteProject()
                }
            }
        } message: {
            Text("Removes this project and its tasks from Pilot. Your GitHub repository is not affected.")
        }
        .sheet(isPresented: $showingAddTask) {
            AddTaskView(project: project) { _ in
                // task already inserted into vm.tasks by WorkViewModel
            }
            .environmentObject(vm)
        }
        .navigationDestination(item: $selectedRun) { run in
            SessionRunView(
                session: run,
                projectName: project.name,
                initialPrompt: pendingPrompt,
                onDeleted: {
                    vm.runs.removeAll { $0.id == run.id }
                    pendingPrompt = nil
                }
            )
        }
        .onChange(of: selectedRun) { _, run in
            if run == nil { pendingPrompt = nil }
        }
        .refreshable { await vm.load() }
    }

    // MARK: - Role badge (nav subtitle)

    @ViewBuilder
    private var roleBadge: some View {
        if project.role != .any {
            HStack(spacing: 5) {
                Image(systemName: project.role == .claude ? "sparkles" : "chevron.left.forwardslash.chevron.right")
                    .font(.system(size: 10, weight: .semibold))
                Text(project.role.label)
                    .font(.system(.caption2, weight: .semibold))
            }
            .foregroundStyle(project.role == .claude ? Theme.claude : Theme.codex)
            .padding(.horizontal, 8).padding(.vertical, 3)
            .background((project.role == .claude ? Theme.claude : Theme.codex).opacity(0.12))
            .clipShape(Capsule())
        }
    }

    // MARK: - Task list

    private var taskList: some View {
        ScrollView {
            LazyVStack(spacing: 10) {
                ForEach(projectTasks) { task in
                    TaskCard(task: task, agent: vm.agents.first { $0.id == task.agentId })
                        .onTapGesture {
                            if let sessionId = task.sessionId,
                               let run = vm.runs.first(where: { $0.id == sessionId }) {
                                selectedRun = run
                            }
                        }
                        .contextMenu {
                            if task.status == .pending {
                                Menu("Assign to…") {
                                    ForEach(vm.eligibleAgents(for: project)) { agent in
                                        Button(agent.name) {
                                            Task {
                                                if let run = await vm.assignTask(task, to: agent) {
                                                    pendingPrompt = task.prompt
                                                    selectedRun = run
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                            if task.status == .pending {
                                Button(role: .destructive) {
                                    Task { await vm.deleteTask(task) }
                                } label: {
                                    Label("Delete", systemImage: "trash")
                                }
                            }
                        }
                }
            }
            .padding(.horizontal, 20).padding(.vertical, 12).padding(.bottom, 80)
        }
    }

    // MARK: - Empty state

    private var emptyState: some View {
        VStack(spacing: 20) {
            Spacer()
            ZStack {
                Circle().fill(Theme.surface).frame(width: 72, height: 72)
                Image(systemName: "list.bullet.clipboard")
                    .font(.system(size: 26)).foregroundStyle(Theme.muted)
            }
            VStack(spacing: 6) {
                Text("No tasks yet")
                    .font(.system(.headline, weight: .semibold)).foregroundStyle(.white)
                Text("Add tasks to build a backlog for this project")
                    .font(.subheadline).foregroundStyle(Theme.muted).multilineTextAlignment(.center)
            }
            Spacer()
        }
        .padding(40)
    }

    // MARK: - Delete project

    private func deleteProject() async {
        do {
            try await APIClient.shared.deleteProject(id: project.id)
            vm.projects.removeAll { $0.id == project.id }
            vm.tasks.removeAll { $0.projectId == project.id }
            vm.runs.removeAll { $0.projectId == project.id }
            dismiss()
        } catch {
            vm.error = error.localizedDescription
        }
    }

    // MARK: - Add task button

    private var addTaskButton: some View {
        Button { showingAddTask = true } label: {
            Label("Add Task", systemImage: "plus.circle.fill")
                .font(.system(.body, weight: .semibold))
                .foregroundStyle(.black)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 16)
                .background(Theme.green)
                .clipShape(RoundedRectangle(cornerRadius: 14))
        }
    }
}

// MARK: - Task card

private struct TaskCard: View {
    let task: WorkTask
    let agent: Agent?

    private var statusColor: Color {
        switch task.status {
        case .pending: Theme.muted
        case .running: Theme.green
        case .done:    Theme.green
        case .failed:  Theme.danger
        @unknown default: Theme.muted
        }
    }

    private var statusIcon: String {
        switch task.status {
        case .pending: "clock"
        case .running: "bolt.fill"
        case .done:    "checkmark.circle.fill"
        case .failed:  "xmark.circle.fill"
        @unknown default: "clock"
        }
    }

    var body: some View {
        HStack(spacing: 14) {
            ZStack {
                RoundedRectangle(cornerRadius: 8)
                    .fill(statusColor.opacity(0.1))
                    .frame(width: 36, height: 36)
                Image(systemName: statusIcon)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(statusColor)
            }

            VStack(alignment: .leading, spacing: 3) {
                Text(task.title)
                    .font(.system(.subheadline, weight: .semibold))
                    .foregroundStyle(.white)
                    .lineLimit(1)
                HStack(spacing: 6) {
                    if let agent {
                        Text(agent.name)
                            .font(.system(.caption, weight: .medium))
                            .foregroundStyle(agent.provider.color)
                    } else {
                        Text("Unassigned")
                            .font(.caption)
                            .foregroundStyle(Theme.muted)
                    }
                    Text("·").foregroundStyle(Theme.border)
                    Text(task.baseBranch)
                        .font(.system(.caption, design: .monospaced))
                        .foregroundStyle(Theme.muted.opacity(0.7))
                }
            }

            Spacer()

            // tap hint if runnable
            if task.status == .running || task.status == .done {
                Image(systemName: "chevron.right")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(Theme.border)
            }
        }
        .pilotCard()
    }
}
