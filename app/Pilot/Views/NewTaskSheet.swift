import SwiftUI

private let sizes: [(value: String, label: String, desc: String)] = [
    ("xs", "XS", "<30m"), ("s", "S", "~1h"), ("m", "M", "~2h"), ("l", "L", "~4h"), ("xl", "XL", "1d+"),
]

struct NewTaskSheet: View {
    let project: Project
    let idleAgents: [Agent]
    let onDone: () -> Void

    @Environment(AppState.self) private var appState
    @Environment(\.dismiss) private var dismiss

    @State private var title = ""
    @State private var prompt = ""
    @State private var size = "m"
    @State private var isLoading = false
    @State private var error: String?
    @FocusState private var titleFocused: Bool

    private var canSubmit: Bool { title.trimmingCharacters(in: .whitespaces).count >= 2 && !isLoading }

    var body: some View {
        ZStack {
            Color.bg.ignoresSafeArea()
            VStack(spacing: 0) {
                // Nav bar
                HStack {
                    Button("Cancel") { dismiss() }
                        .font(.system(size: 15))
                        .foregroundStyle(Color.ink2)
                    Spacer()
                    Text("New task")
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundStyle(Color.ink)
                    Spacer()
                    Button("Queue") { submit(dispatch: false) }
                        .font(.system(size: 15, weight: .medium))
                        .foregroundStyle(canSubmit ? Color.ink2 : Color.muted)
                        .disabled(!canSubmit)
                }
                .padding(.horizontal, 20)
                .padding(.vertical, 16)

                Divider().background(Color.rule)

                ScrollView {
                    VStack(alignment: .leading, spacing: 20) {
                        if let error {
                            Text(error)
                                .font(.footnote)
                                .foregroundStyle(Color.pilotRed)
                                .padding(12)
                                .background(Color.pilotRed.opacity(0.08), in: RoundedRectangle(cornerRadius: 8))
                        }

                        // Title
                        VStack(alignment: .leading, spacing: 6) {
                            Text("Title")
                                .font(.label)
                                .foregroundStyle(Color.ink2)
                            TextField("What should the agent do?", text: $title)
                                .font(.system(size: 15))
                                .foregroundStyle(Color.ink)
                                .focused($titleFocused)
                                .padding(.horizontal, 12)
                                .padding(.vertical, 11)
                                .background(Color.panel2)
                                .clipShape(RoundedRectangle(cornerRadius: 8))
                                .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.rule, lineWidth: 1))
                        }

                        // Prompt
                        VStack(alignment: .leading, spacing: 6) {
                            Text("Prompt")
                                .font(.label)
                                .foregroundStyle(Color.ink2)
                            TextEditor(text: $prompt)
                                .font(.system(size: 14))
                                .foregroundStyle(Color.ink)
                                .frame(minHeight: 80)
                                .padding(.horizontal, 8)
                                .padding(.vertical, 8)
                                .background(Color.panel2)
                                .clipShape(RoundedRectangle(cornerRadius: 8))
                                .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.rule, lineWidth: 1))
                                .scrollContentBackground(.hidden)
                        }

                        // Size
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Size")
                                .font(.label)
                                .foregroundStyle(Color.ink2)
                            HStack(spacing: 6) {
                                ForEach(sizes, id: \.value) { s in
                                    Button {
                                        size = s.value
                                    } label: {
                                        VStack(spacing: 2) {
                                            Text(s.label)
                                                .font(.system(size: 12, weight: .semibold))
                                            Text(s.desc)
                                                .font(.system(size: 9))
                                                .opacity(0.7)
                                        }
                                        .frame(maxWidth: .infinity)
                                        .padding(.vertical, 8)
                                        .background(size == s.value ? Color.ember : Color.panel2)
                                        .foregroundStyle(size == s.value ? Color.white : Color.ink2)
                                        .clipShape(RoundedRectangle(cornerRadius: 7))
                                        .overlay(RoundedRectangle(cornerRadius: 7).stroke(
                                            size == s.value ? Color.ember : Color.rule, lineWidth: 1))
                                    }
                                }
                            }
                        }

                        // Dispatch button
                        if !idleAgents.isEmpty {
                            Button { submit(dispatch: true) } label: {
                                ZStack {
                                    Label("Dispatch", systemImage: "arrow.up.right")
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
                    }
                    .padding(20)
                }
            }
        }
        .onAppear { titleFocused = true }
    }

    private func submit(dispatch: Bool) {
        guard canSubmit, let client = appState.client else { return }
        error = nil
        isLoading = true
        Task {
            do {
                let task = try await client.createTask(
                    projectId: project.id,
                    title: title.trimmingCharacters(in: .whitespaces),
                    prompt: prompt.trimmingCharacters(in: .whitespaces).isEmpty ? "Complete the task: \(title)" : prompt,
                    size: size
                )
                if dispatch {
                    try? await client.runQueue()
                    _ = task
                }
                onDone()
                dismiss()
            } catch {
                self.error = error.localizedDescription
                isLoading = false
            }
        }
    }
}
