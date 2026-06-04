import SwiftUI

struct AgentAvatar: View {
    var agent: Agent?
    var name: String?
    var seed: String?
    var size: CGFloat = 32
    var running = false

    private static let palette: [Color] = [
        Color(hex: "#4B7EC8"), Color(hex: "#3EA87A"), Color(hex: "#C8784B"), Color(hex: "#8B5BC8"),
        Color(hex: "#3AACAC"), Color(hex: "#C85A5A"), Color(hex: "#8B8340"), Color(hex: "#5C5CC8"),
    ]

    private var displayName: String { (name ?? agent?.name ?? "").trimmingCharacters(in: .whitespaces) }
    private var hashKey: String { seed ?? agent?.avatarSeed ?? displayName }

    private var bg: Color {
        guard !hashKey.isEmpty else { return .panel2 }
        var h: UInt32 = 5381
        for s in hashKey.unicodeScalars { h = ((h &<< 5) &+ h) ^ s.value }
        return Self.palette[Int(h % UInt32(Self.palette.count))]
    }

    private var initial: String { String(displayName.prefix(1)).uppercased() }
    private var cornerRadius: CGFloat { size <= 24 ? 6 : size <= 36 ? 8 : 10 }

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: cornerRadius)
                .fill(bg)
                .frame(width: size, height: size)
            Text(initial)
                .font(.system(size: size * 0.44, weight: .semibold, design: .rounded))
                .foregroundStyle(.white)
        }
        .overlay(
            RoundedRectangle(cornerRadius: cornerRadius + 2)
                .stroke(running ? Color.green : .clear, lineWidth: 2)
                .padding(-2)
        )
    }
}
