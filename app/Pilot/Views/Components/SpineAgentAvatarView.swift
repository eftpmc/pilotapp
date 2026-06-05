import SwiftUI
@preconcurrency import Spine
@preconcurrency import SpineCppLite

// Sendable box so the closure can hold the Skin reference without crossing actor boundaries.
private final class SkinRef: @unchecked Sendable {
    var skin: Skin?
    deinit { skin?.dispose() }
}

// Holds SpineController + keeps the combined Skin alive (Spine skins are manually managed C objects).
private final class AvatarController: ObservableObject {
    let controller: SpineController
    private var skinRef: SkinRef?

    init(seed: String) {
        let ref = SkinRef()
        controller = SpineController(onInitialized: { ctrl in
            print("[SpineAvatar] onInitialized seed=\(seed)")
            let skin = Skin.create(name: "agent-\(seed)")
            for skinName in SpineAgentAvatarView.skinNames(for: seed) {
                if let s = ctrl.skeletonData.findSkin(name: skinName) {
                    skin.addSkin(other: s)
                    print("[SpineAvatar]   + \(skinName)")
                } else {
                    print("[SpineAvatar]   MISSING \(skinName)")
                }
            }
            ref.skin = skin
            ctrl.skeleton.skin = skin
            ctrl.skeleton.setSlotsToSetupPose()
            SpineAgentAvatarView.applySlotColors(to: ctrl.skeleton, seed: seed)
            ctrl.animationState.setAnimationByName(trackIndex: 0, animationName: "Idle", loop: true)
            ctrl.animationState.update(delta: Float(SpineAgentAvatarView.djb2(seed) % 300) / 100)
            ctrl.animationState.apply(skeleton: ctrl.skeleton)
            ctrl.skeleton.updateWorldTransform(physics: SPINE_PHYSICS_UPDATE)
            print("[SpineAvatar] done")
        })
        skinRef = ref
    }
}

struct SpineAgentAvatarView: View {
    let seed: String
    let size: CGFloat
    let animated: Bool

    @StateObject private var ac: AvatarController

    init(seed: String, size: CGFloat, animated: Bool = true) {
        let key = seed.lowercased()
        self.seed = key
        self.size = size
        self.animated = animated
        _ac = StateObject(wrappedValue: AvatarController(seed: key))
    }

    var body: some View {
        SpineView(
            from: .bundle(
                atlasFileName: "Casual Character.atlas",
                skeletonFileName: "Casual Character.json"
            ),
            controller: ac.controller,
            mode: .fit,
            alignment: .center,
            boundsProvider: RawBounds(x: -38, y: 118, width: 76, height: 76),
            backgroundColor: .clear
        )
        .frame(width: size, height: size)
        .allowsHitTesting(false)
        .onAppear { if !animated { ac.controller.pause() } }
        .onChange(of: animated) { _, newValue in
            newValue ? ac.controller.resume() : ac.controller.pause()
        }
    }

    fileprivate static func skinNames(for seed: String) -> [String] {
        var names = [
            "skin/skin_1",
            "eyes/eyes_c_\(weightedPick(seed, salt: "e", pairs: [(2, 80), (3, 5), (4, 5), (6, 4), (11, 3), (13, 3)]))",
            "hair_short/hair_short_c_\(pick(seed, salt: "h", values: Array(1...30)))",
            "mouth/mouth_c_\(weightedPick(seed, salt: "m", pairs: [(1, 80), (3, 5), (4, 5), (6, 4), (8, 3), (9, 3)]))",
            "brow/brow_c_\(pick(seed, salt: "b", values: [1, 2, 3, 4, 5, 8, 9]))",
            "top/top_c_\(pick(seed, salt: "t", values: Array(1...48)))",
        ]

        if djb2(seed + "beard") % 100 >= 90 {
            names.append("beard/beard_c_\(pick(seed, salt: "beardN", values: Array(1...10)))")
        }

        return names
    }

    fileprivate static func applySlotColors(to skeleton: Skeleton, seed: String) {
        let skin = pickColor(seed, salt: "sk", values: skinTones)
        let hair = pickColor(seed, salt: "hc", values: hairColors)
        let brow = RGB(r: hair.r * 0.75, g: hair.g * 0.75, b: hair.b * 0.75)
        let beard = RGB(r: hair.r * 0.85, g: hair.g * 0.85, b: hair.b * 0.85)

        setSlot("head", color: skin, skeleton: skeleton)
        setSlot("hair", color: hair, skeleton: skeleton)
        setSlot("brow", color: brow, skeleton: skeleton)
        setSlot("beard", color: beard, skeleton: skeleton)
    }

    private static func setSlot(_ name: String, color: RGB, skeleton: Skeleton) {
        skeleton.findSlot(slotName: name)?.setColor(r: color.r, g: color.g, b: color.b, a: 1)
    }

    private static func pick(_ seed: String, salt: String, values: [Int]) -> Int {
        values[Int(djb2(seed + salt) % UInt32(values.count))]
    }

    private static func pickColor(_ seed: String, salt: String, values: [RGB]) -> RGB {
        values[Int(djb2(seed + salt) % UInt32(values.count))]
    }

    private static func weightedPick(_ seed: String, salt: String, pairs: [(Int, Int)]) -> Int {
        let total = pairs.reduce(0) { $0 + $1.1 }
        guard total > 0 else { return pairs.first?.0 ?? 1 }
        var value = Int(djb2(seed + salt) % UInt32(total))
        for (part, weight) in pairs {
            if value < weight { return part }
            value -= weight
        }
        return pairs.first?.0 ?? 1
    }

    fileprivate static func djb2(_ string: String) -> UInt32 {
        var hash: UInt32 = 5381
        for scalar in string.unicodeScalars {
            hash = ((hash &<< 5) &+ hash) ^ scalar.value
        }
        return hash
    }

    private struct RGB {
        let r: Float
        let g: Float
        let b: Float
    }

    private static let skinTones: [RGB] = [
        RGB(r: 1.00, g: 0.88, b: 0.76),
        RGB(r: 0.97, g: 0.78, b: 0.60),
        RGB(r: 0.90, g: 0.67, b: 0.45),
        RGB(r: 0.80, g: 0.54, b: 0.32),
        RGB(r: 0.65, g: 0.42, b: 0.24),
        RGB(r: 0.50, g: 0.30, b: 0.18),
    ]

    private static let hairColors: [RGB] = [
        RGB(r: 0.08, g: 0.06, b: 0.05),
        RGB(r: 0.22, g: 0.14, b: 0.08),
        RGB(r: 0.38, g: 0.24, b: 0.12),
        RGB(r: 0.52, g: 0.34, b: 0.16),
        RGB(r: 0.68, g: 0.46, b: 0.20),
        RGB(r: 0.82, g: 0.60, b: 0.22),
        RGB(r: 0.95, g: 0.84, b: 0.40),
        RGB(r: 0.72, g: 0.16, b: 0.10),
        RGB(r: 0.55, g: 0.10, b: 0.06),
        RGB(r: 0.80, g: 0.40, b: 0.10),
        RGB(r: 0.30, g: 0.08, b: 0.28),
        RGB(r: 0.55, g: 0.12, b: 0.42),
        RGB(r: 0.10, g: 0.22, b: 0.52),
        RGB(r: 0.08, g: 0.42, b: 0.40),
        RGB(r: 0.62, g: 0.62, b: 0.62),
        RGB(r: 0.90, g: 0.90, b: 0.90),
    ]
}
