import SwiftUI

struct ManualConnectView: View {
    @Environment(AppState.self) private var appState
    @Environment(\.dismiss) private var dismiss

    @State private var serverURL = ""
    @State private var email = ""
    @State private var password = ""
    @State private var isLoading = false
    @State private var error: String?

    private var canSubmit: Bool {
        !serverURL.trimmingCharacters(in: .whitespaces).isEmpty &&
        !email.isEmpty && !password.isEmpty && !isLoading
    }

    var body: some View {
        ZStack {
            Color.bg.ignoresSafeArea()

            VStack(spacing: 0) {
                HStack {
                    Text("Connect")
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundStyle(Color.ink)
                    Spacer()
                    Button("Cancel") { dismiss() }
                        .font(.system(size: 15))
                        .foregroundStyle(Color.ink2)
                }
                .padding(.horizontal, 20)
                .padding(.vertical, 16)

                Divider().background(Color.rule)

                ScrollView {
                    VStack(spacing: 20) {
                        if let error {
                            Text(error)
                                .font(.footnote)
                                .foregroundStyle(Color.pilotRed)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(12)
                                .background(Color.pilotRed.opacity(0.08), in: RoundedRectangle(cornerRadius: 8))
                        }

                        field(label: "Server URL", placeholder: "http://192.168.1.x:3000", text: $serverURL)
                            .keyboardType(.URL)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()

                        field(label: "Email", placeholder: "you@example.com", text: $email)
                            .keyboardType(.emailAddress)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()

                        field(label: "Password", placeholder: "••••••••", text: $password, secure: true)

                        Button {
                            submit()
                        } label: {
                            ZStack {
                                Text("Connect")
                                    .font(.system(size: 15, weight: .semibold))
                                    .opacity(isLoading ? 0 : 1)
                                if isLoading { ProgressView().tint(.white) }
                            }
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 14)
                            .background(canSubmit ? Color.ember : Color.ember.opacity(0.4))
                            .foregroundStyle(.white)
                            .clipShape(RoundedRectangle(cornerRadius: 10))
                        }
                        .disabled(!canSubmit)
                    }
                    .padding(20)
                }
            }
        }
    }

    @ViewBuilder
    private func field(label: String, placeholder: String, text: Binding<String>, secure: Bool = false) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label)
                .font(.label)
                .foregroundStyle(Color.ink2)

            Group {
                if secure {
                    SecureField(placeholder, text: text)
                } else {
                    TextField(placeholder, text: text)
                }
            }
            .font(.system(size: 15))
            .foregroundStyle(Color.ink)
            .padding(.horizontal, 12)
            .padding(.vertical, 11)
            .background(Color.panel2)
            .clipShape(RoundedRectangle(cornerRadius: 8))
            .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.rule, lineWidth: 1))
        }
    }

    private func submit() {
        error = nil
        var raw = serverURL.trimmingCharacters(in: .whitespaces)
        if !raw.hasPrefix("http://") && !raw.hasPrefix("https://") {
            raw = "http://" + raw
        }
        guard let url = URL(string: raw) else {
            error = "Invalid server URL."
            return
        }
        isLoading = true
        Task {
            do {
                let token = try await APIClient.login(serverURL: url, email: email, password: password)
                appState.connect(serverURL: url, token: token)
                dismiss()
            } catch {
                self.error = error.localizedDescription
                isLoading = false
            }
        }
    }
}
