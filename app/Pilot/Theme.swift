import SwiftUI

// MARK: - Design Tokens

enum Theme {
    static let bg      = Color(red: 0.043, green: 0.043, blue: 0.051)  // #0B0B0D
    static let card    = Color(red: 0.075, green: 0.075, blue: 0.094)  // #131318
    static let surface = Color(red: 0.110, green: 0.110, blue: 0.141)  // #1C1C24
    static let border  = Color(red: 0.176, green: 0.176, blue: 0.227)  // #2D2D3A
    static let green   = Color(red: 0.184, green: 0.820, blue: 0.345)  // #2FD158
    static let claude  = Color(red: 0.961, green: 0.651, blue: 0.137)  // #F5A623
    static let codex   = Color(red: 0.290, green: 0.565, blue: 1.000)  // #4A90FF
    static let muted   = Color(red: 0.541, green: 0.541, blue: 0.608)  // #8A8A9B
    static let danger  = Color(red: 1.000, green: 0.231, blue: 0.188)  // #FF3B30
    static let term    = Color(red: 0.000, green: 0.000, blue: 0.020)  // terminal black
}

// MARK: - View Helpers

extension View {
    func pilotCard(padding: CGFloat = 16) -> some View {
        self
            .padding(padding)
            .background(Theme.card)
            .clipShape(RoundedRectangle(cornerRadius: 14))
            .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(Theme.border, lineWidth: 0.5))
    }

    func sectionLabel() -> some View {
        self
            .font(.system(.caption2, weight: .semibold))
            .foregroundStyle(Theme.muted)
            .textCase(.uppercase)
            .tracking(1.2)
    }
}

// MARK: - Shared Input Field

struct PilotTextField: View {
    let placeholder: String
    @Binding var text: String
    var isSecure: Bool = false
    var keyboardType: UIKeyboardType = .default

    init(_ placeholder: String, text: Binding<String>, isSecure: Bool = false, keyboardType: UIKeyboardType = .default) {
        self.placeholder = placeholder
        self._text = text
        self.isSecure = isSecure
        self.keyboardType = keyboardType
    }

    var body: some View {
        Group {
            if isSecure {
                SecureField(placeholder, text: $text)
            } else {
                TextField(placeholder, text: $text)
                    .keyboardType(keyboardType)
            }
        }
        .autocorrectionDisabled()
        .textInputAutocapitalization(.never)
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .background(Theme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(Theme.border, lineWidth: 0.5))
    }
}

// MARK: - Agent Color

extension AgentProvider {
    var color: Color {
        switch self {
        case .claude: Theme.claude
        case .codex:  Theme.codex
        }
    }

    var icon: String {
        switch self {
        case .claude: "sparkles"
        case .codex:  "chevron.left.forwardslash.chevron.right"
        }
    }
}

// MARK: - Status

extension SessionStatus {
    var color: Color {
        switch self {
        case .running: Theme.green
        case .idle:    Theme.muted
        case .done:    Theme.green
        case .error:   Theme.danger
        }
    }
}

struct StatusPill: View {
    let status: SessionStatus

    var body: some View {
        HStack(spacing: 5) {
            if status == .running {
                Circle()
                    .fill(Theme.green)
                    .frame(width: 6, height: 6)
                    .overlay(Circle().fill(Theme.green.opacity(0.3)).frame(width: 12, height: 12))
            } else {
                Circle()
                    .fill(status.color)
                    .frame(width: 6, height: 6)
            }
            Text(status.rawValue)
                .font(.system(.caption2, weight: .medium))
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 5)
        .background(status.color.opacity(0.1))
        .foregroundStyle(status.color)
        .clipShape(Capsule())
        .overlay(Capsule().strokeBorder(status.color.opacity(0.2), lineWidth: 0.5))
    }
}
