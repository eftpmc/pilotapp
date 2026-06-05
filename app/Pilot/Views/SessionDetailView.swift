import SwiftUI

// MARK: - View model

@Observable
@MainActor
final class SessionViewModel {
    var session: Session
    var agent: Agent?
    var projectAgents: [Agent] = []

    // Output
    var turns: [TurnData] = []
    var legacyLines: [OutputLine] = []
    var legacyDone = false
    var legacyExitCode: String?
    var liveTokens = TokenStats()

    // Tabs
    var activeTab: SessionTab = .output
    var diffContent: String?
    var diffIsText = false
    var diffLoading = false
    var diffError: String?

    // Clarification
    var clarification: ClarificationItem?
    var clarificationInput = ""

    // Bottom bars
    var continuePrompt = ""
    var idlePrompt = ""
    var retryHint = ""
    var isSendingContinue = false

    // Actions
    var isMerging = false
    var isDiscarding = false
    var actionError: String?
    var pushed = false

    private var stdoutBuffer = ""
    private var activeTurnId: String?

    var hasTurns: Bool { !turns.isEmpty }
    var isRunning: Bool { session.statusEnum == .running }
    var isDone:    Bool { session.statusEnum == .done }
    var isError:   Bool { session.statusEnum == .error }
    var isMerged:  Bool { session.statusEnum == .merged }
    var isIdle:    Bool { session.statusEnum == .idle }
    var isWaiting: Bool { session.statusEnum == .waiting }
    var isActive:  Bool { session.statusEnum.isLive }
    var canContinue: Bool { isDone && session.runnerSessionId != nil && !isMerged && session.parentSessionId == nil }

    var displayTokens: TokenStats? {
        if liveTokens.input > 0 || liveTokens.output > 0 { return liveTokens }
        if let i = session.inputTokens {
            return TokenStats(input: i, output: session.outputTokens ?? 0,
                              cacheRead: session.cacheReadTokens ?? 0, costUsd: session.totalCostUsd)
        }
        return nil
    }

    init(session: Session) { self.session = session }

    // MARK: Socket handler
    func handleMessage(type: String, data: String) {
        switch type {
        case "turn_start":
            if let p = try? JSONDecoder().decode(TurnStartPayload.self, from: Data(data.utf8)) {
                activeTurnId = p.turnId
                turns.append(TurnData(id: p.turnId, number: p.turnNumber, prompt: p.prompt))
                legacyDone = false; legacyExitCode = nil
            }
        case "turn_done":
            if let p = try? JSONDecoder().decode(TurnDonePayload.self, from: Data(data.utf8)) {
                activeTurnId = nil
                if let i = turns.firstIndex(where: { $0.id == p.turnId }) {
                    turns[i].status  = p.exitCode == "0" ? .done : .error
                    turns[i].exitCode = p.exitCode
                }
                legacyDone = true; legacyExitCode = p.exitCode
            }
        case "stdout":
            processStdout(data)
        case "stderr":
            dispatchLine(OutputLine(text: data, kind: .stderr))
        case "done":
            legacyDone = true; legacyExitCode = data.isEmpty ? "0" : data
        case "clarification":
            if let c = try? JSONDecoder().decode(ClarificationItem.self, from: Data(data.utf8)) {
                clarification = c; clarificationInput = ""
            }
        default: break
        }
    }

    // MARK: Stdout JSONL processing
    private func processStdout(_ chunk: String) {
        stdoutBuffer += chunk
        var parts = stdoutBuffer.components(separatedBy: "\n")
        if !stdoutBuffer.hasSuffix("\n") {
            stdoutBuffer = parts.removeLast()
        } else {
            stdoutBuffer = ""
        }
        for line in parts {
            let t = line.trimmingCharacters(in: .whitespaces)
            if !t.isEmpty { parseJSONLine(t) }
        }
    }

    private func parseJSONLine(_ line: String) {
        guard let data = line.data(using: .utf8),
              let obj  = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            dispatchLine(OutputLine(text: line, kind: .text))
            return
        }
        let type = obj["type"] as? String ?? ""
        switch type {
        case "assistant":
            guard let msg = obj["message"] as? [String: Any],
                  let content = msg["content"] as? [[String: Any]] else { return }
            for block in content {
                switch block["type"] as? String {
                case "text":
                    if let t = block["text"] as? String, !t.trimmingCharacters(in: .whitespaces).isEmpty {
                        dispatchLine(OutputLine(text: t.trimmingCharacters(in: .whitespaces), kind: .text))
                    }
                case "tool_use":
                    if let name = block["name"] as? String {
                        let input = block["input"] as? [String: Any] ?? [:]
                        dispatchLine(OutputLine(text: fmtTool(name: name, input: input), kind: .tool))
                    }
                case "thinking":
                    if let t = block["thinking"] as? String, !t.trimmingCharacters(in: .whitespaces).isEmpty {
                        let flat = t.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: "\n", with: " ")
                        let s = flat.count > 140 ? String(flat.prefix(140)) + "…" : flat
                        dispatchLine(OutputLine(text: "  💭 \(s)", kind: .thinking))
                    }
                default: break
                }
            }
            if let usage = msg["usage"] as? [String: Any] {
                liveTokens.input  += usage["input_tokens"]               as? Int ?? 0
                liveTokens.output += usage["output_tokens"]              as? Int ?? 0
                liveTokens.cacheRead += usage["cache_read_input_tokens"] as? Int ?? 0
            }
        case "user":
            guard let msg = obj["message"] as? [String: Any],
                  let content = msg["content"] as? [[String: Any]] else { return }
            for block in content {
                if block["type"] as? String == "tool_result", let preview = fmtResult(block["content"]) {
                    dispatchLine(OutputLine(text: preview, kind: .toolResult))
                }
            }
        case "result":
            if let r = obj["result"] as? String, !r.trimmingCharacters(in: .whitespaces).isEmpty {
                dispatchLine(OutputLine(text: r.trimmingCharacters(in: .whitespaces), kind: .text))
            }
            if let cost = obj["total_cost_usd"] as? Double { liveTokens.costUsd = cost }
        default: break
        }
    }

    private func dispatchLine(_ line: OutputLine) {
        if let tid = activeTurnId, let i = turns.firstIndex(where: { $0.id == tid }) {
            turns[i].lines.append(line)
            if turns[i].lines.count > 2000 { turns[i].lines.removeFirst(turns[i].lines.count - 2000) }
        } else {
            legacyLines.append(line)
            if legacyLines.count > 2000 { legacyLines.removeFirst(legacyLines.count - 2000) }
        }
    }

    private func fmtTool(name: String, input: [String: Any]) -> String {
        let entries = input.sorted { $0.key < $1.key }
        if entries.isEmpty { return "▸ \(name)" }
        if entries.count == 1 {
            let v = String(describing: entries[0].value)
            return "▸ \(name)  \(v.count > 72 ? "…" + v.suffix(60) : v)"
        }
        let parts = entries.prefix(2).map { "\($0.key): \(String(describing: $0.value).prefix(35))" }
        return "▸ \(name)  \(parts.joined(separator: "  "))"
    }

    private func fmtResult(_ content: Any?) -> String? {
        guard let content else { return nil }
        if let s = content as? String {
            let t = s.trimmingCharacters(in: .whitespaces)
            return t.isEmpty ? nil : (t.count > 180 ? "  " + t.prefix(178) + "…" : "  " + t)
        }
        if let arr = content as? [[String: Any]] {
            let texts = arr.compactMap { $0["text"] as? String }
                          .map { $0.trimmingCharacters(in: .whitespaces) }
                          .filter { !$0.isEmpty }
            let j = texts.joined(separator: " ")
            return j.isEmpty ? nil : (j.count > 180 ? "  " + j.prefix(178) + "…" : "  " + j)
        }
        return nil
    }
}

enum SessionTab { case output, diff, journal }

// MARK: - View

struct SessionDetailView: View {
    let initialSession: Session
    @State private var vm: SessionViewModel
    @Environment(AppState.self) private var appState
    @Environment(\.dismiss) private var dismiss
    @State private var showDiscardAlert = false
    @State private var task: WorkTask?

    init(session: Session) {
        initialSession = session
        _vm = State(initialValue: SessionViewModel(session: session))
    }

    var body: some View {
        ZStack(alignment: .bottom) {
            Color.bg.ignoresSafeArea()

            VStack(spacing: 0) {
                tabBar

                ZStack {
                    switch vm.activeTab {
                    case .output:  outputTab
                    case .diff:    diffTab
                    case .journal: journalTab
                    }
                }
                .frame(maxHeight: .infinity)

                bottomBar
            }

            if let c = vm.clarification {
                clarificationOverlay(c)
            }
        }
        .navigationTitle(task?.title ?? vm.agent?.name ?? "Session")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(Color.bg, for: .navigationBar)
        .toolbarColorScheme(.dark, for: .navigationBar)
        .toolbar { toolbarItems }
        .alert("Discard session?", isPresented: $showDiscardAlert) {
            Button("Discard", role: .destructive) { discard() }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("The branch and all changes will be deleted. This cannot be undone.")
        }
        .task { await loadInitial() }
        .task(id: appState.socket?.refreshTick) {
            guard (appState.socket?.refreshTick ?? 0) > 0 else { return }
            await refreshSession()
        }
        .onAppear {
            appState.socket?.subscribeSession(vm.session.id) { [weak vm = vm] type, data in
                vm?.handleMessage(type: type, data: data)
            }
        }
        .onDisappear {
            appState.socket?.unsubscribeSession(vm.session.id)
        }
    }

    // MARK: - Header / tabs

    private var tabBar: some View {
        VStack(spacing: 0) {
            // Agent + status header
            HStack(alignment: .top, spacing: 12) {
                AgentAvatar(agent: vm.agent, size: 44, running: vm.isActive)
                VStack(alignment: .leading, spacing: 6) {
                    Text(task?.title ?? vm.agent?.name ?? vm.session.shortBranch)
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundStyle(Color.ink)
                        .lineLimit(2)

                    HStack(spacing: 7) {
                        if let agentName = vm.agent?.name {
                            Text(agentName)
                                .font(.system(size: 13))
                                .foregroundStyle(Color.ink2)
                        }
                        StatusBadge(status: vm.session.statusEnum)
                        if vm.isActive {
                            ElapsedChip(createdAt: task?.startedAt ?? vm.session.createdAt)
                        }
                        if vm.hasTurns {
                            Text("\(vm.turns.count) turn\(vm.turns.count == 1 ? "" : "s")")
                                .font(.caption2)
                                .foregroundStyle(Color.muted)
                        }

                    }

                    if !vm.session.shortBranch.isEmpty {
                        Text(vm.session.shortBranch)
                            .font(.mono)
                            .foregroundStyle(Color.muted)
                            .lineLimit(1)
                    }
                }
                Spacer()
                if let tokens = vm.displayTokens, let cost = tokens.costUsd {
                    VStack(alignment: .trailing, spacing: 2) {
                        Text(String(format: "$%.4f", cost))
                            .font(.label)
                            .foregroundStyle(Color.ink2)
                        let fmt = { (n: Int) -> String in n >= 1000 ? "\(n/1000)k" : "\(n)" }
                        Text("↑\(fmt(tokens.input)) ↓\(fmt(tokens.output))")
                            .font(.system(size: 10, design: .monospaced))
                            .foregroundStyle(Color.muted)
                    }
                }
            }
            .padding(.horizontal, 24)
            .padding(.top, 18)
            .padding(.bottom, 14)

            if let err = vm.actionError {
                Text(err)
                    .font(.footnote)
                    .foregroundStyle(Color.pilotRed)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 24)
                    .padding(.bottom, 8)
            }

            // Tabs
            HStack(spacing: 0) {
                tabButton("Output", tab: .output)
                tabButton(vm.session.isWorkspace ? "Files" : "Diff", tab: .diff)
                if vm.session.journal != nil || vm.isActive {
                    tabButton(vm.session.parentSessionId != nil ? "Review" : "Journal", tab: .journal)
                }
            }
            .padding(.horizontal, 24)

            Divider().background(Color.rule)
        }
        .background(Color.bg)
    }

    private func tabButton(_ label: String, tab: SessionTab) -> some View {
        Button { switchTab(tab) } label: {
            Text(label)
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(vm.activeTab == tab ? Color.ink : Color.muted)
                .padding(.vertical, 10)
                .padding(.horizontal, 14)
                .overlay(alignment: .bottom) {
                    if vm.activeTab == tab {
                        Rectangle().fill(Color.ember).frame(height: 2)
                    }
                }
        }
    }

    private func switchTab(_ tab: SessionTab) {
        vm.activeTab = tab
        if tab == .diff && vm.diffContent == nil { loadDiff() }
    }

    // MARK: - Output tab

    private var outputTab: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 0) {
                    if vm.hasTurns {
                        if !vm.legacyLines.isEmpty {
                            legacyBlock
                        }
                        ForEach(Array(vm.turns.enumerated()), id: \.element.id) { i, turn in
                            TurnCard(turn: turn, isActive: i == vm.turns.count - 1)
                                .padding(.horizontal, 24)
                                .padding(.vertical, 4)
                        }
                    } else {
                        legacyBlock
                    }
                    Color.clear.frame(height: 1).id("bottom")
                }
                .padding(.bottom, 8)
            }
            .onChange(of: vm.legacyLines.count) { proxy.scrollTo("bottom") }
            .onChange(of: vm.turns.last?.lines.count) { proxy.scrollTo("bottom") }
        }
        .background(Color.bg)
    }

    private var legacyBlock: some View {
        VStack(alignment: .leading, spacing: 0) {
            if vm.legacyLines.isEmpty && !vm.legacyDone {
                Text(vm.isActive ? "starting…" : "No output")
                    .font(.mono)
                    .foregroundStyle(Color.muted)
                    .padding(24)
            }
            ForEach(vm.legacyLines) { line in
                outputLine(line)
            }
            if vm.isActive && !vm.legacyDone {
                cursorBlink
                    .padding(.horizontal, 24)
                    .padding(.top, 4)
            }
            if vm.legacyDone {
                exitFooter(code: vm.legacyExitCode ?? "0")
            }
        }
    }

    // MARK: - Diff tab

    private var diffTab: some View {
        ScrollView {
            Group {
                if vm.diffLoading {
                    ProgressView().tint(Color.ember).padding(40)
                } else if let err = vm.diffError {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Diff unavailable")
                            .font(.system(size: 14, weight: .medium))
                            .foregroundStyle(Color.ink)
                        Text(err)
                            .font(.footnote)
                            .foregroundStyle(Color.muted)
                    }
                    .padding(16)
                    .background(Color.panel, in: RoundedRectangle(cornerRadius: 10))
                    .padding(16)
                } else if let diff = vm.diffContent {
                    if vm.diffIsText {
                        Text(diff)
                            .font(.mono)
                            .foregroundStyle(Color.ink2)
                            .textSelection(.enabled)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(16)
                    } else {
                        ColoredDiff(raw: diff)
                            .padding(16)
                    }
                } else {
                    Text("Tap Diff to load")
                        .font(.footnote)
                        .foregroundStyle(Color.muted)
                        .padding(40)
                }
            }
            .frame(maxWidth: .infinity)
        }
        .background(Color.bg)
    }

    // MARK: - Journal tab

    private var journalTab: some View {
        ScrollView {
            if let journal = vm.session.journal {
                JournalView(text: journal)
                    .padding(16)
            } else {
                Text("No journal yet…")
                    .font(.mono)
                    .foregroundStyle(Color.muted)
                    .padding(40)
            }
        }
        .background(Color.bg)
    }

    // MARK: - Bottom bar

    @ViewBuilder
    private var bottomBar: some View {
        if vm.isMerged {
            mergedBanner
        } else if vm.isWaiting && vm.clarification == nil {
            waitingBanner
        } else if vm.isError {
            errorBar
        } else if vm.isIdle && vm.session.workTaskId == nil {
            idleBar
        } else if vm.canContinue {
            continueBar
        } else if vm.isRunning || vm.isDone {
            actionBar
        }
    }

    private var actionBar: some View {
        HStack(spacing: 10) {
            if vm.isRunning {
                Button { stop() } label: {
                    Text("Stop")
                        .font(.system(size: 14, weight: .medium))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .background(Color.panel)
                        .foregroundStyle(Color.ink2)
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                        .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.rule, lineWidth: 1))
                }
            }
            if vm.isDone {
                Button { merge() } label: {
                    ZStack {
                        Text(vm.session.isWorkspace ? "Complete ✓" : "Merge ✓")
                            .font(.system(size: 14, weight: .semibold))
                            .opacity(vm.isMerging ? 0 : 1)
                        if vm.isMerging { ProgressView().tint(.white).scaleEffect(0.8) }
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(Color.ember)
                    .foregroundStyle(.white)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                }
                .disabled(vm.isMerging)
            }
            Button { showDiscardAlert = true } label: {
                Text("Discard")
                    .font(.system(size: 14, weight: .medium))
                    .padding(.horizontal, 16)
                    .padding(.vertical, 12)
                    .background(Color.pilotRed.opacity(0.08))
                    .foregroundStyle(Color.pilotRed)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
            }
            .disabled(vm.isDiscarding)
        }
        .padding(.horizontal, 24)
        .padding(.vertical, 14)
        .background(Color.bg)
        .overlay(alignment: .top) { Divider().background(Color.rule) }
    }

    private var continueBar: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Add a follow-up")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(Color.ink)
            HStack(spacing: 10) {
                TextField("Continue where it left off, fix something, or add to the work...", text: $vm.continuePrompt, axis: .vertical)
                    .font(.system(size: 14))
                    .foregroundStyle(Color.ink)
                    .lineLimit(1...4)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 10)
                    .background(Color.panel2)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                    .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.ember.opacity(0.9), lineWidth: 1))
                Button { sendContinue() } label: {
                    ZStack {
                        Text("Send")
                            .font(.system(size: 13, weight: .semibold))
                            .opacity(vm.isSendingContinue ? 0 : 1)
                        if vm.isSendingContinue { ProgressView().tint(Color.ember) }
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .background(Color.panel)
                    .foregroundStyle(vm.continuePrompt.trimmingCharacters(in: .whitespaces).isEmpty ? Color.muted : Color.ink)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                    .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.rule, lineWidth: 1))
                }
                .disabled(vm.continuePrompt.trimmingCharacters(in: .whitespaces).isEmpty || vm.isSendingContinue)
            }
        }
        .padding(.horizontal, 24)
        .padding(.vertical, 14)
        .background(Color.bg)
        .overlay(alignment: .top) { Divider().background(Color.rule) }
    }

    private var idleBar: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("What should this agent do?")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(Color.ink)
            HStack(spacing: 10) {
                TextField("Describe the task…", text: $vm.idlePrompt, axis: .vertical)
                    .font(.system(size: 14))
                    .foregroundStyle(Color.ink)
                    .lineLimit(1...4)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 10)
                    .background(Color.panel2)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                    .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.rule, lineWidth: 1))
                Button { runIdle() } label: {
                    Image(systemName: "arrow.up.circle.fill")
                        .font(.system(size: 28))
                        .foregroundStyle(vm.idlePrompt.trimmingCharacters(in: .whitespaces).isEmpty ? Color.muted : Color.ember)
                }
                .disabled(vm.idlePrompt.trimmingCharacters(in: .whitespaces).isEmpty)
            }
        }
        .padding(.horizontal, 24)
        .padding(.vertical, 14)
        .background(Color.bg)
        .overlay(alignment: .top) { Divider().background(Color.rule) }
    }

    private var errorBar: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Session ended with an error")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(Color.pilotRed)
            HStack(spacing: 10) {
                TextField("Optional context before retrying…", text: $vm.retryHint, axis: .vertical)
                    .font(.system(size: 14))
                    .foregroundStyle(Color.ink)
                    .lineLimit(1...3)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 10)
                    .background(Color.panel2)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                    .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.rule, lineWidth: 1))
                Button("Retry") { retry() }
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                    .background(Color.ember)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
            }
        }
        .padding(.horizontal, 24)
        .padding(.vertical, 14)
        .background(Color.pilotRed.opacity(0.05))
        .overlay(alignment: .top) { Divider().background(Color.pilotRed.opacity(0.2)) }
    }

    private var mergedBanner: some View {
        HStack(spacing: 10) {
            Text(vm.session.isWorkspace ? "Completed ✓" : "Merged ✓")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(Color.green)
            Spacer()
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .background(Color.green.opacity(0.06))
        .overlay(alignment: .top) { Divider().background(Color.green.opacity(0.2)) }
    }

    private var waitingBanner: some View {
        HStack(spacing: 10) {
            Circle().fill(Color(hex: "#C8A04B")).frame(width: 7, height: 7)
            Text("Agent is waiting for your input…")
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(Color(hex: "#C8A04B"))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .background(Color(hex: "#C8A04B").opacity(0.06))
        .overlay(alignment: .top) { Divider().background(Color(hex: "#C8A04B").opacity(0.2)) }
    }

    // MARK: - Clarification overlay

    private func clarificationOverlay(_ c: ClarificationItem) -> some View {
        ZStack {
            Color.black.opacity(0.55).ignoresSafeArea()
            VStack(alignment: .leading, spacing: 16) {
                Text("AGENT NEEDS YOUR INPUT")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(Color(hex: "#C8A04B"))
                    .tracking(1)

                Text(c.question)
                    .font(.system(size: 16, weight: .medium))
                    .foregroundStyle(Color.ink)

                if let options = c.options, !options.isEmpty {
                    VStack(spacing: 8) {
                        ForEach(options, id: \.self) { opt in
                            Button { submitClarification(c, response: opt) } label: {
                                Text(opt)
                                    .font(.system(size: 14))
                                    .foregroundStyle(Color.ink)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .padding(.horizontal, 14)
                                    .padding(.vertical, 12)
                                    .background(Color.panel2)
                                    .clipShape(RoundedRectangle(cornerRadius: 8))
                                    .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.rule, lineWidth: 1))
                            }
                        }
                    }
                } else {
                    VStack(spacing: 10) {
                        TextField("Type your answer…", text: $vm.clarificationInput, axis: .vertical)
                            .font(.system(size: 14))
                            .foregroundStyle(Color.ink)
                            .lineLimit(2...5)
                            .padding(12)
                            .background(Color.panel2)
                            .clipShape(RoundedRectangle(cornerRadius: 8))
                            .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.rule, lineWidth: 1))
                        Button {
                            submitClarification(c, response: vm.clarificationInput)
                        } label: {
                            Text("Send")
                                .font(.system(size: 14, weight: .semibold))
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 12)
                                .background(vm.clarificationInput.trimmingCharacters(in: .whitespaces).isEmpty ? Color.ember.opacity(0.4) : Color.ember)
                                .foregroundStyle(.white)
                                .clipShape(RoundedRectangle(cornerRadius: 8))
                        }
                        .disabled(vm.clarificationInput.trimmingCharacters(in: .whitespaces).isEmpty)
                    }
                }
            }
            .padding(24)
            .background(Color.panel, in: RoundedRectangle(cornerRadius: 16))
            .overlay(RoundedRectangle(cornerRadius: 16).stroke(Color.rule, lineWidth: 1))
            .padding(.horizontal, 24)
        }
    }

    // MARK: - Toolbar

    @ToolbarContentBuilder
    private var toolbarItems: some ToolbarContent {
        ToolbarItem(placement: .topBarTrailing) {
            if vm.isDone || vm.isError {
                Menu {
                    if vm.isDone { Button("Diff") { switchTab(.diff) } }
                    if vm.session.journal != nil { Button("Journal") { vm.activeTab = .journal } }
                    if !vm.projectAgents.filter({ $0.id != vm.session.agentId }).isEmpty && vm.isDone && vm.session.reviewVerdict == nil {
                        Menu("Request Review") {
                            ForEach(vm.projectAgents.filter { $0.id != vm.session.agentId }) { a in
                                Button(a.name) { requestReview(agentId: a.id) }
                            }
                        }
                    }
                } label: {
                    Image(systemName: "ellipsis.circle")
                        .foregroundStyle(Color.ink2)
                }
            }
        }
    }

    // MARK: - Output helpers

    private func outputLine(_ line: OutputLine) -> some View {
        Text(line.text)
            .font(.mono)
            .foregroundStyle(lineColor(line.kind))
            .opacity(line.kind == .toolResult || line.kind == .thinking ? 0.7 : 1)
            .textSelection(.enabled)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 24)
            .padding(.vertical, 1)
    }

    private func lineColor(_ kind: LineKind) -> Color {
        switch kind {
        case .tool:       return .ember
        case .toolResult: return .muted
        case .thinking:   return Color(hex: "#8B7EC8")
        case .stderr:     return .muted
        case .mcpError:   return .pilotRed
        case .text:       return .ink2
        }
    }

    private var cursorBlink: some View {
        RoundedRectangle(cornerRadius: 1)
            .fill(Color.ink)
            .frame(width: 8, height: 14)
            .opacity(0.8)
    }

    private func exitFooter(code: String) -> some View {
        Text("process exited \(code)")
            .font(.system(size: 11, design: .monospaced))
            .foregroundStyle(Color.muted.opacity(0.5))
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 16)
            .padding(.top, 12)
            .padding(.bottom, 8)
    }

    // MARK: - Actions

    private func loadInitial() async {
        guard let client = appState.client else { return }
        async let s  = client.session(vm.session.id)
        async let a  = client.agents()
        do {
            let (updatedSession, allAgents) = try await (s, a)
            vm.session       = updatedSession
            vm.agent         = allAgents.first { $0.id == updatedSession.agentId }
            vm.projectAgents = allAgents
            if let taskId = updatedSession.workTaskId {
                task = try? await client.tasks(projectId: updatedSession.projectId).first { $0.id == taskId }
            }
        } catch {}
    }

    private func refreshSession() async {
        guard let client = appState.client,
              let updated = try? await client.session(vm.session.id) else { return }
        vm.session = updated
        if vm.clarification != nil {
            let items = (try? await client.clarifications(vm.session.id)) ?? []
            if items.first(where: { $0.respondedAt == nil }) == nil { vm.clarification = nil }
        }
    }

    private func loadDiff() {
        guard let client = appState.client else { return }
        vm.diffLoading = true
        vm.diffError   = nil
        Task {
            do {
                let (diff, isText) = try await client.diff(vm.session.id)
                vm.diffContent = diff
                vm.diffIsText  = isText
            } catch {
                vm.diffError = error.localizedDescription
            }
            vm.diffLoading = false
        }
    }

    private func merge() {
        guard let client = appState.client else { return }
        vm.isMerging = true; vm.actionError = nil
        Task {
            do {
                try await client.mergeSession(vm.session.id)
                vm.session = (try? await client.session(vm.session.id)) ?? vm.session
            } catch { vm.actionError = error.localizedDescription }
            vm.isMerging = false
        }
    }

    private func discard() {
        guard let client = appState.client else { return }
        vm.isDiscarding = true; vm.actionError = nil
        Task {
            do {
                try await client.discardSession(vm.session.id)
                dismiss()
            } catch {
                vm.actionError = error.localizedDescription
                vm.isDiscarding = false
            }
        }
    }

    private func stop() {
        guard let client = appState.client else { return }
        Task {
            try? await client.stopSession(vm.session.id)
            vm.session = (try? await client.session(vm.session.id)) ?? vm.session
        }
    }

    private func sendContinue() {
        guard let client = appState.client,
              !vm.continuePrompt.trimmingCharacters(in: .whitespaces).isEmpty else { return }
        vm.isSendingContinue = true
        Task {
            try? await client.addTurn(vm.session.id, prompt: vm.continuePrompt.trimmingCharacters(in: .whitespaces))
            vm.continuePrompt = ""
            vm.isSendingContinue = false
        }
    }

    private func runIdle() {
        guard let client = appState.client,
              !vm.idlePrompt.trimmingCharacters(in: .whitespaces).isEmpty else { return }
        let prompt = vm.idlePrompt.trimmingCharacters(in: .whitespaces)
        vm.idlePrompt = ""
        Task {
            try? await client.run(vm.session.id, prompt: prompt)
            vm.legacyLines = []; vm.turns = []; vm.legacyDone = false
        }
    }

    private func retry() {
        guard let client = appState.client else { return }
        let hint = vm.retryHint.trimmingCharacters(in: .whitespaces)
        let prompt = hint.isEmpty ? nil : "Continue where you left off.\n\nAdditional context: \(hint)"
        vm.retryHint = ""; vm.legacyLines = []; vm.turns = []; vm.legacyDone = false
        Task {
            try? await client.run(vm.session.id, prompt: prompt)
        }
    }

    private func requestReview(agentId: String) {
        guard let client = appState.client else { return }
        Task {
            try? await client.requestReview(vm.session.id, agentId: agentId)
            await refreshSession()
        }
    }

    private func submitClarification(_ c: ClarificationItem, response: String) {
        guard let client = appState.client, !response.trimmingCharacters(in: .whitespaces).isEmpty else { return }
        Task {
            try? await client.respondToClarification(
                sessionId: vm.session.id,
                clarificationId: c.id,
                response: response.trimmingCharacters(in: .whitespaces)
            )
            vm.clarification = nil
            vm.clarificationInput = ""
        }
    }
}

// MARK: - Turn card

private struct TurnCard: View {
    let turn: TurnData
    let isActive: Bool
    @State private var expanded: Bool

    init(turn: TurnData, isActive: Bool) {
        self.turn = turn
        self.isActive = isActive
        _expanded = State(initialValue: isActive)
    }

    var body: some View {
        VStack(spacing: 0) {
            // Header
            Button {
                withAnimation(.easeInOut(duration: 0.15)) { expanded.toggle() }
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: expanded ? "chevron.down" : "chevron.right")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundStyle(Color.muted)

                    Text("Turn \(turn.number)")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(Color.muted)
                        .tracking(0.5)

                    Circle()
                        .fill(statusColor)
                        .frame(width: 6, height: 6)

                    if let code = turn.exitCode, turn.status != .running {
                        Text("exit \(code)")
                            .font(.system(size: 10, design: .monospaced))
                            .foregroundStyle(Color.muted)
                    }

                    Spacer()

                    Text(turn.prompt.count > 90 ? String(turn.prompt.prefix(88)) + "…" : turn.prompt)
                        .font(.system(size: 13))
                        .foregroundStyle(Color.ink)
                        .lineLimit(1)
                        .frame(maxWidth: 220, alignment: .trailing)
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 10)
            }
            .buttonStyle(.plain)

            if expanded {
                Divider().background(Color.rule.opacity(0.5))
                VStack(alignment: .leading, spacing: 0) {
                    if turn.lines.isEmpty && turn.status == .running {
                        Text("starting…")
                            .font(.mono)
                            .foregroundStyle(Color.muted)
                            .padding(12)
                    }
                    ForEach(turn.lines) { line in
                        Text(line.text)
                            .font(.mono)
                            .foregroundStyle(turnLineColor(line.kind))
                            .opacity(line.kind == .toolResult || line.kind == .thinking ? 0.7 : 1)
                            .textSelection(.enabled)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 1)
                    }
                    if turn.status != .running && !turn.lines.isEmpty {
                        Text("exit \(turn.exitCode ?? "0")")
                            .font(.system(size: 10, design: .monospaced))
                            .foregroundStyle(Color.muted.opacity(0.5))
                            .padding(.horizontal, 12)
                            .padding(.top, 8)
                            .padding(.bottom, 6)
                    }
                }
            }
        }
        .background(isActive ? Color.panel : Color.clear)
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.rule, lineWidth: 1))
        .onChange(of: isActive) { if isActive { expanded = true } }
    }

    private var statusColor: Color {
        switch turn.status {
        case .running: return .green
        case .done:    return .muted
        case .error:   return .pilotRed
        }
    }

    private func turnLineColor(_ kind: LineKind) -> Color {
        switch kind {
        case .tool:       return .ember
        case .toolResult: return .muted
        case .thinking:   return Color(hex: "#8B7EC8")
        case .stderr:     return .muted
        case .mcpError:   return .pilotRed
        case .text:       return .ink2
        }
    }
}

// MARK: - Journal view

private struct JournalView: View {
    let text: String

    struct Block: Identifiable {
        enum Kind { case h2(String), beat([String]) }
        let id = UUID()
        let kind: Kind
    }

    private var blocks: [Block] {
        var result: [Block] = []
        for raw in text.split(separator: "\n", omittingEmptySubsequences: false) {
            let line = String(raw).trimmingCharacters(in: CharacterSet(charactersIn: "\r"))
            if line.hasPrefix("## ") || line.hasPrefix("**") {
                let heading = line.replacingOccurrences(of: "^#{1,2}\\s+", with: "", options: .regularExpression)
                                   .trimmingCharacters(in: CharacterSet(charactersIn: "*# "))
                if !heading.isEmpty { result.append(Block(kind: .h2(heading))) }
            } else if line.isEmpty {
                // ignore
            } else {
                if case .beat(let lines) = result.last?.kind {
                    result[result.count - 1] = Block(kind: .beat(lines + [line]))
                } else {
                    result.append(Block(kind: .beat([line])))
                }
            }
        }
        return result
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(blocks) { block in
                switch block.kind {
                case .h2(let heading):
                    Text(heading.uppercased())
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundStyle(Color.muted.opacity(0.5))
                        .tracking(1.5)
                        .padding(.top, 24)
                        .padding(.bottom, 8)
                case .beat(let lines):
                    HStack(alignment: .top, spacing: 12) {
                        Rectangle()
                            .fill(Color.rule)
                            .frame(width: 1)
                            .padding(.top, 4)
                        VStack(alignment: .leading, spacing: 2) {
                            ForEach(Array(lines.enumerated()), id: \.offset) { _, line in
                                Text(line)
                                    .font(.system(size: 14))
                                    .foregroundStyle(Color.ink2)
                                    .lineSpacing(4)
                            }
                        }
                    }
                    .padding(.bottom, 10)
                }
            }
        }
    }
}
