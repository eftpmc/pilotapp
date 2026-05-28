import SwiftUI

struct SessionRunView: View {
    let session: AgentSession
    let projectName: String?
    var initialPrompt: String? = nil
    var onDeleted: (() -> Void)?
    @StateObject private var runVm = AgentRunViewModel()
    @StateObject private var speech = SpeechService()
    @Environment(\.dismiss) private var dismiss
    @State private var showingDiff = false
    @State private var voiceOutputOn = true
    @State private var hasStarted = false
    @State private var taskPrompt = ""

    var body: some View {
        VStack(spacing: 0) {
            if !hasStarted {
                idleView
            } else {
                terminalView
                actionBar
            }
        }
        .navigationTitle(session.provider.rawValue.capitalized)
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(Theme.card, for: .navigationBar)
        .toolbarColorScheme(.dark, for: .navigationBar)
        .toolbar {
            if let name = projectName {
                ToolbarItem(placement: .principal) {
                    VStack(spacing: 1) {
                        Text(session.provider.rawValue.capitalized)
                            .font(.system(.subheadline, weight: .semibold))
                        Text(name)
                            .font(.system(.caption2))
                            .foregroundStyle(Theme.muted)
                    }
                }
            }
        }
        .sheet(isPresented: $showingDiff) {
            DiffView(diff: runVm.diff, sessionId: session.id, runVm: runVm) {
                onDeleted?()
                dismiss()
            }
        }
        .onAppear {
            runVm.socket.onAssistantText = { [weak speech] text in
                speech?.feedText(text)
            }
            runVm.socket.onStreamDone = { [weak speech] in
                speech?.flushSpeech()
            }
            if let prompt = initialPrompt, !prompt.isEmpty {
                taskPrompt = prompt
                runVm.run(session, prompt: prompt)
                hasStarted = true
            }
        }
        .onDisappear {
            speech.stopSpeaking()
            runVm.socket.onAssistantText = nil
            runVm.socket.onStreamDone = nil
        }
    }

    // MARK: - Idle: task input

    private var idleView: some View {
        ZStack {
            Theme.bg.ignoresSafeArea()

            VStack(spacing: 0) {
                // Agent badge
                VStack(spacing: 8) {
                    ZStack {
                        Circle()
                            .fill(session.provider.color.opacity(0.12))
                            .frame(width: 64, height: 64)
                        Image(systemName: session.provider.icon)
                            .font(.system(size: 24, weight: .semibold))
                            .foregroundStyle(session.provider.color)
                    }
                    VStack(spacing: 3) {
                        Text(session.provider.rawValue.capitalized)
                            .font(.system(.headline, weight: .semibold))
                            .foregroundStyle(.white)
                        HStack(spacing: 6) {
                            if let name = projectName {
                                Text(name)
                                    .foregroundStyle(Theme.muted)
                            }
                            Text(session.branch)
                                .foregroundStyle(Theme.muted.opacity(0.7))
                        }
                        .font(.system(.caption, design: .monospaced))
                    }
                }
                .padding(.top, 40)
                .padding(.bottom, 28)

                // Task input
                VStack(alignment: .leading, spacing: 10) {
                    Text("Task")
                        .sectionLabel()
                        .padding(.horizontal, 4)

                    ZStack(alignment: .topLeading) {
                        if taskPrompt.isEmpty && !speech.isListening {
                            Text("What should the agent do?")
                                .font(.body)
                                .foregroundStyle(Theme.muted)
                                .padding(.top, 14)
                                .padding(.leading, 16)
                                .allowsHitTesting(false)
                        }
                        TextEditor(text: $taskPrompt)
                            .frame(minHeight: 140)
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
                                    if !speech.transcript.isEmpty { taskPrompt = speech.transcript }
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

                        if speech.isListening && !speech.transcript.isEmpty {
                            Text(speech.transcript)
                                .font(.caption)
                                .foregroundStyle(Theme.muted)
                                .lineLimit(2)
                        }
                    }

                    if let err = speech.permissionError {
                        Text(err).font(.caption).foregroundStyle(Theme.danger)
                    }
                }
                .padding(.horizontal, 24)

                Spacer()

                Button {
                    if speech.isListening { speech.stopListening() }
                    runVm.run(session, prompt: taskPrompt)
                    hasStarted = true
                } label: {
                    Label("Send Task", systemImage: "arrow.up.circle.fill")
                        .font(.system(.body, weight: .semibold))
                        .foregroundStyle(.black)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 15)
                        .background(taskPrompt.isEmpty ? Theme.surface : Theme.green)
                        .clipShape(RoundedRectangle(cornerRadius: 14))
                }
                .disabled(taskPrompt.isEmpty)
                .padding(.horizontal, 24)
                .padding(.bottom, 32)
            }
        }
        .onChange(of: speech.transcript) { _, t in
            if speech.isListening { taskPrompt = t }
        }
    }

    // MARK: - Terminal output

    private var terminalView: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 2) {
                    ForEach(runVm.socket.lines) { line in
                        Text(line.text)
                            .font(.system(.caption, design: .monospaced))
                            .foregroundStyle(lineColor(for: line.kind))
                            .textSelection(.enabled)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .id(line.id)
                    }
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 12)
            }
            .background(Theme.term)
            .onChange(of: runVm.socket.lines.count) { _, _ in
                if let last = runVm.socket.lines.last {
                    withAnimation(.linear(duration: 0.1)) {
                        proxy.scrollTo(last.id, anchor: .bottom)
                    }
                }
            }
        }
    }

    // MARK: - Action bar

    private var actionBar: some View {
        VStack(spacing: 0) {
            Divider().background(Theme.border)
            HStack(spacing: 14) {
                if runVm.socket.isDone {
                    Button {
                        Task {
                            await runVm.loadDiff(sessionId: session.id)
                            showingDiff = true
                        }
                    } label: {
                        Label("Review", systemImage: "doc.text.magnifyingglass")
                            .font(.system(.subheadline, weight: .semibold))
                            .foregroundStyle(.black)
                            .padding(.horizontal, 18)
                            .padding(.vertical, 10)
                            .background(Theme.green)
                            .clipShape(RoundedRectangle(cornerRadius: 10))
                    }

                    Button(role: .destructive) {
                        Task {
                            try? await runVm.discard(sessionId: session.id)
                            onDeleted?()
                            dismiss()
                        }
                    } label: {
                        Label("Discard", systemImage: "trash")
                            .font(.system(.subheadline, weight: .medium))
                            .foregroundStyle(Theme.danger)
                            .padding(.horizontal, 18)
                            .padding(.vertical, 10)
                            .background(Theme.danger.opacity(0.1))
                            .clipShape(RoundedRectangle(cornerRadius: 10))
                            .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(Theme.danger.opacity(0.2), lineWidth: 0.5))
                    }
                } else {
                    HStack(spacing: 8) {
                        Circle()
                            .fill(Theme.green)
                            .frame(width: 7, height: 7)
                            .overlay(Circle().fill(Theme.green.opacity(0.3)).frame(width: 14, height: 14))
                        Text("Running")
                            .font(.system(size: 12, weight: .medium, design: .monospaced))
                            .foregroundStyle(Theme.green)
                    }
                }

                Spacer()

                if speech.isPlaying {
                    Image(systemName: "waveform")
                        .foregroundStyle(Theme.green)
                        .symbolEffect(.variableColor.iterative)
                }

                Button {
                    voiceOutputOn.toggle()
                    speech.setVoiceOutput(enabled: voiceOutputOn)
                    if !voiceOutputOn { speech.stopSpeaking() }
                } label: {
                    Image(systemName: voiceOutputOn ? "speaker.wave.2.fill" : "speaker.slash.fill")
                        .font(.system(size: 16))
                        .foregroundStyle(voiceOutputOn ? Theme.green : Theme.muted)
                }
            }
            .padding(.horizontal, 18)
            .padding(.vertical, 14)
            .background(Theme.card)
        }
    }

    private func lineColor(for kind: WebSocketClient.OutputLine.Kind) -> Color {
        switch kind {
        case .assistant: .white
        case .tool:      Color(red: 0.4, green: 0.9, blue: 1.0)
        case .stderr:    Color(red: 1.0, green: 0.6, blue: 0.2)
        case .system:    Theme.muted
        }
    }
}
