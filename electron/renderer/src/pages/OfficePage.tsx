import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { OfficeBg, sessions, getBaseUrl } from '@pilot/shared'
import type { Agent, OfficeMode, Session } from '@pilot/shared'
import { getServerUrl } from '@/api'
import { AlertCircle, CheckCircle2, Eye, Hammer, Radio, Wifi } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import SessionPanel from '@/components/SessionPanel'

const MODES: { id: OfficeMode; label: string; icon: LucideIcon; disabled?: boolean }[] = [
  { id: 'live',  label: 'Live',  icon: Radio   },
  { id: 'watch', label: 'Watch', icon: Eye     },
  { id: 'build', label: 'Build', icon: Hammer, disabled: true },
]
const MAC_WINDOW_CONTROLS_INSET = 88

function ModeSwitcher({ mode, onChange }: {
  mode: OfficeMode
  onChange: (mode: OfficeMode) => void
}) {
  const [open, setOpen] = useState(false)
  const current = MODES.find(m => m.id === mode)!
  const Icon = current.icon

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '0 12px 0 10px', height: 34,
          borderRadius: 9,
          background: open ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.1)',
          color: '#fff',
          cursor: 'pointer',
          transition: 'background 120ms',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.12)' }}
        onMouseLeave={e => { if (!open) e.currentTarget.style.background = 'rgba(255,255,255,0.06)' }}
      >
        <Icon size={15} strokeWidth={1.8} color="rgba(255,255,255,0.68)" />
        <span style={{ fontSize: 12, fontWeight: 650, letterSpacing: '-0.01em' }}>{current.label}</span>
        <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', marginLeft: 2 }}>▾</span>
      </button>

      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: -1 }} onClick={() => setOpen(false)} />
          <div style={{
            position: 'absolute', top: 'calc(100% + 6px)', left: 0,
            minWidth: 160,
            borderRadius: 12,
            background: 'oklch(0.15 0.009 265 / 0.97)',
            border: '1px solid rgba(255,255,255,0.1)',
            backdropFilter: 'blur(20px)',
            boxShadow: '0 12px 32px rgba(0,0,0,0.5)',
            padding: '4px',
          }}>
            {MODES.map(({ id, label, icon: ModeIcon, disabled }) => {
              const active = mode === id
              return (
                <button
                  key={id}
                  disabled={disabled}
                  onClick={() => { if (!disabled) onChange(id); setOpen(false) }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    width: '100%', padding: '9px 12px',
                    borderRadius: 8,
                    fontSize: 13, fontWeight: active ? 600 : 400,
                    color: disabled ? 'rgba(255,255,255,0.22)' : active ? '#fff' : 'rgba(255,255,255,0.45)',
                    background: active ? 'rgba(255,255,255,0.08)' : 'transparent',
                    cursor: disabled ? 'default' : 'pointer',
                    transition: 'background 100ms, color 100ms',
                  }}
                  onMouseEnter={e => { if (!active && !disabled) { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = 'rgba(255,255,255,0.8)' } }}
                  onMouseLeave={e => { if (!active && !disabled) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255,255,255,0.45)' } }}
                >
                  <ModeIcon size={15} strokeWidth={active ? 2 : 1.6} />
                  <span style={{ flex: 1, textAlign: 'left' }}>{label}</span>
                  {disabled && <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)' }}>Soon</span>}
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

function OfficeTopHud({
  mode, onModeChange, serverUrl, workingCount, reviewCount, errorCount, onReviewNext,
}: {
  mode: OfficeMode
  onModeChange: (mode: OfficeMode) => void
  serverUrl: string
  workingCount: number
  reviewCount: number
  errorCount: number
  onReviewNext: () => void
}) {
  const host = serverUrl ? serverUrl.replace(/^https?:\/\//, '') : 'No server'
  const watch = mode === 'watch'

  return (
    <div style={{
      position: 'fixed',
      top: 14,
      left: watch ? '50%' : MAC_WINDOW_CONTROLS_INSET,
      right: watch ? 'auto' : 16,
      transform: watch ? 'translateX(-50%)' : 'none',
      zIndex: 60,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      minWidth: watch ? 0 : 560,
      maxWidth: watch ? 'none' : 920,
      padding: watch ? 4 : '6px 8px 6px 12px',
      borderRadius: 14,
      background: 'oklch(0.13 0.008 265 / 0.88)',
      border: '1px solid rgba(255,255,255,0.11)',
      backdropFilter: 'blur(20px)',
      boxShadow: '0 12px 36px rgba(0,0,0,0.32)',
    }}>
      {!watch && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <div style={{
            width: 24, height: 24, borderRadius: 8,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(255,107,53,0.14)', color: 'var(--ember)',
          }}>
            <Radio size={13} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 750, letterSpacing: '-0.02em' }}>Pilot Office</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 1, fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>
              <Wifi size={10} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 190 }}>{host}</span>
            </div>
          </div>
        </div>
      )}

      <ModeSwitcher mode={mode} onChange={onModeChange} />

      {!watch && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <StatusPill icon={CheckCircle2} label={`${workingCount} active`} tone="green" />
          <button
            onClick={onReviewNext}
            disabled={reviewCount === 0}
            style={{
              height: 34,
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '0 11px',
              borderRadius: 9,
              background: reviewCount > 0 ? 'rgba(255,107,53,0.16)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${reviewCount > 0 ? 'rgba(255,107,53,0.28)' : 'rgba(255,255,255,0.07)'}`,
              color: reviewCount > 0 ? '#ff9b78' : 'rgba(255,255,255,0.28)',
              cursor: reviewCount > 0 ? 'pointer' : 'default',
              fontSize: 12,
              fontWeight: 650,
            }}
          >
            <AlertCircle size={14} />
            {errorCount > 0 ? `${errorCount} need attention` : reviewCount > 0 ? `${reviewCount} ready` : 'Review clear'}
          </button>
        </div>
      )}
    </div>
  )
}

function StatusPill({ icon: Icon, label, tone }: {
  icon: LucideIcon
  label: string
  tone: 'green'
}) {
  const color = tone === 'green' ? '#3dd68c' : '#fff'
  return (
    <div style={{
      height: 34,
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '0 10px',
      borderRadius: 9,
      background: `${color}16`,
      border: `1px solid ${color}28`,
      color,
      fontSize: 12,
      fontWeight: 650,
    }}>
      <Icon size={13} />
      {label}
    </div>
  )
}

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
  const [mode, setMode] = useState<OfficeMode>('live')
  const [logLines, setLogLines] = useState<string[]>([])
  const logBufRef = useRef<string>('')

  const { data: sessionList = [] } = useQuery({
    queryKey: ['sessions'],
    queryFn: () => sessions.list(),
    refetchInterval: 15_000,
    enabled: !!localStorage.getItem('token'),
  })
  const reviewSessions = useMemo(
    () => sessionList
      .filter(s => !s.specId && (s.status === 'done' || s.status === 'error'))
      .sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt)),
    [sessionList],
  )
  const workingCount = useMemo(
    () => sessionList.filter(s => s.status === 'running' || s.status === 'waiting').length,
    [sessionList],
  )
  const errorCount = useMemo(
    () => reviewSessions.filter(s => s.status === 'error').length,
    [reviewSessions],
  )

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

  const openReviewNext = useCallback(() => {
    const next = reviewSessions[0]
    if (!next) return
    setMode('live')
    setLogLines([])
    logBufRef.current = ''
    setSelectedAgentId(next.agentId)
    setSelectedSessionId(next.id)
  }, [reviewSessions])

  // Non-agent navigation falls back to browser
  const onNavigate = useCallback((path: string) => {
    el()?.openExternal(`${getServerUrl()}${path}`)
  }, [])

  const closePanel = useCallback(() => {
    setSelectedSessionId(null)
    setSelectedAgentId(null)
  }, [])

  useEffect(() => {
    if (mode === 'watch') closePanel()
  }, [closePanel, mode])

  const stored = localStorage.getItem('pilot.theme')
  const theme  = (stored === 'light' || stored === 'dark') ? stored
    : window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'

  return (
    <div style={{ position: 'relative', height: '100vh', overflow: 'hidden' }}>
      <OfficeBg
        active={true}
        theme={theme}
        mode={mode}
        showHud={false}
        onNavigate={onNavigate}
        onSelect={mode === 'watch' ? undefined : onSelect}
      />

      <OfficeTopHud
        mode={mode}
        onModeChange={setMode}
        serverUrl={getServerUrl()}
        workingCount={workingCount}
        reviewCount={reviewSessions.length}
        errorCount={errorCount}
        onReviewNext={openReviewNext}
      />

      {mode !== 'watch' && (selectedSessionId || selectedAgentId) && (
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
