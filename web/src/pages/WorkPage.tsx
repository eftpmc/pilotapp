import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { tasks, agents, sessions, projects, connections, shifts } from '../api/client'
import type { Task, Agent, Session, TaskSize, Shift } from '../api/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { EmptyState } from '@/components/EmptyState'
import { CardSkeleton } from '@/components/Skeleton'
import { AgentAvatar } from '@/components/AgentAvatar'
import { fmtSecs, useElapsed } from '@/lib/time'
import { cn } from '@/lib/utils'
import { ListTodo, Loader2, GitMerge, Upload, GripVertical } from 'lucide-react'
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

// ---------------------------------------------------------------------------
// Project color dot
// ---------------------------------------------------------------------------

const PROJECT_COLORS = ['#f87171','#fb923c','#facc15','#4ade80','#60a5fa','#c084fc','#f472b6']

function ProjectDot({ projectId, projectList }: { projectId: string; projectList: { id: string }[] }) {
  const idx = projectList.findIndex(p => p.id === projectId)
  return <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: PROJECT_COLORS[idx % PROJECT_COLORS.length] ?? 'var(--muted-foreground)' }} />
}

// ---------------------------------------------------------------------------
// Column header
// ---------------------------------------------------------------------------

const COL_ACCENT: Record<string, string> = {
  Queue:   'bg-muted-foreground/25',
  Working: 'bg-green-500',
  Review:  'bg-amber-400',
}

function ColHead({ title, count }: { title: string; count: number }) {
  return (
    <div className="flex items-center gap-2.5 pb-3 shrink-0">
      <div className={cn('w-0.5 h-4 rounded-full shrink-0', COL_ACCENT[title] ?? 'bg-muted-foreground/25')} />
      <span className="text-xs font-semibold text-foreground tracking-wide">{title}</span>
      <span className="text-[11px] font-mono text-muted-foreground/50 bg-muted/60 px-1.5 py-px rounded-full leading-none">{count}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Agent picker
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
          {agentList.map(e => (
            <button key={e.id} onClick={() => { onAssign(e.id); setOpen(false) }}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-foreground hover:bg-muted/60 transition-colors cursor-pointer bg-transparent border-none text-left">
              <AgentAvatar agent={e} size={18} />
              {e.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

const SIZE_BADGE: Record<string, string> = {
  xs: 'text-sky-400 bg-sky-500/10 border-sky-500/25',
  s:  'text-blue-400 bg-blue-500/10 border-blue-500/25',
  m:  'text-muted-foreground/60 bg-muted/50 border-border/50',
  l:  'text-amber-400 bg-amber-500/10 border-amber-500/25',
  xl: 'text-red-400 bg-red-500/10 border-red-500/25',
}

function SizeBadge({ size }: { size?: string }) {
  const s = size ?? 'm'
  return (
    <span className={cn('inline-flex items-center font-mono text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border', SIZE_BADGE[s])}>
      {s}
    </span>
  )
}

function QueueCard({ task, agentList, projectList, onAssign, onDelete }: {
  task: Task; agentList: Agent[]
  projectList: { id: string; name: string }[]
  onAssign: (id: string) => void; onDelete: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id })
  const style = { transform: CSS.Transform.toString(transform), transition }
  const projName = projectList.find(p => p.id === task.projectId)?.name
  return (
    <div ref={setNodeRef} style={style} className={cn('bg-card rounded-xl [box-shadow:var(--shadow-card)] overflow-hidden select-none', isDragging && 'opacity-50 z-50')}>
      {/* Tags row */}
      <div className="flex items-center gap-1.5 px-3.5 pt-3.5">
        <SizeBadge size={task.size} />
        {task.leadSessionId && (
          <span className="text-[10px] font-bold text-primary bg-primary/10 border border-primary/25 rounded px-1.5 py-0.5 uppercase tracking-wider">Lead</span>
        )}
        <span className="text-[11px] font-mono text-muted-foreground/55 bg-muted/50 border border-border/40 rounded-full px-2 py-px ml-auto">
          {task.baseBranch || 'main'}
        </span>
      </div>

      {/* Title + prompt */}
      <div className="px-3.5 pt-2.5 pb-3">
        <p className="text-sm font-semibold text-foreground leading-snug">{task.title}</p>
        {task.prompt && (
          <p className="text-xs text-muted-foreground/60 mt-1.5 leading-relaxed line-clamp-2">{task.prompt}</p>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center gap-2 px-3.5 pb-3 border-t border-border/30 pt-2.5">
        <button {...attributes} {...listeners}
          className="text-muted-foreground/20 hover:text-muted-foreground/50 cursor-grab active:cursor-grabbing bg-transparent border-none p-0 touch-none transition-colors shrink-0" tabIndex={-1}>
          <GripVertical className="h-3.5 w-3.5" />
        </button>
        {projName && (
          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground/50">
            <ProjectDot projectId={task.projectId} projectList={projectList} />
            {projName}
          </span>
        )}
        <div className="flex-1" />
        {agentList.length > 0
          ? <AgentPicker agentList={agentList} onAssign={onAssign} />
          : <span className="text-[11px] text-muted-foreground/40">No agents</span>
        }
        <button onClick={onDelete}
          className="text-muted-foreground/25 hover:text-destructive transition-colors cursor-pointer bg-transparent border-none text-lg leading-none">×</button>
      </div>
    </div>
  )
}

function WorkingCard({ session, agent, task, projectName, taskList, onClick }: {
  session: Session; agent?: Agent; task?: Task; projectName?: string
  taskList: Task[]; onClick: () => void
}) {
  const secs       = useElapsed(session.createdAt, true)
  const shortId    = session.id.slice(0, 7)
  const isLead     = agent?.role === 'lead'
  const shiftTotal = session.shiftId ? taskList.filter(t => t.shiftId === session.shiftId).length : 0
  const shiftDone  = session.shiftId ? taskList.filter(t => t.shiftId === session.shiftId && (t.status === 'done' || t.status === 'failed')).length : 0

  const statusLabel = session.shiftId
    ? `Shift ${shiftDone + 1}/${shiftTotal}`
    : isLead ? 'Coordinating' : 'Running'

  return (
    <button onClick={onClick}
      className="w-full text-left bg-card rounded-xl overflow-hidden cursor-pointer transition-all duration-200 hover:-translate-y-0.5 [box-shadow:var(--shadow-card)]"
      style={{ boxShadow: 'var(--shadow-card), inset 0 2px 0 oklch(0.70 0.19 145 / 0.6)' }}
    >
      <div className="flex items-center gap-1.5 px-3.5 pt-3.5">
        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-green-500 bg-green-500/10 border border-green-500/25 rounded px-1.5 py-0.5">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-[pulse_1.6s_ease-out_infinite]" />
          {statusLabel}
        </span>
        <span className="font-mono text-[11px] text-green-500 tabular-nums ml-auto">{fmtSecs(secs)}</span>
      </div>

      <div className="px-3.5 pt-2.5 pb-3">
        <p className="text-sm font-semibold text-foreground leading-snug line-clamp-2">
          {task?.title ?? session.branch}
        </p>
      </div>

      <div className="flex items-center gap-2 px-3.5 pb-3 border-t border-border/30 pt-2.5">
        <AgentAvatar agent={agent} size={18} />
        <span className="text-xs text-muted-foreground">{agent?.name ?? '—'}</span>
        {projectName && <span className="text-[11px] text-muted-foreground/40">· {projectName}</span>}
        <span className="font-mono text-[10px] text-muted-foreground/30">#{shortId}</span>
      </div>
    </button>
  )
}

function ReviewerPicker({ agentList, onPick }: { agentList: Agent[]; onPick: (id: string) => void }) {
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
      <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs" onClick={e => { e.stopPropagation(); setOpen(o => !o) }}>
        Request Review
      </Button>
      {open && (
        <div className="absolute right-0 top-[calc(100%+4px)] z-30 bg-card border border-border rounded-xl shadow-xl overflow-hidden min-w-[150px]">
          <p className="text-[10px] text-muted-foreground px-3 py-2 border-b border-border/60">Pick reviewer</p>
          {agentList.map(e => (
            <button key={e.id} onClick={() => { onPick(e.id); setOpen(false) }}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-foreground hover:bg-muted/60 transition-colors cursor-pointer bg-transparent border-none text-left">
              <AgentAvatar agent={e} size={16} />
              {e.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function ReviewCard({ session, agent, task, projectName, hasRemote, allAgents, onMerge, onMergePush, onClick, isMerging, onRequestReview }: {
  session: Session; agent?: Agent; task?: Task; projectName?: string
  hasRemote: boolean; allAgents: Agent[]
  onMerge: () => void; onMergePush: () => void; onClick: () => void; isMerging?: boolean
  onRequestReview: (agentId: string) => void
}) {
  const isError   = session.status === 'error'
  const verdict   = session.reviewVerdict
  const isPending = verdict === 'pending'
  const approved  = verdict === 'approved'
  const changes   = verdict === 'changes_requested'

  const topAccent = isError ? 'oklch(0.63 0.22 22 / 0.7)' : approved ? 'oklch(0.70 0.19 145 / 0.7)' : isPending ? 'oklch(0.60 0.10 264 / 0.5)' : 'oklch(0.80 0.16 75 / 0.6)'
  const statusTag = isError ? (
    <span className="inline-flex items-center text-[10px] font-bold text-red-400 bg-red-500/10 border border-red-500/25 rounded px-1.5 py-0.5">Error</span>
  ) : isPending ? (
    <span className="inline-flex items-center text-[10px] font-bold text-muted-foreground bg-muted/60 border border-border/50 rounded px-1.5 py-0.5">Reviewing…</span>
  ) : approved ? (
    <span className="inline-flex items-center text-[10px] font-bold text-green-400 bg-green-500/10 border border-green-500/25 rounded px-1.5 py-0.5">Approved ✓</span>
  ) : changes ? (
    <span className="inline-flex items-center text-[10px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/25 rounded px-1.5 py-0.5">Changes Requested</span>
  ) : (
    <span className="inline-flex items-center text-[10px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/25 rounded px-1.5 py-0.5">Review</span>
  )

  return (
    <div onClick={onClick}
      className="bg-card rounded-xl overflow-hidden cursor-pointer transition-all duration-200 hover:-translate-y-0.5 [box-shadow:var(--shadow-card)]"
      style={{ boxShadow: `var(--shadow-card), inset 0 2px 0 ${topAccent}` }}
    >
      <div className="flex items-center gap-1.5 px-3.5 pt-3.5">{statusTag}</div>

      <div className="px-3.5 pt-2.5 pb-3">
        <p className="text-sm font-semibold text-foreground leading-snug line-clamp-2">
          {task?.title ?? session.branch}
        </p>
      </div>

      <div className="flex items-center gap-2 px-3.5 pb-2.5">
        <AgentAvatar agent={agent} size={18} />
        <span className="text-xs text-muted-foreground">{agent?.name ?? '—'}</span>
        {projectName && <span className="text-[11px] text-muted-foreground/40">· {projectName}</span>}
      </div>

      <div className="flex items-center gap-1.5 px-3.5 pb-3.5 border-t border-border/30 pt-2.5" onClick={e => e.stopPropagation()}>
        {isError ? (
          <Button size="sm" className="h-7 px-2.5 text-xs flex-1" onClick={onClick}>View & Retry</Button>
        ) : isPending ? (
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-muted-foreground flex-1" onClick={onClick}>View Output</Button>
        ) : (
          <>
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-muted-foreground" onClick={onClick}>Log</Button>
            {!verdict && <ReviewerPicker agentList={allAgents.filter(e => e.id !== session.agentId)} onPick={onRequestReview} />}
            {hasRemote ? (
              <>
                <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs flex-1" onClick={onMerge} disabled={isMerging}>
                  {isMerging ? '…' : 'Merge'}
                </Button>
                <Button size="sm" className="h-7 px-2.5 text-xs gap-1 flex-1" onClick={onMergePush} disabled={isMerging}>
                  <Upload className="h-3 w-3" />{isMerging ? '…' : 'Push'}
                </Button>
              </>
            ) : (
              <Button size="sm" className="h-7 px-2.5 text-xs flex-1" onClick={onMerge} disabled={isMerging}>
                {isMerging ? '…' : 'Merge ✓'}
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

type MobileCol = 'Queue' | 'Working' | 'Review'

export default function WorkPage() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [showNew,      setShowNew]      = useState(false)
  const [mobileCol,    setMobileCol]    = useState<MobileCol>('Queue')
  const [reportShift,  setReportShift]  = useState<Shift | null>(null)

  const { data: taskList      = [], isLoading: tasksLoading   } = useQuery({ queryKey: ['tasks'],    queryFn: () => tasks.list(),       refetchInterval: 4000 })
  const { data: agentList  = []                             } = useQuery({ queryKey: ['agents'], queryFn: () => agents.list() })
  const { data: sessionList   = [], isLoading: sessionsLoading } = useQuery({ queryKey: ['sessions'], queryFn: () => sessions.list(),    refetchInterval: 4000 })
  const { data: projectList   = []                             } = useQuery({ queryKey: ['projects'],  queryFn: () => projects.list() })
  const { data: connectionList = []                            } = useQuery({ queryKey: ['connections'],    queryFn: () => connections.list() })
  const { data: shiftList     = []                             } = useQuery({ queryKey: ['shifts'],    queryFn: () => shifts.list(),      refetchInterval: 10_000 })
  const isLoading = tasksLoading || sessionsLoading

  const codeSessions   = sessionList.filter(s => !s.specId && !s.parentSessionId)
  const busyIds        = new Set(codeSessions.filter(s => s.status === 'running').map(s => s.agentId))
  const quotaConnIds   = new Set(connectionList.filter(c => c.quotaStatus === 'exceeded').map(c => c.id))
  const idleAgents  = agentList.filter(e => !busyIds.has(e.id) && !quotaConnIds.has(e.connectionId ?? ''))
  const queue          = taskList.filter(t => t.status === 'pending').sort((a, b) => {
    if ((b.priority ?? 0) !== (a.priority ?? 0)) return (b.priority ?? 0) - (a.priority ?? 0)
    return a.createdAt.localeCompare(b.createdAt)
  })
  const working = codeSessions.filter(s => s.status === 'running' || s.status === 'idle')
  const review  = codeSessions.filter(s => s.status === 'done' || s.status === 'error')

  const [shiftDialog, setShiftDialog] = useState(false)

  const runQueue     = useMutation({ mutationFn: () => tasks.runQueue(), onSuccess: () => { qc.invalidateQueries({ queryKey: ['tasks'] }); qc.invalidateQueries({ queryKey: ['sessions'] }) } })
  const deleteTask   = useMutation({ mutationFn: (id: string) => tasks.delete(id), onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }) })
  const assignTask   = useMutation({
    mutationFn: ({ taskId, agentId }: { taskId: string; agentId: string }) => tasks.assign(taskId, agentId),
    onSuccess: ({ session }) => { qc.invalidateQueries({ queryKey: ['tasks'] }); qc.invalidateQueries({ queryKey: ['sessions'] }); navigate(`/sessions/${session.id}`) },
  })
  const mergeSession = useMutation({
    mutationFn: (id: string) => sessions.merge(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sessions'] }),
  })
  const mergePushSession = useMutation({
    mutationFn: async (s: Session) => { await sessions.merge(s.id); await projects.push(s.projectId) },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sessions'] }),
  })
  const requestReview = useMutation({
    mutationFn: ({ sessionId, agentId }: { sessionId: string; agentId: string }) => sessions.requestReview(sessionId, agentId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sessions'] }) },
  })
  const createShift = useMutation({
    mutationFn: (body: { agentId: string; taskIds: string[] }) => shifts.create(body),
    onSuccess: ({ session }) => { qc.invalidateQueries({ queryKey: ['tasks'] }); qc.invalidateQueries({ queryKey: ['sessions'] }); setShiftDialog(false); navigate(`/sessions/${session.id}`) },
  })

  function employeeFor(s: Session) { return agentList.find(e => e.id === s.agentId) }
  function taskFor(s: Session)     { return taskList.find(t => t.id === s.workTaskId) }
  function projectFor(s: Session)  { return projectList.find(p => p.id === s.projectId) }

  // Drag-to-reorder queue
  const dndSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  function handleQueueDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIdx = queue.findIndex(t => t.id === active.id)
    const newIdx = queue.findIndex(t => t.id === over.id)
    if (oldIdx === -1 || newIdx === -1) return
    const reordered = arrayMove(queue, oldIdx, newIdx)
    reordered.forEach((task, i) => {
      const newPriority = reordered.length - i
      if (task.priority !== newPriority) {
        tasks.update(task.id, { priority: newPriority })
      }
    })
    qc.setQueryData(['tasks'], (old: Task[] | undefined) => {
      if (!old) return old
      return old.map(t => {
        const idx = reordered.findIndex(r => r.id === t.id)
        return idx >= 0 ? { ...t, priority: reordered.length - idx } : t
      })
    })
  }

  // WebSocket — subscribe to all running sessions
  const invalidateRef = useRef<() => void>(() => {})
  invalidateRef.current = () => {
    qc.invalidateQueries({ queryKey: ['sessions'] })
    qc.invalidateQueries({ queryKey: ['tasks'] })
  }
  const wsRef = useRef<WebSocket | null>(null)
  const subscribedRef = useRef(new Set<string>())
  const workingIdsRef = useRef<string[]>([])
  workingIdsRef.current = working.map(s => s.id)

  useEffect(() => {
    let dead = false; let retryDelay = 2000
    function connect() {
      if (dead) return
      const token = localStorage.getItem('token')
      if (!token) return
      const proto = location.protocol === 'https:' ? 'wss' : 'ws'
      const ws = new WebSocket(`${proto}://${location.host}/ws?token=${token}`)
      wsRef.current = ws; subscribedRef.current = new Set()
      ws.onopen = () => {
        retryDelay = 2000
        for (const id of workingIdsRef.current) { ws.send(JSON.stringify({ type: 'subscribe', sessionId: id })); subscribedRef.current.add(id) }
      }
      ws.onmessage = (e) => { try { if (JSON.parse(e.data).type === 'done') invalidateRef.current() } catch {} }
      ws.onclose = () => { if (!dead) { setTimeout(connect, retryDelay); retryDelay = Math.min(retryDelay * 2, 30_000) } }
      ws.onerror = () => ws.close()
    }
    connect()
    return () => { dead = true; wsRef.current?.close(); wsRef.current = null }
  }, [])

  const runningKey = working.map(s => s.id).join(',')
  useEffect(() => {
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    for (const id of workingIdsRef.current) {
      if (!subscribedRef.current.has(id)) { ws.send(JSON.stringify({ type: 'subscribe', sessionId: id })); subscribedRef.current.add(id) }
    }
  }, [runningKey]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === 'n' && !showNew && projectList.length > 0) { e.preventDefault(); setShowNew(true) }
      if (e.key === 'r' && queue.length > 0 && idleAgents.length > 0 && !runQueue.isPending) { e.preventDefault(); runQueue.mutate() }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [showNew, queue.length, idleAgents.length, projectList.length, runQueue.isPending])

  const COLS: { title: MobileCol; count: number }[] = [
    { title: 'Queue',   count: queue.length   },
    { title: 'Working', count: working.length },
    { title: 'Review',  count: review.length  },
  ]

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-background">

      {/* Page header */}
      <div className="shrink-0 px-5 pt-6 pb-5 border-b border-border/40 flex items-end gap-4">
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight">Work</h1>
          <div className="flex items-center gap-4 mt-1.5">
            {working.length > 0 && (
              <span className="flex items-center gap-1.5 text-sm text-green-500 font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-[pulse_1.6s_ease-out_infinite]" />
                {working.length} working
              </span>
            )}
            {review.length > 0 && <span className="text-sm text-amber-500 font-semibold">{review.length} in review</span>}
            {queue.length > 0 && <span className="text-sm text-muted-foreground">{queue.length} queued</span>}
            {working.length === 0 && review.length === 0 && queue.length === 0 && (
              <span className="text-sm text-muted-foreground/40">Idle</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {queue.length > 0 && idleAgents.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => runQueue.mutate()} disabled={runQueue.isPending}>
              {runQueue.isPending ? '…' : '▶ Run queue'}
            </Button>
          )}
          {queue.length >= 2 && idleAgents.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => setShiftDialog(true)}>Shift ↓</Button>
          )}
          <Button size="sm" disabled={projectList.length === 0} onClick={() => setShowNew(true)}>
            + New task <span className="hidden md:inline ml-1 opacity-40 font-mono text-[10px]">n</span>
          </Button>
        </div>
      </div>

      <ShiftStrip
        shiftList={shiftList} agentList={agentList}
        onViewReport={shift => setReportShift(shift)}
      />

      {/* Mobile column tabs */}
      <div className="md:hidden flex shrink-0 border-b border-border/40">
        {COLS.map(col => (
          <button key={col.title} onClick={() => setMobileCol(col.title)}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors cursor-pointer bg-transparent border-none border-b-2 -mb-px',
              mobileCol === col.title ? 'text-foreground border-primary' : 'text-muted-foreground border-transparent'
            )}>
            <div className={cn('w-0.5 h-3 rounded-full', COL_ACCENT[col.title])} />
            {col.title}
            {col.count > 0 && <span className="font-mono text-[10px] text-muted-foreground">({col.count})</span>}
          </button>
        ))}
      </div>

      {/* Kanban */}
      <div className="flex-1 min-h-0 flex gap-3 px-4 md:px-5 pt-4 pb-4 overflow-hidden">
        {COLS.map(({ title, count }) => (
          <div key={title} className={cn(
            'min-w-0 flex-col overflow-hidden rounded-xl p-3',
            '',
            title === mobileCol ? 'flex flex-1' : 'hidden',
            'md:flex md:flex-1'
          )}>
            <ColHead title={title} count={count} />
            <ScrollArea className="flex-1">
              <div className="flex flex-col gap-2.5 pb-1">
                {isLoading ? (
                  Array.from({ length: 2 }).map((_, i) => <CardSkeleton key={i} />)
                ) : title === 'Queue' ? (
                  queue.length === 0
                    ? <EmptyState icon={ListTodo} title="Queue is empty" description="Add a task to get started." />
                    : (
                      <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={handleQueueDragEnd}>
                        <SortableContext items={queue.map(t => t.id)} strategy={verticalListSortingStrategy}>
                          {queue.map(task => (
                            <QueueCard key={task.id} task={task} agentList={idleAgents} projectList={projectList}
                              onAssign={agentId => assignTask.mutate({ taskId: task.id, agentId })}
                              onDelete={() => deleteTask.mutate(task.id)} />
                          ))}
                        </SortableContext>
                      </DndContext>
                    )
                ) : title === 'Working' ? (
                  working.length === 0
                    ? <EmptyState icon={Loader2} title="Nobody working" description="Assign a task from the Queue." />
                    : working.map(s => <WorkingCard key={s.id} session={s} agent={employeeFor(s)} task={taskFor(s)} projectName={projectFor(s)?.name} taskList={taskList} onClick={() => navigate(`/sessions/${s.id}`)} />)
                ) : (
                  review.length === 0
                    ? <EmptyState icon={GitMerge} title="Nothing to review" description="Completed sessions will appear here." />
                    : review.map(s => {
                        const proj = projectFor(s)
                        return (
                          <ReviewCard key={s.id} session={s} agent={employeeFor(s)} task={taskFor(s)} projectName={proj?.name}
                            hasRemote={!!proj?.remoteUrl} allAgents={agentList}
                            onMerge={() => mergeSession.mutate(s.id)}
                            onMergePush={() => mergePushSession.mutate(s)}
                            onClick={() => navigate(`/sessions/${s.id}`)}
                            isMerging={mergeSession.isPending || mergePushSession.isPending}
                            onRequestReview={agentId => requestReview.mutate({ sessionId: s.id, agentId })} />
                        )
                      })
                )}
              </div>
            </ScrollArea>
          </div>
        ))}
      </div>

      {(mergeSession.isError || mergePushSession.isError || assignTask.isError) && (
        <div className="shrink-0 border-t border-destructive/30 bg-destructive/5 px-5 py-2.5 flex items-center gap-3">
          <span className="text-xs text-destructive flex-1">
            {(mergeSession.error ?? mergePushSession.error ?? assignTask.error)?.message}
          </span>
          <button className="text-xs text-muted-foreground hover:text-foreground cursor-pointer bg-transparent border-none"
            onClick={() => { mergeSession.reset(); mergePushSession.reset(); assignTask.reset() }}>
            Dismiss
          </button>
        </div>
      )}

      {reportShift && (
        <ShiftReportDialog shift={reportShift} agentList={agentList} onClose={() => setReportShift(null)} />
      )}

      {shiftDialog && (
        <ShiftDialog
          agentList={idleAgents}
          queueTasks={queue}
          projectList={projectList}
          onClose={() => setShiftDialog(false)}
          onCreate={(agentId, taskIds) => createShift.mutate({ agentId, taskIds })}
          loading={createShift.isPending}
          error={createShift.error?.message}
        />
      )}

      {showNew && (
        <NewTaskDialog
          projectList={projectList}
          hasIdleEmployee={idleAgents.length > 0}
          onClose={() => setShowNew(false)}
          onCreate={async body => { await tasks.create(body); qc.invalidateQueries({ queryKey: ['tasks'] }); setShowNew(false) }}
          onCreateAndRun={async body => {
            await tasks.create(body)
            await tasks.runQueue()
            qc.invalidateQueries({ queryKey: ['tasks'] })
            qc.invalidateQueries({ queryKey: ['sessions'] })
            setShowNew(false)
          }}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Shift strip — active and recent completed shifts
// ---------------------------------------------------------------------------

function ShiftStrip({ shiftList, agentList, onViewReport }: {
  shiftList: Shift[]; agentList: Agent[]
  onViewReport: (shift: Shift) => void
}) {
  const recent = shiftList.filter(s => s.status === 'running' || s.status === 'completed').slice(0, 5)
  if (recent.length === 0) return null
  return (
    <div className="shrink-0 flex items-center gap-2 px-4 py-2 border-b border-border/40 overflow-x-auto">
      <span className="text-xs font-semibold text-muted-foreground/60 shrink-0">Shifts</span>
      {recent.map(shift => {
        const emp = agentList.find(e => e.id === shift.agentId)
        const isRunning = shift.status === 'running'
        const pct = shift.taskCount > 0 ? Math.round((shift.doneCount / shift.taskCount) * 100) : 0
        return (
          <button
            key={shift.id}
            onClick={() => shift.status === 'completed' ? onViewReport(shift) : undefined}
            disabled={isRunning}
            className={cn(
              'flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs shrink-0 transition-colors',
              isRunning
                ? 'bg-card border-green-500/20 cursor-default'
                : 'bg-card border-border/50 hover:border-border cursor-pointer'
            )}
          >
            {emp && <AgentAvatar agent={emp} size={14} />}
            <span className="font-medium text-foreground">{emp?.name ?? '—'}</span>
            <span className="text-muted-foreground font-mono">{shift.doneCount}/{shift.taskCount}</span>
            {isRunning ? (
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-[pulse_1.6s_ease-out_infinite]" />
            ) : (
              <span className="text-muted-foreground/60">· Report</span>
            )}
            {isRunning && shift.taskCount > 0 && (
              <div className="w-16 h-1 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
              </div>
            )}
          </button>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Shift report dialog
// ---------------------------------------------------------------------------

function ShiftReportDialog({ shift, agentList, onClose }: {
  shift: Shift; agentList: Agent[]; onClose: () => void
}) {
  const emp = agentList.find(e => e.id === shift.agentId)
  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {emp && <AgentAvatar agent={emp} size={20} />}
            Shift Report — {emp?.name ?? 'Unknown'}
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-4 text-sm">
            <span className="text-green-500 font-semibold">{shift.doneCount} done</span>
            {shift.taskCount - shift.doneCount > 0 && (
              <span className="text-red-400 font-semibold">{shift.taskCount - shift.doneCount} failed</span>
            )}
            <span className="text-muted-foreground text-xs font-mono ml-auto">
              {shift.completedAt && new Date(shift.completedAt).toLocaleString()}
            </span>
          </div>
          {shift.report ? (
            <pre className="font-mono text-xs leading-relaxed whitespace-pre-wrap text-foreground/80 bg-muted/40 rounded-xl px-4 py-3 max-h-64 overflow-y-auto">
              {shift.report}
            </pre>
          ) : (
            <p className="text-sm text-muted-foreground">No report available.</p>
          )}
          <Button variant="outline" onClick={onClose} className="self-end">Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// New task dialog — includes project picker
// ---------------------------------------------------------------------------

const SIZES: { value: TaskSize; label: string; desc: string }[] = [
  { value: 'xs', label: 'XS', desc: '<30m' },
  { value: 's',  label: 'S',  desc: '~1h'  },
  { value: 'm',  label: 'M',  desc: '~2h'  },
  { value: 'l',  label: 'L',  desc: '~4h'  },
  { value: 'xl', label: 'XL', desc: '1d+'  },
]

function NewTaskDialog({ projectList, hasIdleEmployee, onClose, onCreate, onCreateAndRun }: {
  projectList: { id: string; name: string }[]
  hasIdleEmployee: boolean
  onClose: () => void
  onCreate: (body: { projectId: string; title: string; prompt: string; baseBranch: string; size: TaskSize }) => Promise<void>
  onCreateAndRun: (body: { projectId: string; title: string; prompt: string; baseBranch: string; size: TaskSize }) => Promise<void>
}) {
  const [projectId,  setProjectId]  = useState(projectList[0]?.id ?? '')
  const [title,      setTitle]      = useState('')
  const [prompt,     setPrompt]     = useState('')
  const [baseBranch, setBaseBranch] = useState('main')
  const [size,       setSize]       = useState<TaskSize>('m')
  const [loading,    setLoading]    = useState(false)
  const isValid = title.trim().length > 2 && !!projectId

  async function submit(fn: typeof onCreate) {
    if (!isValid) return
    setLoading(true)
    try { await fn({ projectId, title: title.trim(), prompt, baseBranch, size }) }
    finally { setLoading(false) }
  }

  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>New task</DialogTitle></DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Project</Label>
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger><SelectValue placeholder="Select project" /></SelectTrigger>
              <SelectContent>
                {projectList.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
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
          <div className="flex gap-3">
            <div className="flex flex-col gap-1.5 flex-1">
              <Label>Base branch</Label>
              <Input value={baseBranch} onChange={e => setBaseBranch(e.target.value)} className="font-mono text-xs" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Size</Label>
              <div className="flex gap-1">
                {SIZES.map(s => (
                  <button key={s.value} type="button" onClick={() => setSize(s.value)} className={cn(
                    'flex flex-col items-center px-2 py-1 rounded-lg border text-xs font-bold transition-colors cursor-pointer min-w-[36px]',
                    size === s.value ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-transparent text-muted-foreground hover:text-foreground'
                  )}>
                    {s.label}
                    <span className="font-normal text-[9px] opacity-70">{s.desc}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button variant="outline" className="flex-1" disabled={!isValid || loading} onClick={() => void submit(onCreate)}>
              {loading ? '…' : 'Queue'}
            </Button>
            <Button className="flex-1" disabled={!isValid || loading || !hasIdleEmployee} onClick={() => void submit(onCreateAndRun)}>
              {loading ? '…' : 'Dispatch ↗'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Shift creation dialog
// ---------------------------------------------------------------------------

function ShiftDialog({ agentList, queueTasks, projectList, onClose, onCreate, loading, error }: {
  agentList: Agent[]
  queueTasks: Task[]
  projectList: { id: string; name: string }[]
  onClose: () => void
  onCreate: (agentId: string, taskIds: string[]) => void
  loading: boolean
  error?: string
}) {
  const [agentId,  setAgentId]  = useState(agentList[0]?.id ?? '')
  const [selected, setSelected] = useState<Set<string>>(new Set())

  function toggle(id: string) {
    setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  const isValid = agentId && selected.size >= 2

  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Create Shift</DialogTitle></DialogHeader>
        <div className="flex flex-col gap-4">
          <p className="text-xs text-muted-foreground -mt-1">
            Assign a batch of tasks to one agent. They'll run sequentially, unattended.
          </p>
          <div className="flex flex-col gap-1.5">
            <Label>Agent</Label>
            <Select value={agentId} onValueChange={setAgentId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {agentList.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Tasks <span className="text-muted-foreground font-normal">(select 2+, run in order)</span></Label>
            <div className="flex flex-col gap-1 max-h-[200px] overflow-y-auto border border-border rounded-xl p-1">
              {queueTasks.map(task => {
                const projName = projectList.find(p => p.id === task.projectId)?.name
                return (
                  <button key={task.id} type="button" onClick={() => toggle(task.id)}
                    className={cn(
                      'flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left cursor-pointer border transition-colors bg-transparent text-xs',
                      selected.has(task.id) ? 'border-primary bg-primary/8 text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/40'
                    )}>
                    <span className={cn('w-3.5 h-3.5 rounded border shrink-0 flex items-center justify-center text-[9px] font-bold',
                      selected.has(task.id) ? 'border-primary bg-primary text-primary-foreground' : 'border-border')}>
                      {selected.has(task.id) ? '✓' : ''}
                    </span>
                    <span className="flex-1 truncate font-medium">{task.title}</span>
                    {projName && <span className="text-[10px] text-muted-foreground/60 shrink-0">{projName}</span>}
                  </button>
                )
              })}
            </div>
            {selected.size > 0 && <p className="text-[11px] text-muted-foreground">{selected.size} tasks selected</p>}
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button className="flex-1" disabled={!isValid || loading}
              onClick={() => onCreate(agentId, queueTasks.filter(t => selected.has(t.id)).map(t => t.id))}>
              {loading ? '…' : `Start Shift (${selected.size} tasks) ↗`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
