import SwiftUI

struct AssignTaskView: View {
    @ObservedObject var vm: AgentDetailViewModel
    var onStarted: (AgentSession, String) -> Void
    @Environment(\.dismiss) private var dismiss

    @State private var selectedProjectId = ""
    @State private var prompt = ""
    @State private var baseBranch = "main"
    @State private var showAdvanced = false
    @State private var isStarting = false
    @StateObject private var speech = SpeechService()

    private var canStart: Bool {
        !selectedProjectId.isEmpty && !prompt.trimmingCharacters(in: .whitespaces).isEmpty && !isStarting
    }

    var body: some View {
        NavigationStack {
            ZStack {
                Theme.bg.ignoresSafeArea()

                ScrollView {
                    VStack(spacing: 20) {
                        projectPicker
                        taskInput
                        advancedSection
                    }
                    .padding(.horizontal, 24)
                    .padding(.top, 24)
                    .padding(.bottom, 100)
                }

                VStack {
                    Spacer()
                    startButton
                        .padding(.horizontal, 24)
                        .padding(.bottom, 32)
                        .background(
                            LinearGradient(
                                colors: [Theme.bg.opacity(0), Theme.bg],
                                startPoint: .top,
                                endPoint: .bottom
                            )
                            .frame(height: 100)
                            .ignoresSafeArea(),
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
                    Button("Cancel") { dismiss() }
                        .foregroundStyle(Theme.muted)
                }
            }
            .onAppear {
                DispatchQueue.main.async {
                    if selectedProjectId.isEmpty, let first = vm.projects.first {
                        selectedProjectId = first.id
                    }
                }
            }
            .onChange(of: speech.transcript) { _, t in
                if speech.isListening { prompt = t }
            }
            .onDisappear {
                speech.stopSpeaking()
            }
        }
    }

    // MARK: - Project picker

    @ViewBuilder
    private var projectPicker: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Project")
                .sectionLabel()
                .padding(.horizontal, 4)

            if vm.projects.isEmpty {
                HStack(spacing: 10) {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .foregroundStyle(Theme.danger)
                        .font(.system(size: 13))
                    Text("No projects yet — add one in the Projects tab first.")
                        .font(.subheadline)
                        .foregroundStyle(Theme.muted)
                }
                .padding(.horizontal, 4)
            } else {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(vm.projects) { project in
                            Button { selectedProjectId = project.id } label: {
                                HStack(spacing: 6) {
                                    Image(systemName: "folder.fill")
                                        .font(.system(size: 12))
                                    Text(project.name)
                                        .font(.system(.subheadline, weight: .medium))
                                }
                                .padding(.horizontal, 14)
                                .padding(.vertical, 10)
                                .background(selectedProjectId == project.id ? Theme.green.opacity(0.15) : Theme.surface)
                                .foregroundStyle(selectedProjectId == project.id ? Theme.green : Theme.muted)
                                .clipShape(RoundedRectangle(cornerRadius: 10))
                                .overlay(
                                    RoundedRectangle(cornerRadius: 10)
                                        .strokeBorder(
                                            selectedProjectId == project.id ? Theme.green.opacity(0.4) : Theme.border,
                                            lineWidth: 0.5
                                        )
                                )
                            }
                        }
                    }
                    .padding(.horizontal, 4)
                }
            }
        }
    }

    // MARK: - Task input

    private var taskInput: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Task")
                .sectionLabel()
                .padding(.horizontal, 4)

            ZStack(alignment: .topLeading) {
                if prompt.isEmpty && !speech.isListening {
                    Text("What should \(vm.agent.name) do?")
                        .font(.body)
                        .foregroundStyle(Theme.muted)
                        .padding(.top, 14)
                        .padding(.leading, 16)
                        .allowsHitTesting(false)
                }
                TextEditor(text: $prompt)
                    .frame(minHeight: 130)
                    .scrollContentBackground(.hidden)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 10)
            }
            .background(Theme.surface)
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(Theme.border, lineWidth: 0.5))

            HStack(spacing: 10) {
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
                    .padding(.horizontal, 14)
                    .padding(.vertical, 8)
                    .background((speech.isListening ? Theme.danger : Theme.muted).opacity(0.1))
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                }

                if let err = speech.permissionError {
                    Text(err).font(.caption).foregroundStyle(Theme.danger)
                }
            }
        }
    }

    // MARK: - Advanced

    private var advancedSection: some View {
        VStack(alignment: .leading, spacing: 0) {
            Button {
                withAnimation(.spring(duration: 0.25)) { showAdvanced.toggle() }
            } label: {
                HStack(spacing: 6) {
                    Text("Advanced")
                        .font(.system(.caption2, weight: .semibold))
                        .foregroundStyle(Theme.muted)
                        .textCase(.uppercase)
                        .tracking(1.2)
                    Image(systemName: showAdvanced ? "chevron.up" : "chevron.down")
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundStyle(Theme.muted)
                }
                .padding(.horizontal, 4)
                .padding(.vertical, 6)
            }

            if showAdvanced {
                VStack(alignment: .leading, spacing: 10) {
                    Text("Base Branch")
                        .sectionLabel()
                        .padding(.horizontal, 4)
                    PilotTextField("main", text: $baseBranch)
                }
                .padding(.top, 10)
                .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
    }

    // MARK: - Start button

    private var startButton: some View {
        Button {
            Task { await start() }
        } label: {
            Group {
                if isStarting {
                    ProgressView().tint(.black)
                } else {
                    Label("Start Task", systemImage: "arrow.up.circle.fill")
                        .font(.system(.body, weight: .semibold))
                        .foregroundStyle(.black)
                }
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 16)
            .background(canStart ? Theme.green : Theme.surface)
            .clipShape(RoundedRectangle(cornerRadius: 14))
        }
        .disabled(!canStart)
        .animation(.easeInOut(duration: 0.15), value: canStart)
    }

    private func start() async {
        if speech.isListening { speech.stopListening() }
        isStarting = true
        let trimmedPrompt = prompt.trimmingCharacters(in: .whitespaces)
        if let run = await vm.assignTask(
            projectId: selectedProjectId,
            baseBranch: baseBranch.isEmpty ? nil : baseBranch
        ) {
            dismiss()
            onStarted(run, trimmedPrompt)
        }
        isStarting = false
    }
}
