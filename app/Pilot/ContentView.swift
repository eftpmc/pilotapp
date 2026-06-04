import SwiftUI

struct ContentView: View {
    var body: some View {
        ZStack {
            Color(red: 0.043, green: 0.043, blue: 0.051)
                .ignoresSafeArea()

            VStack(spacing: 16) {
                Image(systemName: "airplane")
                    .font(.system(size: 48, weight: .light))
                    .foregroundStyle(.white.opacity(0.3))
                Text("Pilot")
                    .font(.system(size: 28, weight: .semibold))
                    .foregroundStyle(.white)
                Text("Coming soon")
                    .font(.subheadline)
                    .foregroundStyle(.white.opacity(0.4))
            }
        }
        .preferredColorScheme(.dark)
    }
}
