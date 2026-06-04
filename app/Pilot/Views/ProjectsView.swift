import SwiftUI

struct ProjectsView: View {
    @Environment(AppState.self) private var appState
    @State private var projects: [Project] = []
    @State private var sessions: [Session] = []
    @State private var isLoading = false

    private let columns = [
        GridItem(.adaptive(minimum: 320, maximum: 420), spacing: 12, alignment: .top)
    ]

    struct ProjectActivity {
        let running: Int
        let review: Int
        let queued: Int
        let lastActive: String?
    }

    private func activity(for project: Project) -> ProjectActivity {
        let ps = sessions.filter { $0.projectId == project.id }
        let all = ps.sorted { $0.createdAt > $1.createdAt }
        return ProjectActivity(
            running: ps.filter { $0.statusEnum == .running }.count,
            review:  ps.filter { $0.statusEnum == .done || $0.statusEnum == .error }.count,
            queued:  0,
            lastActive: all.first?.createdAt
        )
    }

    var body: some View {
        ZStack {
            Color.bg.ignoresSafeArea()

            if isLoading && projects.isEmpty {
                ProgressView().tint(Color.ember)
            } else if projects.isEmpty {
                emptyState
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("\(projects.count) project\(projects.count == 1 ? "" : "s")")
                            .font(.system(size: 14))
                            .foregroundStyle(Color.muted)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 24)
                    .padding(.top, 4)
                    .padding(.bottom, 20)

                    LazyVGrid(columns: columns, alignment: .leading, spacing: 12) {
                        ForEach(projects) { project in
                            let a = activity(for: project)
                            NavigationLink(destination: ProjectDetailView(project: project)) {
                                ProjectCard(project: project, activity: a)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(.horizontal, 24)
                    .padding(.bottom, 32)
                }
                .refreshable { await load() }
            }
        }
        .navigationTitle("Projects")
        .navigationBarTitleDisplayMode(.large)
        .toolbarBackground(Color.bg, for: .navigationBar)
        .toolbarColorScheme(.dark, for: .navigationBar)
        .task { await load() }
        .task(id: appState.socket?.refreshTick) {
            guard (appState.socket?.refreshTick ?? 0) > 0 else { return }
            await load()
        }
    }

    private var emptyState: some View {
        VStack(spacing: 12) {
            Image(systemName: "folder.badge.plus")
                .font(.system(size: 40))
                .foregroundStyle(Color.muted)
            Text("No projects yet")
                .font(.footnote)
                .foregroundStyle(Color.muted)
            Text("Create a project in the web UI to get started.")
                .font(.caption2)
                .foregroundStyle(Color.muted.opacity(0.6))
                .multilineTextAlignment(.center)
        }
        .padding(40)
    }

    private func load() async {
        guard let client = appState.client else { return }
        isLoading = true
        defer { isLoading = false }
        async let p = client.projects()
        async let s = client.sessions()
        do { (projects, sessions) = try await (p, s) } catch {}
    }
}

private struct ProjectCard: View {
    let project: Project
    let activity: ProjectsView.ProjectActivity

    private var statusColor: Color {
        if activity.running > 0 { return .green }
        if activity.review > 0  { return Color(hex: "#C8A04B") }
        return .clear
    }

    private var statusText: String {
        if activity.running > 0 { return "\(activity.running) running" }
        if activity.review > 0  { return "\(activity.review) to review" }
        return "Idle"
    }

    private var statusTextColor: Color {
        if activity.running > 0 { return .green }
        if activity.review > 0  { return Color(hex: "#C8A04B") }
        return .muted
    }

    private var isActive: Bool { activity.running > 0 || activity.review > 0 }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(project.name)
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundStyle(Color.ink)
                    Text(repoLabel)
                        .font(.caption2)
                        .foregroundStyle(Color.muted)
                }
                Spacer()
                if isActive {
                    Circle()
                        .fill(statusColor)
                        .frame(width: 8, height: 8)
                        .padding(.top, 4)
                }
            }

            // Lane visualization — 3 thin bars like the web
            HStack(spacing: 3) {
                ForEach(0..<3, id: \.self) { i in
                    RoundedRectangle(cornerRadius: 2)
                        .fill(laneColor(i))
                        .frame(maxWidth: .infinity)
                        .frame(height: 3)
                }
            }

            HStack {
                HStack(spacing: 4) {
                    if isActive && activity.running > 0 {
                        Circle().fill(statusColor).frame(width: 6, height: 6)
                    }
                    Text(statusText)
                        .font(.system(size: 13))
                        .foregroundStyle(statusTextColor)
                }
                Spacer()
                HStack(spacing: 8) {
                    let total = activity.running + activity.review
                    if total > 0 {
                        Text("\(total) active item\(total == 1 ? "" : "s")")
                            .font(.caption2)
                            .foregroundStyle(Color.muted)
                    }
                    if let last = activity.lastActive {
                        Text(relativeTime(last))
                            .font(.caption2)
                            .foregroundStyle(Color.muted)
                    }
                }
            }
        }
        .padding(20)
        .frame(maxWidth: .infinity, minHeight: 148, alignment: .topLeading)
        .pilotCard(
            radius: 12,
            stroke: activity.review > 0 ? Color(hex: "#C8A04B").opacity(0.24) :
                activity.running > 0 ? Color.green.opacity(0.18) :
                Color.rule
        )
    }

    private func laneColor(_ index: Int) -> Color {
        switch index {
        case 0: return activity.review > 0 ? Color(hex: "#C8A04B") : Color.panel2
        case 1: return activity.running > 0 ? Color.green.opacity(0.5) : Color.panel2
        default: return Color.panel2
        }
    }

    private var repoLabel: String {
        if let remote = project.remoteUrl {
            return remote
                .replacingOccurrences(of: "https://github.com/", with: "")
                .replacingOccurrences(of: ".git", with: "")
        }
        if let local = project.localPath { return "local · \(URL(fileURLWithPath: local).lastPathComponent)" }
        return "local repo"
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
