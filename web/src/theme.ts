import { createContext, useContext, useState, useEffect, useMemo, createElement, type ReactNode } from 'react'

export type ThemeMode = 'light' | 'dark' | 'system'

export const ACCENTS = [
  { hex: '#0A84FF', label: 'Blue'   },
  { hex: '#34C759', label: 'Green'  },
  { hex: '#BF5AF2', label: 'Violet' },
  { hex: '#FF9500', label: 'Orange' },
  { hex: '#FF2D55', label: 'Pink'   },
]

export const KNOWN_FACES = ['atlas','bishop','cleo','codex','dex','fern','gil']

function systemIsDark() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function makeTokens(dark: boolean, accent: string) {
  return dark ? {
    bg:      '#131316',
    card:    '#1C1C21',
    surface: '#131316',
    surface2:'#26262C',
    border:  'rgba(255,255,255,0.09)',
    text:    '#F0F0F2',
    muted:   'rgba(240,240,242,0.52)',
    faint:   'rgba(240,240,242,0.26)',
    green:   '#30D158',
    danger:  '#FF453A',
    amber:   '#FF9F0A',
    tint:    accent,
    sans:    '-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif',
    mono:    'ui-monospace, "SF Mono", Menlo, monospace',
  } : {
    bg:      '#F2F2F7',
    card:    '#FFFFFF',
    surface: '#F2F2F7',
    surface2:'#E7E7EC',
    border:  'rgba(60,60,67,0.15)',
    text:    '#1C1C1E',
    muted:   'rgba(60,60,67,0.62)',
    faint:   'rgba(60,60,67,0.34)',
    green:   '#34C759',
    danger:  '#FF3B30',
    amber:   '#FF9500',
    tint:    accent,
    sans:    '-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif',
    mono:    'ui-monospace, "SF Mono", Menlo, monospace',
  }
}

export type Tokens = ReturnType<typeof makeTokens>

interface ThemeCtx {
  T: Tokens
  theme: ThemeMode
  accent: string
  isDark: boolean
  setTheme: (t: ThemeMode) => void
  setAccent: (a: string) => void
}

const Ctx = createContext<ThemeCtx>(null!)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>(
    () => (localStorage.getItem('pilot.theme') as ThemeMode) ?? 'system'
  )
  const [accent, setAccentState] = useState(
    () => localStorage.getItem('pilot.accent') ?? '#0A84FF'
  )
  const [sysDark, setSysDark] = useState(systemIsDark)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent) => setSysDark(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  const isDark = theme === 'dark' || (theme === 'system' && sysDark)
  const T = useMemo(() => makeTokens(isDark, accent), [isDark, accent])

  useEffect(() => {
    document.body.style.background = T.bg
    document.body.style.color = T.text
  }, [T])

  function setTheme(t: ThemeMode) {
    setThemeState(t)
    localStorage.setItem('pilot.theme', t)
  }
  function setAccent(a: string) {
    setAccentState(a)
    localStorage.setItem('pilot.accent', a)
  }

  return createElement(Ctx.Provider, { value: { T, theme, accent, isDark, setTheme, setAccent } }, children)
}

export function useTheme() { return useContext(Ctx) }
