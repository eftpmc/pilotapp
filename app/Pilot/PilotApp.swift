import SwiftUI

@main
struct PilotApp: App {
    @AppStorage("isLoggedIn") private var isLoggedIn = false

    var body: some Scene {
        WindowGroup {
            Group {
                if isLoggedIn {
                    MainTabView()
                } else {
                    AuthView()
                }
            }
            .preferredColorScheme(.dark)
        }
    }
}
