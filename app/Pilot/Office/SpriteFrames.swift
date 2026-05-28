import SpriteKit

// Character sprite sheet layout — Premade_Character_32x32_XX.png
// Frame size: 32x32. Sheet dimensions determined at runtime from texture.
// Row layout (from top): idle(0-1), walk(2-3), sleep(4), sit(5-6), work(7), swim(8), etc.
enum CharacterSheet {
    static let frameSize: CGFloat = 32

    // Row pixel offsets from top-left of image
    static let rowSitIdle: CGFloat  = 128   // row 4: sitting still
    static let rowSitWork: CGFloat  = 192   // row 6: typing at computer (4-9 loop)
    static let rowSitRelax: CGFloat = 160   // row 5: relaxed sit

    static func textures(sheet: SKTexture, pixelRow: CGFloat, cols: [Int]) -> [SKTexture] {
        let w = sheet.size().width
        let h = sheet.size().height
        return cols.map { col in
            let x = CGFloat(col) * frameSize / w
            let y = 1.0 - (pixelRow + frameSize) / h
            let tw = frameSize / w
            let th = frameSize / h
            let t = SKTexture(rect: CGRect(x: x, y: y, width: tw, height: th), in: sheet)
            t.filteringMode = .nearest
            return t
        }
    }

    static func idleFrames(sheet: SKTexture)  -> [SKTexture] { textures(sheet: sheet, pixelRow: rowSitIdle,  cols: [0, 1]) }
    static func workFrames(sheet: SKTexture)  -> [SKTexture] { textures(sheet: sheet, pixelRow: rowSitWork,  cols: [4, 5, 6, 7, 8]) }
    static func doneFrames(sheet: SKTexture)  -> [SKTexture] { textures(sheet: sheet, pixelRow: rowSitRelax, cols: [0, 1]) }
}

// Emote sheet — UI_thinking_emotes_animation_48x48.png
// Sheet: 432 × 432 px, each frame 48×48
// Top row: thought bubble growing frames (cols 0-3)
enum EmoteSheet {
    static let frameSize: CGFloat = 48

    static func thinkFrames(sheet: SKTexture) -> [SKTexture] {
        let w = sheet.size().width
        let h = sheet.size().height
        return (0..<4).map { col in
            let x = CGFloat(col) * frameSize / w
            let y = 1.0 - frameSize / h   // top row
            let t = SKTexture(rect: CGRect(x: x, y: y, width: frameSize / w, height: frameSize / h), in: sheet)
            t.filteringMode = .nearest
            return t
        }
    }
}

// Desk sprite from office_tiles.png — the top of the single desk at ~col 7-8, row 0
// office_tiles.png is 480 × 1504 px
enum OfficeSheet {
    static func deskTexture(sheet: SKTexture) -> SKTexture {
        // Single desk top: in the right column area, row 0
        // Using the gray desk visible at approx x=224, y=0 in the sheet
        let w = sheet.size().width
        let h = sheet.size().height
        let x = 224.0 / w
        let y = 1.0 - 96.0 / h   // 3 rows tall
        let tw = 96.0 / w
        let th = 96.0 / h
        let t = SKTexture(rect: CGRect(x: x, y: y, width: tw, height: th), in: sheet)
        t.filteringMode = .nearest
        return t
    }
}
