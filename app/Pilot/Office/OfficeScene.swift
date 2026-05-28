import SpriteKit
import UIKit

final class OfficeScene: SKScene {
    private var agentNodes: [String: AgentSpriteNode] = [:]
    var onAgentTapped: ((String) -> Void)?

    private static let deskPositions: [CGPoint] = [
        CGPoint(x: -110, y: 200),
        CGPoint(x: 110,  y: 200),
        CGPoint(x: -110, y: 20),
        CGPoint(x: 110,  y: 20),
    ]

    override func didMove(to view: SKView) {
        backgroundColor = UIColor(red: 0.15, green: 0.14, blue: 0.20, alpha: 1)
        buildFloor()
        buildDesks()
    }

    // MARK: - Background

    private func buildFloor() {
        // Tile the floor with a subtle pattern using the room tiles sheet
        let sheet = SKTexture(imageNamed: "room_tiles")
        sheet.filteringMode = .nearest
        let w = sheet.size().width
        let h = sheet.size().height

        // Gray floor tile is at approximately x=320, y=160 in a ~512×416 sheet
        let tileW: CGFloat = 64, tileH: CGFloat = 64
        let tx = 320.0 / w
        let ty = 1.0 - (160.0 + tileH) / h
        let tileTex = SKTexture(rect: CGRect(x: tx, y: ty, width: tileW / w, height: tileH / h), in: sheet)
        tileTex.filteringMode = .nearest

        let displaySize: CGFloat = 48
        let cols = Int(size.width  / displaySize) + 2
        let rows = Int(size.height / displaySize) + 2

        for col in 0..<cols {
            for row in 0..<rows {
                let tile = SKSpriteNode(texture: tileTex, size: CGSize(width: displaySize, height: displaySize))
                tile.position = CGPoint(
                    x: -size.width  / 2 + CGFloat(col) * displaySize + displaySize / 2,
                    y: -size.height / 2 + CGFloat(row) * displaySize + displaySize / 2
                )
                tile.zPosition = -1
                addChild(tile)
            }
        }
    }

    private func buildDesks() {
        let sheet = SKTexture(imageNamed: "office_tiles")
        sheet.filteringMode = .nearest
        let deskTex = OfficeSheet.deskTexture(sheet: sheet)

        for pos in Self.deskPositions {
            let desk = SKSpriteNode(texture: deskTex, size: CGSize(width: 96, height: 64))
            desk.position = pos
            desk.zPosition = 1
            addChild(desk)
        }
    }

    // MARK: - Session management

    func updateSessions(_ sessions: [AgentSession]) {
        let ids = Set(sessions.map(\.id))

        for (id, node) in agentNodes where !ids.contains(id) {
            node.removeFromParent()
            agentNodes.removeValue(forKey: id)
        }

        for (idx, session) in sessions.prefix(4).enumerated() {
            if let node = agentNodes[session.id] {
                node.sessionStatus = session.status
            } else {
                let pos = Self.deskPositions[idx]
                let label = session.provider == .claude ? "Claude" : "Codex"
                let node = AgentSpriteNode(provider: session.provider, name: label)
                node.position = CGPoint(x: pos.x, y: pos.y + 48)
                node.sessionStatus = session.status
                node.zPosition = 2
                node.name = session.id
                addChild(node)
                agentNodes[session.id] = node
            }
        }
    }

    // MARK: - Touch

    override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent?) {
        guard let point = touches.first?.location(in: self) else { return }
        for node in nodes(at: point) {
            var current: SKNode? = node
            while let n = current {
                if let id = n.name, agentNodes[id] != nil {
                    onAgentTapped?(id)
                    return
                }
                current = n.parent
            }
        }
    }
}
