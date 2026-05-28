import SwiftUI

struct GitHubRepoPickerView: View {
    @ObservedObject var github: GitHubService
    @Environment(\.dismiss) private var dismiss
    var onPick: (GitHubRepo) -> Void

    @State private var search = ""

    var filtered: [GitHubRepo] {
        guard !search.isEmpty else { return github.repos }
        return github.repos.filter {
            $0.fullName.localizedCaseInsensitiveContains(search) ||
            ($0.description ?? "").localizedCaseInsensitiveContains(search)
        }
    }

    var body: some View {
        NavigationStack {
            ZStack {
                Theme.bg.ignoresSafeArea()

                Group {
                    if github.isLoading {
                        VStack(spacing: 12) {
                            ProgressView().tint(Theme.green)
                            Text("Loading repos…")
                                .font(.subheadline)
                                .foregroundStyle(Theme.muted)
                        }
                    } else if github.repos.isEmpty {
                        VStack(spacing: 12) {
                            Image(systemName: "tray")
                                .font(.system(size: 40))
                                .foregroundStyle(Theme.muted)
                            Text("No repositories found")
                                .font(.headline)
                                .foregroundStyle(.white)
                            Text("Make sure your token has the repo scope.")
                                .font(.subheadline)
                                .foregroundStyle(Theme.muted)
                        }
                    } else {
                        ScrollView {
                            LazyVStack(spacing: 8) {
                                ForEach(filtered) { repo in
                                    Button {
                                        onPick(repo)
                                        dismiss()
                                    } label: {
                                        RepoCard(repo: repo)
                                    }
                                }
                            }
                            .padding(.horizontal, 20)
                            .padding(.vertical, 12)
                        }
                        .searchable(text: $search, prompt: "Search repos")
                    }
                }
            }
            .navigationTitle("Choose Repository")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(Theme.card, for: .navigationBar)
            .toolbarColorScheme(.dark, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                        .foregroundStyle(Theme.muted)
                }
            }
            .task {
                if github.repos.isEmpty { await github.loadRepos() }
            }
        }
    }
}

private struct RepoCard: View {
    let repo: GitHubRepo

    var body: some View {
        HStack(spacing: 14) {
            ZStack {
                RoundedRectangle(cornerRadius: 10)
                    .fill(Theme.surface)
                    .frame(width: 40, height: 40)
                Image(systemName: repo.private ? "lock.fill" : "chevron.left.forwardslash.chevron.right")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(repo.private ? Theme.claude : Theme.muted)
            }

            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Text(repo.fullName)
                        .font(.system(.subheadline, weight: .semibold))
                        .foregroundStyle(.white)
                        .lineLimit(1)
                    if repo.private {
                        Text("private")
                            .font(.system(.caption2, weight: .medium))
                            .foregroundStyle(Theme.claude)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Theme.claude.opacity(0.12))
                            .clipShape(Capsule())
                    }
                }
                if let desc = repo.description, !desc.isEmpty {
                    Text(desc)
                        .font(.caption)
                        .foregroundStyle(Theme.muted)
                        .lineLimit(1)
                }
                Text(repo.pushedAt.prefix(10))
                    .font(.system(.caption2, design: .monospaced))
                    .foregroundStyle(Theme.muted.opacity(0.7))
            }

            Spacer()

            Image(systemName: "chevron.right")
                .font(.caption.weight(.semibold))
                .foregroundStyle(Theme.border)
        }
        .pilotCard(padding: 12)
    }
}
