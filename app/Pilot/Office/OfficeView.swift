import SwiftUI
import SpriteKit
import UIKit

struct OfficeView: View {
    @ObservedObject var vm: AgentsViewModel
    @State private var selectedAgent: Agent?

    private let scene: OfficeScene = {
        let screenSize = UIScreen.main.bounds.size
        let s = OfficeScene(size: screenSize)
        s.scaleMode = .resizeFill
        return s
    }()

    var body: some View {
        ZStack(alignment: .bottom) {
            SpriteView(scene: scene, options: [.allowsTransparency])
                .ignoresSafeArea()

            HStack {
                Text("Office")
                    .font(.system(.headline, design: .monospaced))
                    .foregroundStyle(.white)
                Spacer()
            }
            .padding(.horizontal, 24)
            .padding(.vertical, 14)
            .background(.ultraThinMaterial)
            .clipShape(RoundedRectangle(cornerRadius: 20))
            .padding(.horizontal, 16)
            .padding(.bottom, 24)
        }
        .navigationBarTitleDisplayMode(.inline)
        .task { await vm.load() }
        .refreshable { await vm.load() }
        .alert("Error", isPresented: .init(
            get: { vm.error != nil },
            set: { if !$0 { vm.error = nil } }
        )) {
            Button("OK", role: .cancel) { vm.error = nil }
        } message: {
            Text(vm.error ?? "")
        }
    }
}
