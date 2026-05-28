import SwiftUI

struct SetupView: View {
    @EnvironmentObject var vm: WorkViewModel
    @StateObject private var github = GitHubService()
    @State private var showingNewAgent = false
    @State private var showingCreateProject = false
    @State private var showingRepoPicker = false
    @State private var newProjectName = ""
    @State private var newProjectRole: ProjectRole = .any

    var body: some View {
        NavigationStack {
            ZStack {
                Theme.bg.ignoresSafeArea()
                ScrollView {
                    VStack(spacing: 28) {
                        agentsSection
                        projectsSection
                    }
                    .padding(.horizontal, 20)
                    .padding(.vertical, 20)
                }
            }
            .navigationTitle("Setup")
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
            }
            .sheet(isPresented: $showingNewAgent) {
                NewAgentView { name, provider in
                    Task { await vm.createAgent(name: name, provider: provider) }
                }
            }
            .sheet(isPresented: $showingRepoPicker) {
                GitHubRepoPickerView(github: github) { repo in
                    Task {
                        await createProject(
                            name: repo.name,
                            githubCloneUrl: repo.cloneUrl,
                            githubToken: github.token
                        )
                    }
                }
            }
            .sheet(isPresented: $showingCreateProject) {
                NewProjectView(name: $newProjectName, role: $newProjectRole) {
                    Task {
                        await createProject(name: newProjectName, role: newProjectRole)
                        newProjectName = ""
                        newProjectRole = .any
                    }
                }
            }
            .task { await github.checkStatus() }
            .refreshable { await vm.load() }
        }
    }

    // MARK: - Agents

    private var agentsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Agents")
                    .sectionLabel()
                Spacer()
                Button {
                    showingNewAgent = true
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "plus")
                            .font(.system(size: 11, weight: .bold))
                        Text("Hire")
                            .font(.system(.caption, weight: .semibold))
                    }
                    .foregroundStyle(Theme.green)
                    .padding(.horizontal, 10).padding(.vertical, 5)
                    .background(Theme.green.opacity(0.1))
                    .clipShape(Capsule())
                    .overlay(Capsule().strokeBorder(Theme.green.opacity(0.3), lineWidth: 0.5))
                }
            }
            .padding(.horizontal, 4)

            if vm.agents.isEmpty {
                emptyCard(
                    icon: "cpu",
                    title: "No agents yet",
                    message: "Hire an agent to start dispatching tasks"
                )
            } else {
                ForEach(vm.agents) { agent in
                    NavigationLink(destination: AgentDetailView(agent: agent).environmentObject(vm)) {
                        AgentSetupRow(agent: agent)
                    }
                    .buttonStyle(.plain)
                    .contextMenu {
                        Button(role: .destructive) {
                            Task { await vm.deleteAgent(agent) }
                        } label: {
                            Label("Remove", systemImage: "trash")
                        }
                    }
                    .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                        Button(role: .destructive) {
                            Task { await vm.deleteAgent(agent) }
                        } label: {
                            Label("Remove", systemImage: "trash")
                        }
                    }
                }
            }
        }
    }

    // MARK: - Projects

    private var projectsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Projects")
                    .sectionLabel()
                Spacer()
                Menu {
                    Button {
                        showingCreateProject = true
                    } label: {
                        Label("Empty Project", systemImage: "folder.badge.plus")
                    }
                    if github.isConnected {
                        Button {
                            showingRepoPicker = true
                        } label: {
                            Label("Import from GitHub", systemImage: "arrow.down.circle")
                        }
                    }
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "plus")
                            .font(.system(size: 11, weight: .bold))
                        Text("Add")
                            .font(.system(.caption, weight: .semibold))
                    }
                    .foregroundStyle(Theme.green)
                    .padding(.horizontal, 10).padding(.vertical, 5)
                    .background(Theme.green.opacity(0.1))
                    .clipShape(Capsule())
                    .overlay(Capsule().strokeBorder(Theme.green.opacity(0.3), lineWidth: 0.5))
                }
            }
            .padding(.horizontal, 4)

            if vm.projects.isEmpty {
                emptyCard(
                    icon: "folder",
                    title: "No projects yet",
                    message: "Projects give agents a git repo to work in"
                )
            } else {
                ForEach(vm.projects) { project in
                    NavigationLink(destination: ProjectDetailView(project: project)) {
                        ProjectSetupRow(project: project)
                    }
                    .buttonStyle(.plain)
                    .contextMenu {
                        Button(role: .destructive) {
                            Task { await deleteProject(project) }
                        } label: {
                            Label("Delete", systemImage: "trash")
                        }
                    }
                    .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                        Button(role: .destructive) {
                            Task { await deleteProject(project) }
                        } label: {
                            Label("Remove", systemImage: "trash")
                        }
                    }
                }
            }
        }
    }

    // MARK: - Helpers

    private func emptyCard(icon: String, title: String, message: String) -> some View {
        HStack(spacing: 14) {
            Image(systemName: icon)
                .font(.system(size: 18))
                .foregroundStyle(Theme.muted)
                .frame(width: 36)
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.system(.subheadline, weight: .semibold))
                    .foregroundStyle(Theme.muted)
                Text(message)
                    .font(.caption)
                    .foregroundStyle(Theme.muted.opacity(0.7))
            }
            Spacer()
        }
        .pilotCard()
    }

    private func createProject(name: String, role: ProjectRole = .any, githubCloneUrl: String? = nil, githubToken: String? = nil) async {
        do {
            let project = try await APIClient.shared.createProject(
                name: name,
                role: role,
                githubCloneUrl: githubCloneUrl,
                githubToken: githubToken
            )
            vm.projects.append(project)
        } catch {
            vm.error = error.localizedDescription
        }
    }

    private func deleteProject(_ project: Project) async {
        do {
            try await APIClient.shared.deleteProject(id: project.id)
            vm.projects.removeAll { $0.id == project.id }
            vm.runs.removeAll { $0.projectId == project.id }
        } catch {
            vm.error = error.localizedDescription
        }
    }
}

private struct AgentSetupRow: View {
    let agent: Agent

    var body: some View {
        HStack(spacing: 14) {
            ZStack {
                RoundedRectangle(cornerRadius: 10)
                    .fill(agent.provider.color.opacity(0.12))
                    .frame(width: 40, height: 40)
                Image(systemName: agent.provider.icon)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(agent.provider.color)
            }
            VStack(alignment: .leading, spacing: 3) {
                Text(agent.name)
                    .font(.system(.subheadline, weight: .semibold))
                    .foregroundStyle(.white)
                Text(agent.provider.rawValue.capitalized)
                    .font(.caption).foregroundStyle(Theme.muted)
            }
            Spacer()
            Image(systemName: "chevron.right")
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(Theme.border)
        }
        .pilotCard()
    }
}

private struct ProjectSetupRow: View {
    let project: Project

    var body: some View {
        HStack(spacing: 14) {
            ZStack {
                RoundedRectangle(cornerRadius: 10)
                    .fill(Theme.surface)
                    .frame(width: 40, height: 40)
                Image(systemName: "folder.fill")
                    .font(.system(size: 15))
                    .foregroundStyle(Theme.muted)
            }
            VStack(alignment: .leading, spacing: 3) {
                Text(project.name)
                    .font(.system(.subheadline, weight: .semibold))
                    .foregroundStyle(.white)
                Text(project.createdAt.prefix(10))
                    .font(.system(.caption2, design: .monospaced))
                    .foregroundStyle(Theme.muted)
            }
            Spacer()
            Image(systemName: "chevron.right")
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(Theme.border)
        }
        .pilotCard()
    }
}
