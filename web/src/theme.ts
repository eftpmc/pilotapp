import { createContext, useContext, useState, useEffect, createElement, type ReactNode } from 'react'

export type ThemeMode = 'light' | 'dark' | 'system'

export const ACCENTS = [
  { hex: '#6366f1', label: 'Indigo',  oklch: 'oklch(0.58 0.21 277)' },
  { hex: '#0A84FF', label: 'Blue',    oklch: 'oklch(0.60 0.20 250)' },
  { hex: '#22c55e', label: 'Green',   oklch: 'oklch(0.70 0.19 145)' },
  { hex: '#BF5AF2', label: 'Violet',  oklch: 'oklch(0.60 0.22 300)' },
  { hex: '#FF9500', label: 'Orange',  oklch: 'oklch(0.72 0.18 55)'  },
]

export const KNOWN_FACES = ['atlas','bishop','cleo','codex','dex','fern','gil']

function systemIsDark() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

interface ThemeCtx {
  theme: ThemeMode
  accent: string
  isDark: boolean
  setTheme: (t: ThemeMode) => void
  setAccent: (a: string) => void
}

const Ctx = createContext<ThemeCtx>(null!)

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Default to dark — Railway-inspired dark is the primary look
  const [theme, setThemeState] = useState<ThemeMode>(
    () => (localStorage.getItem('pilot.theme') as ThemeMode) ?? 'dark'
  )
  const [accent, setAccentState] = useState(
    () => localStorage.getItem('pilot.accent') ?? '#6366f1'
  )
  const [sysDark, setSysDark] = useState(systemIsDark)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent) => setSysDark(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  const isDark = theme === 'dark' || (theme === 'system' && sysDark)

  useEffect(() => {
    const root = document.documentElement
    // CSS: :root = dark vars, .light = light override
    root.classList.toggle('light', !isDark)
  }, [isDark])

  useEffect(() => {
    const found = ACCENTS.find(a => a.hex === accent)
    const oklch = found?.oklch ?? 'oklch(0.58 0.21 277)'
    // In dark mode, brighten slightly for readability
    const oklchDark = oklch.replace(/oklch\(([0-9.]+)/, (_, l) =>
      `oklch(${Math.min(parseFloat(l) + 0.08, 0.88).toFixed(2)}`)
    document.documentElement.style.setProperty('--primary', isDark ? oklchDark : oklch)
  }, [accent, isDark])

  function setTheme(t: ThemeMode) { setThemeState(t); localStorage.setItem('pilot.theme', t) }
  function setAccent(a: string)   { setAccentState(a); localStorage.setItem('pilot.accent', a) }

  return createElement(Ctx.Provider, { value: { theme, accent, isDark, setTheme, setAccent } }, children)
}

export function useTheme() { return useContext(Ctx) }
