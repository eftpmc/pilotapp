import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { sessions, tasks, agents, projects, events } from '../api/client'
import type { Task, Session, Agent, CompanyEvent } from '../api/client'
import { AgentAvatar } from '@/components/AgentAvatar'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from '@/components/ui/item'
import { useElapsed, fmtSecs, timeAgo } from '@/lib/time'
import { cn } from '@/lib/utils'

const EVENT_VERB: Record<string, [string, string]> = {
  'session.completed': ['finished',  'text-[var(--green)]'],
  'session.failed':    ['failed',    'text-destructive'],
  'session.merged':    ['accepted',  'text-primary'],
}

function ElapsedTimer({ createdAt }: { createdAt: string }) {
  const secs = useElapsed(createdAt, true)
  return <span className="text-xs font-mono text-[var(--green)] tabular-nums shrink-0">{fmtSecs(secs)}</span>
}

// ---------------------------------------------------------------------------
// Task item — used for both running and review sections
// ---------------------------------------------------------------------------

function TaskItem({
  task, taskSessions, agentList, projectName, running, onClick,
}: {
  task: Task
  taskSessions: Session[]
  agentList: Agent[]
  projectName: string
  running?: boolean
  onClick: () => void
}) {
  const workSessions = taskSessions.filter(s => !s.parentSessionId)
  const agents = workSessions.reduce<Agent[]>((acc, s) => {
    const a = agentList.find(ag => ag.id === s.agentId)
    if (a && !acc.find(x => x.id === a.id)) acc.push(a)
    return acc
  }, [])
  const hasError = workSessions.some(s => s.status === 'error')
  const activeSession = workSessions.find(s => s.status === 'running' || s.status === 'idle' || s.status === 'waiting')
    ?? workSessions.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]

  return (
    <Item
      asChild
      variant="outline"
      className={cn(
        'w-full bg-card/70 transition-all hover:-translate-y-0.5 hover:bg-card',
        hasError && !running && 'outline outline-1 outline-destructive/20'
      )}
    >
      <button onClick={onClick}>
        <ItemMedia>
          {running && <span className="dot green pulse shrink-0" />}
          <div className="flex -space-x-1.5">
            {agents.slice(0, 3).map(a => (
              <div key={a.id} className="rounded-full ring-2 ring-card">
                <AgentAvatar agent={a} size={running ? 32 : 34} running={running} />
              </div>
            ))}
          </div>
        </ItemMedia>
        <ItemContent className="items-start">
          <ItemTitle className="max-w-full truncate">{task.title}</ItemTitle>
          <ItemDescription className="w-full text-left text-xs">
            {agents.map(a => a.name).join(', ')} · {projectName}
          </ItemDescription>
        </ItemContent>
        <ItemActions>
          {running && activeSession && <ElapsedTimer createdAt={activeSession.createdAt} />}
          {!running && hasError && <span className="text-xs text-destructive/70 shrink-0">error</span>}
        </ItemActions>
      </button>
    </Item>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function OverviewPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()

  useEffect(() => {
    let ws: WebSocket | null = null
    let dead = false
    let delay = 1000
    function connect() {
      if (dead) return
      const token = localStorage.getItem('token')
      if (!token) return
      const proto = location.protocol === 'https:' ? 'wss' : 'ws'
      ws = new WebSocket(`${proto}://${location.host}/ws?token=${token}`)
      ws.onopen = () => { delay = 1000; ws!.send(JSON.stringify({ type: 'subscribe-global' })) }
      ws.onmessage = (e) => {
        try {
          if (JSON.parse(e.data).type === 'global-event') {
            qc.invalidateQueries({ queryKey: ['sessions'] })
            qc.invalidateQueries({ queryKey: ['tasks'] })
            qc.invalidateQueries({ queryKey: ['events'] })
          }
        } catch {}
      }
      ws.onclose = () => { if (!dead) { setTimeout(connect, delay); delay = Math.min(delay * 2, 30_000) } }
      ws.onerror  = () => ws?.close()
    }
    connect()
    return () => { dead = true; ws?.close() }
  }, [qc])

  const { data: sessionList = [] } = useQuery({ queryKey: ['sessions'],  queryFn: () => sessions.list(),  refetchInterval: 30_000 })
  const { data: taskList    = [] } = useQuery({ queryKey: ['tasks'],     queryFn: () => tasks.list(),     refetchInterval: 30_000 })
  const { data: agentList   = [] } = useQuery({ queryKey: ['agents'],    queryFn: () => agents.list() })
  const { data: projectList = [] } = useQuery({ queryKey: ['projects'],  queryFn: () => projects.list() })
  const { data: eventList   = [] } = useQuery({ queryKey: ['events'],    queryFn: () => events.list(30),  refetchInterval: 30_000 })

  function projectName(id: string) { return projectList.find(p => p.id === id)?.name ?? 'Unknown' }

  // Build task → sessions map (work sessions only, not spec)
  const sessionsByTask = new Map<string, Session[]>()
  for (const s of sessionList) {
    if (!s.specId && s.workTaskId) {
      const arr = sessionsByTask.get(s.workTaskId) ?? []
      arr.push(s)
      sessionsByTask.set(s.workTaskId, arr)
    }
  }

  // Map: parentTaskId → subtasks (for campaign grouping)
  const subtasksByParent = new Map<string, Task[]>()
  for (const t of taskList) {
    if (t.parentTaskId) {
      const arr = subtasksByParent.get(t.parentTaskId) ?? []
      arr.push(t)
      subtasksByParent.set(t.parentTaskId, arr)
    }
  }

  // Gather ALL sessions for a root task (root + campaign subtasks)
  function allCampaignSessions(root: Task): Session[] {
    const subtasks = subtasksByParent.get(root.id) ?? []
    const allTaskIds = [root.id, ...subtasks.map(t => t.id)]
    return allTaskIds.flatMap(tid => sessionsByTask.get(tid) ?? [])
  }

  // Root tasks only — tasks with no parentTaskId that have been started
  const rootTasks = taskList.filter(t => !t.parentTaskId && t.status !== 'pending')

  // Running: root task where any campaign session is active
  const runningTasks = rootTasks.filter(t =>
    allCampaignSessions(t).some(s => s.status === 'running' || s.status === 'waiting' || s.status === 'idle')
  )
  const runningRootIds = new Set(runningTasks.map(t => t.id))

  // Review: root task where a work session (non-review) is done/error and nothing is still running
  const reviewTasks = rootTasks.filter(t => {
    if (runningRootIds.has(t.id)) return false
    const workSessions = allCampaignSessions(t).filter(s => !s.parentSessionId)
    return workSessions.some(s => s.status === 'done' || s.status === 'error')
  })

  // Build taskSessionMap for TaskItem (still needed by TaskItem)
  const taskSessionMap = new Map<string, Session[]>()
  for (const t of rootTasks) taskSessionMap.set(t.id, allCampaignSessions(t))

  const queued = taskList.filter(t => !t.parentTaskId && t.status === 'pending')

  // Recent: root tasks that were recently completed/merged, not currently running or in review
  const reviewRootIds = new Set(reviewTasks.map(t => t.id))
  const recentTasks = rootTasks
    .filter(t => !runningRootIds.has(t.id) && !reviewRootIds.has(t.id) && (t.status === 'done' || t.status === 'failed'))
    .sort((a, b) => (b.completedAt ?? b.createdAt).localeCompare(a.completedAt ?? a.createdAt))
    .slice(0, 5)

  const todayCost = sessionList.reduce((sum, s) => {
    if (!s.totalCostUsd) return sum
    const age = Date.now() - new Date(s.createdAt).getTime()
    return age < 86_400_000 ? sum + s.totalCostUsd : sum
  }, 0)

  const parts: string[] = []
  if (runningTasks.length) parts.push(`${runningTasks.length} task${runningTasks.length !== 1 ? 's' : ''} running`)
  if (reviewTasks.length)  parts.push(`${reviewTasks.length} to review`)
  if (queued.length)       parts.push(`${queued.length} queued`)
  if (todayCost > 0)       parts.push(`$${todayCost.toFixed(2)} today`)
  if (!parts.length && recentTasks.length > 0) parts.push(`${recentTasks.length} recent`)
  const subtitle = parts.length ? parts.join(' · ') : 'Nothing running yet.'

  const isEmpty = runningTasks.length === 0 && reviewTasks.length === 0

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-[960px] mx-auto px-6 pt-12 pb-10 flex flex-col gap-10">

        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Today</h1>
            <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
          </div>
        </div>

        {/* Onboarding */}
        {isEmpty && projectList.length === 0 && (
          <section className="flex flex-col gap-2">
            <p className="text-xs font-semibold text-[var(--muted)] mb-2">Get started</p>
            <ItemGroup className="gap-3">
              {[
                { n: '1', label: 'Add a project',  desc: 'Connect a GitHub repo or local path.', path: '/projects' },
                { n: '2', label: 'Add agents',      desc: 'Configure API keys and create named agents.', path: '/agents' },
                { n: '3', label: 'Dispatch work',   desc: 'Open a project, create tasks, assign to agents.', path: '/projects' },
              ].map(({ n, label, desc, path }) => (
                <Item key={n} asChild variant="outline" className="w-full bg-card/70 transition-all hover:-translate-y-0.5 hover:bg-card">
                  <button onClick={() => navigate(path)}>
                    <ItemMedia>
                      <span className="grid size-5 place-items-center rounded-md bg-primary/10 text-[11px] font-bold text-primary">{n}</span>
                    </ItemMedia>
                    <ItemContent>
                      <ItemTitle>{label}</ItemTitle>
                      <ItemDescription className="w-full text-left text-xs">{desc}</ItemDescription>
                    </ItemContent>
                  </button>
                </Item>
              ))}
            </ItemGroup>
          </section>
        )}

        {/* Needs review */}
        {reviewTasks.length > 0 && (
          <section>
            <p className="text-xs font-semibold text-[var(--muted)] mb-3">Needs review</p>
            <ItemGroup className="gap-3">
              {reviewTasks.map(task => (
                <TaskItem
                  key={task.id}
                  task={task}
                  taskSessions={taskSessionMap.get(task.id) ?? []}
                  agentList={agentList}
                  projectName={projectName(task.projectId)}
                  onClick={() => navigate(`/projects/${task.projectId}/tasks/${task.id}`)}
                />
              ))}
            </ItemGroup>
          </section>
        )}

        {/* In progress */}
        {runningTasks.length > 0 && (
          <section>
            <p className="text-xs font-semibold text-[var(--muted)] mb-3">In progress</p>
            <ItemGroup className="gap-3">
              {runningTasks.map(task => (
                <TaskItem
                  key={task.id}
                  task={task}
                  taskSessions={taskSessionMap.get(task.id) ?? []}
                  agentList={agentList}
                  projectName={projectName(task.projectId)}
                  running
                  onClick={() => navigate(`/projects/${task.projectId}/tasks/${task.id}`)}
                />
              ))}
            </ItemGroup>
          </section>
        )}

        {/* Recent work */}
        {isEmpty && recentTasks.length > 0 && (
          <section>
            <p className="text-xs font-semibold text-[var(--muted)] mb-3">Recent work</p>
            <ItemGroup className="gap-3">
              {recentTasks.map(task => (
                <TaskItem
                  key={task.id}
                  task={task}
                  taskSessions={taskSessionMap.get(task.id) ?? []}
                  agentList={agentList}
                  projectName={projectName(task.projectId)}
                  onClick={() => navigate(`/projects/${task.projectId}/tasks/${task.id}`)}
                />
              ))}
            </ItemGroup>
          </section>
        )}

        {/* Activity feed — one entry per task, significant events only */}
        {(() => {
          // Only show task-linked events — spec/review sessions have no taskId and are noise
          const significant = (eventList as CompanyEvent[]).filter(ev => ev.type in EVENT_VERB && (ev.taskId || ev.data.taskTitle))
          // Deduplicate: one entry per taskId (most recent), fall back to sessionId for no-task events
          const seen = new Set<string>()
          const deduped = significant.filter(ev => {
            const key = ev.taskId ?? ev.sessionId ?? ev.id
            if (seen.has(key)) return false
            seen.add(key)
            return true
          }).slice(0, 10)

          if (!deduped.length) return null
          return (
            <section>
              <p className="text-xs font-semibold text-[var(--muted)] mb-3">Recent activity</p>
              <ItemGroup className="gap-1">
                {deduped.map(ev => {
                  const name = ev.data.employeeName ?? ''
                  const title = ev.taskId ? (taskList.find(t => t.id === ev.taskId)?.title ?? ev.data.taskTitle ?? '') : ''
                  const [verb, colorClass] = EVENT_VERB[ev.type]!
                  return (
                    <Item key={ev.id} asChild size="sm" className="hover:bg-muted/40">
                      <button
                        onClick={() => {
                          if (ev.taskId && ev.projectId) navigate(`/projects/${ev.projectId}/tasks/${ev.taskId}`)
                          else if (ev.sessionId) navigate(`/sessions/${ev.sessionId}`)
                        }}
                        disabled={!ev.taskId && !ev.sessionId}
                      >
                        <span className="w-[52px] shrink-0 text-xs font-semibold truncate text-foreground">{name || '-'}</span>
                        <span className={cn('w-[60px] shrink-0 text-xs', colorClass)}>{verb}</span>
                        <ItemContent className="min-w-0">
                          <ItemDescription className="truncate text-xs">{title}</ItemDescription>
                        </ItemContent>
                        <ItemActions>
                          <span className="text-xs text-muted-foreground/40 shrink-0 tabular-nums">{timeAgo(ev.createdAt)}</span>
                        </ItemActions>
                      </button>
                    </Item>
                  )
                })}
              </ItemGroup>
            </section>
          )
        })()}

        {isEmpty && recentTasks.length === 0 && projectList.length > 0 && (
          <Empty className="border border-dashed border-border/70 bg-card/30">
            <EmptyHeader>
              <EmptyTitle>Quiet today</EmptyTitle>
              <EmptyDescription>Queued, running, and reviewed work will show up here.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}

      </div>
    </div>
  )
}
