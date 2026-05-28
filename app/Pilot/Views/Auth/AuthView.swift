import SwiftUI

struct AuthView: View {
    @AppStorage("isLoggedIn") private var isLoggedIn = false
    @State private var serverURL = KeychainService.load(for: "serverURL") ?? ""
    @State private var email = ""
    @State private var password = ""
    @State private var isRegistering = false
    @State private var isLoading = false
    @State private var error: String?
    @State private var cursorOn = false

    var body: some View {
        ZStack {
            Theme.bg.ignoresSafeArea()

            ScrollView {
                VStack(spacing: 0) {
                    // Brand
                    VStack(spacing: 8) {
                        HStack(spacing: 0) {
                            Text("pilot")
                                .font(.system(size: 48, weight: .black, design: .monospaced))
                                .foregroundStyle(.white)
                            Text("_")
                                .font(.system(size: 48, weight: .black, design: .monospaced))
                                .foregroundStyle(Theme.green)
                                .opacity(cursorOn ? 1 : 0)
                        }
                        Text("AI agent control")
                            .font(.system(.subheadline, weight: .regular))
                            .foregroundStyle(Theme.muted)
                    }
                    .padding(.top, 100)
                    .padding(.bottom, 52)

                    // Fields
                    VStack(spacing: 10) {
                        PilotTextField("http://your-server:3000", text: $serverURL, keyboardType: .URL)
                        PilotTextField("Email", text: $email, keyboardType: .emailAddress)
                        PilotTextField("Password", text: $password, isSecure: true)
                    }
                    .padding(.horizontal, 24)

                    // Error
                    if let error {
                        HStack(spacing: 6) {
                            Image(systemName: "exclamationmark.triangle.fill")
                                .font(.caption)
                            Text(error)
                                .font(.caption)
                        }
                        .foregroundStyle(Theme.danger)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 24)
                        .padding(.top, 12)
                    }

                    // CTA
                    VStack(spacing: 14) {
                        Button {
                            Task { await submit() }
                        } label: {
                            ZStack {
                                if isLoading {
                                    ProgressView().tint(.black)
                                } else {
                                    Text(isRegistering ? "Create account" : "Sign in")
                                        .font(.system(.body, weight: .semibold))
                                }
                            }
                            .frame(maxWidth: .infinity)
                            .frame(height: 52)
                            .background(canSubmit ? Theme.green : Theme.surface)
                            .foregroundStyle(canSubmit ? .black : Theme.muted)
                            .clipShape(RoundedRectangle(cornerRadius: 14))
                        }
                        .disabled(!canSubmit || isLoading)

                        Button(isRegistering ? "Already have an account?" : "Create an account") {
                            isRegistering.toggle()
                            error = nil
                        }
                        .font(.subheadline)
                        .foregroundStyle(Theme.muted)
                    }
                    .padding(.horizontal, 24)
                    .padding(.top, 20)
                }
                .padding(.bottom, 60)
            }
        }
        .onAppear {
            withAnimation(.easeInOut(duration: 0.55).repeatForever(autoreverses: true)) {
                cursorOn = true
            }
        }
    }

    private var canSubmit: Bool {
        !serverURL.isEmpty && !email.isEmpty && !password.isEmpty
    }

    private func submit() async {
        isLoading = true
        error = nil
        KeychainService.save(serverURL, for: "serverURL")
        do {
            let response = try await isRegistering
                ? APIClient.shared.register(email: email, password: password)
                : APIClient.shared.login(email: email, password: password)
            KeychainService.save(response.token, for: "authToken")
            isLoggedIn = true
        } catch {
            self.error = error.localizedDescription
        }
        isLoading = false
    }
}
