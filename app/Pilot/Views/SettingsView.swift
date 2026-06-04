import SwiftUI

struct SettingsView: View {
    @Environment(AppState.self) private var appState
    @State private var profile: UserProfile?
    @State private var devices: [UserDevice] = []
    @State private var isLoading = false
    @State private var confirmDisconnect = false
    @State private var revokeTarget: UserDevice?

    var body: some View {
        NavigationStack {
            ZStack {
                Color.bg.ignoresSafeArea()
                ScrollView {
                    VStack(alignment: .leading, spacing: 34) {
                        Text("Account, connections, and workspace configuration.")
                            .font(.system(size: 14))
                            .foregroundStyle(Color.muted)
                            .padding(.top, 4)

                        VStack(alignment: .leading, spacing: 10) {
                            PilotSectionHeader(title: "Account")
                            VStack(spacing: 0) {
                                accountRow
                                Divider().background(Color.rule)
                                rowInfo("Server", value: appState.serverURL?.host ?? "-")
                                Divider().background(Color.rule)
                                Button(role: .destructive) {
                                    confirmDisconnect = true
                                } label: {
                                    HStack {
                                        Text("Sign out of pilot")
                                            .font(.system(size: 15))
                                            .foregroundStyle(Color.ink)
                                        Spacer()
                                        Text("Sign out")
                                            .font(.system(size: 13, weight: .semibold))
                                            .foregroundStyle(Color.pilotRed)
                                            .padding(.horizontal, 12)
                                            .padding(.vertical, 8)
                                            .background(Color.pilotRed.opacity(0.08), in: RoundedRectangle(cornerRadius: 8))
                                    }
                                    .padding(.horizontal, 16)
                                    .padding(.vertical, 14)
                                }
                            }
                            .pilotCard(radius: 12)
                        }

                        VStack(alignment: .leading, spacing: 10) {
                            PilotSectionHeader(title: "Connected devices")
                            if devices.isEmpty {
                                VStack(spacing: 6) {
                                    Text("No registered devices.")
                                        .font(.system(size: 14))
                                        .foregroundStyle(Color.muted)
                                    Text("Connect the Pilot mobile or desktop app using the QR code.")
                                        .font(.caption2)
                                        .foregroundStyle(Color.muted.opacity(0.7))
                                }
                                .frame(maxWidth: .infinity, minHeight: 92)
                                .pilotCard(radius: 12)
                            } else {
                                VStack(spacing: 0) {
                                    ForEach(Array(devices.enumerated()), id: \.element.id) { index, device in
                                        deviceRow(device)
                                        if index < devices.count - 1 { Divider().background(Color.rule) }
                                    }
                                }
                                .pilotCard(radius: 12)
                            }
                        }

                        VStack(alignment: .leading, spacing: 10) {
                            PilotSectionHeader(title: "App")
                            VStack(spacing: 0) {
                                rowInfo("Version", value: Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "-")
                                Divider().background(Color.rule)
                                rowInfo("Build", value: Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "-")
                            }
                            .pilotCard(radius: 12)
                        }
                    }
                    .padding(.horizontal, 24)
                    .padding(.bottom, 36)
                }
                .refreshable { await load() }
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.large)
            .toolbarBackground(Color.bg, for: .navigationBar)
            .toolbarColorScheme(.dark, for: .navigationBar)
        }
        .task { await load() }
        .alert("Sign out?", isPresented: $confirmDisconnect) {
            Button("Sign out", role: .destructive) { appState.disconnect() }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("You'll need to scan the QR code or log in again to reconnect.")
        }
        .alert("Revoke device?", isPresented: .init(
            get: { revokeTarget != nil },
            set: { if !$0 { revokeTarget = nil } }
        )) {
            Button("Revoke", role: .destructive) {
                if let d = revokeTarget { revoke(d) }
            }
            Button("Cancel", role: .cancel) { revokeTarget = nil }
        } message: {
            Text("\(revokeTarget?.name ?? "This device") will be disconnected.")
        }
    }

    @ViewBuilder
    private var accountRow: some View {
        if let p = profile {
            HStack(spacing: 12) {
                ZStack {
                    Circle()
                        .fill(Color.ember.opacity(0.15))
                        .frame(width: 44, height: 44)
                    Text(String((p.name.isEmpty ? p.email : p.name).prefix(1)).uppercased())
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundStyle(Color.ember)
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text(p.name.isEmpty ? p.email : p.name)
                        .font(.system(size: 15, weight: .medium))
                        .foregroundStyle(Color.ink)
                    Text(p.email)
                        .font(.caption2)
                        .foregroundStyle(Color.muted)
                }
                Spacer()
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
        } else {
            HStack(spacing: 12) {
                RoundedRectangle(cornerRadius: 22)
                    .fill(Color.panel2)
                    .frame(width: 44, height: 44)
                VStack(alignment: .leading, spacing: 5) {
                    RoundedRectangle(cornerRadius: 4).fill(Color.panel2).frame(width: 100, height: 12)
                    RoundedRectangle(cornerRadius: 4).fill(Color.panel2).frame(width: 140, height: 10)
                }
                Spacer()
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
            .redacted(reason: isLoading ? .placeholder : [])
        }
    }

    private func rowInfo(_ label: String, value: String) -> some View {
        HStack {
            Text(label)
                .font(.system(size: 15))
                .foregroundStyle(Color.ink)
            Spacer()
            Text(value)
                .font(.system(size: 14))
                .foregroundStyle(Color.muted)
                .lineLimit(1)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
    }

    private func deviceRow(_ device: UserDevice) -> some View {
        HStack(spacing: 12) {
            Image(systemName: device.deviceType == "mobile" ? "iphone" : "laptopcomputer")
                .font(.system(size: 16))
                .foregroundStyle(Color.ink2)
                .frame(width: 24)
            VStack(alignment: .leading, spacing: 2) {
                Text(device.name)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(Color.ink)
                if let seen = device.lastSeenAt {
                    Text("Last seen \(relativeTime(seen))")
                        .font(.caption2)
                        .foregroundStyle(Color.muted)
                }
            }
            Spacer()
            Button("Revoke") { revokeTarget = device }
                .font(.caption2)
                .foregroundStyle(Color.pilotRed)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
    }

    private func load() async {
        guard let client = appState.client else { return }
        isLoading = true
        defer { isLoading = false }
        async let p = client.me()
        async let d = client.devices()
        do { (profile, devices) = try await (p, d) } catch {}
    }

    private func revoke(_ device: UserDevice) {
        revokeTarget = nil
        guard let client = appState.client else { return }
        Task {
            try? await client.revokeDevice(device.id)
            await load()
        }
    }

    private func relativeTime(_ iso: String) -> String {
        let fmt = ISO8601DateFormatter()
        fmt.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard let date = fmt.date(from: iso) ?? ISO8601DateFormatter().date(from: iso) else { return iso }
        let d = Date().timeIntervalSince(date)
        if d < 60    { return "just now" }
        if d < 3600  { return "\(Int(d/60))m ago" }
        if d < 86400 { return "\(Int(d/3600))h ago" }
        return "\(Int(d/86400))d ago"
    }
}
