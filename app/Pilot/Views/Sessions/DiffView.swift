import SwiftUI

struct DiffView: View {
    let diff: String
    let sessionId: String
    @ObservedObject var runVm: AgentRunViewModel
    var onMerged: (() -> Void)?
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ZStack {
                Theme.term.ignoresSafeArea()

                if diff.isEmpty {
                    VStack(spacing: 12) {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.system(size: 44))
                            .foregroundStyle(Theme.green)
                        Text("No changes")
                            .font(.system(.headline, weight: .semibold))
                            .foregroundStyle(.white)
                        Text("The agent made no file modifications.")
                            .font(.subheadline)
                            .foregroundStyle(Theme.muted)
                    }
                } else {
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: 0) {
                            ForEach(Array(diff.components(separatedBy: "\n").enumerated()), id: \.offset) { _, line in
                                Text(line.isEmpty ? " " : line)
                                    .font(.system(.caption, design: .monospaced))
                                    .foregroundStyle(diffColor(for: line))
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .padding(.horizontal, 14)
                                    .padding(.vertical, 1)
                                    .background(diffBg(for: line))
                            }
                        }
                        .padding(.vertical, 8)
                    }
                    .textSelection(.enabled)
                }
            }
            .navigationTitle("Review Changes")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(Theme.card, for: .navigationBar)
            .toolbarColorScheme(.dark, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                        .foregroundStyle(Theme.muted)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button {
                        Task {
                            try? await runVm.merge(sessionId: sessionId)
                            onMerged?()
                        }
                    } label: {
                        Text("Merge")
                            .font(.system(.body, weight: .semibold))
                            .foregroundStyle(diff.isEmpty ? Theme.muted : Theme.green)
                    }
                    .disabled(diff.isEmpty)
                }
            }
        }
    }

    private func diffColor(for line: String) -> Color {
        if line.hasPrefix("+") && !line.hasPrefix("+++") { return Theme.green }
        if line.hasPrefix("-") && !line.hasPrefix("---") { return Theme.danger }
        if line.hasPrefix("@@") { return Color(red: 0.4, green: 0.9, blue: 1.0) }
        if line.hasPrefix("diff ") || line.hasPrefix("index ") || line.hasPrefix("---") || line.hasPrefix("+++") {
            return Theme.muted
        }
        return Color(red: 0.75, green: 0.75, blue: 0.82)
    }

    private func diffBg(for line: String) -> Color {
        if line.hasPrefix("+") && !line.hasPrefix("+++") { return Theme.green.opacity(0.06) }
        if line.hasPrefix("-") && !line.hasPrefix("---") { return Theme.danger.opacity(0.06) }
        return .clear
    }
}
