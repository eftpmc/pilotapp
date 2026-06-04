import SwiftUI

struct TodayView: View {
    @Environment(AppState.self) private var appState

    @State private var sessions: [Session] = []
    @State private var agents: [Agent] = []
    @State private var projects: [Project] = []
    @State private var taskList: [WorkTask] = []
    @State private var events: [ActivityEvent] = []
    @State private var isLoading = false

    private var running:    [Session] { sessions.filter { $0.statusEnum == .running && $0.parentSessionId == nil } }
    private var review:     [Session] { sessions.filter { ($0.statusEnum == .done || $0.statusEnum == .error) && $0.parentSessionId == nil } }
    private var recentWork: [Session] {
        guard running.isEmpty && review.isEmpty else { return [] }
        return sessions
            .filter { $0.statusEnum == .merged && $0.parentSessionId == nil }
            .sorted { $0.createdAt > $1.createdAt }
            .prefix(5)
            .map { $0 }
    }

    private var todayCost: Double {
        sessions.reduce(0) { sum, s in
            guard let cost = s.totalCostUsd else { return sum }
            let iso = ISO8601DateFormatter()
            iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            guard let date = iso.date(from: s.createdAt) ?? ISO8601DateFormatter().date(from: s.createdAt) else { return sum }
            return Date().timeIntervalSince(date) < 86_400 ? sum + cost : sum
        }
    }

    private var subtitle: String {
        var parts: [String] = []
        if !running.isEmpty  { parts.append("\(running.count) working") }
        if !review.isEmpty   { parts.append("\(review.count) to review") }
        if todayCost > 0.001 { parts.append(String(format: "$%.2f today", todayCost)) }
        if parts.isEmpty && !recentWork.isEmpty { return "\(recentWork.count) recent sessions" }
        return parts.isEmpty ? "Nothing running yet." : parts.joined(separator: " · ")
    }

    var body: some View {
        NavigationStack {
            ZStack {
                Color.bg.ignoresSafeArea()
                if isLoading && sessions.isEmpty {
                    ProgressView().tint(Color.ember)
                } else {
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: 28) {
                            // Subtitle
                            Text(subtitle)
                                .font(.system(size: 14))
                                .foregroundStyle(Color.muted)
                                .padding(.horizontal, 20)
                                .padding(.top, 4)

                            // Onboarding
                            if projects.isEmpty && running.isEmpty && review.isEmpty {
                                onboardingSection
                            }

                            // Needs review
                            if !review.isEmpty {
                                sessionSection(
                                    title: "Needs review",
                                    count: review.count,
                                    sessions: review,
                                    accentColor: Color(hex: "#C8A04B")
                                )
                            }

                            // In progress
                            if !running.isEmpty {
                                sessionSection(
                                    title: "In progress",
                                    count: running.count,
                                    sessions: running,
                                    accentColor: .green
                                )
                            }

                            // Recent work
                            if !recentWork.isEmpty {
                                sessionSection(
                                    title: "Recent work",
                                    count: nil,
                                    sessions: recentWork,
                                    accentColor: .muted
                                )
                            }

                            // Activity feed
                            if !events.isEmpty {
                                activitySection
                            }
                        }
                        .padding(.bottom, 32)
                    }
                    .refreshable { await load() }
                }
            }
            .navigationTitle("Today")
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

    // MARK: - Sections

    private func sessionSection(title: String, count: Int?, sessions: [Session], accentColor: Color) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 6) {
                Text(title)
                    .font(.label)
                    .foregroundStyle(Color.muted)
                if let count {
                    Text("\(count)")
                        .font(.caption2)
                        .foregroundStyle(Color.muted)
                        .padding(.horizontal, 5)
                        .padding(.vertical, 1)
                        .background(Color.panel2, in: Capsule())
                }
            }
            .padding(.horizontal, 20)

            VStack(spacing: 8) {
                ForEach(sessions) { session in
                    NavigationLink(destination: SessionDetailView(session: session)) {
                        SessionCard(
                            session: session,
                            agent: agents.first { $0.id == session.agentId },
                            project: projects.first { $0.id == session.projectId },
                            task: taskList.first { $0.id == session.workTaskId },
                            accentColor: accentColor
                        )
                    }
                    .buttonStyle(.plain)
                    .padding(.horizontal, 16)
                }
            }
        }
    }

    private var activitySection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Activity")
                .font(.label)
                .foregroundStyle(Color.muted)
                .padding(.horizontal, 20)

            VStack(spacing: 0) {
                ForEach(events.prefix(12)) { event in
                    ActivityRow(event: event)
                }
            }
            .background(Color.panel, in: RoundedRectangle(cornerRadius: 12))
            .padding(.horizontal, 16)
        }
    }

    private var onboardingSection: some View {
        VStack(spacing: 8) {
            ForEach(onboardingSteps, id: \.title) { step in
                HStack(spacing: 14) {
                    Text(step.number)
                        .font(.system(size: 11, weight: .bold))
                        .foregroundStyle(Color.ember)
                        .frame(width: 22, height: 22)
                        .background(Color.ember.opacity(0.12), in: RoundedRectangle(cornerRadius: 6))
                    VStack(alignment: .leading, spacing: 2) {
                        Text(step.title)
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(Color.ink)
                        Text(step.desc)
                            .font(.caption2)
                            .foregroundStyle(Color.muted)
                    }
                    Spacer()
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 12)
                .background(Color.panel, in: RoundedRectangle(cornerRadius: 10))
                .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.rule, lineWidth: 1))
                .padding(.horizontal, 16)
            }
        }
    }

    private let onboardingSteps = [
        (number: "1", title: "Add a project",  desc: "Connect a GitHub repo or local path in the web UI."),
        (number: "2", title: "Add agents",     desc: "Configure API keys and create named agents."),
        (number: "3", title: "Dispatch work",  desc: "Open a project, create tasks, assign to agents."),
    ]

    // MARK: - Load

    private func load() async {
        guard let client = appState.client else { return }
        isLoading = true
        defer { isLoading = false }
        async let s  = client.sessions()
        async let a  = client.agents()
        async let p  = client.projects()
        async let ev = client.events()
        do {
            (sessions, agents, projects, events) = try await (s, a, p, ev)
            taskList = (try? await client.tasks(projectId: "")) ?? []
        } catch {}
    }
}

// MARK: - Session card

private struct SessionCard: View {
    let session: Session
    let agent: Agent?
    let project: Project?
    let task: WorkTask?
    let accentColor: Color

    var body: some View {
        HStack(spacing: 12) {
            AgentAvatar(agent: agent, size: 38, running: session.statusEnum == .running)

            VStack(alignment: .leading, spacing: 4) {
                Text(task?.title ?? (session.shortBranch.isEmpty ? String(session.id.prefix(8)) : session.shortBranch))
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(Color.ink)
                    .lineLimit(1)
                HStack(spacing: 6) {
                    if let name = agent?.name {
                        Text(name)
                            .font(.caption2)
                            .foregroundStyle(Color.ink2)
                    }
                    if let proj = project {
                        Text("·")
                            .font(.caption2)
                            .foregroundStyle(Color.muted)
                        Text(proj.name)
                            .font(.caption2)
                            .foregroundStyle(Color.muted)
                    }
                }
            }

            Spacer()

            if session.statusEnum == .running {
                ElapsedChip(createdAt: session.createdAt)
            } else if session.statusEnum == .done || session.statusEnum == .error {
                StatusBadge(status: session.statusEnum)
            } else {
                Text(relativeTime(session.createdAt))
                    .font(.caption2)
                    .foregroundStyle(Color.muted)
            }

            Image(systemName: "arrow.right")
                .font(.system(size: 11, weight: .medium))
                .foregroundStyle(Color.muted.opacity(0.4))
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .background(Color.panel, in: RoundedRectangle(cornerRadius: 12))
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(
                    session.statusEnum == .done ? Color(hex: "#C8A04B").opacity(0.25) :
                    session.statusEnum == .error ? Color.pilotRed.opacity(0.2) :
                    Color.rule,
                    lineWidth: 1
                )
        )
    }

    private func relativeTime(_ iso: String) -> String {
        let fmt = ISO8601DateFormatter()
        fmt.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard let date = fmt.date(from: iso) ?? ISO8601DateFormatter().date(from: iso) else { return "" }
        let d = Date().timeIntervalSince(date)
        if d < 60    { return "just now" }
        if d < 3600  { return "\(Int(d/60))m ago" }
        if d < 86400 { return "\(Int(d/3600))h ago" }
        return "\(Int(d/86400))d ago"
    }
}

// MARK: - Activity row

private struct ActivityRow: View {
    let event: ActivityEvent

    private static let verbs: [String: (String, Color)] = [
        "session.started":   ("started",  Color(hex: "#7a7770")),
        "session.completed": ("finished", Color(hex: "#3d9970")),
        "session.failed":    ("failed",   Color(hex: "#c93b2a")),
        "session.merged":    ("merged",   Color(hex: "#ff6b35")),
    ]

    var body: some View {
        HStack(spacing: 10) {
            Text(event.data.employeeName ?? "—")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(Color.ink)
                .frame(width: 56, alignment: .leading)
                .lineLimit(1)

            let (verb, color) = Self.verbs[event.type] ?? ("updated", Color.muted)
            Text(verb)
                .font(.system(size: 12))
                .foregroundStyle(color)
                .frame(width: 52, alignment: .leading)

            Text(event.data.taskTitle ?? "")
                .font(.system(size: 12))
                .foregroundStyle(Color.muted)
                .lineLimit(1)
                .frame(maxWidth: .infinity, alignment: .leading)

            Text(relativeTime(event.createdAt))
                .font(.system(size: 11, design: .monospaced))
                .foregroundStyle(Color.muted.opacity(0.5))
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 9)
        .overlay(alignment: .bottom) {
            Divider().background(Color.rule).padding(.leading, 14)
        }
    }

    private func relativeTime(_ iso: String) -> String {
        let fmt = ISO8601DateFormatter()
        fmt.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard let date = fmt.date(from: iso) ?? ISO8601DateFormatter().date(from: iso) else { return "" }
        let d = Date().timeIntervalSince(date)
        if d < 60    { return "\(Int(d))s" }
        if d < 3600  { return "\(Int(d/60))m" }
        if d < 86400 { return "\(Int(d/3600))h" }
        return "\(Int(d/86400))d"
    }
}
