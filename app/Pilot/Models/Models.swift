import Foundation

enum AgentProvider: String, Codable, CaseIterable, Hashable {
    case claude
    case codex
}

enum ProjectRole: String, Codable, CaseIterable, Hashable {
    case any
    case claude
    case codex

    var label: String {
        switch self {
        case .any:    return "Any"
        case .claude: return "Claude"
        case .codex:  return "Codex"
        }
    }
}

struct Project: Identifiable, Hashable {
    let id: String
    let name: String
    let repoPath: String
    var role: ProjectRole
    let createdAt: String
}

extension Project: Codable {
    enum CodingKeys: String, CodingKey {
        case id, name, repoPath, role, createdAt
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id        = try c.decode(String.self, forKey: .id)
        name      = try c.decode(String.self, forKey: .name)
        repoPath  = try c.decode(String.self, forKey: .repoPath)
        role      = try c.decodeIfPresent(ProjectRole.self, forKey: .role) ?? .any
        createdAt = try c.decode(String.self, forKey: .createdAt)
    }
}

enum WorkTaskStatus: String, Codable, Hashable {
    case pending, running, done, failed
}

struct WorkTask: Codable, Identifiable, Hashable {
    let id: String
    let projectId: String
    var title: String
    var prompt: String
    var baseBranch: String
    var status: WorkTaskStatus
    var agentId: String?
    var sessionId: String?
    let createdAt: String
    var startedAt: String?
    var completedAt: String?
}

struct Agent: Codable, Identifiable, Hashable {
    let id: String
    let name: String
    let provider: AgentProvider
    let createdAt: String
}

struct AgentSession: Codable, Identifiable, Hashable {
    let id: String
    let agentId: String
    let projectId: String
    var workTaskId: String?
    let provider: AgentProvider
    let branch: String
    let worktreePath: String
    var status: SessionStatus
    let createdAt: String
}

enum SessionStatus: String, Codable, Hashable {
    case running, idle, done, error
}

struct DiffResponse: Codable {
    let diff: String
}

struct AuthResponse: Codable {
    let token: String
}

struct SocketMessage: Codable {
    let type: String
    let sessionId: String?
    let data: String
}
