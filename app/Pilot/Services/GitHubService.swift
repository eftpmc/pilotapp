import Foundation

struct GitHubRepo: Codable, Identifiable, Hashable {
    let id: Int
    let name: String
    let fullName: String
    let `private`: Bool
    let description: String?
    let pushedAt: String
    let cloneUrl: String
    let defaultBranch: String
}

@MainActor
final class GitHubService: ObservableObject {
    @Published var repos: [GitHubRepo] = []
    @Published var isLoading = false
    @Published var error: String?

    var isConnected: Bool { token != nil }

    var token: String? {
        get { KeychainService.load(for: "githubPAT") }
    }

    func save(token: String) {
        KeychainService.save(token, for: "githubPAT")
        repos = []
        error = nil
        Task { await loadRepos() }
    }

    func disconnect() {
        KeychainService.delete(for: "githubPAT")
        repos = []
    }

    func checkStatus() async {
        await loadRepos()
    }

    func loadRepos() async {
        guard let token else { return }
        isLoading = true
        defer { isLoading = false }

        var req = URLRequest(url: URL(string: "https://api.github.com/user/repos?sort=pushed&per_page=100&affiliation=owner,collaborator")!)
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        req.setValue("application/vnd.github+json", forHTTPHeaderField: "Accept")

        guard let (data, _) = try? await URLSession.shared.data(for: req) else {
            error = "Could not reach GitHub"
            return
        }

        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        if let list = try? decoder.decode([GitHubRepo].self, from: data) {
            repos = list
        } else {
            error = "Invalid token or GitHub API error"
        }
    }
}
