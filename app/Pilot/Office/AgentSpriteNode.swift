import SpriteKit
import UIKit

final class AgentSpriteNode: SKNode {
    private let characterNode: SKSpriteNode
    private let emoteNode: SKSpriteNode
    private let nameLabel: SKLabelNode
    private let statusDot: SKShapeNode

    private let charSheet: SKTexture
    private let emoteSheet: SKTexture

    var sessionStatus: SessionStatus = .idle {
        didSet { guard oldValue != sessionStatus else { return }; updateAnimation() }
    }

    init(provider: AgentProvider, name: String) {
        let charImageName = provider == .claude ? "char_claude" : "char_codex"
        charSheet = SKTexture(imageNamed: charImageName)
        charSheet.filteringMode = .nearest

        emoteSheet = SKTexture(imageNamed: "emotes")
        emoteSheet.filteringMode = .nearest

        // Show first idle frame as initial texture
        let firstFrameRect = CGRect(
            x: 0,
            y: 1.0 - 160.0 / charSheet.size().height,
            width: 32.0 / charSheet.size().width,
            height: 32.0 / charSheet.size().height
        )
        let firstTex = SKTexture(rect: firstFrameRect, in: charSheet)
        firstTex.filteringMode = .nearest

        characterNode = SKSpriteNode(texture: firstTex, size: CGSize(width: 96, height: 96))
        characterNode.position = .zero

        // Emote bubble
        let firstEmote = EmoteSheet.thinkFrames(sheet: SKTexture(imageNamed: "emotes")).first ?? SKTexture()
        emoteNode = SKSpriteNode(texture: firstEmote, size: CGSize(width: 48, height: 48))
        emoteNode.position = CGPoint(x: 24, y: 64)
        emoteNode.alpha = 0

        nameLabel = SKLabelNode(text: name)
        nameLabel.fontName = "AvenirNext-Bold"
        nameLabel.fontSize = 12
        nameLabel.fontColor = .white
        nameLabel.position = CGPoint(x: 0, y: -60)

        statusDot = SKShapeNode(circleOfRadius: 5)
        statusDot.fillColor = .gray
        statusDot.strokeColor = .clear
        statusDot.position = CGPoint(x: 0, y: -74)

        super.init()

        addChild(characterNode)
        addChild(emoteNode)
        addChild(nameLabel)
        addChild(statusDot)

        updateAnimation()
    }

    required init?(coder: NSCoder) { fatalError() }

    private func updateAnimation() {
        characterNode.removeAllActions()
        emoteNode.removeAllActions()
        emoteNode.alpha = 0
        statusDot.removeAllActions()
        statusDot.alpha = 1

        switch sessionStatus {
        case .idle:
            loop(CharacterSheet.idleFrames(sheet: charSheet), on: characterNode, fps: 1.5)
            statusDot.fillColor = UIColor.systemGray

        case .running:
            loop(CharacterSheet.workFrames(sheet: charSheet), on: characterNode, fps: 8)
            showThinkBubble()
            statusDot.fillColor = UIColor.systemBlue
            pulseNode(statusDot)

        case .done:
            loop(CharacterSheet.doneFrames(sheet: charSheet), on: characterNode, fps: 1.5)
            statusDot.fillColor = UIColor.systemGreen
            bounceOnce(characterNode)

        case .error:
            loop(CharacterSheet.idleFrames(sheet: charSheet), on: characterNode, fps: 1.5)
            statusDot.fillColor = UIColor.systemRed
            shake(characterNode)
        }
    }

    private func loop(_ frames: [SKTexture], on node: SKSpriteNode, fps: Double) {
        guard !frames.isEmpty else { return }
        node.run(.repeatForever(.animate(with: frames, timePerFrame: 1.0 / fps)))
    }

    private func showThinkBubble() {
        let frames = EmoteSheet.thinkFrames(sheet: emoteSheet)
        guard !frames.isEmpty else { return }
        emoteNode.alpha = 1
        let grow  = SKAction.animate(with: frames, timePerFrame: 0.15)
        let hold  = SKAction.wait(forDuration: 0.6)
        let shrink = SKAction.animate(with: frames.reversed(), timePerFrame: 0.1)
        let pause = SKAction.wait(forDuration: 1.2)
        emoteNode.run(.repeatForever(.sequence([grow, hold, shrink, pause])))
    }

    private func pulseNode(_ node: SKNode) {
        node.run(.repeatForever(.sequence([
            .fadeAlpha(to: 0.25, duration: 0.5),
            .fadeAlpha(to: 1.0,  duration: 0.5),
        ])))
    }

    private func bounceOnce(_ node: SKSpriteNode) {
        node.run(.sequence([
            .moveBy(x: 0, y: 8, duration: 0.12),
            .moveBy(x: 0, y: -8, duration: 0.12),
        ]))
    }

    private func shake(_ node: SKSpriteNode) {
        node.run(.sequence([
            .moveBy(x: -6, y: 0, duration: 0.05),
            .moveBy(x: 12, y: 0, duration: 0.05),
            .moveBy(x: -12, y: 0, duration: 0.05),
            .moveBy(x: 6,  y: 0, duration: 0.05),
        ]))
    }
}
