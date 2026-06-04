#!/usr/bin/env node
/**
 * Pilot design token builder
 * Reads design/tokens.json → generates:
 *   web/src/tokens.css          (CSS custom properties, light + dark)
 *   app/Pilot/Generated/DesignTokens.swift  (SwiftUI Color + Font extensions)
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dir  = dirname(fileURLToPath(import.meta.url))
const ROOT   = join(__dir, '..')
const tokens = JSON.parse(readFileSync(join(__dir, 'tokens.json'), 'utf-8'))

// ─── Helpers ────────────────────────────────────────────────────────────────

/** camelCase → kebab-case, handles trailing digits (panel2 → panel-2) */
function kebab(s) {
  return s
    .replace(/([A-Z])/g, '-$1')
    .toLowerCase()
    .replace(/(\d+)$/, '-$1')
}

/** Parse "#rrggbb", "rgb(...)", or "rgba(...)" into [r,g,b,a] on 0-1 scale. */
function parseColor(value) {
  if (value.startsWith('#')) {
    const h = value.replace('#', '')
    return [
      parseInt(h.slice(0, 2), 16) / 255,
      parseInt(h.slice(2, 4), 16) / 255,
      parseInt(h.slice(4, 6), 16) / 255,
      1,
    ]
  }

  const match = value.match(/^rgba?\(([^)]+)\)$/)
  if (!match) return null

  const parts = match[1].split(',').map(p => p.trim())
  if (parts.length < 3) return null
  return [
    Number(parts[0]) / 255,
    Number(parts[1]) / 255,
    Number(parts[2]) / 255,
    parts[3] == null ? 1 : Number(parts[3]),
  ]
}

/** Format a 0–1 float to 4 decimal places, trimming trailing zeros */
function f(n) { return parseFloat(n.toFixed(4)).toString() }

// ─── CSS generator ──────────────────────────────────────────────────────────

function buildCSS() {
  const lightVars = []
  const darkVars  = []

  const { color, typography, radius, spacing, shadow } = tokens

  // Colors
  for (const [group, entries] of Object.entries(color)) {
    for (const [name, val] of Object.entries(entries)) {
      lightVars.push(`  --${kebab(name)}: ${val.light};`)
      darkVars.push( `  --${kebab(name)}: ${val.dark};`)
    }
  }

  // Typography
  lightVars.push(`  --font-sans: ${typography.fontSans};`)
  lightVars.push(`  --font-mono: ${typography.fontMono};`)
  for (const [name, px] of Object.entries(typography.size)) {
    lightVars.push(`  --text-${name}: ${px}px;`)
  }
  for (const [name, val] of Object.entries(typography.lineHeight)) {
    lightVars.push(`  --leading-${name}: ${val};`)
  }

  // Radius
  for (const [name, px] of Object.entries(radius)) {
    lightVars.push(`  --radius-${name}: ${px}px;`)
  }

  // Spacing
  for (const [name, px] of Object.entries(spacing)) {
    lightVars.push(`  --space-${name}: ${px}px;`)
  }

  // Shadows
  for (const [name, val] of Object.entries(shadow)) {
    lightVars.push(`  --shadow-${name}: ${val.light};`)
    darkVars.push( `  --shadow-${name}: ${val.dark};`)
  }

  const banner = `/* AUTO-GENERATED — do not edit. Run: npm run tokens */\n\n`

  const light = `:root {\n${lightVars.join('\n')}\n}`

  const dark = `@media (prefers-color-scheme: dark) {\n  html:not(.light) {\n${
    darkVars.map(l => '  ' + l).join('\n')
  }\n  }\n}`

  const forced = [
    `html.dark {\n${darkVars.join('\n')}\n}`,
    `html.light {\n${lightVars.join('\n')}\n}`,
  ].join('\n\n')

  return [banner, light, dark, forced].join('\n\n')
}

// ─── Swift generator ────────────────────────────────────────────────────────

function buildSwift() {
  const { color, typography, radius } = tokens
  const lines = []

  lines.push(`// AUTO-GENERATED — do not edit. Run: npm run tokens`)
  lines.push(`// Source: design/tokens.json`)
  lines.push(`import SwiftUI`)
  lines.push(``)

  // MARK: - Color
  lines.push(`// MARK: - Colors`)
  lines.push(`extension Color {`)

  for (const [, entries] of Object.entries(color)) {
    for (const [name, val] of Object.entries(entries)) {
      const swiftName = name  // already camelCase
      const lightRgb = parseColor(val.light)
      const darkRgb  = parseColor(val.dark)

      if (lightRgb && darkRgb) {
        // Adaptive color using UIColor trait collection
        lines.push(`    static let ${swiftName} = Color(UIColor { t in`)
        lines.push(`        t.userInterfaceStyle == .dark`)
        lines.push(`            ? UIColor(red: ${f(darkRgb[0])},  green: ${f(darkRgb[1])},  blue: ${f(darkRgb[2])},  alpha: ${f(darkRgb[3])})`)
        lines.push(`            : UIColor(red: ${f(lightRgb[0])}, green: ${f(lightRgb[1])}, blue: ${f(lightRgb[2])}, alpha: ${f(lightRgb[3])})`)
        lines.push(`    })`)
      } else {
        const fallback = parseColor(val.dark) || parseColor(val.light)
        if (fallback) {
          lines.push(`    static let ${swiftName} = Color(red: ${f(fallback[0])}, green: ${f(fallback[1])}, blue: ${f(fallback[2])}, opacity: ${f(fallback[3])})`)
        } else {
          lines.push(`    // ${swiftName}: unsupported color token`)
        }
      }
    }
  }

  // Hex initialiser (kept for one-off use)
  lines.push(``)
  lines.push(`    init(hex: String) {`)
  lines.push(`        let h = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)`)
  lines.push(`        var v: UInt64 = 0`)
  lines.push(`        Scanner(string: h).scanHexInt64(&v)`)
  lines.push(`        self.init(`)
  lines.push(`            red:   Double((v >> 16) & 0xFF) / 255,`)
  lines.push(`            green: Double((v >> 8)  & 0xFF) / 255,`)
  lines.push(`            blue:  Double(v         & 0xFF) / 255`)
  lines.push(`        )`)
  lines.push(`    }`)
  lines.push(`}`)
  lines.push(``)

  // MARK: - Typography
  lines.push(`// MARK: - Typography`)
  lines.push(`extension Font {`)
  for (const [name, px] of Object.entries(typography.size)) {
    lines.push(`    static let ${name}Size: CGFloat = ${px}`)
  }
  lines.push(``)
  lines.push(`    static let mono    = Font.system(.footnote, design: .monospaced)`)
  lines.push(`    static let label   = Font.system(size: ${typography.size.label}, weight: .medium)`)
  lines.push(`    static let caption = Font.system(size: ${typography.size.caption})`)
  lines.push(`}`)
  lines.push(``)

  // MARK: - Radius
  lines.push(`// MARK: - Radius`)
  lines.push(`enum Radius {`)
  for (const [name, px] of Object.entries(radius)) {
    if (name !== 'pill') {
      lines.push(`    static let ${name}: CGFloat = ${px}`)
    }
  }
  lines.push(`}`)

  return lines.join('\n') + '\n'
}

// ─── Write outputs ──────────────────────────────────────────────────────────

const cssOut   = join(ROOT, 'web/src/tokens.css')
const swiftOut = join(ROOT, 'app/Pilot/Generated/DesignTokens.swift')

mkdirSync(dirname(cssOut),   { recursive: true })
mkdirSync(dirname(swiftOut), { recursive: true })

writeFileSync(cssOut,   buildCSS())
writeFileSync(swiftOut, buildSwift())

console.log(`✓ web/src/tokens.css`)
console.log(`✓ app/Pilot/Generated/DesignTokens.swift`)
