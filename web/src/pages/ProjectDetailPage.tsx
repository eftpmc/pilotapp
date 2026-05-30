import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { tasks, agents, sessions, projects } from '../api/client'
import type { Task, Agent, Session } from '../api/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { EmptyState } from '@/components/EmptyState'
import { CardSkeleton } from '@/components/Skeleton'
import { AgentAvatar } from '@/components/AgentAvatar'
import { fmtSecs, useElapsed } from '@/lib/time'
import { cn } from '@/lib/utils'
import { ListTodo, Loader2, GitMerge, Upload } from 'lucide-react'

// ---------------------------------------------------------------------------
// Column header
// ---------------------------------------------------------------------------

const COL_DOT: Record<string, string> = {
  Queue: 'bg-muted-foreground/40',
  Working: 'bg-green-500',
  Review: 'bg-amber-400',
}

function ColHead({ title, count }: { title: string; count: number }) {
  return (
    <div className="flex items-center gap-2 pb-3 shrink-0">
      <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', COL_DOT[title] ?? 'bg-muted-foreground/40')} />
      <span className="text-xs font-semibold text-foreground">{title}</span>
      <span className="font-mono text-xs text-muted-foreground">{count}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Kanban cards
// ---------------------------------------------------------------------------

function AgentPicker({ agentList, onAssign }: { agentList: Agent[]; onAssign: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    function down(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', down)
    return () => document.removeEventListener('mousedown', down)
  }, [open])
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(o => !o)}
        className="text-[11px] font-semibold text-primary hover:text-primary/80 cursor-pointer bg-transparent border-none transition-colors">
        Assign ›
      </button>
      {open && (
        <div className="absolute right-0 top-[calc(100%+4px)] z-30 bg-card border border-border rounded-xl shadow-xl overflow-hidden min-w-[130px]">
          {agentList.map(a => (
            <button key={a.id} onClick={() => { onAssign(a.id); setOpen(false) }}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-foreground hover:bg-muted/60 transition-colors cursor-pointer bg-transparent border-none text-left">
              <AgentAvatar agent={a} size={18} />
              {a.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function QueueCard({ task, agentList, onAssign, onDelete, onMoveUp, onMoveDown, isFirst, isLast }: {
  task: Task; agentList: Agent[]; onAssign: (id: string) => void; onDelete: () => void
  onMoveUp: () => void; onMoveDown: () => void; isFirst: boolean; isLast: boolean
}) {
  return (
    <div className="bg-card rounded-xl p-3.5 flex flex-col gap-2.5 [box-shadow:var(--shadow-card)] border border-dashed border-border/50">
      <p className="text-sm font-medium text-foreground leading-snug">{task.title}</p>
      <div className="flex items-center gap-2">
        <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-[11px] font-mono truncate max-w-[120px]">{task.baseBranch || 'main'}</span>
        <div className="flex gap-0.5">
          <button onClick={onMoveUp} disabled={isFirst}
            className="text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-25 cursor-pointer disabled:cursor-default bg-transparent border-none px-0.5 leading-none">↑</button>
          <button onClick={onMoveDown} disabled={isLast}
            className="text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-25 cursor-pointer disabled:cursor-default bg-transparent border-none px-0.5 leading-none">↓</button>
        </div>
        <div className="flex-1" />
        {agentList.length > 0
          ? <AgentPicker agentList={agentList} onAssign={onAssign} />
          : <span className="text-[11px] text-muted-foreground">No agents</span>}
        <button onClick={onDelete}
          className="text-muted-foreground hover:text-destructive transition-colors cursor-pointer bg-transparent border-none text-base leading-none ml-0.5">×</button>
      </div>
    </div>
  )
}

function WorkingCard({ session, agent, task, onClick }: {
  session: Session; agent?: Agent; task?: Task; onClick: () => void
}) {
  const secs = useElapsed(session.createdAt, true)
  return (
    <button onClick={onClick}
      className="w-full text-left bg-card rounded-xl p-3.5 flex flex-col gap-2 cursor-pointer transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.99] [box-shadow:var(--shadow-card)] border border-green-500/20">
      <div className="flex items-center gap-2">
        <AgentAvatar agent={agent} size={26} />
        <span className="text-sm font-semibold text-foreground">{agent?.name ?? '—'}</span>
        <div className="flex-1" />
        <span className="font-mono text-[11px] text-green-500 tabular-nums">{fmtSecs(secs)}</span>
        <Badge variant="success" className="gap-1 shrink-0 text-[10px] px-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-[pulse_1.6s_ease-out_infinite]" />
          Working
        </Badge>
      </div>
      {task && <p className="text-[12.5px] text-muted-foreground leading-snug line-clamp-2">{task.title}</p>}
      <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-[11px] font-mono self-start truncate max-w-full">{session.branch}</span>
    </button>
  )
}

function ReviewCard({ session, agent, task, hasRemote, onMerge, onMergePush, onClick }: {
  session: Session; agent?: Agent; task?: Task
  hasRemote: boolean; onMerge: () => void; onMergePush: () => void; onClick: () => void
}) {
  const isError = session.status === 'error'
  return (
    <div onClick={onClick}
      className={cn(
        'bg-card rounded-xl p-3.5 flex flex-col gap-1.5 cursor-pointer transition-all duration-200 hover:-translate-y-0.5 [box-shadow:var(--shadow-card)]',
        isError ? 'border border-red-500/25' : 'border border-amber-400/20'
      )}>
      <div className="flex items-center gap-2">
        <AgentAvatar agent={agent} size={28} />
        <span className="text-sm font-semibold text-foreground">{agent?.name ?? '—'}</span>
        <div className="flex-1" />
        <Badge variant={isError ? 'destructive' : 'success'} className="shrink-0 text-[10px]">
          {isError ? 'Error' : 'Ready'}
        </Badge>
      </div>
      {task && <p className="text-sm text-muted-foreground leading-snug line-clamp-2 mt-1">{task.title}</p>}
      <div className="flex items-center gap-2 mt-1" onClick={e => e.stopPropagation()}>
        <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-[11px] font-mono truncate max-w-[120px]">{session.branch}</span>
        <div className="flex-1" />
        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={onClick}>Log</Button>
        {isError ? (
          <Button size="sm" className="h-7 px-2.5 text-xs" onClick={onClick}>Retry</Button>
        ) : hasRemote ? (
          <>
            <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs" onClick={onMerge}>Merge</Button>
            <Button size="sm" className="h-7 px-2.5 text-xs gap-1" onClick={onMergePush}>
              <Upload className="h-3 w-3" />Push
            </Button>
          </>
        ) : (
          <Button size="sm" className="h-7 px-2.5 text-xs" onClick={onMerge}>Merge ✓</Button>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

type MobileCol = 'Queue' | 'Working' | 'Review'

export default function ProjectDetailPage() {
  const { id: projectId } = useParams<{ id: string }>()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [showNew,   setShowNew]   = useState(false)
  const [mobileCol, setMobileCol] = useState<MobileCol>('Queue')

  const { data: taskList    = [], isLoading: tasksLoading   } = useQuery({ queryKey: ['tasks',    projectId], queryFn: () => tasks.list({ projectId }),    refetchInterval: 4000 })
  const { data: agentList   = []                             } = useQuery({ queryKey: ['agents'],              queryFn: () => agents.list() })
  const { data: sessionList = [], isLoading: sessionsLoading } = useQuery({ queryKey: ['sessions', projectId], queryFn: () => sessions.list({ projectId }), refetchInterval: 4000 })
  const { data: projectList = []                             } = useQuery({ queryKey: ['projects'],             queryFn: () => projects.list() })
  const isLoading = tasksLoading || sessionsLoading
  const project   = projectList.find(p => p.id === projectId)

  const runQueue    = useMutation({ mutationFn: () => tasks.runQueue(), onSuccess: () => { qc.invalidateQueries({ queryKey: ['tasks', projectId] }); qc.invalidateQueries({ queryKey: ['sessions', projectId] }) } })
  const deleteTask  = useMutation({ mutationFn: (id: string) => tasks.delete(id), onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks', projectId] }) })
  const assignTask  = useMutation({
    mutationFn: ({ taskId, agentId }: { taskId: string; agentId: string }) => tasks.assign(taskId, agentId),
    onSuccess: ({ session }) => { qc.invalidateQueries({ queryKey: ['tasks', projectId] }); qc.invalidateQueries({ queryKey: ['sessions', projectId] }); navigate(`/sessions/${session.id}`) },
  })
  const setPriority = useMutation({ mutationFn: ({ taskId, priority }: { taskId: string; priority: number }) => tasks.update(taskId, { priority }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks', projectId] }) })
  const mergeSession = useMutation({
    mutationFn: (id: string) => sessions.merge(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sessions', projectId] }),
  })
  const mergePushSession = useMutation({
    mutationFn: async (id: string) => { await sessions.merge(id); await projects.push(projectId!) },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sessions', projectId] }),
  })

  const codeSessions = sessionList.filter(s => !s.specId)
  const busyIds      = new Set(codeSessions.filter(s => s.status === 'running').map(s => s.agentId))
  const idleAgents   = agentList.filter(a => !busyIds.has(a.id))
  const queue        = taskList.filter(t => t.status === 'pending').sort((a, b) => {
    if ((b.priority ?? 0) !== (a.priority ?? 0)) return (b.priority ?? 0) - (a.priority ?? 0)
    return a.createdAt.localeCompare(b.createdAt)
  })
  const working      = codeSessions.filter(s => s.status === 'running' || s.status === 'idle')
  const review       = codeSessions.filter(s => s.status === 'done' || s.status === 'error')

  function agentFor(s: Session) { return agentList.find(a => a.id === s.agentId) }
  function taskFor(s: Session)  { return taskList.find(t => t.id === s.workTaskId) }

  // Real-time: one stable WS per project, subscribe new sessions as they appear
  const invalidateRef = useRef<() => void>(() => {})
  invalidateRef.current = () => {
    qc.invalidateQueries({ queryKey: ['sessions', projectId] })
    qc.invalidateQueries({ queryKey: ['tasks', projectId] })
  }
  const wsRef = useRef<WebSocket | null>(null)
  const subscribedRef = useRef(new Set<string>())
  const currentIdsRef = useRef<string[]>([])
  currentIdsRef.current = working.map(s => s.id)

  useEffect(() => {
    let dead = false
    let retryDelay = 2000

    function connect() {
      if (dead) return
      const token = localStorage.getItem('token')
      if (!token) return
      const proto = location.protocol === 'https:' ? 'wss' : 'ws'
      const ws = new WebSocket(`${proto}://${location.host}/ws?token=${token}`)
      wsRef.current = ws
      subscribedRef.current = new Set()

      ws.onopen = () => {
        retryDelay = 2000
        for (const id of currentIdsRef.current) {
          ws.send(JSON.stringify({ type: 'subscribe', sessionId: id }))
          subscribedRef.current.add(id)
        }
      }
      ws.onmessage = (e) => { try { if (JSON.parse(e.data).type === 'done') invalidateRef.current() } catch {} }
      ws.onclose = () => {
        if (!dead) { setTimeout(connect, retryDelay); retryDelay = Math.min(retryDelay * 2, 30_000) }
      }
      ws.onerror = () => ws.close()
    }

    connect()
    return () => { dead = true; wsRef.current?.close(); wsRef.current = null }
  }, [projectId]) // stable — only recreates on project change

  // Subscribe newly-appeared sessions without tearing down the connection
  const runningKey = working.map(s => s.id).join(',')
  useEffect(() => {
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    for (const id of currentIdsRef.current) {
      if (!subscribedRef.current.has(id)) {
        ws.send(JSON.stringify({ type: 'subscribe', sessionId: id }))
        subscribedRef.current.add(id)
      }
    }
  }, [runningKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard shortcuts: n = new task, r = run queue
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === 'n' && !showNew && agentList.length > 0) { e.preventDefault(); setShowNew(true) }
      if (e.key === 'r' && queue.length > 0 && idleAgents.length > 0 && !runQueue.isPending) { e.preventDefault(); runQueue.mutate() }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [showNew, queue.length, idleAgents.length, agentList.length, runQueue.isPending])

  const stats = [
    { label: 'Queue',   value: queue.length,     cls: 'text-foreground'       },
    { label: 'Working', value: working.length,    cls: 'text-green-500'        },
    { label: 'Review',  value: review.length,     cls: 'text-amber-400'        },
    { label: 'Free',    value: idleAgents.length, cls: 'text-muted-foreground' },
  ]

  const COLS: { title: MobileCol; count: number }[] = [
    { title: 'Queue',   count: queue.length   },
    { title: 'Working', count: working.length },
    { title: 'Review',  count: review.length  },
  ]

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-background">

      {/* Top bar */}
      <div className="h-14 shrink-0 flex items-center gap-4 px-4 md:px-6 border-b border-border/60">
        <div className="flex items-center gap-3">
          {stats.map(({ label, value, cls }) => (
            <div key={label} className="flex items-center gap-1.5">
              <span className={cn('text-sm font-semibold tabular-nums', cls)}>{value}</span>
              <span className="text-xs text-muted-foreground hidden sm:inline">{label}</span>
            </div>
          ))}
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          {queue.length > 0 && idleAgents.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => runQueue.mutate()} disabled={runQueue.isPending}
              className="hidden sm:flex">
              {runQueue.isPending ? '…' : '▶ Run'}
            </Button>
          )}
          <Button size="sm" disabled={agentList.length === 0} onClick={() => setShowNew(true)}>
            + New task <span className="hidden md:inline ml-1 opacity-40 font-mono text-[10px]">n</span>
          </Button>
        </div>
      </div>

      {/* Mobile column tabs */}
      <div className="md:hidden flex shrink-0 border-b border-border/40">
        {COLS.map(col => (
          <button key={col.title} onClick={() => setMobileCol(col.title)}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors cursor-pointer bg-transparent border-none border-b-2 -mb-px',
              mobileCol === col.title ? 'text-foreground border-primary' : 'text-muted-foreground border-transparent'
            )}>
            <span className={cn('w-1.5 h-1.5 rounded-full', COL_DOT[col.title])} />
            {col.title}
            {col.count > 0 && <span className="font-mono text-[10px] text-muted-foreground">({col.count})</span>}
          </button>
        ))}
      </div>

      {/* Kanban */}
      <div className="flex-1 min-h-0 flex gap-3 px-3 md:px-4 pt-4 pb-2 overflow-hidden">
        {COLS.map(({ title, count }) => (
          <div key={title} className={cn(
            'min-w-0 flex-col overflow-hidden',
            title === mobileCol ? 'flex flex-1' : 'hidden',
            'md:flex md:flex-1'
          )}>
            <ColHead title={title} count={count} />
            <ScrollArea className="flex-1">
              <div className="flex flex-col gap-2.5 pb-3">
                {isLoading ? (
                  Array.from({ length: 2 }).map((_, i) => <CardSkeleton key={i} />)
                ) : title === 'Queue' ? (
                  queue.length === 0
                    ? <EmptyState icon={ListTodo} title="Queue is empty" description="Add a task to get started." />
                    : queue.map((task, idx) => (
                        <QueueCard key={task.id} task={task} agentList={idleAgents}
                          onAssign={agentId => assignTask.mutate({ taskId: task.id, agentId })}
                          onDelete={() => deleteTask.mutate(task.id)}
                          isFirst={idx === 0} isLast={idx === queue.length - 1}
                          onMoveUp={() => setPriority.mutate({ taskId: task.id, priority: (queue[idx - 1]?.priority ?? 0) + 1 })}
                          onMoveDown={() => setPriority.mutate({ taskId: task.id, priority: Math.max(0, (queue[idx + 1]?.priority ?? 0) - 1) })} />
                      ))
                ) : title === 'Working' ? (
                  working.length === 0
                    ? <EmptyState icon={Loader2} title="Nobody working" description="Assign a task from the Queue to an agent." />
                    : working.map(s => <WorkingCard key={s.id} session={s} agent={agentFor(s)} task={taskFor(s)} onClick={() => navigate(`/sessions/${s.id}`)} />)
                ) : (
                  review.length === 0
                    ? <EmptyState icon={GitMerge} title="Nothing to review" description="Completed sessions will appear here." />
                    : review.map(s => (
                        <ReviewCard key={s.id} session={s} agent={agentFor(s)} task={taskFor(s)}
                          hasRemote={!!project?.remoteUrl}
                          onMerge={() => mergeSession.mutate(s.id)}
                          onMergePush={() => mergePushSession.mutate(s.id)}
                          onClick={() => navigate(`/sessions/${s.id}`)} />
                      ))
                )}
              </div>
            </ScrollArea>
          </div>
        ))}
      </div>

      {/* Error banners */}
      {(mergeSession.isError || mergePushSession.isError || assignTask.isError) && (
        <div className="shrink-0 border-t border-destructive/30 bg-destructive/5 px-5 py-2.5 flex items-center gap-3">
          <span className="text-xs text-destructive flex-1">
            {(mergeSession.error ?? mergePushSession.error ?? assignTask.error)?.message}
          </span>
          <button
            className="text-xs text-muted-foreground hover:text-foreground cursor-pointer bg-transparent border-none"
            onClick={() => { mergeSession.reset(); mergePushSession.reset(); assignTask.reset() }}
          >
            Dismiss
          </button>
        </div>
      )}

      {showNew && projectId && (
        <NewTaskDialog
          projectId={projectId}
          hasIdleAgent={idleAgents.length > 0}
          onClose={() => setShowNew(false)}
          onCreate={async body => { await tasks.create(body); qc.invalidateQueries({ queryKey: ['tasks', projectId] }); setShowNew(false) }}
          onCreateAndRun={async body => {
            await tasks.create(body)
            await tasks.runQueue()
            qc.invalidateQueries({ queryKey: ['tasks', projectId] })
            qc.invalidateQueries({ queryKey: ['sessions', projectId] })
            setShowNew(false)
          }}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// New task dialog
// ---------------------------------------------------------------------------

function NewTaskDialog({ projectId, hasIdleAgent, onClose, onCreate, onCreateAndRun }: {
  projectId: string
  hasIdleAgent: boolean
  onClose: () => void
  onCreate: (body: { projectId: string; title: string; prompt: string; baseBranch: string }) => Promise<void>
  onCreateAndRun: (body: { projectId: string; title: string; prompt: string; baseBranch: string }) => Promise<void>
}) {
  const [title,      setTitle]      = useState('')
  const [prompt,     setPrompt]     = useState('')
  const [baseBranch, setBaseBranch] = useState('main')
  const [loading,    setLoading]    = useState(false)
  const isValid = title.trim().length > 2

  async function submit(fn: typeof onCreate) {
    if (!isValid) return
    setLoading(true)
    try { await fn({ projectId, title: title.trim(), prompt, baseBranch }) }
    finally { setLoading(false) }
  }

  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>New task</DialogTitle></DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Title</Label>
            <Input autoFocus value={title} onChange={e => setTitle(e.target.value)}
              placeholder="What should the agent do?"
              onKeyDown={e => { if (e.key === 'Enter' && isValid) void submit(onCreate) }} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Prompt <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={3}
              placeholder="Additional context, requirements, or constraints…" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Base branch</Label>
            <Input value={baseBranch} onChange={e => setBaseBranch(e.target.value)} className="font-mono text-xs" />
          </div>
          <div className="flex gap-2 pt-1">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button variant="outline" className="flex-1" disabled={!isValid || loading} onClick={() => void submit(onCreate)}>
              {loading ? '…' : 'Queue'}
            </Button>
            <Button className="flex-1" disabled={!isValid || loading || !hasIdleAgent} onClick={() => void submit(onCreateAndRun)}>
              {loading ? '…' : 'Dispatch ↗'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
