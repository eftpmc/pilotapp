import Foundation

enum APIError: LocalizedError {
    case badURL, httpError(Int), decodingError, unauthorized

    var errorDescription: String? {
        switch self {
        case .badURL: return "Invalid server URL"
        case .httpError(let code): return "Server error (\(code))"
        case .decodingError: return "Unexpected response format"
        case .unauthorized: return "Invalid credentials"
        }
    }
}

@MainActor
final class APIClient: ObservableObject {
    static let shared = APIClient()

    private var baseURL: String {
        KeychainService.load(for: "serverURL") ?? ""
    }

    private var token: String? {
        KeychainService.load(for: "authToken")
    }

    private func request<T: Decodable>(
        _ path: String,
        method: String = "GET",
        body: Encodable? = nil
    ) async throws -> T {
        guard let url = URL(string: baseURL + path) else { throw APIError.badURL }

        var req = URLRequest(url: url)
        req.httpMethod = method
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")

        if let token {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        if let body {
            req.httpBody = try JSONEncoder().encode(body)
        }

        let (data, response) = try await URLSession.shared.data(for: req)
        guard let http = response as? HTTPURLResponse else { throw APIError.badURL }

        if http.statusCode == 401 { throw APIError.unauthorized }
        guard (200..<300).contains(http.statusCode) else { throw APIError.httpError(http.statusCode) }

        // 204 No Content and other empty bodies — substitute `{}` so EmptyResponse decodes cleanly
        let decodeData = data.isEmpty ? Data("{}".utf8) : data
        do {
            return try JSONDecoder().decode(T.self, from: decodeData)
        } catch {
            throw APIError.decodingError
        }
    }

    // MARK: Auth

    func login(email: String, password: String) async throws -> AuthResponse {
        try await request("/auth/login", method: "POST", body: ["email": email, "password": password])
    }

    func register(email: String, password: String) async throws -> AuthResponse {
        try await request("/auth/register", method: "POST", body: ["email": email, "password": password])
    }

    // MARK: Projects

    func fetchProjects() async throws -> [Project] {
        try await request("/projects")
    }

    func createProject(name: String, role: ProjectRole = .any, githubCloneUrl: String? = nil, githubToken: String? = nil) async throws -> Project {
        var body: [String: String] = ["name": name, "role": role.rawValue]
        if let url = githubCloneUrl   { body["githubCloneUrl"] = url }
        if let tok = githubToken      { body["githubToken"] = tok }
        return try await request("/projects", method: "POST", body: body)
    }

    func deleteProject(id: String) async throws {
        let _: EmptyResponse = try await request("/projects/\(id)", method: "DELETE")
    }

    // MARK: Agents

    func fetchAgents() async throws -> [Agent] {
        try await request("/agents")
    }

    func createAgent(name: String, provider: AgentProvider) async throws -> Agent {
        try await request("/agents", method: "POST", body: ["name": name, "provider": provider.rawValue])
    }

    func deleteAgent(id: String) async throws {
        let _: EmptyResponse = try await request("/agents/\(id)", method: "DELETE")
    }

    // MARK: Tasks

    func fetchTasks(projectId: String? = nil, status: String? = nil) async throws -> [WorkTask] {
        var params: [String] = []
        if let p = projectId { params.append("projectId=\(p)") }
        if let s = status    { params.append("status=\(s)") }
        let query = params.isEmpty ? "" : "?" + params.joined(separator: "&")
        return try await request("/tasks\(query)")
    }

    func createTask(projectId: String, title: String, prompt: String, baseBranch: String = "main") async throws -> WorkTask {
        let body: [String: String] = ["projectId": projectId, "title": title, "prompt": prompt, "baseBranch": baseBranch]
        return try await request("/tasks", method: "POST", body: body)
    }

    func deleteTask(id: String) async throws {
        let _: EmptyResponse = try await request("/tasks/\(id)", method: "DELETE")
    }

    func assignTask(taskId: String, agentId: String) async throws -> AssignResponse {
        try await request("/tasks/\(taskId)/assign", method: "POST", body: ["agentId": agentId])
    }

    func runQueue() async throws -> QueueRunResponse {
        try await request("/tasks/queue/run", method: "POST", body: [:] as [String: String])
    }

    // MARK: Settings

    func fetchCredentialStatus() async throws -> CredentialStatus {
        try await request("/settings/credentials")
    }

    func updateCredentials(claude: String?, codex: String?) async throws -> CredentialStatus {
        var body: [String: String] = [:]
        if let c = claude { body["claude"] = c }
        if let c = codex  { body["codex"] = c }
        return try await request("/settings/credentials", method: "PUT", body: body)
    }

    // MARK: Sessions

    func fetchSessions(agentId: String? = nil, projectId: String? = nil) async throws -> [AgentSession] {
        var query = ""
        var params: [String] = []
        if let a = agentId   { params.append("agentId=\(a)") }
        if let p = projectId { params.append("projectId=\(p)") }
        if !params.isEmpty   { query = "?" + params.joined(separator: "&") }
        return try await request("/sessions\(query)")
    }

    func createSession(agentId: String, projectId: String, baseBranch: String?) async throws -> AgentSession {
        var body: [String: String] = ["agentId": agentId, "projectId": projectId]
        if let base = baseBranch { body["baseBranch"] = base }
        return try await request("/sessions", method: "POST", body: body)
    }

    func fetchDiff(sessionId: String) async throws -> DiffResponse {
        try await request("/sessions/\(sessionId)/diff")
    }

    func mergeSession(sessionId: String) async throws {
        let _: EmptyResponse = try await request("/sessions/\(sessionId)/merge", method: "POST")
    }

    func deleteSession(sessionId: String) async throws {
        let _: EmptyResponse = try await request("/sessions/\(sessionId)", method: "DELETE")
    }
}

private struct EmptyResponse: Decodable {}

struct AssignResponse: Decodable {
    let task: WorkTask
    let session: AgentSession
}

struct QueueRunResponse: Decodable {
    struct Dispatched: Decodable {
        let task: WorkTask
        let session: AgentSession
    }
    let dispatched: [Dispatched]
}
