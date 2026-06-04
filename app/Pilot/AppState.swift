import Foundation
import Observation

@Observable
@MainActor
final class AppState {
    private(set) var serverURL: URL?
    private(set) var token: String?
    private(set) var socket: SocketClient?

    var isConnected: Bool { serverURL != nil && token != nil }

    var client: APIClient? {
        guard let url = serverURL, let t = token else { return nil }
        return APIClient(baseURL: url, token: t)
    }

    init() {
        guard
            let urlString = Keychain.load(key: "serverURL"),
            let url = URL(string: urlString),
            let t = Keychain.load(key: "token")
        else { return }
        serverURL = url
        token = t
        let s = SocketClient()
        s.connect(baseURL: url, token: t)
        socket = s
    }

    func connect(serverURL: URL, token: String) {
        socket?.disconnect()
        self.serverURL = serverURL
        self.token = token
        Keychain.save(key: "serverURL", value: serverURL.absoluteString)
        Keychain.save(key: "token", value: token)
        let s = SocketClient()
        s.connect(baseURL: serverURL, token: token)
        socket = s
    }

    func disconnect() {
        socket?.disconnect()
        socket = nil
        serverURL = nil
        token = nil
        Keychain.delete(key: "serverURL")
        Keychain.delete(key: "token")
    }
}
