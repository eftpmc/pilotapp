import SwiftUI

struct ProjectsView: View {
    @StateObject private var vm = ProjectsViewModel()
    @StateObject private var github = GitHubService()
    @State private var showingCreate = false
    @State private var showingRepoPicker = false
    @State private var newName = ""

    var body: some View {
        NavigationStack {
            ZStack {
                Theme.bg.ignoresSafeArea()

                Group {
                    if vm.isLoading && vm.projects.isEmpty {
                        ProgressView().tint(Theme.green)
                    } else if vm.projects.isEmpty {
                        emptyState
                    } else {
                        projectList
                    }
                }
            }
            .navigationTitle("Projects")
            .toolbarBackground(Theme.bg, for: .navigationBar)
            .toolbarColorScheme(.dark, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Menu {
                        Button {
                            showingCreate = true
                        } label: {
                            Label("New Empty Project", systemImage: "folder.badge.plus")
                        }
                        if github.isConnected {
                            Button {
                                showingRepoPicker = true
                            } label: {
                                Label("Import from GitHub", systemImage: "arrow.down.circle")
                            }
                        }
                    } label: {
                        Image(systemName: "plus")
                            .fontWeight(.semibold)
                            .foregroundStyle(Theme.green)
                    }
                }
            }
            .alert("New Project", isPresented: $showingCreate) {
                TextField("Name", text: $newName)
                Button("Create") {
                    Task { await vm.create(name: newName); newName = "" }
                }
                Button("Cancel", role: .cancel) { newName = "" }
            }
            .sheet(isPresented: $showingRepoPicker) {
                GitHubRepoPickerView(github: github) { repo in
                    Task {
                        await vm.create(
                            name: repo.name,
                            githubCloneUrl: repo.cloneUrl,
                            githubToken: github.token
                        )
                    }
                }
            }
            .task {
                await vm.load()
                await github.checkStatus()
            }
            .refreshable { await vm.load() }
        }
    }

    private var projectList: some View {
        ScrollView {
            LazyVStack(spacing: 10) {
                ForEach(vm.projects) { project in
                    NavigationLink(destination: ProjectDetailView(project: project)) {
                        ProjectRow(project: project)
                    }
                    .buttonStyle(.plain)
                    .contextMenu {
                        Button(role: .destructive) {
                            Task { await vm.delete(project) }
                        } label: {
                            Label("Delete", systemImage: "trash")
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
                Image(systemName: "folder")
                    .font(.system(size: 28))
                    .foregroundStyle(Theme.muted)
            }
            VStack(spacing: 6) {
                Text("No projects yet")
                    .font(.system(.headline, weight: .semibold))
                    .foregroundStyle(.white)
                Text("Projects give agents a git repo to work in")
                    .font(.subheadline)
                    .foregroundStyle(Theme.muted)
                    .multilineTextAlignment(.center)
            }
            HStack(spacing: 12) {
                Button("New Project") { showingCreate = true }
                    .font(.system(.subheadline, weight: .semibold))
                    .foregroundStyle(.black)
                    .padding(.horizontal, 20)
                    .padding(.vertical, 12)
                    .background(Theme.green)
                    .clipShape(RoundedRectangle(cornerRadius: 12))

                if github.isConnected {
                    Button("From GitHub") { showingRepoPicker = true }
                        .font(.system(.subheadline, weight: .semibold))
                        .foregroundStyle(Theme.green)
                        .padding(.horizontal, 20)
                        .padding(.vertical, 12)
                        .background(Theme.green.opacity(0.12))
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                        .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(Theme.green.opacity(0.3), lineWidth: 0.5))
                }
            }
        }
        .padding(40)
    }
}

private struct ProjectRow: View {
    let project: Project

    var body: some View {
        HStack(spacing: 14) {
            ZStack {
                RoundedRectangle(cornerRadius: 10)
                    .fill(Theme.surface)
                    .frame(width: 44, height: 44)
                Image(systemName: "folder.fill")
                    .font(.system(size: 18))
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
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(Theme.border)
        }
        .pilotCard()
    }
}
