export {}

declare global {
  interface Window {
    electron?: {
      platform?: string
      isElectron?: boolean
      openExternal?: (url: string) => void
      notify?: (title: string, body: string) => void
      badge?: (count: number) => void
      onTheme?: (cb: (theme: 'light' | 'dark') => void) => void
      navigate?: (path: string) => void
      getPendingPair?: () => Promise<{ serverUrl: string; pairToken: string } | null>
      onDeepLinkPair?: (cb: (data: { serverUrl: string; pairToken: string }) => void) => void
      settings?: {
        get: (key: string) => Promise<string | null>
        set: (key: string, value: string) => Promise<void>
      }
    }
  }
}
