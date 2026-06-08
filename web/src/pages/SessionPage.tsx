import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { sessions, agents, projects, tasks, AgentAvatar, fmtSecs, useElapsed, cn } from '@pilot/shared'
import type { Agent } from '@pilot/shared'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { StatusBadge } from '@/components/StatusBadge'
import { ArrowLeft, ChevronDown, ChevronRight } from 'lucide-react'

const MAX_LINES = 2000

interface Line { text: string; kind: 'text' | 'tool' | 'tool-result' | 'thinking' | 'stderr' | 'mcp-error' }

interface TokenStats { input: number; output: number; cacheRead: number; costUsd: number | null }

interface TurnData {
  id: string
  number: number
  prompt: string
  lines: Line[]
  status: 'running' | 'done' | 'error'
  exitCode?: string
}

function formatToolCall(name: string, input: Record<string, unknown>): string {
  const entries = Object.entries(input)
  if (entries.length === 0) return `▸ ${name}`
  if (entries.length === 1) {
    const v = String(entries[0][1])
    return `▸ ${name}  ${v.length > 72 ? '…' + v.slice(-60) : v}`
  }
  const parts = entries.slice(0, 2).map(([k, v]) => `${k}: ${String(v).slice(0, 35)}`)
  return `▸ ${name}  ${parts.join('  ')}`
}

function formatToolResult(content: unknown): string | null {
  if (typeof content === 'string') {
    const t = content.trim()
    return t.length > 0 ? (t.length > 180 ? '  ' + t.slice(0, 178) + '…' : '  ' + t) : null
  }
  if (Array.isArray(content)) {
    const texts = content.filter((c: any) => c.type === 'text').map((c: any) => c.text?.trim()).filter(Boolean)
    const joined = texts.join(' ')
    return joined.length > 0 ? (joined.length > 180 ? '  ' + joined.slice(0, 178) + '…' : '  ' + joined) : null
  }
  return null
}

function ColoredDiff({ raw }: { raw: string }) {
  if (!raw.trim()) return <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--muted)' }}>No changes.</p>
  return (
    <div className="diff">
      {raw.split('\n').map((line, i) => {
        const cls =
          line.startsWith('@@')         ? 'hunk' :
          line.startsWith('+')          ? 'add'  :
          line.startsWith('-')          ? 'del'  :
          line.startsWith('diff --git') ||
          line.startsWith('index ')     ||
          line.startsWith('--- ')       ||
          line.startsWith('+++ ')       ? 'meta' : ''
        return <div key={i} className={`dl ${cls}`}>{line || ' '}</div>
      })}
    </div>
  )
}

function ReviewerPickerButton({ agentList, onPick }: { agentList: Agent[]; onPick: (id: string) => void }) {
  if (agentList.length === 0) return null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline">Request Review</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Pick reviewer</DropdownMenuLabel>
        {agentList.map(a => (
          <DropdownMenuItem key={a.id} onSelect={() => onPick(a.id)} className="flex items-center gap-2">
            <AgentAvatar agent={a} size={24} animated={false} />
            {a.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function inlineWithCode(line: string, key: number) {
  const parts = line.split(/(`[^`]+`)/)
  return (
    <p key={key} style={{ fontFamily: 'inherit', fontWeight: 400, fontSize: 14, lineHeight: 1.7, color: 'var(--ink-2)', margin: '3px 0 0' }}>
      {parts.map((part, k) =>
        part.startsWith('`') && part.endsWith('`')
          ? <code key={k} style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ember)', background: 'var(--ember-wash)', padding: '1px 5px', borderRadius: 4 }}>{part.slice(1, -1)}</code>
          : stripInlineMarkdown(part)
      )}
    </p>
  )
}

function stripInlineMarkdown(text: string) {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
}

function journalHeading(line: string) {
  const trimmed = line.trim()
  const markdownHeading = trimmed.match(/^#{1,2}\s+(.+)$/)
  if (markdownHeading) return stripInlineMarkdown(markdownHeading[1]).trim()
  const boldHeading = trimmed.match(/^(?:\*\*|__)(.+?)(?:\*\*|__):?$/)
  return boldHeading ? stripInlineMarkdown(boldHeading[1]).trim() : null
}

function JournalView({ text }: { text: string }) {
  const lines = text.split('\n')
  type Block = { type: 'h1' | 'h2' | 'beat'; content: string[] }
  const blocks: Block[] = []

  for (const raw of lines) {
    const line = raw.trimEnd()
    const heading = journalHeading(line)
    if (line.startsWith('# ') && heading) {
      blocks.push({ type: 'h1', content: [heading] })
    } else if ((line.startsWith('## ') || heading) && heading) {
      blocks.push({ type: 'h2', content: [heading] })
    } else if (line === '') {
      if (blocks.length > 0 && blocks[blocks.length - 1].type === 'beat' && blocks[blocks.length - 1].content.length > 0) {
        blocks.push({ type: 'beat', content: [] })
      }
    } else {
      const last = blocks[blocks.length - 1]
      if (last?.type === 'beat') {
        last.content.push(line)
      } else {
        blocks.push({ type: 'beat', content: [line] })
      }
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, maxWidth: '44em' }}>
      {blocks.map((block, i) => {
        if (block.type === 'h1') return null
        if (block.type === 'h2') {
          return (
            <p key={i} className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/50"
              style={{ margin: '28px 0 10px' }}>
              {block.content[0]}
            </p>
          )
        }
        if (!block.content.length) return null
        return (
          <div key={i} className="flex gap-4" style={{ marginBottom: 10 }}>
            <div className="w-px shrink-0 rounded-full bg-border" style={{ marginTop: 5 }} />
            <div className="flex-1 min-w-0">
              {block.content.map((line, j) => inlineWithCode(line, j))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function CopyCommand({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button onClick={() => { navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) }) }}
      style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ember)', background: 'var(--ember-wash)', border: '1px solid color-mix(in srgb, var(--ember) 25%, transparent)', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
      {copied ? '✓ Copied' : 'Copy pull command'}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Output line renderer
// ---------------------------------------------------------------------------

function lineColor(kind: Line['kind']): string {
  if (kind === 'tool')        return 'var(--ember)'
  if (kind === 'tool-result') return 'var(--muted)'
  if (kind === 'thinking')    return 'oklch(0.55 0.08 280)'
  if (kind === 'stderr')      return 'var(--muted)'
  if (kind === 'mcp-error')   return 'var(--red)'
  return 'var(--ink-2)'
}

function TokenBar({ stats }: { stats: TokenStats }) {
  const fmt = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--rule-soft)' }}>
      <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--muted)' }}>
        in {fmt(stats.input)} · out {fmt(stats.output)}
        {stats.cacheRead > 0 && ` · cache hit ${fmt(stats.cacheRead)}`}
        {stats.costUsd != null && ` · $${stats.costUsd.toFixed(4)}`}
      </span>
    </div>
  )
}

function OutputLines({ lines, done, exitCode, elapsedSecs, isRunning, tokens }: {
  lines: Line[]; done: boolean; exitCode: string | null; elapsedSecs: number; isRunning: boolean; tokens?: TokenStats
}) {
  const bottomRef = useRef<HTMLDivElement>(null)
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [lines])
  return (
    <div role="log" aria-live="polite" aria-label="Session output">
      {lines.length === MAX_LINES && (
        <p className="text-[11px] font-mono text-muted-foreground/40 mb-4 pb-3 border-b border-border">
          ↑ earlier output truncated — showing last {MAX_LINES} lines
        </p>
      )}
      {lines.length === 0 && !isRunning && !done && (
        <p className="text-xs font-mono text-muted-foreground">waiting for output…</p>
      )}
      {lines.map((line, i) => (
        <div key={i} style={{
          fontFamily: 'var(--font-mono)', fontSize: 12.5, lineHeight: 1.85,
          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          color: lineColor(line.kind),
          opacity: line.kind === 'tool-result' || line.kind === 'thinking' ? 0.7 : 1,
        }}>
          {line.text}
        </div>
      ))}
      {isRunning && !done && <span className="cursor-blink" style={{ marginTop: 4, display: 'inline-block' }} />}
      {done && (
        <p className="text-[11px] font-mono text-muted-foreground/40 mt-5 pt-3 border-t border-border/50">
          process exited {exitCode ?? '0'} · {fmtSecs(elapsedSecs)}
        </p>
      )}
      {done && tokens && (tokens.input > 0 || tokens.output > 0) && <TokenBar stats={tokens} />}
      <div ref={bottomRef} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Turn card
// ---------------------------------------------------------------------------

function TurnCard({ turn, isActive, elapsedSecs }: { turn: TurnData; isActive: boolean; elapsedSecs: number }) {
  const [expanded, setExpanded] = useState(isActive)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Keep active turn scrolled to bottom
  useEffect(() => {
    if (isActive) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [turn.lines, isActive])

  // Auto-expand when this turn becomes active
  useEffect(() => {
    if (isActive) setExpanded(true)
  }, [isActive])

  const statusColor = turn.status === 'running' ? 'var(--green)' : turn.status === 'error' ? 'var(--red)' : 'var(--muted)'
  const promptPreview = turn.prompt.length > 90 ? turn.prompt.slice(0, 88) + '…' : turn.prompt

  return (
    <div style={{
      border: '1px solid var(--rule)',
      borderRadius: 10,
      overflow: 'hidden',
      background: isActive ? 'var(--panel)' : 'transparent',
      marginBottom: 10,
    }}>
      {/* Turn header */}
      <button
        type="button"
        onClick={() => setExpanded(e => !e)}
        style={{
          width: '100%', display: 'flex', alignItems: 'flex-start', gap: 10,
          padding: '11px 14px', background: 'none', border: 'none', cursor: 'pointer',
          textAlign: 'left', fontFamily: 'inherit',
        }}
      >
        <div style={{ paddingTop: 2, color: 'var(--muted)', flexShrink: 0 }}>
          {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Turn {turn.number}
            </span>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor, flexShrink: 0,
              ...(turn.status === 'running' ? { animation: 'pulse 1.6s ease-out infinite' } : {}) }} />
            {turn.status !== 'running' && turn.exitCode && (
              <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--muted)' }}>
                exit {turn.exitCode}
              </span>
            )}
            {isActive && turn.status === 'running' && (
              <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--green)' }}>
                {fmtSecs(elapsedSecs)}
              </span>
            )}
          </div>
          <p style={{ fontSize: 13, color: 'var(--ink)', margin: 0, lineHeight: 1.5 }}>{promptPreview}</p>
        </div>
      </button>

      {/* Turn output */}
      {expanded && (
        <div style={{ padding: '0 14px 14px', borderTop: '1px solid var(--rule-soft)' }}>
          {turn.lines.length === 0 && turn.status === 'running' && (
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--muted)', marginTop: 12 }}>starting…</p>
          )}
          {turn.lines.map((line, i) => (
            <div key={i} style={{
              fontFamily: 'var(--font-mono)', fontSize: 12.5, lineHeight: 1.85,
              whiteSpace: 'pre-wrap', wordBreak: 'break-word', marginTop: i === 0 ? 12 : 0,
              color: lineColor(line.kind),
              opacity: line.kind === 'tool-result' || line.kind === 'thinking' ? 0.7 : 1,
            }}>
              {line.text}
            </div>
          ))}
          {isActive && turn.status === 'running' && <span className="cursor-blink" style={{ marginTop: 4, display: 'inline-block' }} />}
          {turn.status !== 'running' && turn.lines.length > 0 && (
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--rule-soft)' }}>
              exit {turn.exitCode ?? '0'}
            </p>
          )}
          <div ref={bottomRef} />
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SessionPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()

  // Legacy (pre-turns) flat output state
  const [legacyLines, setLegacyLines]   = useState<Line[]>([])
  const [done, setDone]                 = useState(false)
  const [exitCode, setExitCode]         = useState<string | null>(null)

  // Turn-based state
  const [turns, setTurns]               = useState<TurnData[]>([])
  const activeTurnRef                   = useRef<string | null>(null)

  // Token stats (accumulated from stream-json)
  const [tokens, setTokens]             = useState<TokenStats>({ input: 0, output: 0, cacheRead: 0, costUsd: null })
  const tokensRef                       = useRef<TokenStats>({ input: 0, output: 0, cacheRead: 0, costUsd: null })

  const [clarification, setClarification] = useState<{ id: string; question: string; options?: string[] } | null>(null)
  const [clarificationInput, setClarInput] = useState('')

  const [activeTab, setActiveTab]       = useState<'output' | 'diff' | 'journal'>('output')
  const [diff, setDiff]                 = useState<string | null>(null)
  const [diffIsText, setDiffIsText]     = useState(false)
  const [diffLoading, setDiffLoad]      = useState(false)
  const [diffError, setDiffError]       = useState<string | null>(null)
  const [hint, setHint]                 = useState('')
  const [idlePrompt, setIdlePrompt]     = useState('')
  const [continuePrompt, setContinue]   = useState('')
  const [pushed, setPushed]             = useState(false)
  const legacyBottomRef                 = useRef<HTMLDivElement>(null)
  const bufferRef                       = useRef('')
  const notifiedRef                     = useRef(false)

  const isLiveStatus = (s?: string) => s === 'running' || s === 'waiting'
  const { data: session, refetch: refetchSession } = useQuery({
    queryKey: ['session', id],
    queryFn: () => sessions.get(id!),
    enabled: !!id,
    refetchInterval: (q) => isLiveStatus(q.state.data?.status) ? 2000 : 3000,
  })
  const { data: agentList     = [] } = useQuery({ queryKey: ['agents'],   queryFn: () => agents.list() })
  const { data: projectList   = [] } = useQuery({ queryKey: ['projects'], queryFn: () => projects.list() })
  const { data: taskList      = [] } = useQuery({ queryKey: ['tasks', session?.projectId], queryFn: () => tasks.list({ projectId: session!.projectId }), enabled: !!session?.projectId })
  const { data: projectSessions = [] } = useQuery({ queryKey: ['sessions', 'project', session?.projectId], queryFn: () => sessions.list({ projectId: session!.projectId }), enabled: !!session?.projectId, refetchInterval: 5000 })

  const agent   = agentList.find(a => a.id === session?.agentId)
  const project = projectList.find(p => p.id === session?.projectId)
  const task    = taskList.find(t => t.id === session?.workTaskId)

  const isRunning = session?.status === 'running'
  const isDone    = session?.status === 'done'
  const isError   = session?.status === 'error'
  const isMerged  = session?.status === 'merged'
  const hasTurns  = turns.length > 0
  const activeRunning = isRunning || (hasTurns && turns[turns.length - 1]?.status === 'running')

  // Seed token stats from server data when loading a completed session
  const sessionTokens: TokenStats | undefined = session?.inputTokens != null ? {
    input: session.inputTokens, output: session.outputTokens ?? 0,
    cacheRead: session.cacheReadTokens ?? 0, costUsd: session.totalCostUsd ?? null,
  } : undefined
  const displayTokens = (tokens.input > 0 || tokens.output > 0) ? tokens : sessionTokens

  const elapsedSecs = useElapsed(task?.startedAt ?? session?.createdAt, activeRunning)

  const merge         = useMutation({ mutationFn: () => sessions.merge(id!),   onSuccess: () => { qc.invalidateQueries({ queryKey: ['sessions'] }); qc.invalidateQueries({ queryKey: ['tasks'] }); refetchSession() } })
  const push          = useMutation({ mutationFn: () => projects.push(project!.id), onSuccess: () => setPushed(true) })
  const stop          = useMutation({ mutationFn: () => sessions.stop(id!),   onSuccess: () => refetchSession() })
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const discard       = useMutation({ mutationFn: () => sessions.delete(id!), onSuccess: () => { qc.invalidateQueries({ queryKey: ['sessions'] }); navigate(session?.projectId ? `/projects/${session.projectId}` : -1 as never) } })
  const requestReview = useMutation({ mutationFn: (agentId: string) => sessions.requestReview(id!, agentId), onSuccess: () => refetchSession() })
  const retry         = useMutation({
    mutationFn: (prompt?: string) => sessions.run(id!, prompt),
    onSuccess: () => { setLegacyLines([]); setDone(false); setExitCode(null); setDiff(null); setHint(''); bufferRef.current = ''; refetchSession() },
  })
  const addTurn = useMutation({
    mutationFn: (prompt: string) => sessions.addTurn(id!, prompt),
    onSuccess: () => { setContinue(''); refetchSession() },
  })

  // Keyboard shortcuts: m=merge, d=discard, Esc=back; 1–9=pick clarification option
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.metaKey || e.ctrlKey) return

      if (clarification) {
        if (clarification.options) {
          const n = parseInt(e.key)
          if (n >= 1 && n <= clarification.options.length) {
            e.preventDefault()
            submitClarification(clarification.id, clarification.options[n - 1])
          }
        }
        return
      }

      if (confirmDiscard) return

      if (e.key === 'm' && (isDone || isError) && !isMerged && !session?.parentSessionId && !merge.isPending) {
        e.preventDefault()
        merge.mutate()
      }
      if (e.key === 'd' && !isMerged) {
        e.preventDefault()
        setConfirmDiscard(true)
      }
      if (e.key === 'Escape') {
        if (task && session?.projectId) navigate(`/projects/${session.projectId}/tasks/${task.id}`)
        else if (session?.projectId) navigate(`/projects/${session.projectId}`)
        else navigate(-1 as never)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [isDone, isError, isMerged, session, confirmDiscard, clarification, merge.isPending, task, navigate])

  useEffect(() => { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission() }, [])
  useEffect(() => {
    if (!done || notifiedRef.current || !session) return
    notifiedRef.current = true
    if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
      new Notification(session.status === 'done' ? '✓ Done' : '✗ Error', { body: `${agent?.name ?? 'Agent'} · ${project?.name ?? ''}`, icon: '/favicon.svg' })
    }
  }, [done, session])

  // WebSocket — handles both legacy and turn-based output
  useEffect(() => {
    if (!id) return
    let ws: WebSocket | null = null, dead = false, delay = 1000
    function connect() {
      if (dead) return
      const token = localStorage.getItem('token')
      if (!token) return
      const proto = location.protocol === 'https:' ? 'wss' : 'ws'
      ws = new WebSocket(`${proto}://${location.host}/ws?token=${token}`)
      ws.onopen = () => {
        delay = 1000
        const fresh = { input: 0, output: 0, cacheRead: 0, costUsd: null }
        tokensRef.current = fresh; setTokens(fresh)
        setLegacyLines([]); setDone(false); setExitCode(null); setTurns([]); activeTurnRef.current = null; bufferRef.current = ''
        ws!.send(JSON.stringify({ type: 'subscribe', sessionId: id }))
        ws!.send(JSON.stringify({ type: 'subscribe-global' }))
      }
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data)

          // Global events
          if (msg.type === 'global-event') {
            if (msg.eventType === 'session.clarification_requested' && msg.sessionId === id) {
              // Fallback: fetch from server if we missed the inline stream event
              if (!clarification) {
                const token = localStorage.getItem('token')
                fetch(`/sessions/${id}/clarifications`, { headers: { Authorization: `Bearer ${token}` } })
                  .then(r => r.json())
                  .then((items: { id: string; question: string; options?: string[]; respondedAt?: string }[]) => {
                    const pending = items.find(c => !c.respondedAt)
                    if (pending) { setClarification({ id: pending.id, question: pending.question, options: pending.options }); setClarInput('') }
                  })
                  .catch(() => {})
              }
              refetchSession()
            }
            if (msg.eventType === 'session.clarification_responded' && msg.sessionId === id) {
              setClarification(null); setClarInput(''); refetchSession()
            }
            if (msg.eventType === 'session.review_completed' && (msg.sessionId === id || msg.sessionId === session?.parentSessionId)) {
              refetchSession()
            }
            return
          }

          // Inline clarification — sent directly on session stream
          if (msg.type === 'clarification' && msg.sessionId === id) {
            try {
              const c = JSON.parse(msg.data)
              setClarification({ id: c.id, question: c.question, options: c.options ?? undefined })
              setClarInput('')
            } catch {}
            return
          }

          if (msg.type === 'done') {
            setDone(true); setExitCode(String(msg.data ?? '0'))
            setTokens({ ...tokensRef.current }); refetchSession(); return
          }
          if (msg.type === 'turn_start') {
            const { turnId, turnNumber, prompt: p } = JSON.parse(msg.data)
            activeTurnRef.current = turnId
            setTurns(prev => [...prev, { id: turnId, number: turnNumber, prompt: p, lines: [], status: 'running' }])
            setDone(false); setExitCode(null)
            return
          }
          if (msg.type === 'turn_done') {
            const { turnId, exitCode: ec } = JSON.parse(msg.data)
            activeTurnRef.current = null
            setTurns(prev => prev.map(t => t.id === turnId ? { ...t, status: ec === '0' ? 'done' : 'error', exitCode: ec } : t))
            setDone(true); setExitCode(ec); setTokens({ ...tokensRef.current }); refetchSession()
            return
          }
          if (msg.type === 'stdout') processChunk(msg.data)
          if (msg.type === 'stderr') dispatchLine(msg.data, 'stderr')
        } catch {}
      }
      ws.onclose = () => { if (!dead) { setTimeout(connect, delay); delay = Math.min(delay * 2, 30_000) } }
      ws.onerror = () => ws?.close()
    }
    connect()
    return () => { dead = true; ws?.close() }
  }, [id])

  useEffect(() => {
    if (!hasTurns) legacyBottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [legacyLines, hasTurns])

  function dispatchLine(text: string, kind: Line['kind']) {
    if (activeTurnRef.current) {
      const turnId = activeTurnRef.current
      setTurns(prev => prev.map(t => {
        if (t.id !== turnId) return t
        const next = [...t.lines, { text, kind }]
        return { ...t, lines: next.length > MAX_LINES ? next.slice(-MAX_LINES) : next }
      }))
    } else {
      setLegacyLines(prev => { const next = [...prev, { text, kind }]; return next.length > MAX_LINES ? next.slice(-MAX_LINES) : next })
    }
  }

  function processChunk(chunk: string) {
    bufferRef.current += chunk
    const parts = bufferRef.current.split('\n')
    bufferRef.current = parts.pop() ?? ''
    for (const raw of parts) parseLine(raw.trim())
  }

  function parseLine(line: string) {
    if (!line) return
    try {
      const obj = JSON.parse(line)

      if (obj.type === 'assistant') {
        for (const block of (obj.message?.content ?? [])) {
          if (block.type === 'text' && block.text?.trim()) {
            dispatchLine(block.text.trim(), 'text')
          } else if (block.type === 'tool_use') {
            dispatchLine(formatToolCall(block.name, block.input ?? {}), 'tool')
          } else if (block.type === 'thinking' && block.thinking?.trim()) {
            const preview = block.thinking.trim().replace(/\n/g, ' ').slice(0, 140)
            dispatchLine(`  💭 ${preview}${block.thinking.length > 140 ? '…' : ''}`, 'thinking')
          }
        }
        // Accumulate token counts
        const usage = obj.message?.usage
        if (usage) {
          tokensRef.current = {
            input:     tokensRef.current.input     + (usage.input_tokens     ?? 0),
            output:    tokensRef.current.output    + (usage.output_tokens    ?? 0),
            cacheRead: tokensRef.current.cacheRead + (usage.cache_read_input_tokens ?? 0),
            costUsd:   tokensRef.current.costUsd,
          }
        }
      } else if (obj.type === 'user') {
        // Tool results come back as user messages
        for (const block of (obj.message?.content ?? [])) {
          if (block.type === 'tool_result') {
            const preview = formatToolResult(block.content)
            if (preview) dispatchLine(preview, 'tool-result')
          }
        }
      } else if (obj.type === 'result') {
        if (obj.result?.trim()) dispatchLine(obj.result.trim(), 'text')
        if (typeof obj.total_cost_usd === 'number') {
          tokensRef.current = { ...tokensRef.current, costUsd: obj.total_cost_usd }
        }
      }
    } catch { if (line) dispatchLine(line, 'text') }
  }

  async function loadDiff() {
    if (!id || diffLoading) return
    if (diff !== null) { setActiveTab('diff'); return }
    setDiffLoad(true); setDiffError(null); setActiveTab('diff')
    try {
      const { diff: d, unavailableReason, isResultText } = await sessions.diff(id) as { diff: string; unavailableReason?: string; isResultText?: boolean }
      setDiff(d)
      setDiffIsText(!!isResultText)
      if (unavailableReason) setDiffError(unavailableReason)
    }
    catch (e) { setDiffError(e instanceof Error ? e.message : 'Could not load diff') }
    finally { setDiffLoad(false) }
  }

  const isWorkspace = session?.workspaceMode === 'workspace'

  // Prior sessions on this task — tells us if this session received a handoff
  const priorSessions = session?.workTaskId && !session.parentSessionId
    ? projectSessions
        .filter(s => s.workTaskId === session.workTaskId && s.id !== id && !s.parentSessionId && s.createdAt < session.createdAt)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    : []

  const canContinue = isDone && !!session?.runnerSessionId && !isMerged && !session?.parentSessionId
  const isWaiting   = (session?.status as string) === 'waiting'

  // Lead orchestration
  const runnerSession  = session?.runnerSessionId ? projectSessions.find(s => s.id === session.runnerSessionId) : undefined
  const runnerAgent    = runnerSession ? agentList.find(a => a.id === runnerSession.agentId) : undefined
  const workerSessions = projectSessions.filter(s => s.runnerSessionId === id && s.id !== id)

  function submitClarification(clarificationId: string, response: string) {
    if (!response.trim()) return
    const token = localStorage.getItem('token')
    fetch(`/sessions/${id}/clarifications/${clarificationId}/respond`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body:    JSON.stringify({ response: response.trim() }),
    }).then(() => { setClarification(null); setClarInput('') }).catch(() => {})
  }

  return (
    <div className="flex-1 flex flex-col" style={{ minHeight: 0 }}>

      {/* Header */}
      <div className="bg-background border-b border-border px-6 pt-5 pb-0">
        <Button variant="ghost" size="sm" onClick={() => {
          if (task && session?.projectId) navigate(`/projects/${session.projectId}/tasks/${task.id}`)
          else if (session?.projectId) navigate(`/projects/${session.projectId}`)
          else navigate(-1 as never)
        }} className="mb-4 -ml-2 text-muted-foreground">
          <ArrowLeft size={13} />
          {task?.title ?? project?.name ?? 'Back'}
        </Button>

        <div className="flex items-start gap-3 mb-4 flex-wrap">
          <AgentAvatar agent={agent} size={44} running={activeRunning} />
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-semibold tracking-tight text-foreground leading-snug">
              {task?.title ?? (session?.specId ? 'Planning session' : 'Session')}
            </h1>
            <div className="flex items-center gap-2.5 mt-1 flex-wrap">
              {agent && <span className="text-sm text-muted-foreground font-medium">{agent.name}</span>}
              {agent && session && <span className="text-muted-foreground/30">·</span>}
              {session && <StatusBadge status={session.status} />}
              {activeRunning && <span className="text-xs font-mono text-[var(--green)] tabular-nums">{fmtSecs(elapsedSecs)}</span>}
              {hasTurns && (
                <>
                  <span className="text-muted-foreground/30">·</span>
                  <span className="text-xs text-muted-foreground">{turns.length} turn{turns.length !== 1 ? 's' : ''}</span>
                </>
              )}
              {priorSessions.length > 0 && (
                <>
                  <span className="text-muted-foreground/30">·</span>
                  <button
                    onClick={() => task && session?.projectId && navigate(`/projects/${session.projectId}/tasks/${task.id}`)}
                    className="text-xs text-muted-foreground/60 hover:text-foreground transition-colors"
                    title="View task history"
                  >
                    Resumed · {priorSessions.length} prior
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="flex gap-2 shrink-0 flex-wrap justify-end max-sm:basis-full max-sm:pl-[46px] max-sm:justify-start">
            {activeRunning && <Button size="sm" variant="outline" onClick={() => stop.mutate()} disabled={stop.isPending}>{stop.isPending ? '…' : 'Stop'}</Button>}
            {(isDone || isError) && <Button size="sm" variant="outline" onClick={loadDiff} disabled={diffLoading}>{diffLoading ? '…' : 'Diff'}</Button>}
            {isDone && !session?.reviewVerdict && !isMerged && (
              <ReviewerPickerButton agentList={agentList.filter(a => a.id !== session?.agentId)} onPick={agentId => requestReview.mutate(agentId)} />
            )}
            {session?.reviewVerdict === 'pending' && <span className="chip" style={{ color: 'var(--muted)' }}>Reviewing…</span>}
            {session?.reviewVerdict === 'approved' && <span className="chip" style={{ color: 'var(--green)', background: 'color-mix(in srgb, var(--green) 10%, transparent)' }}>Approved ✓</span>}
            {session?.reviewVerdict === 'changes_requested' && <span className="chip" style={{ color: 'var(--amber)', background: 'color-mix(in srgb, var(--amber) 10%, transparent)' }}>Changes Requested</span>}
            {(isDone || isError) && !isMerged && !session?.parentSessionId && <Button size="sm" onClick={() => merge.mutate()} disabled={merge.isPending}>{merge.isPending ? '…' : isError ? 'Accept anyway' : isWorkspace ? 'Complete ✓' : 'Accept ✓'}</Button>}
            {!isMerged && (
              <Button size="sm" variant="destructive" onClick={() => setConfirmDiscard(true)}>
                Discard
              </Button>
            )}

            <Dialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Discard session?</DialogTitle>
                  <DialogDescription>
                    The session and its worktree will be permanently deleted. Any uncommitted work will be lost.
                  </DialogDescription>
                </DialogHeader>
                <div className="flex justify-end gap-2 mt-2">
                  <Button variant="outline" size="sm" onClick={() => setConfirmDiscard(false)}>Cancel</Button>
                  <Button variant="destructive" size="sm" disabled={discard.isPending} onClick={() => { setConfirmDiscard(false); discard.mutate() }}>
                    {discard.isPending ? '…' : 'Discard'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1">
          {(['output', 'diff'] as const).map(t => (
            <button key={t}
              onClick={() => t === 'diff' ? loadDiff() : setActiveTab('output')}
              className={`proj-tab capitalize ${activeTab === t ? 'active' : ''}`}
            >
              {t === 'diff' && isWorkspace ? 'files' : t}
            </button>
          ))}
          {(session?.journal || isLiveStatus(session?.status)) && (
            <button
              className={`proj-tab capitalize ${activeTab === 'journal' ? 'active' : ''}`}
              onClick={() => setActiveTab('journal')}
            >
              {session?.parentSessionId ? 'review' : 'journal'}
            </button>
          )}
        </div>
      </div>

      {/* Orchestration banner — dispatched by a lead */}
      {runnerSession && runnerAgent && (
        <div className="border-b border-border/60 bg-muted/20 px-6 py-2.5 flex items-center gap-3">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50 shrink-0">Dispatched by</span>
          <button
            onClick={() => navigate(`/sessions/${runnerSession.id}`)}
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
          >
            <AgentAvatar agent={runnerAgent} size={20} running={runnerSession.status === 'running'} animated={false} />
            <span className="text-xs font-medium text-foreground">{runnerAgent.name}</span>
            <span className="text-[10px] font-semibold px-1 py-0.5 rounded" style={{ color: 'var(--ember)', background: 'var(--ember-wash)' }}>Lead</span>
          </button>
        </div>
      )}

      {/* Worker sessions — this is a lead session */}
      {workerSessions.length > 0 && (
        <div className="border-b border-border/60 bg-muted/20 px-6 py-3 flex flex-col gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
            Dispatched · {workerSessions.length} worker{workerSessions.length !== 1 ? 's' : ''}
          </p>
          <div className="flex flex-wrap gap-2">
            {workerSessions.map(ws => {
              const wa = agentList.find(a => a.id === ws.agentId)
              const wt = taskList.find(t => t.id === ws.workTaskId)
              const isLive = ws.status === 'running'
              const isDoneWs = ws.status === 'done'
              const isErrWs = ws.status === 'error'
              return (
                <button
                  key={ws.id}
                  onClick={() => navigate(`/sessions/${ws.id}`)}
                  className="flex items-center gap-2 px-3 py-1.5 bg-card/70 border border-border/60 rounded-lg hover:bg-muted/40 transition-colors text-left"
                >
                  {isLive && <span className="dot green pulse shrink-0" style={{ width: 6, height: 6 }} />}
                  <AgentAvatar agent={wa} size={20} running={isLive} animated={false} />
                  <span className="text-xs font-medium text-foreground max-w-[140px] truncate">
                    {wa?.name ?? '—'}{wt ? ` · ${wt.title}` : ''}
                  </span>
                  <span className={cn(
                    'text-[10px] font-medium capitalize shrink-0',
                    isLive ? 'text-[var(--green)]' : isErrWs ? 'text-destructive' : isDoneWs ? 'text-primary' : 'text-muted-foreground'
                  )}>{ws.status}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto bg-muted/30" style={{ minHeight: 0 }}>
        <div style={{ maxWidth: 780, margin: '0 auto', padding: '24px 28px' }}>
          {activeTab === 'journal' ? (
            <>
              {priorSessions.filter(s => s.journal).map((s, i) => {
                const a = agentList.find(ag => ag.id === s.agentId)
                return (
                  <div key={s.id} style={{ marginBottom: 28 }}>
                    <p style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 }}>
                      Handoff {priorSessions.filter(s => s.journal).length > 1 ? `· ${priorSessions.filter(ps => ps.journal).length - i} sessions ago` : '· previous session'}
                      {a && <span style={{ fontWeight: 400, marginLeft: 8 }}>{a.name}</span>}
                    </p>
                    <div style={{ opacity: 0.6 }}>
                      <JournalView text={s.journal!} />
                    </div>
                    <div style={{ height: 1, background: 'var(--rule-soft)', margin: '20px 0 0' }} />
                  </div>
                )
              })}
              {session?.journal
                ? <JournalView text={session.journal} />
                : <p className="text-xs font-mono text-muted-foreground">Agent hasn't written anything yet…</p>
              }
            </>
          ) : activeTab === 'diff' ? (
            diffLoading
              ? <p className="text-xs font-mono text-muted-foreground">loading…</p>
              : diffError
              ? (
                <div className="rounded-lg border border-border/60 bg-card px-4 py-3">
                  <p className="text-sm text-foreground">Diff unavailable</p>
                  <p className="text-xs text-muted-foreground mt-1">{diffError}</p>
                </div>
              )
              : diffIsText
              ? <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, lineHeight: 1.8, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: 'var(--ink-2)' }}>{diff}</div>
              : <ColoredDiff raw={diff ?? ''} />
          ) : hasTurns ? (
            /* Turn timeline */
            <div>
              {/* Legacy output before first turn */}
              {legacyLines.length > 0 && (
                <div style={{ marginBottom: 24, paddingBottom: 20, borderBottom: '1px solid var(--rule)' }}>
                  <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Initial run</p>
                  <OutputLines lines={legacyLines} done={done && turns.length === 0} exitCode={exitCode} elapsedSecs={elapsedSecs} isRunning={isRunning && turns.length === 0} tokens={displayTokens} />
                </div>
              )}
              {/* Turn cards */}
              {turns.map((turn, i) => (
                <TurnCard
                  key={turn.id}
                  turn={turn}
                  isActive={i === turns.length - 1}
                  elapsedSecs={i === turns.length - 1 ? elapsedSecs : 0}
                />
              ))}
            </div>
          ) : (
            /* Legacy flat output */
            <div>
              <OutputLines lines={legacyLines} done={done} exitCode={exitCode} elapsedSecs={elapsedSecs} isRunning={isRunning} tokens={displayTokens} />
              <div ref={legacyBottomRef} />
            </div>
          )}
        </div>
      </div>

      {/* Merged / Completed banner */}
      {isMerged && (
        <div className="border-t border-[color-mix(in_srgb,var(--green)_20%,transparent)] bg-[color-mix(in_srgb,var(--green)_5%,transparent)] px-6 py-3.5 flex items-center gap-3 flex-wrap">
          <span className="text-sm font-semibold text-[var(--green)]">{isWorkspace ? 'Completed ✓' : 'Accepted ✓'}</span>
          <div className="flex-1" />
          {!isWorkspace && project?.remoteUrl && !pushed && <Button size="sm" onClick={() => push.mutate()} disabled={push.isPending}>{push.isPending ? '…' : 'Push to remote'}</Button>}
          {!isWorkspace && project?.remoteUrl && pushed && <span className="text-sm font-semibold text-primary">Pushed ✓</span>}
          {!isWorkspace && project?.localPath && <CopyCommand text={`git -C ${project.localPath} pull ${project.repoPath} main`} />}
          {push.isError && <span className="text-sm text-destructive">{push.error?.message}</span>}
          <Button size="sm" variant="outline" onClick={() => navigate(`/projects/${project?.id ?? ''}`)}>← Board</Button>
        </div>
      )}

      {/* Continue bar — shown when session is done and has a runner session ID */}
      {canContinue && (
        <div className="border-t border-border bg-background px-6 py-4">
          <p className="text-sm font-semibold text-foreground mb-3">Add a follow-up</p>
          <div className="flex gap-3 items-end">
            <Textarea
              value={continuePrompt}
              onChange={e => setContinue(e.target.value)}
              placeholder="Continue where it left off, fix something, or add to the work…"
              rows={2}
              className="flex-1"
              autoFocus
              onKeyDown={e => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && continuePrompt.trim()) {
                  addTurn.mutate(continuePrompt.trim())
                }
              }}
            />
            <Button
              onClick={() => { if (!continuePrompt.trim()) return; addTurn.mutate(continuePrompt.trim()) }}
              disabled={!continuePrompt.trim() || addTurn.isPending}
            >
              {addTurn.isPending ? '…' : 'Send'}
            </Button>
          </div>
          {addTurn.isError && <p className="text-xs text-destructive mt-2">{addTurn.error?.message}</p>}
        </div>
      )}

      {/* Idle prompt */}
      {session?.status === 'idle' && !session.workTaskId && (
        <div className="border-t border-border bg-background px-6 py-4">
          <p className="text-sm font-semibold text-foreground mb-3">What should this agent do?</p>
          <div className="flex gap-3 items-end">
            <Textarea value={idlePrompt} onChange={e => setIdlePrompt(e.target.value)} placeholder="Describe the task…" rows={3} className="flex-1" autoFocus />
            <Button onClick={() => { if (!idlePrompt.trim()) return; retry.mutate(idlePrompt.trim()); setIdlePrompt('') }} disabled={!idlePrompt.trim() || retry.isPending}>
              {retry.isPending ? '…' : 'Run'}
            </Button>
          </div>
        </div>
      )}

      {/* Waiting for clarification panel */}
      {isWaiting && !clarification && (
        <div className="border-t border-[color-mix(in_srgb,var(--amber)_30%,transparent)] bg-[color-mix(in_srgb,var(--amber)_6%,transparent)] px-6 py-3.5 flex items-center gap-3">
          <span className="dot amber pulse shrink-0" />
          <span className="text-sm font-medium text-[var(--amber)]">Agent is waiting for your input…</span>
        </div>
      )}

      {/* Error panel */}
      {isError && (
        <div className="border-t border-destructive/20 bg-destructive/5 px-6 py-4">
          <p className="text-sm font-semibold text-destructive mb-3">Session ended with an error</p>
          <div className="flex gap-3 items-end">
            <Textarea value={hint} onChange={e => setHint(e.target.value)} placeholder="Optional: add context before retrying…" rows={2} className="flex-1" />
            <Button onClick={() => retry.mutate(hint.trim() ? `Continue where you left off.\n\nAdditional context: ${hint.trim()}` : undefined)} disabled={retry.isPending}>
              {retry.isPending ? '…' : 'Retry'}
            </Button>
          </div>
        </div>
      )}

      {/* Clarification dialog — blocks interaction until user responds */}
      <Dialog open={!!clarification} onOpenChange={() => {}}>
        <DialogContent
          hideClose
          onEscapeKeyDown={e => e.preventDefault()}
          onPointerDownOutside={e => e.preventDefault()}
          onInteractOutside={e => e.preventDefault()}
        >
          <div className="flex items-center gap-2.5 mb-5">
            <span className="dot amber pulse shrink-0" style={{ width: 7, height: 7 }} />
            <span className="text-[11px] font-semibold tracking-wider uppercase" style={{ color: 'var(--amber)' }}>
              Needs your input
            </span>
          </div>
          <DialogPrimitive.Title className="text-[15px] font-semibold text-foreground leading-snug mb-5">
            {clarification?.question}
          </DialogPrimitive.Title>

          {clarification?.options ? (
            <div className="flex flex-col gap-2" role="list" aria-label="Options">
              {clarification.options.map((opt, i) => (
                <Button
                  key={opt}
                  variant="outline"
                  className="justify-start text-left h-auto py-2.5 gap-3"
                  role="listitem"
                  onClick={() => submitClarification(clarification.id, opt)}
                >
                  <span className="text-[10px] font-mono text-muted-foreground tabular-nums w-3 shrink-0" aria-hidden="true">{i + 1}</span>
                  <span>{opt}</span>
                </Button>
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <Textarea
                value={clarificationInput}
                onChange={e => setClarInput(e.target.value)}
                placeholder="Type your answer…"
                rows={3}
                autoFocus
                onKeyDown={e => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && clarificationInput.trim()) {
                    submitClarification(clarification!.id, clarificationInput)
                  }
                }}
              />
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">⌘↵ to send</span>
                <Button
                  onClick={() => submitClarification(clarification!.id, clarificationInput)}
                  disabled={!clarificationInput.trim()}
                >
                  Send
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
