import Foundation
import SwiftUI

// MARK: - Core models

struct Project: Identifiable, Codable, Sendable, Hashable {
    let id: String
    let name: String
    let role: String
    let workspaceMode: String
    let remoteUrl: String?
    let localPath: String?
    let createdAt: String
}

struct Session: Identifiable, Codable, Sendable, Hashable {
    let id: String
    let agentId: String
    let projectId: String
    let status: String
    let branch: String
    let provider: String
    let createdAt: String
    let workTaskId: String?
    let totalCostUsd: Double?
    let inputTokens: Int?
    let outputTokens: Int?
    let cacheReadTokens: Int?
    let reviewVerdict: String?
    let journal: String?
    let runnerSessionId: String?
    let parentSessionId: String?
    let workspaceMode: String?

    var statusEnum: SessionStatus { SessionStatus(rawValue: status) ?? .idle }
    var isWorkspace: Bool { workspaceMode == "workspace" }

    var shortBranch: String {
        let b = branch.hasPrefix("agent/") ? String(branch.dropFirst(6)) : branch
        let uuidPattern = #"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"#
        if b.range(of: uuidPattern, options: .regularExpression) != nil {
            return "agent/\(b.prefix(8))"
        }
        return branch.count > 34 ? "\(branch.prefix(31))…" : branch
    }
}

enum SessionStatus: String, Sendable, CaseIterable {
    case idle, running, done, error, merged, waiting

    var label: String {
        switch self {
        case .idle:    return "Idle"
        case .running: return "Running"
        case .done:    return "Done"
        case .error:   return "Error"
        case .merged:  return "Merged"
        case .waiting: return "Waiting"
        }
    }

    var dotColor: SwiftUI.Color {
        switch self {
        case .idle:    return .muted
        case .running: return .green
        case .done:    return .ember
        case .error:   return .pilotRed
        case .merged:  return .ink2
        case .waiting: return Color(hex: "#C8A04B")
        }
    }

    var isLive: Bool { self == .running || self == .waiting }
}

struct Agent: Identifiable, Codable, Sendable, Hashable {
    let id: String
    let name: String
    let provider: String
    let role: String
    let connectionId: String?
    let avatarSeed: String?
    let createdAt: String
}

struct WorkTask: Identifiable, Codable, Sendable, Hashable {
    let id: String
    let title: String
    let prompt: String
    let status: String
    let priority: Int
    let projectId: String
    let agentId: String?
    let sessionId: String?
    let size: String?
    let createdAt: String
    let startedAt: String?
    let completedAt: String?
}

// MARK: - Auth

struct PairPayload: Codable, Sendable {
    let serverUrl: String
    let pairToken: String
}

struct LoginResponse: Codable, Sendable {
    let token: String
    let role: String
}

struct PairResponse: Codable, Sendable {
    let token: String
}

// MARK: - WebSocket

struct WSMessage: Codable, Sendable {
    let type: String
    let data: String?
    let sessionId: String?
    let eventType: String?
}

// MARK: - Session output

struct TurnData: Identifiable, Sendable {
    let id: String
    let number: Int
    let prompt: String
    var lines: [OutputLine] = []
    var status: TurnStatus = .running
    var exitCode: String?
}

enum TurnStatus: Sendable { case running, done, error }

struct OutputLine: Identifiable, Sendable {
    let id: UUID = UUID()
    let text: String
    let kind: LineKind
}

enum LineKind: Sendable {
    case text, tool, toolResult, thinking, stderr, mcpError
}

struct TokenStats: Sendable {
    var input: Int = 0
    var output: Int = 0
    var cacheRead: Int = 0
    var costUsd: Double?
}

// MARK: - Clarification

struct ClarificationItem: Identifiable, Codable, Sendable {
    let id: String
    let question: String
    let options: [String]?
    let respondedAt: String?
}

// MARK: - User / devices

struct UserProfile: Codable, Sendable {
    let id: String
    let email: String
    let name: String
    let role: String
    let createdAt: String
}

struct UserDevice: Identifiable, Codable, Sendable {
    let id: String
    let name: String
    let deviceType: String
    let createdAt: String
    let lastSeenAt: String?
}

// MARK: - Activity events

struct ActivityEvent: Identifiable, Codable, Sendable {
    let id: String
    let type: String
    let sessionId: String?
    let agentId: String?
    let projectId: String?
    let taskId: String?
    let data: EventData
    let createdAt: String
}

struct EventData: Codable, Sendable {
    let employeeName: String?
    let taskTitle: String?
    let projectName: String?
}

// MARK: - Turn wire payloads

struct TurnStartPayload: Codable, Sendable {
    let turnId: String
    let turnNumber: Int
    let prompt: String
}

struct TurnDonePayload: Codable, Sendable {
    let turnId: String
    let exitCode: String
}
