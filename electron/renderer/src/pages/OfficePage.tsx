import { useEffect, useRef, useState, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { OfficeBg, sessions, getBaseUrl } from '@pilot/shared'
import type { Agent, Session } from '@pilot/shared'
import { getServerUrl } from '@/api'
import SessionPanel from '@/components/SessionPanel'

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
  localStorage.setItem(NOTIFIED_KEY, JSON.stringify([...ids].slice(-200)))
}

export default function OfficePage() {
  const notifiedRef = useRef<Set<string>>(getNotified())
  const wsRef = useRef<WebSocket | null>(null)
  const deadRef = useRef(false)

  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [selectedAgentId, setSelectedAgentId]     = useState<string | null>(null)
  const [logLines, setLogLines] = useState<string[]>([])
  const logBufRef = useRef<string>('')

  const { data: sessionList = [] } = useQuery({
    queryKey: ['sessions'],
    queryFn: () => sessions.list(),
    refetchInterval: 15_000,
    enabled: !!localStorage.getItem('token'),
  })

  // ── WebSocket ──────────────────────────────────────────────────────────────
  useEffect(() => {
    deadRef.current = false
    let delay = 1000

    function connect() {
      if (deadRef.current) return
      const token = localStorage.getItem('token')
      if (!token) return

      const base   = getBaseUrl() || getServerUrl()
      const proto  = base.startsWith('https') ? 'wss' : 'ws'
      const host   = base.replace(/^https?:\/\//, '')
      const ws     = new WebSocket(`${proto}://${host}/ws?token=${token}`)
      wsRef.current = ws

      ws.onopen = () => {
        delay = 1000
        ws.send(JSON.stringify({ type: 'subscribe-global' }))
        if (selectedSessionId) {
          ws.send(JSON.stringify({ type: 'subscribe', sessionId: selectedSessionId }))
        }
      }

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data)

          // Global status updates — let TanStack Query handle re-fetching
          if (msg.type === 'status') return

          // Session log output
          if (msg.type === 'stdout' || msg.type === 'stderr') {
            const text: string = msg.data ?? ''
            logBufRef.current += text
            // Flush buffer into lines
            const parts = logBufRef.current.split('\n')
            logBufRef.current = parts.pop() ?? ''
            if (parts.length > 0) {
              setLogLines(prev => [...prev, ...parts].slice(-2000))
            }
          }
        } catch {}
      }

      ws.onclose = () => {
        if (deadRef.current) return
        setTimeout(connect, Math.min(delay *= 1.5, 10_000))
      }
    }

    connect()
    return () => { deadRef.current = true; wsRef.current?.close() }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Re-subscribe when selected session changes
  useEffect(() => {
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    if (selectedSessionId) {
      ws.send(JSON.stringify({ type: 'subscribe', sessionId: selectedSessionId }))
    }
  }, [selectedSessionId])

  // ── Tray badge + notifications ─────────────────────────────────────────────
  useEffect(() => {
    if (!el()) return
    const reviewCount = sessionList.filter(
      s => !s.specId && (s.status === 'done' || s.status === 'error')
    ).length
    el()!.badge(reviewCount)

    const seen = notifiedRef.current
    let changed = false
    for (const s of sessionList) {
      if (seen.has(s.id)) continue
      if (s.status === 'done') {
        el()!.notify('Session complete', s.branch ?? 'Ready to review.')
        seen.add(s.id); changed = true
      } else if (s.status === 'error') {
        el()!.notify('Session error', s.branch ?? 'A session encountered an error.')
        seen.add(s.id); changed = true
      }
    }
    if (changed) saveNotified(seen)
  }, [sessionList])

  useEffect(() => {
    function onFocus() { el()?.badge(0) }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])

  // ── Agent select → always open panel ─────────────────────────────────────
  const onSelect = useCallback((agent: Agent, session: Session | undefined) => {
    setLogLines([])
    logBufRef.current = ''
    setSelectedAgentId(agent.id)
    setSelectedSessionId(session?.id ?? null)
  }, [])

  // Non-agent navigation falls back to browser
  const onNavigate = useCallback((path: string) => {
    el()?.openExternal(`${getServerUrl()}${path}`)
  }, [])

  const closePanel = useCallback(() => {
    setSelectedSessionId(null)
    setSelectedAgentId(null)
  }, [])

  const stored = localStorage.getItem('pilot.theme')
  const theme  = (stored === 'light' || stored === 'dark') ? stored
    : window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'

  return (
    <div style={{ position: 'relative', height: '100vh', overflow: 'hidden' }}>
      <OfficeBg active={true} theme={theme} onNavigate={onNavigate} onSelect={onSelect} />

      {(selectedSessionId || selectedAgentId) && (
        <SessionPanel
          sessionId={selectedSessionId}
          agentId={selectedAgentId}
          logLines={logLines}
          onClose={closePanel}
        />
      )}
    </div>
  )
}
