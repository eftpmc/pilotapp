import SwiftUI

struct MainTabView: View {
    @StateObject private var vm = WorkViewModel()

    var body: some View {
        TabView {
            WorkView()
                .tabItem {
                    Label("Work", systemImage: "bolt.fill")
                }

            SetupView()
                .tabItem {
                    Label("Setup", systemImage: "slider.horizontal.3")
                }
        }
        .environmentObject(vm)
        .tint(Theme.green)
        // Single error alert for all shared vm errors
        .alert("Error", isPresented: .init(
            get: { vm.error != nil },
            set: { if !$0 { vm.error = nil } }
        )) {
            Button("OK", role: .cancel) { vm.error = nil }
        } message: {
            Text(vm.error ?? "")
        }
        .task { await vm.load() }
    }
}
