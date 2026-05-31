import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { sessions, employees, projects, tasks } from '../api/client'
import type { Employee } from '../api/client'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { AgentAvatar } from '@/components/AgentAvatar'
import { cn } from '@/lib/utils'
import { fmtSecs, useElapsed } from '@/lib/time'
import { ArrowLeft } from 'lucide-react'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MAX_LINES = 2000

interface Line { text: string; kind: 'text' | 'tool' | 'stderr' }

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

// ---------------------------------------------------------------------------
// Colorized diff
// ---------------------------------------------------------------------------

function ColoredDiff({ raw }: { raw: string }) {
  if (!raw.trim()) return <p className="font-mono text-xs text-muted-foreground">No changes.</p>
  return (
    <div className="font-mono text-xs leading-relaxed">
      {raw.split('\n').map((line, i) => {
        if (line.startsWith('diff --git') || line.startsWith('index ') || line.startsWith('new file') || line.startsWith('deleted file'))
          return <div key={i} className="text-muted-foreground/60 py-px">{line || ' '}</div>
        if (line.startsWith('--- ') || line.startsWith('+++ '))
          return <div key={i} className="text-muted-foreground py-px">{line}</div>
        if (line.startsWith('@@'))
          return <div key={i} className="text-primary/80 bg-primary/6 px-2 -mx-4 py-px">{line}</div>
        if (line.startsWith('+'))
          return <div key={i} className="text-green-600 dark:text-green-400 bg-green-500/10 px-2 -mx-4 py-px whitespace-pre">{line}</div>
        if (line.startsWith('-'))
          return <div key={i} className="text-red-500 dark:text-red-400 bg-red-500/10 px-2 -mx-4 py-px whitespace-pre">{line}</div>
        return <div key={i} className="text-foreground/70 py-px whitespace-pre">{line || ' '}</div>
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: string }) {
  if (status === 'running') return (
    <Badge variant="success" className="gap-1.5 text-[11px]">
      <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-[pulse_1.6s_ease-out_infinite]" />
      Running
    </Badge>
  )
  if (status === 'idle')   return <Badge variant="outline" className="text-[11px]">Idle</Badge>
  if (status === 'done')   return <Badge variant="success" className="text-[11px]">Done</Badge>
  if (status === 'merged') return <Badge variant="outline" className="text-[11px] text-primary border-primary/30">Merged</Badge>
  if (status === 'error')  return <Badge variant="destructive" className="text-[11px]">Error</Badge>
  return <Badge variant="outline" className="text-[11px]">{status}</Badge>
}

// ---------------------------------------------------------------------------
// Copy command
// ---------------------------------------------------------------------------

function CopyCommand({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button onClick={() => { navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) }) }}
      className="font-mono text-xs text-primary bg-primary/10 border border-primary/25 rounded-lg px-3 py-1.5 cursor-pointer hover:bg-primary/15 transition-colors max-w-[260px] truncate">
      {copied ? '✓ Copied' : 'Copy pull command'}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Reviewer picker
// ---------------------------------------------------------------------------

function ReviewerPicker({ agentList, onPick }: { agentList: Employee[]; onPick: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    function down(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', down)
    return () => document.removeEventListener('mousedown', down)
  }, [open])
  if (agentList.length === 0) return null
  return (
    <div ref={ref} className="relative">
      <Button variant="outline" size="sm" onClick={() => setOpen(o => !o)}>Request Review</Button>
      {open && (
        <div className="absolute right-0 top-[calc(100%+4px)] z-30 bg-card border border-border rounded-xl shadow-xl overflow-hidden min-w-[160px]">
          <p className="text-[10px] text-muted-foreground px-3 py-2 border-b border-border/60">Pick reviewer</p>
          {agentList.map(a => (
            <button key={a.id} onClick={() => { onPick(a.id); setOpen(false) }}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-foreground hover:bg-muted/60 transition-colors cursor-pointer bg-transparent border-none text-left">
              <AgentAvatar agent={a} size={16} />
              {a.name}
            </button>
          ))}
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

  const [lines, setLines]       = useState<Line[]>([])
  const [done, setDone]         = useState(false)
  const [activeTab, setActiveTab] = useState<'output' | 'diff' | 'journal'>('output')
  const [diff, setDiff]         = useState<string | null>(null)
  const [diffLoading, setDiffLoading] = useState(false)
  const [hint, setHint]         = useState('')
  const [idlePrompt, setIdlePrompt] = useState('')
  const [pushed, setPushed]     = useState(false)
  const bottomRef   = useRef<HTMLDivElement>(null)
  const bufferRef   = useRef('')
  const notifiedRef = useRef(false)

  const { data: session, refetch: refetchSession } = useQuery({
    queryKey: ['session', id],
    queryFn: () => sessions.get(id!),
    enabled: !!id,
    refetchInterval: 3000,
  })
  const { data: agentList   = [] } = useQuery({ queryKey: ['employees'], queryFn: () => employees.list() })
  const { data: projectList = [] } = useQuery({ queryKey: ['projects'], queryFn: () => projects.list() })
  const { data: taskList    = [] } = useQuery({
    queryKey: ['tasks', session?.projectId],
    queryFn: () => tasks.list({ projectId: session!.projectId }),
    enabled: !!session?.projectId,
  })

  const agent   = agentList.find(a => a.id === session?.agentId)
  const project = projectList.find(p => p.id === session?.projectId)
  const task    = taskList.find(t => t.id === session?.workTaskId)

  const isRunning = session?.status === 'running'
  const isDone    = session?.status === 'done'
  const isError   = session?.status === 'error'
  const isMerged  = session?.status === 'merged'

  // Use task startedAt as the clock origin (excludes worktree creation time)
  const elapsedSecs = useElapsed(task?.startedAt ?? session?.createdAt, isRunning)

  const merge         = useMutation({ mutationFn: () => sessions.merge(id!),   onSuccess: () => { qc.invalidateQueries({ queryKey: ['sessions'] }); refetchSession() } })
  const push          = useMutation({ mutationFn: () => projects.push(project!.id), onSuccess: () => setPushed(true) })
  const stop          = useMutation({ mutationFn: () => sessions.stop(id!),   onSuccess: () => refetchSession() })
  const discard       = useMutation({ mutationFn: () => sessions.delete(id!),   onSuccess: () => { qc.invalidateQueries({ queryKey: ['sessions'] }); navigate(session?.projectId ? `/projects/${session.projectId}` : -1 as never) } })
  const requestReview = useMutation({ mutationFn: (agentId: string) => sessions.requestReview(id!, agentId), onSuccess: () => refetchSession() })
  const retry         = useMutation({
    mutationFn: (prompt?: string) => sessions.run(id!, prompt),
    onSuccess: () => { setLines([]); setDone(false); setDiff(null); setHint(''); bufferRef.current = ''; refetchSession() },
  })

  // Request notification permission once
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission()
  }, [])

  // Notify when session completes and tab is hidden
  useEffect(() => {
    if (!done || notifiedRef.current || !session) return
    notifiedRef.current = true
    if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
      new Notification(session.status === 'done' ? '✓ Done' : '✗ Error', {
        body: `${agent?.name ?? 'Agent'} · ${project?.name ?? ''}`,
        icon: '/favicon.svg',
      })
    }
  }, [done, session])

  // WebSocket with exponential-backoff reconnect
  useEffect(() => {
    if (!id) return
    let ws: WebSocket | null = null
    let dead = false
    let retryDelay = 1000

    function connect() {
      if (dead) return
      const token = localStorage.getItem('token')
      if (!token) return
      const proto = location.protocol === 'https:' ? 'wss' : 'ws'
      ws = new WebSocket(`${proto}://${location.host}/ws?token=${token}`)
      ws.onopen = () => {
        retryDelay = 1000
        setLines([]); setDone(false); bufferRef.current = ''
        ws!.send(JSON.stringify({ type: 'subscribe', sessionId: id }))
      }
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data)
          if (msg.type === 'done') { setDone(true); refetchSession(); return }
          if (msg.type === 'stdout') processChunk(msg.data)
          if (msg.type === 'stderr') addLine(msg.data, 'stderr')
        } catch {}
      }
      ws.onclose = () => {
        if (!dead) { setTimeout(connect, retryDelay); retryDelay = Math.min(retryDelay * 2, 30_000) }
      }
      ws.onerror = () => ws?.close()
    }
    connect()
    return () => { dead = true; ws?.close() }
  }, [id])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [lines])

  function addLine(text: string, kind: Line['kind']) {
    setLines(prev => {
      const next = [...prev, { text, kind }]
      return next.length > MAX_LINES ? next.slice(next.length - MAX_LINES) : next
    })
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
          if (block.type === 'text' && block.text?.trim())       addLine(block.text.trim(), 'text')
          else if (block.type === 'tool_use')                    addLine(formatToolCall(block.name, block.input ?? {}), 'tool')
        }
      } else if (obj.type === 'result' && obj.result?.trim()) {
        addLine(obj.result.trim(), 'text')
      }
    } catch { if (line) addLine(line, 'text') }
  }

  async function loadDiff() {
    if (!id || diffLoading) return
    if (diff !== null) { setActiveTab('diff'); return }
    setDiffLoading(true)
    try {
      const { diff: d } = await sessions.diff(id)
      setDiff(d)
      setActiveTab('diff')
    } finally { setDiffLoading(false) }
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-background">

      {/* ── Top bar ── */}
      <div className="h-14 shrink-0 flex items-center gap-3 px-4 border-b border-border/60 bg-card">

        {/* Back */}
        <button
          onClick={() => navigate(session?.projectId ? `/projects/${session.projectId}` : -1 as never)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer bg-transparent border-none font-medium shrink-0"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {project?.name ?? 'Back'}
        </button>

        <span className="text-border/60 select-none text-xs">›</span>

        {/* Task title — primary identity */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">
            {task?.title ?? session?.branch ?? 'Session'}
          </p>
          {agent && (
            <p className="text-[11px] text-muted-foreground truncate leading-none mt-0.5">
              {agent.name}
              {session?.id && <span className="font-mono opacity-50 ml-1.5">#{session.id.slice(0, 7)}</span>}
            </p>
          )}
        </div>

        {/* Status + elapsed + actions */}
        <div className="flex items-center gap-2 shrink-0">
          {session && <StatusBadge status={session.status} />}
          {isRunning && (
            <span className="font-mono text-xs text-muted-foreground tabular-nums">
              {fmtSecs(elapsedSecs)}
            </span>
          )}
          {isRunning && (
            <Button variant="outline" size="sm" onClick={() => stop.mutate()} disabled={stop.isPending}>
              {stop.isPending ? '…' : 'Stop'}
            </Button>
          )}
          {(isDone || isError) && (
            <Button variant="outline" size="sm" onClick={loadDiff} disabled={diffLoading}>
              {diffLoading ? '…' : 'Diff'}
            </Button>
          )}
          {isDone && !session?.reviewVerdict && !isMerged && (
            <ReviewerPicker
              agentList={agentList.filter(a => a.id !== session?.agentId)}
              onPick={agentId => requestReview.mutate(agentId)}
            />
          )}
          {session?.reviewVerdict === 'pending' && (
            <Badge variant="outline" className="text-[11px] text-muted-foreground">Reviewing…</Badge>
          )}
          {session?.reviewVerdict === 'approved' && (
            <Badge variant="success" className="text-[11px]">Approved ✓</Badge>
          )}
          {session?.reviewVerdict === 'changes_requested' && (
            <Badge variant="warning" className="text-[11px]">Changes Requested</Badge>
          )}
          {isDone && !isMerged && (
            <Button size="sm" onClick={() => merge.mutate()} disabled={merge.isPending}>
              {merge.isPending ? '…' : 'Merge ✓'}
            </Button>
          )}
          {/* Discard separated with a visible gap */}
          <div className="w-px h-5 bg-border/60 mx-1" />
          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive hover:bg-destructive/8"
            onClick={() => discard.mutate()} disabled={discard.isPending || isMerged}>
            {discard.isPending ? '…' : 'Discard'}
          </Button>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="h-9 shrink-0 flex items-end gap-0 border-b border-border/60 px-4 bg-card">
        {(['output', 'diff'] as const).map(t => (
          <button key={t} onClick={() => t === 'diff' ? loadDiff() : setActiveTab('output')}
            className={cn(
              'relative h-full px-4 text-xs font-medium capitalize transition-colors cursor-pointer bg-transparent border-none',
              'after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:rounded-t',
              activeTab === t
                ? 'text-foreground after:bg-primary'
                : 'text-muted-foreground hover:text-foreground after:bg-transparent'
            )}>
            {t}
            {t === 'diff' && diff && (
              <span className="ml-1.5 font-mono text-[10px] text-primary bg-primary/10 rounded-full px-1.5 py-px">ready</span>
            )}
          </button>
        ))}
        {session?.journal && (
          <button onClick={() => setActiveTab('journal')}
            className={cn(
              'relative h-full px-4 text-xs font-medium transition-colors cursor-pointer bg-transparent border-none',
              'after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:rounded-t',
              activeTab === 'journal'
                ? 'text-foreground after:bg-primary'
                : 'text-muted-foreground hover:text-foreground after:bg-transparent'
            )}>
            {session.parentSessionId ? 'review' : 'journal'}
          </button>
        )}
      </div>

      {/* ── Content ── */}
      <div className="flex-1 min-h-0 overflow-y-auto bg-muted/20">
        {activeTab === 'journal' && session?.journal ? (
          <div className="px-5 py-4">
            <pre className="font-mono text-xs leading-relaxed whitespace-pre-wrap text-foreground/80">{session.journal}</pre>
          </div>
        ) : activeTab === 'diff' ? (
          <div className="px-5 py-4">
            {diffLoading
              ? <p className="font-mono text-xs text-muted-foreground/60">loading diff…</p>
              : <ColoredDiff raw={diff ?? ''} />}
          </div>
        ) : (
          <div className="flex flex-col px-5 py-4">
            {lines.length === MAX_LINES && (
              <p className="font-mono text-[11px] text-muted-foreground/40 mb-3 pb-2 border-b border-border/30">
                ↑ earlier output truncated — showing last {MAX_LINES} lines
              </p>
            )}
            {lines.length === 0 && !isRunning && !done && (
              <p className="font-mono text-xs text-muted-foreground/60">waiting for output…</p>
            )}
            {lines.map((line, i) => (
              <div key={i} className={cn(
                'font-mono text-xs leading-relaxed whitespace-pre-wrap break-words',
                line.kind === 'tool'   && 'text-primary/90',
                line.kind === 'stderr' && 'text-muted-foreground/50',
                line.kind === 'text'   && 'text-foreground/80',
              )}>
                {line.text}
              </div>
            ))}
            {isRunning && !done && (
              <span className="inline-block w-[7px] h-[13px] bg-green-500 mt-0.5 animate-[blink_1s_steps(1)_infinite]" />
            )}
            {done && (
              <p className="font-mono text-[11px] text-muted-foreground/40 mt-4 pt-3 border-t border-border/30">
                process exited 0 · {task?.startedAt && task.completedAt
                  ? `${Math.round((new Date(task.completedAt).getTime() - new Date(task.startedAt).getTime()) / 1000)}s`
                  : fmtSecs(elapsedSecs)}
              </p>
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* ── Merged banner ── */}
      {isMerged && (
        <div className="shrink-0 border-t border-green-500/20 bg-green-500/5 px-5 py-3.5 flex items-center gap-3 flex-wrap">
          <span className="text-sm font-semibold text-green-600 dark:text-green-400">Merged ✓</span>
          <div className="flex-1" />
          {project?.remoteUrl && !pushed && (
            <Button size="sm" onClick={() => push.mutate()} disabled={push.isPending}>
              {push.isPending ? '…' : 'Push to remote'}
            </Button>
          )}
          {project?.remoteUrl && pushed && <span className="text-sm font-semibold text-primary">Pushed ✓</span>}
          {project?.localPath && <CopyCommand text={`git -C ${project.localPath} pull ${project.repoPath} main`} />}
          {push.isError && <span className="text-sm text-destructive">{push.error?.message}</span>}
          <Button variant="outline" size="sm" onClick={() => navigate(`/projects/${project?.id ?? ''}`)}>
            ← Board
          </Button>
        </div>
      )}

      {/* ── Idle prompt panel — manually created sessions with no task ── */}
      {session?.status === 'idle' && !session.workTaskId && (
        <div className="shrink-0 border-t border-border/60 bg-card px-5 py-4">
          <p className="text-xs font-semibold text-foreground mb-3">What should this agent do?</p>
          <div className="flex gap-3 items-end">
            <Textarea
              value={idlePrompt}
              onChange={e => setIdlePrompt(e.target.value)}
              placeholder="Describe the task…"
              rows={3}
              className="flex-1 text-sm"
              autoFocus
            />
            <Button
              onClick={() => {
                if (!idlePrompt.trim()) return
                retry.mutate(idlePrompt.trim())
                setIdlePrompt('')
              }}
              disabled={!idlePrompt.trim() || retry.isPending}
            >
              {retry.isPending ? '…' : 'Run'}
            </Button>
          </div>
        </div>
      )}

      {/* ── Error panel ── */}
      {isError && (
        <div className="shrink-0 border-t border-destructive/20 bg-destructive/5 px-5 py-4">
          <p className="text-xs font-semibold text-destructive mb-3">Session ended with an error</p>
          <div className="flex gap-3 items-end">
            <Textarea
              value={hint}
              onChange={e => setHint(e.target.value)}
              placeholder="Optional: add context or guidance before retrying…"
              rows={2}
              className="flex-1 text-sm"
            />
            <Button
              onClick={() => retry.mutate(hint.trim() ? `Continue where you left off.\n\nAdditional context: ${hint.trim()}` : undefined)}
              disabled={retry.isPending}
            >
              {retry.isPending ? '…' : 'Retry'}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
