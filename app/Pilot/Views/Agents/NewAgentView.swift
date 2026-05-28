import SwiftUI

struct NewAgentView: View {
    var onCreate: (String, AgentProvider) -> Void
    @Environment(\.dismiss) private var dismiss

    @State private var name = ""
    @State private var provider: AgentProvider = .claude

    private var canCreate: Bool {
        !name.trimmingCharacters(in: .whitespaces).isEmpty
    }

    var body: some View {
        NavigationStack {
            ZStack {
                Theme.bg.ignoresSafeArea()

                ScrollView {
                    VStack(spacing: 24) {
                        // Name
                        VStack(alignment: .leading, spacing: 10) {
                            Text("Name")
                                .sectionLabel()
                                .padding(.horizontal, 4)
                            PilotTextField("e.g. Backend Claude", text: $name)
                        }

                        // Provider
                        VStack(alignment: .leading, spacing: 10) {
                            Text("Provider")
                                .sectionLabel()
                                .padding(.horizontal, 4)

                            HStack(spacing: 10) {
                                ForEach(AgentProvider.allCases, id: \.self) { p in
                                    Button { provider = p } label: {
                                        HStack(spacing: 8) {
                                            Image(systemName: p.icon)
                                                .font(.system(size: 14, weight: .semibold))
                                            Text(p.rawValue.capitalized)
                                                .font(.system(.subheadline, weight: .semibold))
                                        }
                                        .frame(maxWidth: .infinity)
                                        .padding(.vertical, 14)
                                        .background(provider == p ? p.color.opacity(0.15) : Theme.surface)
                                        .foregroundStyle(provider == p ? p.color : Theme.muted)
                                        .clipShape(RoundedRectangle(cornerRadius: 12))
                                        .overlay(
                                            RoundedRectangle(cornerRadius: 12)
                                                .strokeBorder(
                                                    provider == p ? p.color.opacity(0.4) : Theme.border,
                                                    lineWidth: provider == p ? 1 : 0.5
                                                )
                                        )
                                    }
                                }
                            }
                        }

                    }
                    .padding(.horizontal, 24)
                    .padding(.vertical, 24)
                }
            }
            .navigationTitle("Hire Agent")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(Theme.card, for: .navigationBar)
            .toolbarColorScheme(.dark, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                        .foregroundStyle(Theme.muted)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Hire") {
                        onCreate(name.trimmingCharacters(in: .whitespaces), provider)
                        dismiss()
                    }
                    .font(.system(.body, weight: .semibold))
                    .foregroundStyle(canCreate ? Theme.green : Theme.muted)
                    .disabled(!canCreate)
                }
            }
        }
    }
}
