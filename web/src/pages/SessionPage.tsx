import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { sessions, employees, projects, tasks } from '../api/client'
import type { Employee } from '../api/client'
import { Textarea } from '@/components/ui/textarea'
import { AgentAvatar } from '@/components/AgentAvatar'
import { fmtSecs, useElapsed } from '@/lib/time'
import { ArrowLeft } from 'lucide-react'

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

function StatusStat({ status }: { status: string }) {
  if (status === 'running') return <span className="stat green"><span className="dot green pulse" />Running</span>
  if (status === 'done')    return <span className="stat green"><span className="dot green" />Done</span>
  if (status === 'merged')  return <span className="stat indigo"><span className="dot indigo" />Merged</span>
  if (status === 'error')   return <span className="stat red"><span className="dot red" />Error</span>
  return <span className="stat" style={{ color: 'var(--muted)' }}>{status}</span>
}

function ReviewerPickerButton({ agentList, onPick }: { agentList: Employee[]; onPick: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const down = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', down)
    return () => document.removeEventListener('mousedown', down)
  }, [open])
  if (agentList.length === 0) return null
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className="btn sm" onClick={() => setOpen(o => !o)}>Request Review</button>
      {open && (
        <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 4px)', zIndex: 30, background: 'var(--bg)', border: '1px solid var(--rule)', borderRadius: 10, overflow: 'hidden', minWidth: 160, boxShadow: 'var(--shadow-dialog)' }}>
          <p style={{ fontSize: 11, color: 'var(--muted)', padding: '8px 14px', borderBottom: '1px solid var(--rule-soft)', margin: 0 }}>Pick reviewer</p>
          {agentList.map(a => (
            <button key={a.id} onClick={() => { onPick(a.id); setOpen(false) }}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px', fontSize: 13, color: 'var(--ink)', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}
              onMouseOver={e => (e.currentTarget.style.background = 'var(--panel)')}
              onMouseOut={e => (e.currentTarget.style.background = 'none')}
            >
              <AgentAvatar agent={a} size={20} />{a.name}
            </button>
          ))}
        </div>
      )}
    </div>
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
        // Skip h1 — the tab label already says "Journal"
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

function shortBranchName(branch?: string) {
  if (!branch) return ''
  const trimmed = branch.replace(/^agent\//, '')
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)) {
    return `agent/${trimmed.slice(0, 8)}`
  }
  return branch.length > 34 ? `${branch.slice(0, 31)}...` : branch
}

export default function SessionPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [lines, setLines]           = useState<Line[]>([])
  const [done, setDone]             = useState(false)
  const [activeTab, setActiveTab]   = useState<'output' | 'diff' | 'journal'>('output')
  const [diff, setDiff]             = useState<string | null>(null)
  const [diffLoading, setDiffLoad]  = useState(false)
  const [diffError, setDiffError]   = useState<string | null>(null)
  const [hint, setHint]             = useState('')
  const [idlePrompt, setIdlePrompt] = useState('')
  const [pushed, setPushed]         = useState(false)
  const [exitCode, setExitCode]     = useState<string | null>(null)
  const bottomRef   = useRef<HTMLDivElement>(null)
  const bufferRef   = useRef('')
  const notifiedRef = useRef(false)

  const { data: session, refetch: refetchSession } = useQuery({ queryKey: ['session', id], queryFn: () => sessions.get(id!), enabled: !!id, refetchInterval: 3000 })
  const { data: agentList   = [] } = useQuery({ queryKey: ['employees'], queryFn: () => employees.list() })
  const { data: projectList = [] } = useQuery({ queryKey: ['projects'],  queryFn: () => projects.list() })
  const { data: taskList    = [] } = useQuery({ queryKey: ['tasks', session?.projectId], queryFn: () => tasks.list({ projectId: session!.projectId }), enabled: !!session?.projectId })

  const agent   = agentList.find(a => a.id === session?.agentId)
  const project = projectList.find(p => p.id === session?.projectId)
  const task    = taskList.find(t => t.id === session?.workTaskId)

  const isRunning = session?.status === 'running'
  const isDone    = session?.status === 'done'
  const isError   = session?.status === 'error'
  const isMerged  = session?.status === 'merged'

  const elapsedSecs = useElapsed(task?.startedAt ?? session?.createdAt, isRunning)

  const merge         = useMutation({ mutationFn: () => sessions.merge(id!),   onSuccess: () => { qc.invalidateQueries({ queryKey: ['sessions'] }); refetchSession() } })
  const push          = useMutation({ mutationFn: () => projects.push(project!.id), onSuccess: () => setPushed(true) })
  const stop          = useMutation({ mutationFn: () => sessions.stop(id!),   onSuccess: () => refetchSession() })
  const discard       = useMutation({ mutationFn: () => sessions.delete(id!), onSuccess: () => { qc.invalidateQueries({ queryKey: ['sessions'] }); navigate(session?.projectId ? `/projects/${session.projectId}` : -1 as never) } })
  const requestReview = useMutation({ mutationFn: (agentId: string) => sessions.requestReview(id!, agentId), onSuccess: () => refetchSession() })
  const retry         = useMutation({
    mutationFn: (prompt?: string) => sessions.run(id!, prompt),
    onSuccess: () => { setLines([]); setDone(false); setExitCode(null); setDiff(null); setHint(''); bufferRef.current = ''; refetchSession() },
  })

  useEffect(() => { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission() }, [])
  useEffect(() => {
    if (!done || notifiedRef.current || !session) return
    notifiedRef.current = true
    if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
      new Notification(session.status === 'done' ? '✓ Done' : '✗ Error', { body: `${agent?.name ?? 'Agent'} · ${project?.name ?? ''}`, icon: '/favicon.svg' })
    }
  }, [done, session])

  useEffect(() => {
    if (!id) return
    let ws: WebSocket | null = null, dead = false, delay = 1000
    function connect() {
      if (dead) return
      const token = localStorage.getItem('token')
      if (!token) return
      const proto = location.protocol === 'https:' ? 'wss' : 'ws'
      ws = new WebSocket(`${proto}://${location.host}/ws?token=${token}`)
      ws.onopen = () => { delay = 1000; setLines([]); setDone(false); setExitCode(null); bufferRef.current = ''; ws!.send(JSON.stringify({ type: 'subscribe', sessionId: id })) }
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data)
          if (msg.type === 'done') { setDone(true); setExitCode(String(msg.data ?? '0')); refetchSession(); return }
          if (msg.type === 'stdout') processChunk(msg.data)
          if (msg.type === 'stderr') addLine(msg.data, 'stderr')
        } catch {}
      }
      ws.onclose = () => { if (!dead) { setTimeout(connect, delay); delay = Math.min(delay * 2, 30_000) } }
      ws.onerror = () => ws?.close()
    }
    connect()
    return () => { dead = true; ws?.close() }
  }, [id])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [lines])

  function addLine(text: string, kind: Line['kind']) {
    setLines(prev => { const next = [...prev, { text, kind }]; return next.length > MAX_LINES ? next.slice(next.length - MAX_LINES) : next })
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
          if (block.type === 'text' && block.text?.trim())  addLine(block.text.trim(), 'text')
          else if (block.type === 'tool_use')               addLine(formatToolCall(block.name, block.input ?? {}), 'tool')
        }
      } else if (obj.type === 'result' && obj.result?.trim()) {
        addLine(obj.result.trim(), 'text')
      }
    } catch { if (line) addLine(line, 'text') }
  }

  async function loadDiff() {
    if (!id || diffLoading) return
    if (diff !== null) { setActiveTab('diff'); return }
    setDiffLoad(true)
    setDiffError(null)
    setActiveTab('diff')
    try { const { diff: d } = await sessions.diff(id); setDiff(d) }
    catch (e) { setDiffError(e instanceof Error ? e.message : 'Could not load diff') }
    finally { setDiffLoad(false) }
  }

  const branchShort = shortBranchName(session?.branch)

  return (
    <div className="flex-1 flex flex-col bg-background" style={{ minHeight: 0 }}>

      {/* Header */}
      <div className="bg-background border-b border-border px-6 pt-5 pb-0">
        <button
          onClick={() => navigate(session?.projectId ? `/projects/${session.projectId}` : -1 as never)}
          className="proj-back mb-4"
        >
          <ArrowLeft size={13} />
          {project?.name ?? 'Back'}
        </button>

        <div className="flex items-start gap-3 mb-4 flex-wrap">
          <AgentAvatar agent={agent} size={34} running={isRunning} />
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-semibold tracking-tight text-foreground leading-snug">
              {task?.title ?? session?.branch ?? 'Session'}
            </h1>
            <div className="flex items-center gap-2.5 mt-1 flex-wrap">
              {agent && <span className="text-sm text-muted-foreground font-medium">{agent.name}</span>}
              {agent && session && <span className="text-muted-foreground/30">·</span>}
              {session && <StatusStat status={session.status} />}
              {isRunning && <span className="text-xs font-mono text-green-500 tabular-nums">{fmtSecs(elapsedSecs)}</span>}
              {branchShort && (
                <>
                  <span className="text-muted-foreground/30">·</span>
                  <span className="text-xs font-mono text-muted-foreground/60 truncate max-w-[200px]" title={session?.branch}>{branchShort}</span>
                </>
              )}
            </div>
          </div>

          <div className="flex gap-2 shrink-0 flex-wrap justify-end max-sm:basis-full max-sm:pl-[46px] max-sm:justify-start">
            {isRunning && <button className="btn sm" onClick={() => stop.mutate()} disabled={stop.isPending}>{stop.isPending ? '…' : 'Stop'}</button>}
            {(isDone || isError) && <button className="btn sm" onClick={loadDiff} disabled={diffLoading}>{diffLoading ? '…' : 'Diff'}</button>}
            {isDone && !session?.reviewVerdict && !isMerged && (
              <ReviewerPickerButton agentList={agentList.filter(a => a.id !== session?.agentId)} onPick={agentId => requestReview.mutate(agentId)} />
            )}
            {session?.reviewVerdict === 'pending' && <span className="chip" style={{ color: 'var(--muted)' }}>Reviewing…</span>}
            {session?.reviewVerdict === 'approved' && <span className="chip" style={{ color: 'var(--green)', background: 'color-mix(in srgb, var(--green) 10%, transparent)' }}>Approved ✓</span>}
            {session?.reviewVerdict === 'changes_requested' && <span className="chip" style={{ color: 'var(--amber)', background: 'color-mix(in srgb, var(--amber) 10%, transparent)' }}>Changes Requested</span>}
            {isDone && !isMerged && !session?.parentSessionId && <button className="btn sm primary" onClick={() => merge.mutate()} disabled={merge.isPending}>{merge.isPending ? '…' : 'Merge ✓'}</button>}
            {!isMerged && (
              <button className="btn sm ghost" style={{ color: 'var(--muted)' }}
                onClick={() => discard.mutate()} disabled={discard.isPending}
                onMouseOver={e => (e.currentTarget.style.color = 'var(--red)')}
                onMouseOut={e => (e.currentTarget.style.color = 'var(--muted)')}
              >{discard.isPending ? '…' : 'Discard'}</button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1">
          {(['output', 'diff'] as const).map(t => (
            <button key={t}
              onClick={() => t === 'diff' ? loadDiff() : setActiveTab('output')}
              className={`proj-tab ${activeTab === t ? 'active' : ''}`}
              style={{ textTransform: 'capitalize' }}
            >
              {t}
              {t === 'diff' && diff && (
                <span className="ml-1.5 text-[10px] font-mono text-primary bg-primary/10 rounded px-1 py-0.5">ready</span>
              )}
            </button>
          ))}
          {session?.journal && (
            <button
              className={`proj-tab ${activeTab === 'journal' ? 'active' : ''}`}
              onClick={() => setActiveTab('journal')}
              style={{ textTransform: 'capitalize' }}
            >
              {session.parentSessionId ? 'review' : 'journal'}
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto bg-muted/30" style={{ minHeight: 0 }}>
        <div style={{ maxWidth: 780, margin: '0 auto', padding: '24px 28px' }}>
          {activeTab === 'journal' && session?.journal ? (
            <JournalView text={session.journal} />
          ) : activeTab === 'diff' ? (
            diffLoading
              ? <p className="text-xs font-mono text-muted-foreground">loading diff…</p>
              : diffError
              ? <p className="text-sm text-muted-foreground/60">{diffError}</p>
              : <ColoredDiff raw={diff ?? ''} />
          ) : (
            <div>
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
                  color: line.kind === 'tool' ? 'var(--ember)' : line.kind === 'stderr' ? 'var(--muted)' : 'var(--ink-2)',
                }}>
                  {line.text}
                </div>
              ))}
              {isRunning && !done && <span className="cursor-blink" style={{ marginTop: 4, display: 'inline-block' }} />}
              {done && (
                <p className="text-[11px] font-mono text-muted-foreground/40 mt-5 pt-3 border-t border-border/50">
                  process exited {exitCode ?? (isError ? '1' : '0')} · {task?.startedAt && task.completedAt
                    ? `${Math.round((new Date(task.completedAt).getTime() - new Date(task.startedAt).getTime()) / 1000)}s`
                    : fmtSecs(elapsedSecs)}
                </p>
              )}
              <div ref={bottomRef} />
            </div>
          )}
        </div>
      </div>

      {/* Merged banner */}
      {isMerged && (
        <div className="border-t border-green-500/20 bg-green-500/5 px-6 py-3.5 flex items-center gap-3 flex-wrap">
          <span className="text-sm font-semibold text-green-500">Merged ✓</span>
          <div className="flex-1" />
          {project?.remoteUrl && !pushed && <button className="btn sm primary" onClick={() => push.mutate()} disabled={push.isPending}>{push.isPending ? '…' : 'Push to remote'}</button>}
          {project?.remoteUrl && pushed && <span className="text-sm font-semibold text-primary">Pushed ✓</span>}
          {project?.localPath && <CopyCommand text={`git -C ${project.localPath} pull ${project.repoPath} main`} />}
          {push.isError && <span className="text-sm text-destructive">{push.error?.message}</span>}
          <button className="btn sm" onClick={() => navigate(`/projects/${project?.id ?? ''}`)}>← Board</button>
        </div>
      )}

      {/* Idle prompt */}
      {session?.status === 'idle' && !session.workTaskId && (
        <div className="border-t border-border bg-background px-6 py-4">
          <p className="text-sm font-semibold text-foreground mb-3">What should this agent do?</p>
          <div className="flex gap-3 items-end">
            <Textarea value={idlePrompt} onChange={e => setIdlePrompt(e.target.value)} placeholder="Describe the task…" rows={3} className="flex-1" autoFocus />
            <button className="btn primary" onClick={() => { if (!idlePrompt.trim()) return; retry.mutate(idlePrompt.trim()); setIdlePrompt('') }} disabled={!idlePrompt.trim() || retry.isPending}>
              {retry.isPending ? '…' : 'Run'}
            </button>
          </div>
        </div>
      )}

      {/* Error panel */}
      {isError && (
        <div className="border-t border-destructive/20 bg-destructive/5 px-6 py-4">
          <p className="text-sm font-semibold text-destructive mb-3">Session ended with an error</p>
          <div className="flex gap-3 items-end">
            <Textarea value={hint} onChange={e => setHint(e.target.value)} placeholder="Optional: add context before retrying…" rows={2} className="flex-1" />
            <button className="btn primary" onClick={() => retry.mutate(hint.trim() ? `Continue where you left off.\n\nAdditional context: ${hint.trim()}` : undefined)} disabled={retry.isPending}>
              {retry.isPending ? '…' : 'Retry'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
