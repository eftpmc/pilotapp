import SwiftUI

struct AddTaskView: View {
    let project: Project
    @EnvironmentObject var vm: WorkViewModel
    var onAdded: (WorkTask) -> Void = { _ in }
    @Environment(\.dismiss) private var dismiss

    @State private var title = ""
    @State private var prompt = ""
    @State private var baseBranch = "main"
    @State private var showAdvanced = false
    @State private var isSaving = false
    @StateObject private var speech = SpeechService()

    private var canSave: Bool {
        !title.trimmingCharacters(in: .whitespaces).isEmpty &&
        !prompt.trimmingCharacters(in: .whitespaces).isEmpty &&
        !isSaving
    }

    var body: some View {
        NavigationStack {
            ZStack {
                Theme.bg.ignoresSafeArea()

                ScrollView {
                    VStack(spacing: 20) {
                        // Title
                        VStack(alignment: .leading, spacing: 10) {
                            Text("Title").sectionLabel().padding(.horizontal, 4)
                            PilotTextField("Short description", text: $title)
                        }

                        // Prompt
                        VStack(alignment: .leading, spacing: 10) {
                            Text("Task").sectionLabel().padding(.horizontal, 4)

                            ZStack(alignment: .topLeading) {
                                if prompt.isEmpty && !speech.isListening {
                                    Text("Describe what needs to be done…")
                                        .font(.body).foregroundStyle(Theme.muted)
                                        .padding(.top, 14).padding(.leading, 16)
                                        .allowsHitTesting(false)
                                }
                                TextEditor(text: $prompt)
                                    .frame(minHeight: 130)
                                    .scrollContentBackground(.hidden)
                                    .padding(.horizontal, 12).padding(.vertical, 10)
                            }
                            .background(Theme.surface)
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                            .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(Theme.border, lineWidth: 0.5))

                            Button {
                                Task {
                                    if speech.isListening {
                                        speech.stopListening()
                                        if !speech.transcript.isEmpty { prompt = speech.transcript }
                                    } else {
                                        await speech.startListening()
                                    }
                                }
                            } label: {
                                HStack(spacing: 6) {
                                    Image(systemName: speech.isListening ? "stop.circle.fill" : "mic.circle.fill")
                                        .font(.title3)
                                    Text(speech.isListening ? "Stop" : "Dictate")
                                        .font(.system(.subheadline, weight: .medium))
                                }
                                .foregroundStyle(speech.isListening ? Theme.danger : Theme.muted)
                                .padding(.horizontal, 14).padding(.vertical, 8)
                                .background((speech.isListening ? Theme.danger : Theme.muted).opacity(0.1))
                                .clipShape(RoundedRectangle(cornerRadius: 10))
                            }
                        }

                        // Advanced
                        VStack(alignment: .leading, spacing: 0) {
                            Button {
                                withAnimation(.spring(duration: 0.25)) { showAdvanced.toggle() }
                            } label: {
                                HStack(spacing: 6) {
                                    Text("Advanced")
                                        .font(.system(.caption2, weight: .semibold))
                                        .foregroundStyle(Theme.muted).textCase(.uppercase).tracking(1.2)
                                    Image(systemName: showAdvanced ? "chevron.up" : "chevron.down")
                                        .font(.system(size: 10, weight: .semibold)).foregroundStyle(Theme.muted)
                                }
                                .padding(.horizontal, 4).padding(.vertical, 6)
                            }
                            if showAdvanced {
                                VStack(alignment: .leading, spacing: 10) {
                                    Text("Base Branch").sectionLabel().padding(.horizontal, 4)
                                    PilotTextField("main", text: $baseBranch)
                                }
                                .padding(.top, 10)
                                .transition(.opacity.combined(with: .move(edge: .top)))
                            }
                        }
                    }
                    .padding(.horizontal, 24).padding(.top, 20).padding(.bottom, 100)
                }

                VStack {
                    Spacer()
                    Button {
                        Task { await save() }
                    } label: {
                        Group {
                            if isSaving {
                                ProgressView().tint(.black)
                            } else {
                                Text("Add to Backlog")
                                    .font(.system(.body, weight: .semibold))
                                    .foregroundStyle(canSave ? .black : Theme.muted)
                            }
                        }
                        .frame(maxWidth: .infinity).padding(.vertical, 16)
                        .background(canSave ? Theme.green : Theme.surface)
                        .clipShape(RoundedRectangle(cornerRadius: 14))
                    }
                    .disabled(!canSave)
                    .animation(.easeInOut(duration: 0.15), value: canSave)
                    .padding(.horizontal, 24).padding(.bottom, 32)
                    .background(
                        LinearGradient(colors: [Theme.bg.opacity(0), Theme.bg], startPoint: .top, endPoint: .bottom)
                            .frame(height: 96).ignoresSafeArea(),
                        alignment: .bottom
                    )
                }
            }
            .navigationTitle("New Task")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(Theme.card, for: .navigationBar)
            .toolbarColorScheme(.dark, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }.foregroundStyle(Theme.muted)
                }
            }
            .onChange(of: speech.transcript) { _, t in if speech.isListening { prompt = t } }
            .onDisappear { speech.stopSpeaking() }
        }
    }

    private func save() async {
        isSaving = true
        if let task = await vm.createTask(
            projectId: project.id,
            title: title.trimmingCharacters(in: .whitespaces),
            prompt: prompt.trimmingCharacters(in: .whitespaces),
            baseBranch: baseBranch.isEmpty ? "main" : baseBranch
        ) {
            onAdded(task)
            dismiss()
        }
        isSaving = false
    }
}
