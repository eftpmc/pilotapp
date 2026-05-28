import SwiftUI

struct SettingsView: View {
    @ObservedObject var github: GitHubService
    @AppStorage("isLoggedIn") private var isLoggedIn = false
    @State private var serverURL = KeychainService.load(for: "serverURL") ?? ""
    @State private var githubPAT = KeychainService.load(for: "githubPAT") ?? ""
    @State private var anthropicKey = ""
    @State private var openAIKey = ""
    @State private var credentialStatus: CredentialStatus?
    @State private var saved = false
    @State private var credError: String?

    var body: some View {
        ZStack {
            Theme.bg.ignoresSafeArea()

            ScrollView {
                VStack(spacing: 20) {
                    // Server
                    settingsSection(title: "Server") {
                        PilotTextField("http://your-server:3000", text: $serverURL, keyboardType: .URL)
                    }

                    // API Keys (stored on server)
                    settingsSection(title: "API Keys") {
                        VStack(spacing: 12) {
                            HStack(spacing: 10) {
                                PilotTextField("Anthropic API key", text: $anthropicKey, isSecure: true)
                                if credentialStatus?.claude == true && anthropicKey.isEmpty {
                                    Image(systemName: "checkmark.circle.fill")
                                        .foregroundStyle(Theme.green)
                                        .font(.title3)
                                }
                            }
                            HStack(spacing: 10) {
                                PilotTextField("OpenAI API key", text: $openAIKey, isSecure: true)
                                if credentialStatus?.codex == true && openAIKey.isEmpty {
                                    Image(systemName: "checkmark.circle.fill")
                                        .foregroundStyle(Theme.green)
                                        .font(.title3)
                                }
                            }
                            if let err = credError {
                                HStack(spacing: 6) {
                                    Image(systemName: "exclamationmark.triangle.fill").font(.caption)
                                    Text(err).font(.caption)
                                }
                                .foregroundStyle(Theme.danger)
                            }
                            Text("Stored on your server — never sent from the app.")
                                .font(.caption2)
                                .foregroundStyle(Theme.muted.opacity(0.7))
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                    }

                    // GitHub
                    settingsSection(title: "GitHub") {
                        VStack(spacing: 12) {
                            HStack(spacing: 10) {
                                PilotTextField("Personal Access Token", text: $githubPAT, isSecure: true)
                                if github.isConnected {
                                    Image(systemName: "checkmark.circle.fill")
                                        .foregroundStyle(Theme.green)
                                        .font(.title3)
                                }
                            }

                            if let err = github.error {
                                HStack(spacing: 6) {
                                    Image(systemName: "exclamationmark.triangle.fill").font(.caption)
                                    Text(err).font(.caption)
                                }
                                .foregroundStyle(Theme.danger)
                            }

                            HStack(spacing: 16) {
                                Link(destination: URL(string: "https://github.com/settings/tokens/new?scopes=repo")!) {
                                    Label("Generate token", systemImage: "arrow.up.right")
                                        .font(.system(.caption, weight: .medium))
                                        .foregroundStyle(Theme.muted)
                                }

                                if github.isConnected {
                                    Spacer()
                                    Button("Disconnect") {
                                        github.disconnect()
                                        githubPAT = ""
                                    }
                                    .font(.system(.caption, weight: .medium))
                                    .foregroundStyle(Theme.danger)
                                }
                            }

                            Text("Needs repo and read:user scopes.")
                                .font(.caption2)
                                .foregroundStyle(Theme.muted.opacity(0.7))
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                    }

                    // Save
                    Button { Task { await save() } } label: {
                        Text("Save")
                            .font(.system(.body, weight: .semibold))
                            .foregroundStyle(.black)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 15)
                            .background(Theme.green)
                            .clipShape(RoundedRectangle(cornerRadius: 14))
                    }
                    .padding(.horizontal, 20)

                    // Sign out
                    Button(role: .destructive) { signOut() } label: {
                        Text("Sign Out")
                            .font(.system(.subheadline, weight: .medium))
                            .foregroundStyle(Theme.danger)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 15)
                            .background(Theme.danger.opacity(0.08))
                            .clipShape(RoundedRectangle(cornerRadius: 14))
                            .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(Theme.danger.opacity(0.2), lineWidth: 0.5))
                    }
                    .padding(.horizontal, 20)
                }
                .padding(.vertical, 20)
            }
        }
        .navigationTitle("Settings")
        .navigationBarTitleDisplayMode(.large)
        .toolbarBackground(Theme.bg, for: .navigationBar)
        .toolbarColorScheme(.dark, for: .navigationBar)
        .overlay(alignment: .top) {
            if saved {
                HStack(spacing: 6) {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundStyle(Theme.green)
                    Text("Saved")
                        .font(.system(.callout, weight: .medium))
                        .foregroundStyle(.white)
                }
                .padding(.horizontal, 18)
                .padding(.vertical, 10)
                .background(.ultraThinMaterial, in: Capsule())
                .transition(.move(edge: .top).combined(with: .opacity))
                .padding(.top, 8)
            }
        }
        .animation(.spring(duration: 0.3), value: saved)
        .task { await loadCredentialStatus() }
    }

    @ViewBuilder
    private func settingsSection<Content: View>(title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title)
                .sectionLabel()
                .padding(.horizontal, 4)
            content()
        }
        .padding(.horizontal, 20)
    }

    private func loadCredentialStatus() async {
        guard KeychainService.load(for: "authToken") != nil else { return }
        credentialStatus = try? await APIClient.shared.fetchCredentialStatus()
    }

    private func save() async {
        KeychainService.save(serverURL, for: "serverURL")
        if !githubPAT.isEmpty {
            github.save(token: githubPAT)
        }

        // Push API keys to server if provided
        let claudeKey = anthropicKey.isEmpty ? nil : anthropicKey
        let codexKey  = openAIKey.isEmpty    ? nil : openAIKey
        if claudeKey != nil || codexKey != nil {
            do {
                credentialStatus = try await APIClient.shared.updateCredentials(claude: claudeKey, codex: codexKey)
                anthropicKey = ""
                openAIKey = ""
                credError = nil
            } catch {
                credError = "Failed to save API keys: \(error.localizedDescription)"
                return
            }
        }

        saved = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { saved = false }
    }

    private func signOut() {
        KeychainService.delete(for: "authToken")
        isLoggedIn = false
    }
}
