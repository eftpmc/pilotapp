// Theme follows system preference via CSS media query — no JS needed.
// This stub is kept so import paths don't break during migration.
export function useTheme() {
  return {
    isDark: window.matchMedia('(prefers-color-scheme: dark)').matches,
  }
}
