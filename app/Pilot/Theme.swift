// Tokens live in Generated/DesignTokens.swift — do not add values here.
// To change a token: edit design/tokens.json, then run `npm run tokens` from the project root.
import SwiftUI

// Compatibility aliases for token renames
extension Color {
    static let pilotRed = Color.red      // red is now the token name
}

extension View {
    func pilotCard(radius: CGFloat = 12, stroke: Color = Color.rule) -> some View {
        self
            .background(Color.panel, in: RoundedRectangle(cornerRadius: radius))
            .overlay(RoundedRectangle(cornerRadius: radius).stroke(stroke, lineWidth: 1))
    }
}

struct PilotSectionHeader: View {
    let title: String
    var count: Int?
    var actionTitle: String?
    var action: (() -> Void)?

    var body: some View {
        HStack(spacing: 7) {
            Text(title)
                .font(.label)
                .foregroundStyle(Color.muted)
                .textCase(.uppercase)
            if let count {
                Text("\(count)")
                    .font(.caption2)
                    .foregroundStyle(Color.muted)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(Color.panel2, in: RoundedRectangle(cornerRadius: 5))
            }
            Spacer()
            if let actionTitle, let action {
                Button(actionTitle, action: action)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(Color.muted)
            }
        }
    }
}

struct EmptyPanel: View {
    let text: String

    var body: some View {
        Text(text)
            .font(.system(size: 14))
            .foregroundStyle(Color.muted)
            .frame(maxWidth: .infinity, minHeight: 86)
            .pilotCard(radius: 12, stroke: Color.rule.opacity(0.7))
    }
}
