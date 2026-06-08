import { setBaseUrl } from '@pilot/shared'

export function getServerUrl(): string {
  return localStorage.getItem('pilot.server') ?? ''
}

export function saveServerUrl(url: string) {
  const clean = url.replace(/\/$/, '')
  localStorage.setItem('pilot.server', clean)
  ;(window as Window & { electron?: { settings?: { set: (k: string, v: string) => void } } })
    .electron?.settings?.set('pilot.server', clean)
  if (import.meta.env.PROD) setBaseUrl(clean)
}

// On app init in prod, restore base URL from saved server URL.
if (import.meta.env.PROD) {
  const saved = getServerUrl()
  if (saved) setBaseUrl(saved)
}

export * from '@pilot/shared'
