import Foundation
import Observation

@Observable
@MainActor
final class SocketClient {
    private(set) var refreshTick: Int = 0
    private var wsTask: URLSessionWebSocketTask?
    private var sessionHandlers: [String: (String, String) -> Void] = [:]
    private var receiveTask: Task<Void, Never>?
    private var baseURL: URL?
    private var token: String?

    func connect(baseURL: URL, token: String) {
        self.baseURL = baseURL
        self.token = token
        reconnect()
    }

    private func reconnect() {
        guard let baseURL, let token else { return }
        var c = URLComponents(url: baseURL, resolvingAgainstBaseURL: false)!
        c.scheme = c.scheme == "https" ? "wss" : "ws"
        c.path = "/ws"
        c.query = nil
        c.queryItems = [URLQueryItem(name: "token", value: token)]
        guard let url = c.url else { return }

        receiveTask?.cancel()
        wsTask?.cancel(with: .goingAway, reason: nil)

        let t = URLSession.shared.webSocketTask(with: url)
        wsTask = t
        t.resume()
        t.send(.string(#"{"type":"subscribe-global"}"#)) { _ in }

        receiveTask = Task { [weak self] in await self?.receiveLoop(task: t) }
    }

    func disconnect() {
        receiveTask?.cancel()
        receiveTask = nil
        wsTask?.cancel(with: .goingAway, reason: nil)
        wsTask = nil
        sessionHandlers.removeAll()
        baseURL = nil
        token = nil
    }

    func subscribeSession(_ id: String, handler: @escaping @MainActor (String, String) -> Void) {
        sessionHandlers[id] = handler
        wsTask?.send(.string(#"{"type":"subscribe","sessionId":"\#(id)"}"#)) { _ in }
    }

    func unsubscribeSession(_ id: String) {
        sessionHandlers.removeValue(forKey: id)
    }

    private func receiveLoop(task: URLSessionWebSocketTask) async {
        while !Task.isCancelled {
            do {
                let msg = try await task.receive()
                guard case .string(let str) = msg,
                      let data = str.data(using: .utf8),
                      let decoded = try? JSONDecoder().decode(WSMessage.self, from: data) else { continue }

                if decoded.type == "global-event" {
                    refreshTick += 1
                }

                if let sid = decoded.sessionId, let handler = sessionHandlers[sid] {
                    handler(decoded.type, decoded.data ?? "")
                }
            } catch {
                // Reconnect after a brief delay if not cancelled
                if !Task.isCancelled {
                    try? await Task.sleep(for: .seconds(2))
                    reconnect()
                }
                break
            }
        }
    }
}
