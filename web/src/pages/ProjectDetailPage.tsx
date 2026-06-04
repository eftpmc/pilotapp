import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { tasks, agents, sessions, projects, connections } from '../api/client'
import type { Task, Agent, Session, TaskSize } from '../api/client'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { AgentAvatar } from '@/components/AgentAvatar'
import { useElapsed, fmtSecs } from '@/lib/time'
import { Upload } from 'lucide-react'

function CaretIcon() {
  return <svg className="caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6"/></svg>
}

function ElapsedTimer({ createdAt }: { createdAt: string }) {
  const secs = useElapsed(createdAt, true)
  return <span className="row-time tnum">{fmtSecs(secs)}</span>
}

function AgentPickerDropdown({ agentList, onAssign }: { agentList: Agent[]; onAssign: (id: string) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="primary" onClick={e => e.stopPropagation()}>Assign</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {agentList.map(a => (
          <DropdownMenuItem key={a.id} onSelect={() => onAssign(a.id)} className="flex items-center gap-2">
            <AgentAvatar agent={a} size={22} />
            {a.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

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
  const { data: agentList      = [] } = useQuery({ queryKey: ['agents'],            queryFn: () => agents.list() })
  const { data: sessionList    = [] } = useQuery({ queryKey: ['sessions', projectId], queryFn: () => sessions.list({ projectId }), refetchInterval: 4000 })
  const { data: projectList    = [] } = useQuery({ queryKey: ['projects'],             queryFn: () => projects.list() })
  const { data: connectionList = [] } = useQuery({ queryKey: ['connections'],               queryFn: () => connections.list() })

  const project   = projectList.find(p => p.id === projectId)

  const codeSessions  = sessionList.filter(s => !s.specId && !s.parentSessionId)
  const busyIds       = new Set(codeSessions.filter(s => s.status === 'running' || s.status === 'idle').map(s => s.agentId))
  const quotaConnIds  = new Set(connectionList.filter(c => c.quotaStatus === 'exceeded').map(c => c.id))
  const idleAgents    = agentList.filter(a => !busyIds.has(a.id) && !quotaConnIds.has(a.connectionId ?? ''))
  const queue         = taskList.filter(t => t.status === 'pending').sort((a, b) => {
    const pd = (b.priority ?? 0) - (a.priority ?? 0)
    return pd !== 0 ? pd : a.createdAt.localeCompare(b.createdAt)
  })
  const working       = codeSessions.filter(s => s.status === 'running' || s.status === 'idle')
  const review        = codeSessions.filter(s => s.status === 'done' || s.status === 'error')

  const runQueue     = useMutation({ mutationFn: () => tasks.runQueue(), onSuccess: () => { qc.invalidateQueries({ queryKey: ['tasks', projectId] }); qc.invalidateQueries({ queryKey: ['sessions', projectId] }) } })
  const deleteTask   = useMutation({ mutationFn: (id: string) => tasks.delete(id), onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks', projectId] }) })
  const assignTask   = useMutation({
    mutationFn: ({ taskId, agentId }: { taskId: string; agentId: string }) => tasks.assign(taskId, agentId),
    onSuccess: ({ session }) => { qc.invalidateQueries({ queryKey: ['tasks', projectId] }); qc.invalidateQueries({ queryKey: ['sessions', projectId] }); navigate(`/sessions/${session.id}`) },
  })
  const mergeSession = useMutation({
    mutationFn: (id: string) => sessions.merge(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sessions', projectId] }),
  })
  const mergePushSession = useMutation({
    mutationFn: async (id: string) => { await sessions.merge(id); await projects.push(projectId!) },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sessions', projectId] }),
  })
  const requestReview = useMutation({
    mutationFn: ({ sessionId, agentId }: { sessionId: string; agentId: string }) => sessions.requestReview(sessionId, agentId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sessions', projectId] }),
  })

  // WebSocket
  const invalidateRef = useRef<() => void>(() => {})
  invalidateRef.current = () => { qc.invalidateQueries({ queryKey: ['sessions', projectId] }); qc.invalidateQueries({ queryKey: ['tasks', projectId] }) }
  const wsRef = useRef<WebSocket | null>(null)
  const subscribedRef = useRef(new Set<string>())
  const currentIdsRef = useRef<string[]>([])
  currentIdsRef.current = working.map(s => s.id)

  useEffect(() => {
    let dead = false, delay = 2000
    function connect() {
      if (dead) return
      const token = localStorage.getItem('token')
      if (!token) return
      const proto = location.protocol === 'https:' ? 'wss' : 'ws'
      const ws = new WebSocket(`${proto}://${location.host}/ws?token=${token}`)
      wsRef.current = ws; subscribedRef.current = new Set()
      ws.onopen = () => { delay = 2000; for (const id of currentIdsRef.current) { ws.send(JSON.stringify({ type: 'subscribe', sessionId: id })); subscribedRef.current.add(id) } }
      ws.onmessage = (e) => { try { if (JSON.parse(e.data).type === 'done') invalidateRef.current() } catch {} }
      ws.onclose = () => { if (!dead) { setTimeout(connect, delay); delay = Math.min(delay * 2, 30_000) } }
      ws.onerror = () => ws.close()
    }
    connect()
    return () => { dead = true; wsRef.current?.close(); wsRef.current = null }
  }, [projectId])

  const runningKey = working.map(s => s.id).join(',')
  useEffect(() => {
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    for (const id of currentIdsRef.current) {
      if (!subscribedRef.current.has(id)) { ws.send(JSON.stringify({ type: 'subscribe', sessionId: id })); subscribedRef.current.add(id) }
    }
  }, [runningKey]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.metaKey || e.ctrlKey) return
      if (e.key === 'n' && !showNew && agentList.length > 0) { e.preventDefault(); setShowNew(true) }
      if (e.key === 'r' && queue.length > 0 && idleAgents.length > 0 && !runQueue.isPending) { e.preventDefault(); runQueue.mutate() }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [showNew, queue.length, idleAgents.length, agentList.length, runQueue.isPending])

  function agentFor(s: Session) { return agentList.find(a => a.id === s.agentId) }
  function taskFor(s: Session)  { return taskList.find(t => t.id === s.workTaskId) }

  const verdictChip = (s: Session) => {
    if (s.reviewVerdict === 'approved')         return <span className="stat green"><span className="dot green" />Approved</span>
    if (s.reviewVerdict === 'changes_requested') return <span className="stat amber"><span className="dot amber" />Changes needed</span>
    if (s.reviewVerdict === 'pending')           return <span className="stat" style={{ color: 'var(--muted)' }}><span className="dot idle" />Reviewing…</span>
    if (s.status === 'error')                    return <span className="stat red"><span className="dot red" />Error</span>
    return <span className="stat amber"><span className="dot amber" />Ready to review</span>
  }

  const showBoardSummary = working.length > 0 || queue.length > 0

  return (
    <div className="flex-1 overflow-y-auto bg-background">
      <div className="px-6 pt-6 pb-8">

        {showBoardSummary && (
          <div className="flex items-center gap-4 mb-6">
            {working.length > 0 && <span className="stat green"><span className="dot green pulse" />{working.length} working</span>}
            {review.length  > 0 && <span className="stat amber">{review.length} in review</span>}
            {queue.length   > 0 && <span className="text-xs text-muted-foreground">{queue.length} queued</span>}
            <div className="flex-1" />
            {queue.length > 0 && idleAgents.length > 0 && (
              <Button size="sm" variant="primary" onClick={() => runQueue.mutate()} disabled={runQueue.isPending}>
                {runQueue.isPending ? '…' : 'Run queue'}
              </Button>
            )}
          </div>
        )}

        <div className="board-grid">
        {/* Queue */}
        <div className={`section board-queue${collapsed.has('queue') ? ' collapsed' : ''}`}>
          <div className="section-head">
            <button className="toggle" onClick={() => toggleSection('queue')}><CaretIcon /><h2>Queue</h2>{queue.length > 0 && <span className="count">{queue.length}</span>}</button>
            <button className="board-add" onClick={() => setShowNew(true)}>
              + Add
            </button>
          </div>
          {queue.length === 0 ? (
            <p className="empty-line" style={{ color: 'var(--muted)' }}>Queue is empty — add a task to get started.</p>
          ) : (
            <div className="rows">
              {queue.map((task: Task) => (
                <div key={task.id} className="row" style={{ cursor: 'default' }}>
                  <span className="dot idle" />
                  <div className="row-main">
                    <div className="row-title">{task.title}</div>
                    {task.prompt && (
                      <div className="row-meta" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {task.prompt}
                      </div>
                    )}
                  </div>
                  {task.size && (
                    <span className="chip mono">{task.size}</span>
                  )}
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    {idleAgents.length > 0
                      ? <AgentPickerDropdown agentList={idleAgents} onAssign={agentId => assignTask.mutate({ taskId: task.id, agentId })} />
                      : <span style={{ fontSize: 12, color: 'var(--faint)' }}>No agents</span>
                    }
                    <Button variant="ghost" size="icon" className="text-muted-foreground/40 hover:text-destructive shrink-0 h-8 w-8"
                      onClick={() => deleteTask.mutate(task.id)}>×</Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Running */}
          <div className={`section board-running${collapsed.has('running') ? ' collapsed' : ''}`}>
            <div className="section-head"><button className="toggle" onClick={() => toggleSection('running')}><CaretIcon /><h2>Working</h2><span className="count">{working.length}</span></button></div>
            {working.length === 0 ? (
              <p className="empty-line">No agents running.</p>
            ) : (
            <div className="rows">
              {working.map(s => {
                const agent = agentFor(s)
                const task  = taskFor(s)
                return (
                  <button key={s.id} className="row" onClick={() => navigate(`/sessions/${s.id}`)}>
                    <span className="dot green pulse" />
                    <AgentAvatar agent={agent} size={26} running />
                    <div className="row-main">
                      <div className="row-title">{task?.title ?? s.branch}</div>
                      <div className="row-meta"><span>{agent?.name ?? '—'}</span></div>
                    </div>
                    {s.status === 'running' && <ElapsedTimer createdAt={s.createdAt} />}
                    <span className="row-hint">↵</span>
                    <svg className="row-go" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
                  </button>
                )
              })}
            </div>
            )}
          </div>

        {/* Waiting for review */}
          <div className={`section board-review${collapsed.has('review') ? ' collapsed' : ''}`}>
            <div className="section-head">
              <button className="toggle" onClick={() => toggleSection('review')}>
                <CaretIcon /><h2>Review</h2><span className="count">{review.length}</span>
              </button>
            </div>
            {review.length === 0 ? (
              <p className="empty-line">Nothing to review.</p>
            ) : (
            <div className="rows accent">
              {review.map(s => {
                const agent = agentFor(s)
                const task  = taskFor(s)
                const isMerging = mergeSession.isPending || mergePushSession.isPending
                const canMerge = s.status === 'done'
                return (
                  <div key={s.id} className="row" style={{ cursor: 'default' }}>
                    <AgentAvatar agent={agent} size={28} />
                    <button className="row-main" style={{ textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: 0, minWidth: 0 }}
                      onClick={() => navigate(`/sessions/${s.id}`)}>
                      <div className="row-title">{task?.title ?? s.branch}</div>
                      <div className="row-meta">
                        <span>{agent?.name ?? '—'}</span>
                        <span className="sep">·</span>
                        {verdictChip(s)}
                      </div>
                    </button>
                    <div className="board-row-actions" onClick={e => e.stopPropagation()}>
                      {s.reviewVerdict !== 'pending' && !s.reviewVerdict && (
                        <ReviewerPickerButton agentList={agentList.filter(a => a.id !== s.agentId)}
                          onPick={agentId => requestReview.mutate({ sessionId: s.id, agentId })} />
                      )}
                      {canMerge && project?.remoteUrl ? (
                        <>
                          <Button size="sm" variant="outline" onClick={() => mergeSession.mutate(s.id)} disabled={isMerging}>
                            {isMerging ? '…' : 'Merge'}
                          </Button>
                          <Button size="sm" variant="primary" onClick={() => mergePushSession.mutate(s.id)} disabled={isMerging}>
                            <Upload size={12} />{isMerging ? '…' : 'Push'}
                          </Button>
                        </>
                      ) : canMerge ? (
                        <Button size="sm" variant="primary" onClick={() => mergeSession.mutate(s.id)} disabled={isMerging}>
                          {isMerging ? '…' : 'Merge ✓'}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                )
              })}
            </div>
            )}
          </div>
        </div>

        {/* Errors */}
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
          hasIdleAgent={idleAgents.length > 0}
          onClose={() => setShowNew(false)}
          onCreate={async body => { await tasks.create(body); qc.invalidateQueries({ queryKey: ['tasks', projectId] }); setShowNew(false) }}
          onCreateAndRun={async body => { await tasks.create(body); await tasks.runQueue(); qc.invalidateQueries({ queryKey: ['tasks', projectId] }); qc.invalidateQueries({ queryKey: ['sessions', projectId] }); setShowNew(false) }}
        />
      )}
    </div>
  )
}

function ReviewerPickerButton({ agentList, onPick }: { agentList: Agent[]; onPick: (id: string) => void }) {
  if (agentList.length === 0) return null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline" onClick={e => e.stopPropagation()}>Request Review</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Pick reviewer</DropdownMenuLabel>
        {agentList.map(a => (
          <DropdownMenuItem key={a.id} onSelect={() => onPick(a.id)} className="flex items-center gap-2">
            <AgentAvatar agent={a} size={20} />
            {a.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

const SIZES: { value: TaskSize; label: string; desc: string }[] = [
  { value: 'xs', label: 'XS', desc: '<30m' },
  { value: 's',  label: 'S',  desc: '~1h'  },
  { value: 'm',  label: 'M',  desc: '~2h'  },
  { value: 'l',  label: 'L',  desc: '~4h'  },
  { value: 'xl', label: 'XL', desc: '1d+'  },
]

function NewTaskDialog({ projectId, hasIdleAgent, onClose, onCreate, onCreateAndRun }: {
  projectId: string; hasIdleAgent: boolean; onClose: () => void
  onCreate: (body: { projectId: string; title: string; prompt: string; baseBranch: string; size: TaskSize }) => Promise<void>
  onCreateAndRun: (body: { projectId: string; title: string; prompt: string; baseBranch: string; size: TaskSize }) => Promise<void>
}) {
  const [title, setTitle]           = useState('')
  const [prompt, setPrompt]         = useState('')
  const [baseBranch, setBranch]     = useState('main')
  const [size, setSize]             = useState<TaskSize>('m')
  const [loading, setLoading]       = useState(false)
  const isValid = title.trim().length > 2

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
          <div className="field">
            <Label>Title</Label>
            <Input autoFocus value={title} onChange={e => setTitle(e.target.value)}
              placeholder="What should the agent do?"
              onKeyDown={e => { if (e.key === 'Enter' && isValid) void submit(onCreate) }} />
          </div>
          <div className="field">
            <Label>Prompt <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <Textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={3}
              placeholder="Additional context, requirements, or constraints…" />
          </div>
          <div className="flex gap-3">
            <div className="field flex-1">
              <Label>Base branch</Label>
              <Input value={baseBranch} onChange={e => setBranch(e.target.value)} className="font-mono text-xs" />
            </div>
            <div className="field">
              <Label>Size</Label>
              <div className="flex gap-1">
                {SIZES.map(s => (
                  <Button key={s.value} size="sm" variant={size === s.value ? 'primary' : 'ghost'}
                    onClick={() => setSize(s.value)}
                    className="flex-col gap-0 min-w-[36px] px-2 py-1.5 h-auto">
                    <span className="text-xs font-semibold">{s.label}</span>
                    <span className="text-[9px] opacity-70">{s.desc}</span>
                  </Button>
                ))}
              </div>
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button className="flex-1 justify-center" disabled={!isValid || loading} onClick={() => void submit(onCreate)}>
              {loading ? '…' : 'Queue'}
            </Button>
            <Button variant="primary" className="flex-1 justify-center" disabled={!isValid || loading || !hasIdleAgent} onClick={() => void submit(onCreateAndRun)}>
              {loading ? '…' : 'Dispatch ↗'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
