import Foundation

@MainActor
final class WebSocketClient: ObservableObject {
    @Published var lines: [OutputLine] = []
    @Published var isDone = false
    @Published var error: String?

    var onAssistantText: ((String) -> Void)?
    var onStreamDone: (() -> Void)?

    private var task: URLSessionWebSocketTask?

    struct OutputLine: Identifiable {
        let id = UUID()
        let text: String
        let kind: Kind
        enum Kind { case assistant, tool, system, stderr }
    }

    func connect(serverURL: String, token: String, sessionId: String, prompt: String, apiKey: String) {
        guard let url = wsURL(serverURL: serverURL, token: token) else { return }
        task = URLSession.shared.webSocketTask(with: url)
        task?.resume()
        sendRun(sessionId: sessionId, prompt: prompt, apiKey: apiKey)
        receive()
    }

    /// Connect to a server-side session. Passes apiKey so the server can start it if still idle.
    func subscribe(serverURL: String, token: String, sessionId: String, apiKey: String) {
        guard let url = wsURL(serverURL: serverURL, token: token) else { return }
        task = URLSession.shared.webSocketTask(with: url)
        task?.resume()
        var payload: [String: String] = ["type": "subscribe", "sessionId": sessionId]
        payload["apiKey"] = apiKey
        guard let data = try? JSONEncoder().encode(payload) else { return }
        task?.send(.data(data)) { _ in }
        receive()
    }

    private func wsURL(serverURL: String, token: String) -> URL? {
        guard let base = URL(string: serverURL),
              var components = URLComponents(url: base.appendingPathComponent("ws"), resolvingAgainstBaseURL: false)
        else { return nil }
        components.scheme = base.scheme == "https" ? "wss" : "ws"
        components.queryItems = [URLQueryItem(name: "token", value: token)]
        return components.url
    }

    func disconnect() {
        task?.cancel(with: .goingAway, reason: nil)
        task = nil
    }

    private func sendRun(sessionId: String, prompt: String, apiKey: String) {
        let payload: [String: String] = [
            "type": "run", "sessionId": sessionId, "prompt": prompt, "apiKey": apiKey,
        ]
        guard let data = try? JSONEncoder().encode(payload) else { return }
        task?.send(.data(data)) { _ in }
    }

    private func receive() {
        task?.receive { [weak self] result in
            Task { @MainActor [weak self] in
                guard let self else { return }
                switch result {
                case .success(let msg):
                    self.handle(msg)
                    if !self.isDone { self.receive() }
                case .failure(let err):
                    self.error = err.localizedDescription
                }
            }
        }
    }

    private func handle(_ message: URLSessionWebSocketTask.Message) {
        let raw: Data
        switch message {
        case .data(let d):   raw = d
        case .string(let s): raw = Data(s.utf8)
        @unknown default:    return
        }

        guard let msg = try? JSONDecoder().decode(SocketMessage.self, from: raw) else { return }

        switch msg.type {
        case "stdout":
            // Try to parse as Claude stream-json line
            parseStreamLine(msg.data)
        case "stderr":
            lines.append(.init(text: msg.data, kind: .stderr))
        case "done":
            isDone = true
            onStreamDone?()
            lines.append(.init(text: "── finished ──", kind: .system))
        case "error":
            error = msg.data
        default:
            break
        }
    }

    // MARK: - stream-json parsing

    private func parseStreamLine(_ raw: String) {
        // Claude --output-format stream-json emits one JSON object per line
        for line in raw.components(separatedBy: "\n") {
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            guard !trimmed.isEmpty else { continue }

            guard let data = trimmed.data(using: .utf8),
                  let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
            else {
                // Not JSON — show raw
                lines.append(.init(text: trimmed, kind: .tool))
                return
            }

            let type = obj["type"] as? String ?? ""

            switch type {
            case "assistant":
                if let message = obj["message"] as? [String: Any],
                   let content = message["content"] as? [[String: Any]] {
                    for block in content {
                        if block["type"] as? String == "text", let text = block["text"] as? String {
                            lines.append(.init(text: text, kind: .assistant))
                            onAssistantText?(text)
                        }
                    }
                }

            case "tool_use" where obj["subtype"] as? String == "pre_tool_use":
                let name = obj["name"] as? String ?? "tool"
                if let input = obj["input"] as? [String: Any] {
                    let summary = input.map { "\($0.key): \($0.value)" }.joined(separator: ", ")
                    lines.append(.init(text: "▸ \(name)(\(summary))", kind: .tool))
                } else {
                    lines.append(.init(text: "▸ \(name)", kind: .tool))
                }

            case "result":
                if let result = obj["result"] as? String {
                    lines.append(.init(text: result, kind: .assistant))
                    onAssistantText?(result)
                }

            default:
                break
            }
        }
    }
}
