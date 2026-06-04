import SwiftUI

struct ContentView: View {
    @Environment(AppState.self) private var appState

    var body: some View {
        if appState.isConnected {
            MainTabView()
        } else {
            ConnectView()
        }
    }
}

struct MainTabView: View {
    @Environment(AppState.self) private var appState
    @State private var reviewCount = 0

    var body: some View {
        TabView {
            TodayView()
                .tabItem {
                    Label("Today", systemImage: "house.fill")
                }
                .badge(reviewCount > 0 ? reviewCount : 0)

            NavigationStack {
                ProjectsView()
            }
            .tabItem {
                Label("Projects", systemImage: "folder.fill")
            }

            AgentsView()
                .tabItem {
                    Label("Agents", systemImage: "person.2.fill")
                }

            SettingsView()
                .tabItem {
                    Label("Settings", systemImage: "gearshape.fill")
                }
        }
        .tint(Color.ember)
        .preferredColorScheme(.dark)
        .task { await loadReviewCount() }
        .task(id: appState.socket?.refreshTick) {
            guard (appState.socket?.refreshTick ?? 0) > 0 else { return }
            await loadReviewCount()
        }
    }

    private func loadReviewCount() async {
        guard let client = appState.client,
              let sessions = try? await client.sessions() else { return }
        reviewCount = sessions.filter { $0.statusEnum == .done || $0.statusEnum == .error }.count
    }
}
