import SwiftUI

struct ProjectDetailView: View {
    let project: Project

    @Environment(AppState.self) private var appState
    @State private var allSessions: [Session] = []
    @State private var agents: [Agent] = []
    @State private var taskList: [WorkTask] = []
    @State private var isLoading = false
    @State private var showNewTask = false
    @State private var agentPickerTask: WorkTask?
    @State private var confirmDeleteTask: WorkTask?
    @State private var mergeError: String?

    private var queue:   [WorkTask] { taskList.filter { $0.status == "pending" }.sorted { ($0.priority, $1.createdAt) > ($1.priority, $0.createdAt) } }
    private var working: [Session]  { allSessions.filter { ($0.parentSessionId == nil || $0.parentSessionId!.isEmpty) && ($0.statusEnum == .running || $0.statusEnum == .idle) } }
    private var review:  [Session]  { allSessions.filter { ($0.parentSessionId == nil || $0.parentSessionId!.isEmpty) && ($0.statusEnum == .done || $0.statusEnum == .error) } }

    private var busyIds: Set<String>    { Set(working.map(\.agentId)) }
    private var idleAgents: [Agent]     { agents.filter { !busyIds.contains($0.id) } }

    var body: some View {
        ZStack {
            Color.bg.ignoresSafeArea()
            content
        }
        .navigationTitle(project.name)
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(Color.bg, for: .navigationBar)
        .toolbarColorScheme(.dark, for: .navigationBar)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { showNewTask = true } label: {
                    Image(systemName: "plus")
                        .foregroundStyle(Color.ember)
                }
            }
        }
        .task { await load() }
        .task(id: appState.socket?.refreshTick) {
            guard (appState.socket?.refreshTick ?? 0) > 0 else { return }
            await load()
        }
        .sheet(isPresented: $showNewTask) {
            NewTaskSheet(project: project, idleAgents: idleAgents) { Task { await load() } }
        }
        .sheet(item: $agentPickerTask) { task in
            AgentPickerSheet(task: task, agents: idleAgents) { agentId in
                Task { await assignTask(task, to: agentId) }
            }
        }
        .alert("Delete task?", isPresented: .init(
            get: { confirmDeleteTask != nil },
            set: { if !$0 { confirmDeleteTask = nil } }
        )) {
            Button("Delete", role: .destructive) {
                if let t = confirmDeleteTask { deleteTask(t) }
            }
            Button("Cancel", role: .cancel) { confirmDeleteTask = nil }
        } message: {
            Text(confirmDeleteTask.map { "\"\($0.title)\" will be removed from the queue." } ?? "")
        }
    }

    @ViewBuilder
    private var content: some View {
        if isLoading && allSessions.isEmpty && taskList.isEmpty {
            ProgressView().tint(Color.ember)
        } else {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 28) {
                if !working.isEmpty || !review.isEmpty || !queue.isEmpty {
                    HStack(spacing: 16) {
                        if !working.isEmpty {
                            statChip("\(working.count) working", dotColor: .green, pulse: true)
                        }
                        if !review.isEmpty {
                            statChip("\(review.count) in review", dotColor: Color(hex: "#C8A04B"), pulse: false)
                        }
                        if !queue.isEmpty {
                            statChip("\(queue.count) queued", dotColor: .muted, pulse: false)
                        }
                        Spacer()
                        if !queue.isEmpty && !idleAgents.isEmpty {
                            Button("Run queue") { runQueue() }
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundStyle(Color.ember)
                        }
                    }
                    .padding(.top, 8)
                }

                    boardSection(title: "Queue", count: queue.count, actionTitle: "Add", action: { showNewTask = true }) {
                        if queue.isEmpty {
                            EmptyPanel(text: "Queue is empty - add a task to get started.")
                        } else {
                            VStack(spacing: 0) {
                                ForEach(Array(queue.enumerated()), id: \.element.id) { index, task in
                                    QueueRow(
                                        task: task,
                                        idleAgents: idleAgents,
                                        onAssign: { agentPickerTask = task },
                                        onDelete: { confirmDeleteTask = task }
                                    )
                                    .padding(.horizontal, 14)
                                    .padding(.vertical, 8)
                                    if index < queue.count - 1 { Divider().background(Color.rule) }
                                }
                            }
                            .pilotCard(radius: 12)
                        }
                    }

                    boardSection(title: "Working", count: working.count) {
                        if working.isEmpty {
                            EmptyPanel(text: "No agents running.")
                        } else {
                            VStack(spacing: 0) {
                                ForEach(Array(working.enumerated()), id: \.element.id) { index, session in
                                    NavigationLink(destination: SessionDetailView(session: session)) {
                                        WorkingRow(session: session, agent: agents.first { $0.id == session.agentId }, task: taskList.first { $0.id == session.workTaskId })
                                    }
                                    .buttonStyle(.plain)
                                    .padding(.horizontal, 14)
                                    .padding(.vertical, 8)
                                    if index < working.count - 1 { Divider().background(Color.rule) }
                                }
                            }
                            .pilotCard(radius: 12)
                        }
                    }

                    boardSection(title: "Review", count: review.count) {
                        if review.isEmpty {
                            EmptyPanel(text: "Nothing to review.")
                        } else {
                            VStack(spacing: 0) {
                                ForEach(Array(review.enumerated()), id: \.element.id) { index, session in
                                    ReviewRow(
                                        session: session,
                                        agent: agents.first { $0.id == session.agentId },
                                        task: taskList.first { $0.id == session.workTaskId },
                                        project: project,
                                        reviewerAgents: agents.filter { $0.id != session.agentId },
                                        onMerge: { await mergeSession(session) },
                                        onRequestReview: { agentId in await requestReview(session, agentId: agentId) }
                                    )
                                    .padding(.horizontal, 14)
                                    .padding(.vertical, 8)
                                    if index < review.count - 1 { Divider().background(Color.rule) }
                                }
                            }
                            .pilotCard(radius: 12)
                        }
                    }

                if let err = mergeError {
                    Text(err)
                        .font(.footnote)
                        .foregroundStyle(Color.pilotRed)
                        .padding(14)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .pilotCard(radius: 12, stroke: Color.pilotRed.opacity(0.2))
                }
            }
            .padding(.horizontal, 24)
            .padding(.vertical, 18)
            .refreshable { await load() }
            }
        }
    }

    private func boardSection<Content: View>(
        title: String,
        count: Int,
        actionTitle: String? = nil,
        action: (() -> Void)? = nil,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            PilotSectionHeader(title: title, count: count, actionTitle: actionTitle, action: action)
            content()
        }
    }

    private func statChip(_ text: String, dotColor: Color, pulse: Bool) -> some View {
        HStack(spacing: 5) {
            Circle()
                .fill(dotColor)
                .frame(width: 6, height: 6)
            Text(text)
                .font(.caption2)
                .foregroundStyle(Color.ink2)
        }
    }

    private func load() async {
        guard let client = appState.client else { return }
        isLoading = true
        defer { isLoading = false }
        async let s = client.sessions(projectId: project.id)
        async let a = client.agents()
        async let t = client.tasks(projectId: project.id)
        do { (allSessions, agents, taskList) = try await (s, a, t) } catch {}
    }

    private func assignTask(_ task: WorkTask, to agentId: String) async {
        guard let client = appState.client else { return }
        do {
            _ = try await client.assignTask(task.id, to: agentId)
            await load()
        } catch {}
    }

    private func deleteTask(_ task: WorkTask) {
        guard let client = appState.client else { return }
        confirmDeleteTask = nil
        Task {
            try? await client.deleteTask(task.id)
            await load()
        }
    }

    private func runQueue() {
        guard let client = appState.client else { return }
        Task {
            try? await client.runQueue()
            await load()
        }
    }

    private func mergeSession(_ session: Session) async {
        guard let client = appState.client else { return }
        mergeError = nil
        do {
            try await client.mergeSession(session.id)
            await load()
        } catch {
            mergeError = error.localizedDescription
        }
    }

    private func requestReview(_ session: Session, agentId: String) async {
        guard let client = appState.client else { return }
        do {
            try await client.requestReview(session.id, agentId: agentId)
            await load()
        } catch {}
    }
}

// MARK: - Queue row

private struct QueueRow: View {
    let task: WorkTask
    let idleAgents: [Agent]
    let onAssign: () -> Void
    let onDelete: () -> Void

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Circle()
                .fill(Color.muted.opacity(0.4))
                .frame(width: 7, height: 7)
                .padding(.top, 5)

            VStack(alignment: .leading, spacing: 4) {
                Text(task.title)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(Color.ink)
                if !task.prompt.isEmpty {
                    Text(task.prompt)
                        .font(.caption2)
                        .foregroundStyle(Color.muted)
                        .lineLimit(2)
                }
                if let sz = task.size {
                    Text(sz.uppercased())
                        .font(.system(size: 10, weight: .semibold, design: .monospaced))
                        .foregroundStyle(Color.muted)
                        .padding(.horizontal, 5)
                        .padding(.vertical, 2)
                        .background(Color.panel2, in: Capsule())
                }
            }

            Spacer()

            VStack(spacing: 6) {
                if !idleAgents.isEmpty {
                    Button("Assign") { onAssign() }
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(Color.ember)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 5)
                        .background(Color.ember.opacity(0.1), in: RoundedRectangle(cornerRadius: 6))
                } else {
                    Text("No agents")
                        .font(.system(size: 11))
                        .foregroundStyle(Color.muted)
                }
                Button { onDelete() } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 10, weight: .medium))
                        .foregroundStyle(Color.muted.opacity(0.6))
                }
            }
        }
        .padding(.vertical, 6)
    }
}

// MARK: - Working row

private struct WorkingRow: View {
    let session: Session
    let agent: Agent?
    let task: WorkTask?

    var body: some View {
        HStack(spacing: 10) {
            AgentAvatar(agent: agent, size: 30, running: true)
            VStack(alignment: .leading, spacing: 3) {
                Text(task?.title ?? agent?.name ?? "Session")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(Color.ink)
                HStack(spacing: 6) {
                    if let a = agent {
                        Text(a.name)
                            .font(.caption2)
                            .foregroundStyle(Color.ink2)
                    }
                    if session.statusEnum == .running {
                        ElapsedChip(createdAt: session.createdAt)
                    } else {
                        StatusBadge(status: session.statusEnum)
                    }
                }
            }
            Spacer()
            Image(systemName: "chevron.right")
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(Color.muted)
        }
        .padding(.vertical, 4)
    }
}

// MARK: - Review row

private struct ReviewRow: View {
    let session: Session
    let agent: Agent?
    let task: WorkTask?
    let project: Project
    let reviewerAgents: [Agent]
    let onMerge: () async -> Void
    let onRequestReview: (String) async -> Void

    @State private var showReviewerPicker = false
    @State private var isMerging = false

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                AgentAvatar(agent: agent, size: 30)
                VStack(alignment: .leading, spacing: 3) {
                    Text(task?.title ?? agent?.name ?? "Session")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(Color.ink)
                    HStack(spacing: 6) {
                        if let a = agent {
                            Text(a.name)
                                .font(.caption2)
                                .foregroundStyle(Color.ink2)
                        }
                        verdictBadge
                    }
                }
                Spacer()
                NavigationLink(destination: SessionDetailView(session: session)) {
                    Image(systemName: "arrow.up.right.square")
                        .foregroundStyle(Color.muted)
                }
            }

            HStack(spacing: 8) {
                if session.statusEnum == .done {
                    Button {
                        isMerging = true
                        Task { await onMerge(); isMerging = false }
                    } label: {
                        ZStack {
                            Text(project.workspaceMode == "workspace" ? "Complete ✓" : "Merge ✓")
                                .opacity(isMerging ? 0 : 1)
                            if isMerging { ProgressView().scaleEffect(0.7).tint(.white) }
                        }
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 6)
                        .background(Color.ember)
                        .clipShape(RoundedRectangle(cornerRadius: 6))
                    }
                    .disabled(isMerging)
                }

                if session.reviewVerdict == nil && !reviewerAgents.isEmpty {
                    Button { showReviewerPicker = true } label: {
                        Text("Request Review")
                            .font(.system(size: 12, weight: .medium))
                            .foregroundStyle(Color.ink2)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 6)
                            .background(Color.panel2)
                            .clipShape(RoundedRectangle(cornerRadius: 6))
                            .overlay(RoundedRectangle(cornerRadius: 6).stroke(Color.rule, lineWidth: 1))
                    }
                }
            }
        }
        .padding(.vertical, 6)
        .confirmationDialog("Pick reviewer", isPresented: $showReviewerPicker) {
            ForEach(reviewerAgents) { a in
                Button(a.name) {
                    Task { await onRequestReview(a.id) }
                }
            }
            Button("Cancel", role: .cancel) {}
        }
    }

    @ViewBuilder
    private var verdictBadge: some View {
        switch session.reviewVerdict {
        case "approved":
            Label("Approved", systemImage: "checkmark.circle.fill")
                .font(.caption2)
                .foregroundStyle(Color.green)
        case "changes_requested":
            Label("Changes needed", systemImage: "exclamationmark.circle.fill")
                .font(.caption2)
                .foregroundStyle(Color(hex: "#C8A04B"))
        case "pending":
            Text("Reviewing…")
                .font(.caption2)
                .foregroundStyle(Color.muted)
        default:
            StatusBadge(status: session.statusEnum)
        }
    }
}

// MARK: - Agent picker sheet

private struct AgentPickerSheet: View {
    let task: WorkTask
    let agents: [Agent]
    let onPick: (String) async -> Void

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ZStack {
            Color.bg.ignoresSafeArea()
            VStack(spacing: 0) {
                HStack {
                    Text("Assign to agent")
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundStyle(Color.ink)
                    Spacer()
                    Button("Cancel") { dismiss() }
                        .foregroundStyle(Color.ink2)
                }
                .padding(.horizontal, 20)
                .padding(.vertical, 16)

                Divider().background(Color.rule)

                Text(task.title)
                    .font(.system(size: 13))
                    .foregroundStyle(Color.muted)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 20)
                    .padding(.top, 14)
                    .padding(.bottom, 10)

                List(agents) { agent in
                    Button {
                        dismiss()
                        Task { await onPick(agent.id) }
                    } label: {
                        HStack(spacing: 12) {
                            AgentAvatar(agent: agent, size: 32)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(agent.name)
                                    .font(.system(size: 15, weight: .medium))
                                    .foregroundStyle(Color.ink)
                                Text(agent.provider)
                                    .font(.caption2)
                                    .foregroundStyle(Color.muted)
                            }
                        }
                        .padding(.vertical, 4)
                    }
                    .listRowBackground(Color.panel)
                    .listRowSeparatorTint(Color.rule)
                }
                .listStyle(.plain)
                .scrollContentBackground(.hidden)
            }
        }
    }
}

// MARK: - Elapsed chip

struct ElapsedChip: View {
    let createdAt: String
    @State private var secs: Int = 0
    private let timer = Timer.publish(every: 1, on: .main, in: .common).autoconnect()

    var body: some View {
        Text(fmtSecs(secs))
            .font(.system(size: 11, design: .monospaced))
            .foregroundStyle(Color.green)
            .onReceive(timer) { _ in
                secs = elapsedSeconds(from: createdAt)
            }
            .onAppear { secs = elapsedSeconds(from: createdAt) }
    }

    private func elapsedSeconds(from iso: String) -> Int {
        let fmt = ISO8601DateFormatter()
        fmt.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let date = fmt.date(from: iso) ?? ISO8601DateFormatter().date(from: iso) ?? Date()
        return max(0, Int(Date().timeIntervalSince(date)))
    }

    private func fmtSecs(_ s: Int) -> String {
        let m = s / 60; let sec = s % 60
        return m > 0 ? "\(m)m \(String(format: "%02d", sec))s" : "\(sec)s"
    }
}

// MARK: - Session extension for board filtering

private extension Session {
    var specId: String? { nil } // sessions don't expose specId in our model yet
}
