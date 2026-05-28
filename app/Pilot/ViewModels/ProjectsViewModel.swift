import Foundation

@MainActor
final class ProjectsViewModel: ObservableObject {
    @Published var projects: [Project] = []
    @Published var isLoading = false
    @Published var error: String?

    func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            projects = try await APIClient.shared.fetchProjects()
        } catch {
            self.error = error.localizedDescription
        }
    }

    func create(name: String, githubCloneUrl: String? = nil, githubToken: String? = nil) async {
        do {
            let project = try await APIClient.shared.createProject(
                name: name,
                githubCloneUrl: githubCloneUrl,
                githubToken: githubToken
            )
            projects.append(project)
        } catch {
            self.error = error.localizedDescription
        }
    }

    func delete(_ project: Project) async {
        do {
            try await APIClient.shared.deleteProject(id: project.id)
            projects.removeAll { $0.id == project.id }
        } catch {
            self.error = error.localizedDescription
        }
    }
}
