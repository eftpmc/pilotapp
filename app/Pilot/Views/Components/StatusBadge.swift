import SwiftUI

struct StatusBadge: View {
    let status: SessionStatus
    @State private var pulse = false

    var body: some View {
        HStack(spacing: 4) {
            Circle()
                .fill(dotColor)
                .frame(width: 6, height: 6)
                .opacity(status == .running ? (pulse ? 1 : 0.3) : 1)
                .animation(status == .running ? .easeInOut(duration: 0.8).repeatForever() : .default, value: pulse)
                .onAppear { if status == .running { pulse = true } }
            Text(status.label)
                .font(.caption2)
                .foregroundStyle(dotColor)
        }
        .padding(.horizontal, 7)
        .padding(.vertical, 3)
        .background(dotColor.opacity(0.12), in: Capsule())
    }

    private var dotColor: Color {
        switch status {
        case .idle:    return .muted
        case .running: return .green
        case .done:    return .ember
        case .error:   return .pilotRed
        case .merged:  return .ink2
        case .waiting: return Color(hex: "#C8A04B")
        }
    }
}
