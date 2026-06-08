import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { tasks, agents, sessions, projects, connections, AgentAvatar, useElapsed, fmtSecs, cn } from '@pilot/shared'
import { FileDropzone } from '@/components/FileDropzone'
import type { Task, Agent, Session, TaskSize } from '@pilot/shared'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Field, FieldLabel } from '@/components/ui/field'
import { Spinner } from '@/components/ui/spinner'
import { AvatarGroup } from '@/components/ui/avatar'
import { ChevronRight, Upload } from 'lucide-react'

// ---------------------------------------------------------------------------
// Campaign model
// A campaign = a root task + all subtasks created by its lead session
// ---------------------------------------------------------------------------

export interface Campaign {
  root:     Task    // user-created root task
  subtasks: Task[]  // tasks where parentTaskId === root.id
  allTasks: Task[]
}

export function buildCampaigns(taskList: Task[]): Campaign[] {
  const subtaskMap = new Map<string, Task[]>()  // parentTaskId → subtasks

  for (const t of taskList) {
    if (t.parentTaskId) {
      const arr = subtaskMap.get(t.parentTaskId) ?? []
      arr.push(t)
      subtaskMap.set(t.parentTaskId, arr)
    }
  }

  const rootTasks = taskList.filter(t => !t.parentTaskId)

  return rootTasks.map(root => {
    const subtasks = subtaskMap.get(root.id) ?? []
    return { root, subtasks, allTasks: [root, ...subtasks] }
  })
}

function campaignStage(c: Campaign, sessionList: Session[]): 'queued' | 'working' | 'review' | 'done' {
  const taskIds = new Set(c.allTasks.map(t => t.id))
  const allWorkSessions = sessionList.filter(s => s.workTaskId && taskIds.has(s.workTaskId) && !s.specId && !s.parentSessionId)
  const reviewSessions = sessionList.filter(s =>
    s.parentSessionId && allWorkSessions.some(w => w.id === s.parentSessionId)
  )

  // No sessions visible (session aged out of query window, or still loading) — fall back to task status
  if (allWorkSessions.length === 0) {
    if (c.root.status === 'pending') return 'queued'
    if (c.root.status === 'done')    return 'done'
    // running/failed: session should be visible; show as working until sessions load
    return c.root.status === 'running' ? 'working' : 'review'
  }

  // All work sessions merged — campaign is complete, remove from board
  if (allWorkSessions.every(s => s.status === 'merged')) return 'done'

  // Multi-agent: base stage on subtask sessions only (lead may still be running synthesis)
  if (c.subtasks.length > 0) {
    const subtaskIds = new Set(c.subtasks.map(t => t.id))
    const subtaskSessions = allWorkSessions.filter(s => s.workTaskId && subtaskIds.has(s.workTaskId))
    if (subtaskSessions.some(s => s.status === 'running' || s.status === 'waiting' || s.status === 'idle')) return 'working'
    if (subtaskSessions.some(s => s.status === 'done' || s.status === 'error')) return 'review'
    return 'working'  // lead still planning, subtasks not created yet
  }

  const all = [...allWorkSessions, ...reviewSessions]
  if (all.some(s => s.status === 'running' || s.status === 'waiting' || s.status === 'idle')) return 'working'
  if (all.some(s => s.status === 'done' || s.status === 'error'))   return 'review'
  return 'queued'
}

function campaignAgents(c: Campaign, sessionList: Session[], agentList: Agent[]): Agent[] {
  const taskIds = new Set(c.allTasks.map(t => t.id))
  const workSessions = sessionList.filter(s => s.workTaskId && taskIds.has(s.workTaskId) && !s.specId && !s.parentSessionId)
  const reviewSessions = sessionList.filter(s =>
    s.parentSessionId && workSessions.some(w => w.id === s.parentSessionId)
  )
  const seen = new Set<string>()
  const result: Agent[] = []
  for (const s of [...workSessions, ...reviewSessions]) {
    if (!seen.has(s.agentId)) {
      seen.add(s.agentId)
      const a = agentList.find(a => a.id === s.agentId)
      if (a) result.push(a)
    }
  }
  return result
}

// ---------------------------------------------------------------------------
// Board cards
// ---------------------------------------------------------------------------

function ActiveElapsed({ createdAt }: { createdAt: string }) {
  const secs = useElapsed(createdAt, true)
  return <span className="font-mono text-[11px] text-muted-foreground tabular-nums">{fmtSecs(secs)}</span>
}

function SizeChip({ size }: { size?: string }) {
  if (!size) return null
  return (
    <span className="font-mono text-[10px] text-muted-foreground border border-border/50 rounded px-1.5 py-0.5 uppercase shrink-0">
      {size}
    </span>
  )
}

function QueueCard({
  campaign, idleAgents, onAssign, onDelete,
}: {
  campaign: Campaign
  idleAgents: Agent[]
  onAssign: (taskId: string, agentId: string) => void
  onDelete: (taskId: string) => void
}) {
  const { root } = campaign
  return (
    <div className="flex flex-col gap-3 p-4 rounded-xl border border-border/60 bg-card/70 shadow-sm">
      <div className="flex items-start gap-2 min-w-0">
        <span className="dot idle mt-[5px] shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground leading-snug truncate">{root.title}</p>
          {root.prompt && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{root.prompt}</p>
          )}
        </div>
        <SizeChip size={root.size} />
      </div>
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="icon" className="text-muted-foreground/30 hover:text-destructive h-7 w-7"
          onClick={() => onDelete(root.id)}>×</Button>
        {idleAgents.length > 0
          ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="primary" onClick={e => e.stopPropagation()}>Assign</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {idleAgents.map(a => (
                  <DropdownMenuItem key={a.id} onSelect={() => onAssign(root.id, a.id)} className="flex items-center gap-2">
                    <AgentAvatar agent={a} size={20} animated={false} />
                    {a.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )
          : <span className="text-xs text-muted-foreground/40">No agents free</span>
        }
      </div>
    </div>
  )
}

function WorkingCard({
  campaign, involvedAgents, sessionList, onClick,
}: {
  campaign: Campaign
  involvedAgents: Agent[]
  sessionList: Session[]
  onClick: () => void
}) {
  const { root } = campaign
  const taskIds = new Set(campaign.allTasks.map(t => t.id))
  const activeSession = sessionList.find(s =>
    s.workTaskId && taskIds.has(s.workTaskId) && !s.specId && !s.parentSessionId &&
    (s.status === 'running' || s.status === 'waiting' || s.status === 'idle')
  )
  const subtaskCount = campaign.subtasks.length

  return (
    <button onClick={onClick}
      className="flex flex-col gap-3 w-full p-4 rounded-xl border border-border/60 bg-card/70 shadow-sm hover:bg-card hover:border-border hover:-translate-y-0.5 transition-all text-left">
      <div className="flex items-start gap-2 min-w-0">
        <span className="dot green pulse mt-[5px] shrink-0" />
        <p className="flex-1 text-sm font-medium text-foreground leading-snug truncate">{root.title}</p>
        <SizeChip size={root.size} />
      </div>
      <div className="flex items-center justify-between">
        <AvatarGroup size={34}>
          {involvedAgents.map(a => <AgentAvatar key={a.id} agent={a} size={34} running />)}
        </AvatarGroup>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {subtaskCount > 0 && <span>{subtaskCount} tasks</span>}
          {activeSession?.status === 'running' && <ActiveElapsed createdAt={activeSession.createdAt} />}
          <ChevronRight size={13} className="text-muted-foreground/40" />
        </div>
      </div>
    </button>
  )
}

function ReviewCard({
  campaign, involvedAgents, sessionList, project, isMerging,
  onMerge, onMergePush, onRequestReview, onDiscard, onClick,
}: {
  campaign: Campaign
  involvedAgents: Agent[]
  sessionList: Session[]
  project?: { workspaceMode: string; remoteUrl?: string }
  isMerging: boolean
  onMerge: (id: string) => void
  onMergePush: (id: string) => void
  onRequestReview: (sessionId: string, agentId: string) => void
  onDiscard: (id: string) => void
  onClick: () => void
}) {
  const { root } = campaign

  // Find the primary review target — prefer tasks in error/done without a verdict yet
  const taskIds = new Set(campaign.allTasks.map(t => t.id))
  const workSessions = sessionList.filter(s =>
    s.workTaskId && taskIds.has(s.workTaskId) && !s.specId && !s.parentSessionId &&
    (s.status === 'done' || s.status === 'error')
  )
  const primarySession = workSessions[0]
  const verdict = primarySession?.reviewVerdict
  const reviewPending = workSessions.length > 1

  return (
    <div className="flex flex-col gap-3 p-4 rounded-xl border border-border/60 bg-card/70 shadow-sm">
      <button onClick={onClick} className="flex items-start gap-2 min-w-0 w-full text-left">
        <span className={cn('mt-[5px] shrink-0',
          verdict === 'approved'          ? 'dot green' :
          verdict === 'changes_requested' ? 'dot amber' :
          primarySession?.status === 'error' ? 'dot red' :
          'dot amber'
        )} />
        <p className="flex-1 text-sm font-medium text-foreground leading-snug truncate">{root.title}</p>
        <SizeChip size={root.size} />
      </button>

      <div className="flex items-center justify-between">
        <AvatarGroup size={34}>
          {involvedAgents.map(a => <AgentAvatar key={a.id} agent={a} size={34} />)}
        </AvatarGroup>
        <span className="text-xs text-muted-foreground">
          {verdict === 'approved'          ? 'Approved'         :
           verdict === 'changes_requested' ? 'Changes needed'   :
           verdict === 'pending'           ? 'Reviewing…'       :
           primarySession?.status === 'error' ? 'Error'         :
           reviewPending                   ? `${workSessions.length} ready` :
           'Ready to review'}
        </span>
      </div>

      {primarySession && (
        <div className="flex items-center gap-2 flex-wrap justify-end" onClick={e => e.stopPropagation()}>
          {!verdict && verdict !== 'pending' && (
            <ReviewerDropdown
              excludeAgentId={primarySession.agentId}
              onPick={(agentId) => onRequestReview(primarySession.id, agentId)}
            />
          )}
          {(primarySession.status === 'done' || primarySession.status === 'error') && (
            <>
              <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => onDiscard(primarySession.id)} disabled={isMerging}>
                Discard
              </Button>
              {project?.workspaceMode === 'workspace' ? (
                <Button size="sm" variant="primary" onClick={() => onMerge(primarySession.id)} disabled={isMerging}>
                  {isMerging ? '…' : 'Complete ✓'}
                </Button>
              ) : project?.remoteUrl ? (
                <>
                  <Button size="sm" variant="outline" onClick={() => onMerge(primarySession.id)} disabled={isMerging}>
                    {isMerging ? '…' : primarySession.status === 'error' ? 'Accept anyway' : 'Accept'}
                  </Button>
                  <Button size="sm" variant="primary" onClick={() => onMergePush(primarySession.id)} disabled={isMerging}>
                    <Upload size={12} />{isMerging ? '…' : 'Push'}
                  </Button>
                </>
              ) : (
                <Button size="sm" variant="primary" onClick={() => onMerge(primarySession.id)} disabled={isMerging}>
                  {isMerging ? '…' : primarySession.status === 'error' ? 'Accept anyway' : 'Accept ✓'}
                </Button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function ReviewerDropdown({ excludeAgentId, onPick }: {
  excludeAgentId: string
  onPick: (agentId: string) => void
}) {
  const { data: agentList = [] } = useQuery({ queryKey: ['agents'], queryFn: () => agents.list() })
  const eligible = agentList.filter(a => a.id !== excludeAgentId)
  if (eligible.length === 0) return null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline" onClick={e => e.stopPropagation()}>Request Review</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {eligible.map(a => (
          <DropdownMenuItem key={a.id} onSelect={() => onPick(a.id)} className="flex items-center gap-2">
            <AgentAvatar agent={a} size={20} animated={false} />
            {a.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function ProjectDetailPage() {
  const { id: projectId } = useParams<{ id: string }>()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { search, pathname } = useLocation()
  const [showNew, setShowNew] = useState(false)

  useEffect(() => {
    if (new URLSearchParams(search).get('new') === '1') {
      setShowNew(true)
      navigate(pathname, { replace: true })
    }
  }, [search]) // eslint-disable-line react-hooks/exhaustive-deps

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const toggleSection = useCallback((id: string) => {
    setCollapsed(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }, [])

  const { data: taskList       = [] } = useQuery({ queryKey: ['tasks',    projectId], queryFn: () => tasks.list({ projectId }),    refetchInterval: 4000 })
  const { data: agentList      = [] } = useQuery({ queryKey: ['agents'],              queryFn: () => agents.list() })
  const { data: sessionList    = [] } = useQuery({ queryKey: ['sessions', projectId], queryFn: () => sessions.list({ projectId }), refetchInterval: 4000 })
  const { data: projectList    = [] } = useQuery({ queryKey: ['projects'],             queryFn: () => projects.list() })
  const { data: connectionList = [] } = useQuery({ queryKey: ['connections'],          queryFn: () => connections.list(), refetchInterval: 10000 })

  const project = projectList.find(p => p.id === projectId)

  const campaigns = buildCampaigns(taskList)
  // Pre-compute stages once to avoid redundant calls; 'done' campaigns are excluded from the board
  const campaignStages = new Map(campaigns.map(c => [c.root.id, campaignStage(c, sessionList)]))
  const queued  = campaigns.filter(c => campaignStages.get(c.root.id) === 'queued')
  const working = campaigns.filter(c => campaignStages.get(c.root.id) === 'working')
  const review  = campaigns.filter(c => campaignStages.get(c.root.id) === 'review')

  const quotaConnIds = new Set(connectionList.filter(c => c.quotaStatus === 'exceeded').map(c => c.id))
  const busyIds = new Set(
    sessionList.filter(s => s.status === 'running' || s.status === 'idle').map(s => s.agentId)
  )
  const idleAgents = agentList.filter(a => !busyIds.has(a.id) && !quotaConnIds.has(a.connectionId ?? ''))

  const runQueue     = useMutation({ mutationFn: () => tasks.runQueue(), onSuccess: () => { qc.invalidateQueries({ queryKey: ['tasks', projectId] }); qc.invalidateQueries({ queryKey: ['sessions', projectId] }) } })
  const deleteTask   = useMutation({ mutationFn: (id: string) => tasks.delete(id), onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks', projectId] }) })
  const assignTask   = useMutation({
    mutationFn: ({ taskId, agentId }: { taskId: string; agentId: string }) => tasks.assign(taskId, agentId),
    onSuccess: (_data, { taskId }) => {
      qc.invalidateQueries({ queryKey: ['tasks', projectId] })
      qc.invalidateQueries({ queryKey: ['sessions', projectId] })
      navigate(`/projects/${projectId}/tasks/${taskId}`)
    },
  })
  const mergeSession = useMutation({
    mutationFn: (id: string) => sessions.merge(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sessions', projectId] }); qc.invalidateQueries({ queryKey: ['tasks', projectId] }) },
  })
  const mergePushSession = useMutation({
    mutationFn: async (id: string) => { await sessions.merge(id); await projects.push(projectId!) },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sessions', projectId] }); qc.invalidateQueries({ queryKey: ['tasks', projectId] }) },
  })
  const requestReview = useMutation({
    mutationFn: ({ sessionId, agentId }: { sessionId: string; agentId: string }) => sessions.requestReview(sessionId, agentId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sessions', projectId] }),
  })
  const discardSession = useMutation({
    mutationFn: (id: string) => sessions.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sessions', projectId] }); qc.invalidateQueries({ queryKey: ['tasks', projectId] }) },
  })

  // WebSocket
  const invalidateRef = useRef<() => void>(() => {})
  invalidateRef.current = () => {
    qc.invalidateQueries({ queryKey: ['sessions', projectId] })
    qc.invalidateQueries({ queryKey: ['tasks', projectId] })
  }
  const wsRef = useRef<WebSocket | null>(null)
  const subscribedRef = useRef(new Set<string>())
  const activeIds = sessionList.filter(s => s.status === 'running' || s.status === 'waiting' || s.status === 'idle').map(s => s.id)
  const activeIdsRef = useRef<string[]>([])
  activeIdsRef.current = activeIds

  useEffect(() => {
    let dead = false, delay = 2000
    function connect() {
      if (dead) return
      const token = localStorage.getItem('token')
      if (!token) return
      const proto = location.protocol === 'https:' ? 'wss' : 'ws'
      const ws = new WebSocket(`${proto}://${location.host}/ws?token=${token}`)
      wsRef.current = ws; subscribedRef.current = new Set()
      ws.onopen  = () => { delay = 2000; for (const id of activeIdsRef.current) { ws.send(JSON.stringify({ type: 'subscribe', sessionId: id })); subscribedRef.current.add(id) } }
      ws.onmessage = e => { try { if (JSON.parse(e.data).type === 'done') invalidateRef.current() } catch {} }
      ws.onclose = () => { if (!dead) { setTimeout(connect, delay); delay = Math.min(delay * 2, 30_000) } }
      ws.onerror = () => ws.close()
    }
    connect()
    return () => { dead = true; wsRef.current?.close(); wsRef.current = null }
  }, [projectId])

  const runningKey = activeIds.join(',')
  useEffect(() => {
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    for (const id of activeIdsRef.current) {
      if (!subscribedRef.current.has(id)) { ws.send(JSON.stringify({ type: 'subscribe', sessionId: id })); subscribedRef.current.add(id) }
    }
  }, [runningKey]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.metaKey || e.ctrlKey) return
      if (e.key === 'n' && !showNew && agentList.length > 0) { e.preventDefault(); setShowNew(true) }
      if (e.key === 'r' && queued.length > 0 && idleAgents.length > 0 && !runQueue.isPending) { e.preventDefault(); runQueue.mutate() }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [showNew, queued.length, idleAgents.length, agentList.length, runQueue.isPending])

  const isMerging = mergeSession.isPending || mergePushSession.isPending || discardSession.isPending

  function taskPageFor(c: Campaign) {
    return `/projects/${projectId}/tasks/${c.root.id}`
  }

  const cols = [
    {
      key: 'queue', label: 'Queue', count: queued.length,
      empty: { title: 'Queue is clear', desc: 'Add a task when there is work to hand off.' },
      extra: <button className="ml-auto text-xs font-medium text-muted-foreground hover:text-primary transition-colors" onClick={() => setShowNew(true)}>+ Add</button>,
      cards: queued.map(c => (
        <QueueCard key={c.root.id} campaign={c} idleAgents={idleAgents}
          onAssign={(taskId, agentId) => assignTask.mutate({ taskId, agentId })}
          onDelete={id => deleteTask.mutate(id)} />
      )),
    },
    {
      key: 'running', label: 'Working', count: working.length,
      empty: { title: 'No one working', desc: 'Dispatch the queue when an agent is free.' },
      extra: null,
      cards: working.map(c => (
        <WorkingCard key={c.root.id} campaign={c}
          involvedAgents={campaignAgents(c, sessionList, agentList)}
          sessionList={sessionList}
          onClick={() => navigate(taskPageFor(c))} />
      )),
    },
    {
      key: 'review', label: 'Review', count: review.length,
      empty: { title: 'Nothing to review', desc: 'Finished tasks will land here.' },
      extra: null,
      cards: review.map(c => (
        <ReviewCard key={c.root.id} campaign={c}
          involvedAgents={campaignAgents(c, sessionList, agentList)}
          sessionList={sessionList}
          project={project}
          isMerging={isMerging}
          onMerge={id => mergeSession.mutate(id)}
          onMergePush={id => mergePushSession.mutate(id)}
          onRequestReview={(sid, agentId) => requestReview.mutate({ sessionId: sid, agentId })}
          onDiscard={id => discardSession.mutate(id)}
          onClick={() => navigate(taskPageFor(c))} />
      )),
    },
  ]

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-[1180px] mx-auto px-6 pt-8 pb-10">

        {(working.length > 0 || queued.length > 0) && (
          <div className="flex items-center gap-4 mb-6">
            {working.length > 0 && <span className="stat green"><span className="dot green pulse" />{working.length} working</span>}
            {review.length  > 0 && <span className="stat amber">{review.length} in review</span>}
            {queued.length  > 0 && <span className="text-xs text-muted-foreground">{queued.length} queued</span>}
            <div className="flex-1" />
            {queued.length > 0 && idleAgents.length > 0 && (
              <Button size="sm" variant="primary" onClick={() => runQueue.mutate()} disabled={runQueue.isPending}>
                {runQueue.isPending ? '…' : 'Run queue'}
              </Button>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-start">
          {cols.map(({ key, label, count, empty, extra, cards }) => (
            <div key={key} className="flex flex-col gap-3">
              <div className="flex items-center gap-2 px-1">
                <button className="flex items-center gap-1.5 text-left" onClick={() => toggleSection(key)}>
                  <svg width="12" height="12" viewBox="0 0 12 12" className={cn('text-muted-foreground transition-transform shrink-0', !collapsed.has(key) && 'rotate-90')}>
                    <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</h2>
                  {count > 0 && <span className="font-mono text-[10px] text-muted-foreground bg-muted/60 border border-border/50 rounded px-1.5">{count}</span>}
                </button>
                {extra}
              </div>
              {!collapsed.has(key) && (
                cards.length === 0
                  ? (
                    <Empty className="border border-dashed border-border/60 bg-card/20 py-8">
                      <EmptyHeader>
                        <EmptyTitle>{empty.title}</EmptyTitle>
                        <EmptyDescription>{empty.desc}</EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  )
                  : <div className="flex flex-col gap-2">{cards}</div>
              )}
            </div>
          ))}
        </div>

        {(mergeSession.isError || mergePushSession.isError || assignTask.isError) && (
          <div className="mt-4 flex items-center gap-3 px-4 py-2.5 rounded-lg border border-destructive/30 bg-destructive/5">
            <span className="text-sm text-destructive flex-1">
              {(mergeSession.error ?? mergePushSession.error ?? assignTask.error)?.message}
            </span>
            <Button size="sm" variant="ghost" className="text-muted-foreground"
              onClick={() => { mergeSession.reset(); mergePushSession.reset(); assignTask.reset() }}>Dismiss</Button>
          </div>
        )}
      </div>

      {showNew && projectId && (
        <NewTaskDialog
          projectId={projectId}
          idleAgents={idleAgents}
          onClose={() => setShowNew(false)}
          onDone={() => {
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

const SIZES: { value: TaskSize; label: string; desc: string }[] = [
  { value: 'xs', label: 'XS', desc: '<30m' },
  { value: 's',  label: 'S',  desc: '~1h'  },
  { value: 'm',  label: 'M',  desc: '~2h'  },
  { value: 'l',  label: 'L',  desc: '~4h'  },
  { value: 'xl', label: 'XL', desc: '1d+'  },
]

function NewTaskDialog({ projectId, idleAgents, onClose, onDone }: {
  projectId: string; idleAgents: Agent[]; onClose: () => void; onDone: () => void
}) {
  const [title, setTitle]          = useState('')
  const [prompt, setPrompt]        = useState('')
  const [size, setSize]            = useState<TaskSize>('m')
  const [pendingFiles, setPending] = useState<File[]>([])
  const [loading, setLoading]      = useState(false)
  const isValid = title.trim().length > 2

  function addFiles(incoming: File[]) {
    setPending(prev => {
      const names = new Set(prev.map(f => f.name))
      return [...prev, ...incoming.filter(f => !names.has(f.name))]
    })
  }

  async function submit(andRun: boolean) {
    if (!isValid || loading) return
    setLoading(true)
    try {
      const task = await tasks.create({ projectId, title: title.trim(), prompt, size })
      if (pendingFiles.length > 0) await tasks.uploadFiles(task.id, pendingFiles).catch(() => {})
      if (andRun && idleAgents.length > 0) await tasks.assign(task.id, idleAgents[0].id).catch(() => {})
      onDone()
    } finally { setLoading(false) }
  }

  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>New task</DialogTitle></DialogHeader>
        <div className="flex flex-col gap-4">
          <Field>
            <FieldLabel>Title</FieldLabel>
            <Input autoFocus value={title} onChange={e => setTitle(e.target.value)}
              placeholder="What should the agent do?"
              onKeyDown={e => { if (e.key === 'Enter' && isValid) void submit(false) }} />
          </Field>
          <Field>
            <FieldLabel>Prompt <span className="font-normal text-muted-foreground">(optional)</span></FieldLabel>
            <Textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={3}
              placeholder="Additional context, requirements, or constraints…" />
          </Field>
          <Field>
            <FieldLabel>Size</FieldLabel>
            <ButtonGroup className="flex-wrap gap-1">
              {SIZES.map(s => (
                <Button key={s.value} size="sm" variant={size === s.value ? 'primary' : 'ghost'}
                  onClick={() => setSize(s.value)}
                  className="flex-col gap-0 min-w-[36px] px-2 py-1.5 h-auto">
                  <span className="text-xs font-semibold">{s.label}</span>
                  <span className="text-[9px] opacity-70">{s.desc}</span>
                </Button>
              ))}
            </ButtonGroup>
          </Field>
          <Field>
            <FileDropzone files={pendingFiles.map(f => f.name)} onAdd={addFiles}
              onRemove={name => setPending(prev => prev.filter(f => f.name !== name))} disabled={loading} />
          </Field>
          <div className="flex gap-2 pt-1">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            {idleAgents.length > 0 ? (
              <>
                <Button className="justify-center" disabled={!isValid || loading} title="Save to queue — assign to an agent later" onClick={() => void submit(false)}>
                  {loading ? <Spinner /> : 'Queue'}
                </Button>
                <Button variant="primary" className="flex-1 justify-center" disabled={!isValid || loading} title="Assign to an available agent now" onClick={() => void submit(true)}>
                  {loading ? <Spinner /> : 'Dispatch'}
                </Button>
              </>
            ) : (
              <Button variant="primary" className="flex-1 justify-center" disabled={!isValid || loading} title="No agents free — task will run when one becomes available" onClick={() => void submit(false)}>
                {loading ? <Spinner /> : 'Add to queue'}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
