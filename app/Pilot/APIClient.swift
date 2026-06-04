import Foundation

struct APIError: Error, LocalizedError, Sendable {
    let message: String
    var errorDescription: String? { message }
}

struct APIClient: Sendable {
    let baseURL: URL
    let token: String

    private func url(_ path: String, query: [String: String] = [:]) -> URL {
        var c = URLComponents(url: baseURL, resolvingAgainstBaseURL: false)!
        c.path = path
        c.query = nil
        if !query.isEmpty {
            c.queryItems = query.map { URLQueryItem(name: $0.key, value: $0.value) }
        }
        return c.url!
    }

    private func req<T: Decodable & Sendable>(_ path: String, method: String = "GET", body: (any Encodable)? = nil, query: [String: String] = [:]) async throws -> T {
        var r = URLRequest(url: url(path, query: query))
        r.httpMethod = method
        r.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        r.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let body { r.httpBody = try JSONEncoder().encode(body) }
        let (data, response) = try await URLSession.shared.data(for: r)
        try checkStatus(data: data, response: response)
        return try JSONDecoder().decode(T.self, from: data)
    }

    private func reqVoid(_ path: String, method: String = "POST", body: (any Encodable)? = nil) async throws {
        var r = URLRequest(url: url(path))
        r.httpMethod = method
        r.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        r.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let body { r.httpBody = try JSONEncoder().encode(body) }
        let (data, response) = try await URLSession.shared.data(for: r)
        try checkStatus(data: data, response: response)
    }

    private func checkStatus(data: Data, response: URLResponse) throws {
        guard let http = response as? HTTPURLResponse else { throw APIError(message: "Invalid response") }
        guard http.statusCode < 400 else {
            let msg = (try? JSONDecoder().decode([String: String].self, from: data))?["error"] ?? "HTTP \(http.statusCode)"
            throw APIError(message: msg)
        }
    }

    // MARK: - Projects
    func projects() async throws -> [Project] { try await req("/projects") }
    func push(projectId: String) async throws  { try await reqVoid("/projects/\(projectId)/push") }

    // MARK: - Sessions
    func sessions(projectId: String? = nil) async throws -> [Session] {
        var query: [String: String] = [:]
        if let projectId { query["projectId"] = projectId }
        return try await req("/sessions", query: query)
    }
    func session(_ id: String) async throws -> Session { try await req("/sessions/\(id)") }
    func mergeSession(_ id: String) async throws       { try await reqVoid("/sessions/\(id)/merge") }
    func discardSession(_ id: String) async throws     { try await reqVoid("/sessions/\(id)", method: "DELETE") }
    func stopSession(_ id: String) async throws        { try await reqVoid("/sessions/\(id)/stop") }

    func run(_ sessionId: String, prompt: String?) async throws {
        struct Body: Encodable { let prompt: String? }
        try await reqVoid("/sessions/\(sessionId)/run", body: Body(prompt: prompt))
    }

    func addTurn(_ sessionId: String, prompt: String) async throws {
        struct Body: Encodable { let prompt: String }
        try await reqVoid("/sessions/\(sessionId)/turns", body: Body(prompt: prompt))
    }

    func requestReview(_ sessionId: String, agentId: String) async throws {
        struct Body: Encodable { let agentId: String }
        try await reqVoid("/sessions/\(sessionId)/request-review", body: Body(agentId: agentId))
    }

    func clarifications(_ sessionId: String) async throws -> [ClarificationItem] {
        try await req("/sessions/\(sessionId)/clarifications")
    }

    func respondToClarification(sessionId: String, clarificationId: String, response: String) async throws {
        struct Body: Encodable { let response: String }
        try await reqVoid("/sessions/\(sessionId)/clarifications/\(clarificationId)/respond",
                          body: Body(response: response))
    }

    func diff(_ sessionId: String) async throws -> (diff: String, isText: Bool) {
        struct R: Codable, Sendable { let diff: String; let isResultText: Bool? }
        let r: R = try await req("/sessions/\(sessionId)/diff")
        return (r.diff, r.isResultText ?? false)
    }

    // MARK: - Agents
    func agents() async throws -> [Agent] { try await req("/agents") }

    // MARK: - Me
    func me() async throws -> UserProfile { try await req("/me") }
    func devices() async throws -> [UserDevice] { try await req("/me/devices") }
    func revokeDevice(_ id: String) async throws { try await reqVoid("/me/devices/\(id)", method: "DELETE") }

    // MARK: - Events
    func events(limit: Int = 30) async throws -> [ActivityEvent] {
        try await req("/events", query: ["limit": "\(limit)"])
    }

    // MARK: - Tasks
    func tasks(projectId: String) async throws -> [WorkTask] {
        try await req("/tasks", query: ["projectId": projectId])
    }

    func createTask(projectId: String, title: String, prompt: String, size: String) async throws -> WorkTask {
        struct Body: Encodable { let projectId: String; let title: String; let prompt: String; let size: String }
        return try await req("/tasks", method: "POST", body: Body(projectId: projectId, title: title, prompt: prompt, size: size))
    }

    func deleteTask(_ id: String) async throws { try await reqVoid("/tasks/\(id)", method: "DELETE") }

    struct AssignResult: Codable, Sendable {
        let task: WorkTask
        let session: Session
    }
    func assignTask(_ taskId: String, to agentId: String) async throws -> AssignResult {
        struct Body: Encodable { let agentId: String }
        return try await req("/tasks/\(taskId)/assign", method: "POST", body: Body(agentId: agentId))
    }

    func runQueue() async throws { try await reqVoid("/tasks/queue/run") }

    // MARK: - Auth (static)
    static func login(serverURL: URL, email: String, password: String) async throws -> String {
        struct Body: Encodable { let email: String; let password: String }
        var r = URLRequest(url: apiURL(serverURL, path: "/auth/login"))
        r.httpMethod = "POST"
        r.setValue("application/json", forHTTPHeaderField: "Content-Type")
        r.httpBody = try JSONEncoder().encode(Body(email: email, password: password))
        let (data, response) = try await URLSession.shared.data(for: r)
        guard let http = response as? HTTPURLResponse else { throw APIError(message: "Invalid response") }
        guard http.statusCode < 400 else {
            let msg = (try? JSONDecoder().decode([String: String].self, from: data))?["error"] ?? "HTTP \(http.statusCode)"
            throw APIError(message: msg)
        }
        return try JSONDecoder().decode(LoginResponse.self, from: data).token
    }

    static func pair(serverURL: URL, pairToken: String, deviceName: String) async throws -> String {
        struct Body: Encodable { let pairToken: String; let deviceName: String; let deviceType: String }
        var r = URLRequest(url: apiURL(serverURL, path: "/auth/pair"))
        r.httpMethod = "POST"
        r.setValue("application/json", forHTTPHeaderField: "Content-Type")
        r.httpBody = try JSONEncoder().encode(Body(pairToken: pairToken, deviceName: deviceName, deviceType: "mobile"))
        let (data, response) = try await URLSession.shared.data(for: r)
        guard let http = response as? HTTPURLResponse else { throw APIError(message: "Invalid response") }
        guard http.statusCode < 400 else {
            let msg = (try? JSONDecoder().decode([String: String].self, from: data))?["error"] ?? "HTTP \(http.statusCode)"
            throw APIError(message: msg)
        }
        return try JSONDecoder().decode(PairResponse.self, from: data).token
    }

    private static func apiURL(_ base: URL, path: String) -> URL {
        var c = URLComponents(url: base, resolvingAgainstBaseURL: false)!
        c.path = path
        c.query = nil
        return c.url!
    }
}
