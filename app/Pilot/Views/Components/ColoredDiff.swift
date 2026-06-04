import SwiftUI

struct ColoredDiff: View {
    let raw: String

    var body: some View {
        if raw.trimmingCharacters(in: .whitespaces).isEmpty {
            Text("No changes.")
                .font(.mono)
                .foregroundStyle(Color.muted)
                .frame(maxWidth: .infinity, alignment: .leading)
        } else {
            LazyVStack(alignment: .leading, spacing: 0) {
                ForEach(Array(raw.split(separator: "\n", omittingEmptySubsequences: false).enumerated()), id: \.offset) { _, line in
                    let s = String(line)
                    Text(s.isEmpty ? " " : s)
                        .font(.mono)
                        .foregroundStyle(diffColor(s))
                        .background(diffBg(s))
                        .textSelection(.enabled)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
        }
    }

    private func diffColor(_ line: String) -> Color {
        if line.hasPrefix("@@")         { return Color(hex: "#5B9BD5") }
        if line.hasPrefix("+")          { return Color(hex: "#4CAF50") }
        if line.hasPrefix("-")          { return Color.pilotRed }
        if line.hasPrefix("diff ") ||
           line.hasPrefix("index ") ||
           line.hasPrefix("--- ") ||
           line.hasPrefix("+++ ")       { return Color.muted }
        return Color.ink2
    }

    private func diffBg(_ line: String) -> Color {
        if line.hasPrefix("+") && !line.hasPrefix("+++") { return Color(hex: "#4CAF50").opacity(0.06) }
        if line.hasPrefix("-") && !line.hasPrefix("---") { return Color.pilotRed.opacity(0.06) }
        return .clear
    }
}
