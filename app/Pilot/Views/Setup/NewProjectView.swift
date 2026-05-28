import SwiftUI

struct NewProjectView: View {
    @Binding var name: String
    @Binding var role: ProjectRole
    var onCreate: () -> Void
    @Environment(\.dismiss) private var dismiss

    private var canCreate: Bool {
        !name.trimmingCharacters(in: .whitespaces).isEmpty
    }

    var body: some View {
        NavigationStack {
            ZStack {
                Theme.bg.ignoresSafeArea()

                VStack(spacing: 24) {
                    // Name
                    VStack(alignment: .leading, spacing: 10) {
                        Text("Name").sectionLabel().padding(.horizontal, 4)
                        PilotTextField("e.g. Backend API", text: $name)
                    }

                    // Coder role
                    VStack(alignment: .leading, spacing: 10) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Coder Role").sectionLabel().padding(.horizontal, 4)
                            Text("Which agents can work on this project")
                                .font(.caption).foregroundStyle(Theme.muted).padding(.horizontal, 4)
                        }

                        HStack(spacing: 8) {
                            ForEach(ProjectRole.allCases, id: \.self) { r in
                                Button { role = r } label: {
                                    VStack(spacing: 4) {
                                        Image(systemName: roleIcon(r))
                                            .font(.system(size: 16, weight: .semibold))
                                        Text(r.label)
                                            .font(.system(.caption, weight: .semibold))
                                    }
                                    .frame(maxWidth: .infinity)
                                    .padding(.vertical, 14)
                                    .background(role == r ? roleColor(r).opacity(0.15) : Theme.surface)
                                    .foregroundStyle(role == r ? roleColor(r) : Theme.muted)
                                    .clipShape(RoundedRectangle(cornerRadius: 12))
                                    .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(
                                        role == r ? roleColor(r).opacity(0.4) : Theme.border,
                                        lineWidth: role == r ? 1 : 0.5
                                    ))
                                }
                            }
                        }
                    }

                    Spacer()
                }
                .padding(.horizontal, 24).padding(.top, 24)
            }
            .navigationTitle("New Project")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(Theme.card, for: .navigationBar)
            .toolbarColorScheme(.dark, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }.foregroundStyle(Theme.muted)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Create") {
                        onCreate()
                        dismiss()
                    }
                    .font(.system(.body, weight: .semibold))
                    .foregroundStyle(canCreate ? Theme.green : Theme.muted)
                    .disabled(!canCreate)
                }
            }
        }
    }

    private func roleIcon(_ role: ProjectRole) -> String {
        switch role {
        case .any:    return "person.2.fill"
        case .claude: return "sparkles"
        case .codex:  return "chevron.left.forwardslash.chevron.right"
        }
    }

    private func roleColor(_ role: ProjectRole) -> Color {
        switch role {
        case .any:    return Theme.green
        case .claude: return Theme.claude
        case .codex:  return Theme.codex
        }
    }
}
