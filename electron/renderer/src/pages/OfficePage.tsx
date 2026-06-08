import { useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { OfficeBg, sessions } from '@pilot/shared'
import { getServerUrl } from '@/api'

type ElectronBridge = {
  openExternal: (url: string) => void
  notify: (title: string, body: string) => void
  badge: (count: number) => void
}

const el = (): ElectronBridge | null =>
  (window as Window & { electron?: ElectronBridge }).electron ?? null

const NOTIFIED_KEY = 'pilot.notified'

function getNotified(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(NOTIFIED_KEY) ?? '[]')) }
  catch { return new Set() }
}

function saveNotified(ids: Set<string>) {
  // Keep last 200 to prevent unbounded growth
  const arr = [...ids].slice(-200)
  localStorage.setItem(NOTIFIED_KEY, JSON.stringify(arr))
}

export default function OfficePage() {
  const notifiedRef = useRef<Set<string>>(getNotified())

  const { data: sessionList = [] } = useQuery({
    queryKey: ['sessions'],
    queryFn: () => sessions.list(),
    refetchInterval: 30_000,
    enabled: !!localStorage.getItem('token'),
  })

  // Tray badge + notifications
  useEffect(() => {
    if (!el()) return

    const reviewCount = sessionList.filter(
      s => !s.specId && (s.status === 'done' || s.status === 'error')
    ).length

    el()!.badge(reviewCount)

    // Fire notifications for sessions that just finished
    const seen = notifiedRef.current
    let changed = false
    for (const s of sessionList) {
      if (seen.has(s.id)) continue
      if (s.status === 'done') {
        el()!.notify('Session complete', s.branch ?? 'A session finished and is ready to review.')
        seen.add(s.id)
        changed = true
      } else if (s.status === 'error') {
        el()!.notify('Session error', s.branch ?? 'A session encountered an error.')
        seen.add(s.id)
        changed = true
      }
    }
    if (changed) saveNotified(seen)
  }, [sessionList])

  // Clear badge when window is focused
  useEffect(() => {
    function onFocus() { el()?.badge(0) }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])

  const stored = localStorage.getItem('pilot.theme')
  const theme = (stored === 'light' || stored === 'dark') ? stored
    : window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'

  function onNavigate(path: string) {
    const serverUrl = getServerUrl()
    el()?.openExternal(`${serverUrl}${path}`)
  }

  return <OfficeBg active={true} theme={theme} onNavigate={onNavigate} />
}
