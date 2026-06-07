// AUTO-GENERATED — do not edit. Run: npm run tokens
// Source: design/tokens.json
import SwiftUI

// MARK: - Colors
extension Color {
    static let bg = Color(UIColor { t in
        t.userInterfaceStyle == .dark
            ? UIColor(red: 0.0667,  green: 0.0667,  blue: 0.0627,  alpha: 1)
            : UIColor(red: 0.9686, green: 0.9686, blue: 0.9608, alpha: 1)
    })
    static let panel = Color(UIColor { t in
        t.userInterfaceStyle == .dark
            ? UIColor(red: 0.102,  green: 0.098,  blue: 0.0902,  alpha: 1)
            : UIColor(red: 1, green: 1, blue: 1, alpha: 1)
    })
    static let panel2 = Color(UIColor { t in
        t.userInterfaceStyle == .dark
            ? UIColor(red: 0.1333,  green: 0.1294,  blue: 0.1255,  alpha: 1)
            : UIColor(red: 0.9412, green: 0.9412, blue: 0.9294, alpha: 1)
    })
    static let ink = Color(UIColor { t in
        t.userInterfaceStyle == .dark
            ? UIColor(red: 0.9098,  green: 0.8902,  blue: 0.8549,  alpha: 1)
            : UIColor(red: 0.0667, green: 0.0667, blue: 0.0627, alpha: 1)
    })
    static let ink2 = Color(UIColor { t in
        t.userInterfaceStyle == .dark
            ? UIColor(red: 0.6745,  green: 0.6588,  blue: 0.6235,  alpha: 1)
            : UIColor(red: 0.2667, green: 0.2627, blue: 0.2549, alpha: 1)
    })
    static let muted = Color(UIColor { t in
        t.userInterfaceStyle == .dark
            ? UIColor(red: 0.4784,  green: 0.4667,  blue: 0.4392,  alpha: 1)
            : UIColor(red: 0.4353, green: 0.4275, blue: 0.4, alpha: 1)
    })
    static let faint = Color(UIColor { t in
        t.userInterfaceStyle == .dark
            ? UIColor(red: 0.3137,  green: 0.3059,  blue: 0.2824,  alpha: 1)
            : UIColor(red: 0.6627, green: 0.651, blue: 0.6196, alpha: 1)
    })
    static let rule = Color(UIColor { t in
        t.userInterfaceStyle == .dark
            ? UIColor(red: 1,  green: 1,  blue: 1,  alpha: 0.09)
            : UIColor(red: 0.8667, green: 0.8667, blue: 0.8549, alpha: 1)
    })
    static let ruleSoft = Color(UIColor { t in
        t.userInterfaceStyle == .dark
            ? UIColor(red: 1,  green: 1,  blue: 1,  alpha: 0.055)
            : UIColor(red: 0.9137, green: 0.9137, blue: 0.898, alpha: 1)
    })
    static let ember = Color(UIColor { t in
        t.userInterfaceStyle == .dark
            ? UIColor(red: 1,  green: 0.4196,  blue: 0.2078,  alpha: 1)
            : UIColor(red: 0.898, green: 0.3176, blue: 0.102, alpha: 1)
    })
    static let ember2 = Color(UIColor { t in
        t.userInterfaceStyle == .dark
            ? UIColor(red: 1,  green: 0.549,  blue: 0.3529,  alpha: 1)
            : UIColor(red: 0.7686, green: 0.251, blue: 0.0627, alpha: 1)
    })
    static let emberWash = Color(UIColor { t in
        t.userInterfaceStyle == .dark
            ? UIColor(red: 1,  green: 0.4196,  blue: 0.2078,  alpha: 0.14)
            : UIColor(red: 1, green: 0.9529, blue: 0.9333, alpha: 1)
    })
    static let onEmber = Color(UIColor { t in
        t.userInterfaceStyle == .dark
            ? UIColor(red: 0.102,  green: 0.0392,  blue: 0,  alpha: 1)
            : UIColor(red: 1, green: 1, blue: 1, alpha: 1)
    })
    static let green = Color(UIColor { t in
        t.userInterfaceStyle == .dark
            ? UIColor(red: 0.3608,  green: 0.7882,  blue: 0.5765,  alpha: 1)
            : UIColor(red: 0.0863, green: 0.4745, blue: 0.2902, alpha: 1)
    })
    static let greenDot = Color(UIColor { t in
        t.userInterfaceStyle == .dark
            ? UIColor(red: 0.2078,  green: 0.7333,  blue: 0.4706,  alpha: 1)
            : UIColor(red: 0.1176, green: 0.6196, blue: 0.3608, alpha: 1)
    })
    static let amber = Color(UIColor { t in
        t.userInterfaceStyle == .dark
            ? UIColor(red: 0.851,  green: 0.6588,  blue: 0.3059,  alpha: 1)
            : UIColor(red: 0.5765, green: 0.3804, blue: 0.102, alpha: 1)
    })
    static let amberDot = Color(UIColor { t in
        t.userInterfaceStyle == .dark
            ? UIColor(red: 0.8314,  green: 0.6196,  blue: 0.251,  alpha: 1)
            : UIColor(red: 0.7608, green: 0.5412, blue: 0.1176, alpha: 1)
    })
    static let red = Color(UIColor { t in
        t.userInterfaceStyle == .dark
            ? UIColor(red: 0.9333,  green: 0.4431,  blue: 0.3961,  alpha: 1)
            : UIColor(red: 0.698, green: 0.1373, blue: 0.0863, alpha: 1)
    })
    static let redDot = Color(UIColor { t in
        t.userInterfaceStyle == .dark
            ? UIColor(red: 0.9255,  green: 0.4196,  blue: 0.3608,  alpha: 1)
            : UIColor(red: 0.8314, green: 0.2627, blue: 0.1765, alpha: 1)
    })

    init(hex: String) {
        let h = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var v: UInt64 = 0
        Scanner(string: h).scanHexInt64(&v)
        self.init(
            red:   Double((v >> 16) & 0xFF) / 255,
            green: Double((v >> 8)  & 0xFF) / 255,
            blue:  Double(v         & 0xFF) / 255
        )
    }
}

// MARK: - Typography
extension Font {
    static let microSize: CGFloat = 10
    static let captionSize: CGFloat = 11
    static let labelSize: CGFloat = 12
    static let bodySize: CGFloat = 14
    static let baseSize: CGFloat = 16
    static let headingSize: CGFloat = 24

    static let mono    = Font.system(.footnote, design: .monospaced)
    static let label   = Font.system(size: 12, weight: .medium)
    static let caption = Font.system(size: 11)
}

// MARK: - Radius
enum Radius {
    static let xs: CGFloat = 4
    static let sm: CGFloat = 6
    static let md: CGFloat = 8
    static let lg: CGFloat = 10
    static let xl: CGFloat = 12
}
