import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { sessions, tasks, employees, projects, events, departments } from '../api/client'
import type { CompanyEvent, Employee, Department } from '../api/client'
import { AgentAvatar } from '@/components/AgentAvatar'
import { Badge } from '@/components/ui/badge'
import { fmtSecs, useElapsed } from '@/lib/time'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Live session card
// ---------------------------------------------------------------------------

function LiveCard({ session, employeeName, employeeId, projectName, taskTitle, onClick }: {
  session: { id: string; agentId: string; createdAt: string }
  employeeName: string
  employeeId: string
  projectName: string
  taskTitle?: string
  onClick: () => void
}) {
  const secs = useElapsed(session.createdAt, true)
  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-card border border-green-500/20 rounded-xl px-4 py-3 flex items-center gap-3 hover:-translate-y-0.5 transition-all [box-shadow:var(--shadow-card)] cursor-pointer"
    >
      <AgentAvatar agent={{ id: employeeId, name: employeeName, provider: 'claude', role: 'any', createdAt: '' }} size={28} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground truncate">{taskTitle ?? session.id.slice(0, 8)}</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          <span className="font-medium">{employeeName}</span>
          <span className="mx-1 opacity-40">·</span>
          {projectName}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="font-mono text-[11px] text-green-500 tabular-nums">{fmtSecs(secs)}</span>
        <Badge variant="success" className="gap-1 text-[10px] px-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-[pulse_1.6s_ease-out_infinite]" />
          Live
        </Badge>
      </div>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Review card
// ---------------------------------------------------------------------------

function ReviewCard({ session, employeeName, employeeId, projectName, taskTitle, isError, onClick }: {
  session: { id: string; agentId: string; createdAt: string }
  employeeName: string
  employeeId: string
  projectName: string
  taskTitle?: string
  isError: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left bg-card rounded-xl px-4 py-3 flex items-center gap-3 hover:-translate-y-0.5 transition-all [box-shadow:var(--shadow-card)] cursor-pointer',
        isError ? 'border border-red-500/20' : 'border border-amber-400/20'
      )}
    >
      <AgentAvatar agent={{ id: employeeId, name: employeeName, provider: 'claude', role: 'any', createdAt: '' }} size={28} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground truncate">{taskTitle ?? session.id.slice(0, 8)}</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          <span className="font-medium">{employeeName}</span>
          <span className="mx-1 opacity-40">·</span>
          {projectName}
        </p>
      </div>
      <Badge variant={isError ? 'destructive' : 'warning'} className="shrink-0 text-[10px]">
        {isError ? 'Error' : 'Review'}
      </Badge>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Section header
// ---------------------------------------------------------------------------

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-foreground">{title}</span>
        <span className="font-mono text-xs text-muted-foreground">{count}</span>
      </div>
      {children}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Company visualization
// ---------------------------------------------------------------------------

function EmployeePresence({ emp, activeSessionId, activeTaskTitle, onClick }: {
  emp: Employee; activeSessionId?: string; activeTaskTitle?: string; onClick?: () => void
}) {
  const isActive = !!activeSessionId
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        'flex items-center gap-2 text-left w-full rounded-lg px-2 py-1.5 transition-colors bg-transparent border-none',
        onClick && 'hover:bg-white/5 cursor-pointer',
        !onClick && 'cursor-default'
      )}
    >
      <span className={cn(
        'w-1.5 h-1.5 rounded-full shrink-0',
        isActive ? 'bg-green-500 animate-[pulse_1.6s_ease-out_infinite]' : 'bg-muted-foreground/30'
      )} />
      <span className="text-xs font-medium text-foreground truncate flex-1">{emp.name}</span>
      {isActive && activeTaskTitle ? (
        <span className="text-[10px] text-muted-foreground truncate max-w-[100px] hidden sm:block">{activeTaskTitle}</span>
      ) : (
        <span className="text-[10px] text-muted-foreground/40">idle</span>
      )}
    </button>
  )
}

function DeptCard({ dept, emps, runningMap, taskTitleMap, onEmployeeClick }: {
  dept: Department; emps: Employee[]
  runningMap: Map<string, string>
  taskTitleMap: Map<string, string>
  onEmployeeClick: (sessionId: string) => void
}) {
  return (
    <div className="bg-card rounded-2xl overflow-hidden [box-shadow:var(--shadow-card)]" style={{ borderTop: `2px solid ${dept.color}` }}>
      <div className="px-3 pt-2.5 pb-1.5 flex items-center gap-2">
        <span className="text-xs font-semibold text-foreground">{dept.name}</span>
        <span className="font-mono text-[10px] text-muted-foreground">{emps.length}</span>
        {emps.some(e => runningMap.has(e.id)) && (
          <span className="ml-auto text-[10px] text-green-500 font-medium">{emps.filter(e => runningMap.has(e.id)).length} active</span>
        )}
      </div>
      <div className="px-1 pb-2">
        {emps.map(emp => (
          <EmployeePresence
            key={emp.id} emp={emp}
            activeSessionId={runningMap.get(emp.id)}
            activeTaskTitle={taskTitleMap.get(emp.id)}
            onClick={runningMap.has(emp.id) ? () => onEmployeeClick(runningMap.get(emp.id)!) : undefined}
          />
        ))}
        {emps.length === 0 && <p className="text-[10px] text-muted-foreground/40 px-2 py-1">No employees</p>}
      </div>
    </div>
  )
}

function CompanyGrid({ deptList, employeeList, runningMap, taskTitleMap, onEmployeeClick }: {
  deptList: Department[]; employeeList: Employee[]
  runningMap: Map<string, string>; taskTitleMap: Map<string, string>
  onEmployeeClick: (sessionId: string) => void
}) {
  const unassigned = employeeList.filter(e => !e.departmentId)
  if (deptList.length === 0 && employeeList.length === 0) return null

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3">
        {deptList.map(dept => (
          <DeptCard
            key={dept.id} dept={dept}
            emps={employeeList.filter(e => e.departmentId === dept.id)}
            runningMap={runningMap} taskTitleMap={taskTitleMap}
            onEmployeeClick={onEmployeeClick}
          />
        ))}
        {unassigned.length > 0 && (
          <div className="bg-card rounded-2xl overflow-hidden [box-shadow:var(--shadow-card)] border border-border/40">
            <div className="px-3 pt-2.5 pb-1.5">
              <span className="text-xs font-semibold text-muted-foreground">Unassigned</span>
            </div>
            <div className="px-1 pb-2">
              {unassigned.map(emp => (
                <EmployeePresence
                  key={emp.id} emp={emp}
                  activeSessionId={runningMap.get(emp.id)}
                  activeTaskTitle={taskTitleMap.get(emp.id)}
                  onClick={runningMap.has(emp.id) ? () => onEmployeeClick(runningMap.get(emp.id)!) : undefined}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Activity feed
// ---------------------------------------------------------------------------

const EVENT_LABELS: Record<string, { label: string; cls: string }> = {
  'session.started':   { label: 'started',   cls: 'text-blue-400'           },
  'session.completed': { label: 'completed', cls: 'text-green-500'          },
  'session.failed':    { label: 'failed',    cls: 'text-red-400'            },
  'session.merged':    { label: 'merged',    cls: 'text-purple-400'         },
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1)   return 'just now'
  if (mins < 60)  return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)   return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function ActivityFeed({ eventList, onSessionClick }: { eventList: CompanyEvent[]; onSessionClick: (id: string) => void }) {
  if (eventList.length === 0) return null
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-foreground">Activity</span>
      </div>
      <div className="bg-card rounded-2xl overflow-hidden [box-shadow:var(--shadow-card)]">
        {eventList.map((ev, i) => {
          const meta = EVENT_LABELS[ev.type] ?? { label: ev.type, cls: 'text-muted-foreground' }
          return (
            <button
              key={ev.id}
              onClick={() => ev.sessionId && onSessionClick(ev.sessionId)}
              disabled={!ev.sessionId}
              className={cn(
                'w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors',
                ev.sessionId ? 'hover:bg-muted/40 cursor-pointer' : 'cursor-default',
                i > 0 && 'border-t border-border/40',
                'bg-transparent border-none'
              )}
            >
              <span className="font-medium text-xs text-foreground shrink-0">{ev.data.employeeName ?? '—'}</span>
              <span className={cn('text-xs font-medium shrink-0', meta.cls)}>{meta.label}</span>
              {ev.data.taskTitle && (
                <span className="text-xs text-muted-foreground truncate flex-1">{ev.data.taskTitle}</span>
              )}
              {ev.data.projectName && (
                <span className="text-[11px] text-muted-foreground/60 shrink-0 hidden sm:block">·&nbsp;{ev.data.projectName}</span>
              )}
              <span className="text-[11px] text-muted-foreground/50 shrink-0 font-mono">{timeAgo(ev.createdAt)}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function OverviewPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()

  // WebSocket for instant global event notifications
  useEffect(() => {
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
        ws!.send(JSON.stringify({ type: 'subscribe-global' }))
      }
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data)
          if (msg.type === 'global-event') {
            qc.invalidateQueries({ queryKey: ['sessions'] })
            qc.invalidateQueries({ queryKey: ['tasks'] })
            qc.invalidateQueries({ queryKey: ['events'] })
          }
        } catch {}
      }
      ws.onclose = () => {
        if (!dead) { setTimeout(connect, retryDelay); retryDelay = Math.min(retryDelay * 2, 30_000) }
      }
      ws.onerror = () => ws?.close()
    }
    connect()
    return () => { dead = true; ws?.close() }
  }, [qc])

  const { data: sessionList  = [] } = useQuery({ queryKey: ['sessions'],    queryFn: () => sessions.list(),    refetchInterval: 30_000 })
  const { data: taskList     = [] } = useQuery({ queryKey: ['tasks'],       queryFn: () => tasks.list(),       refetchInterval: 30_000 })
  const { data: employeeList = [] } = useQuery({ queryKey: ['employees'],   queryFn: () => employees.list()                         })
  const { data: projectList  = [] } = useQuery({ queryKey: ['projects'],    queryFn: () => projects.list()                          })
  const { data: deptList     = [] } = useQuery({ queryKey: ['departments'], queryFn: () => departments.list()                       })
  const { data: eventList    = [] } = useQuery({ queryKey: ['events'],      queryFn: () => events.list(30),    refetchInterval: 30_000 })

  const codeSessions = sessionList.filter(s => !s.specId)
  const running      = codeSessions.filter(s => s.status === 'running')
  const review       = codeSessions.filter(s => s.status === 'done' || s.status === 'error')
  const queued       = taskList.filter(t => t.status === 'pending')
  const busyIds      = new Set(running.map(s => s.agentId))

  // Build maps for company grid
  const runningMap    = new Map(running.map(s => [s.agentId, s.id]))
  const taskTitleMap  = new Map(running.map(s => [s.agentId, taskTitle(s.workTaskId) ?? '']))

  function employeeName(agentId: string) {
    return employeeList.find(e => e.id === agentId)?.name ?? 'Unknown'
  }
  function projectName(projectId: string) {
    return projectList.find(p => p.id === projectId)?.name ?? 'Unknown'
  }
  function taskTitle(workTaskId?: string) {
    return workTaskId ? taskList.find(t => t.id === workTaskId)?.title : undefined
  }

  const stats = [
    { label: 'active',   value: running.length,    cls: 'text-green-500'        },
    { label: 'review',   value: review.length,     cls: 'text-amber-400'        },
    { label: 'queued',   value: queued.length,     cls: 'text-foreground'       },
    { label: 'idle',     value: employeeList.filter(e => !busyIds.has(e.id)).length, cls: 'text-muted-foreground' },
  ]

  const isEmpty = running.length === 0 && review.length === 0

  const hasTeam = deptList.length > 0 || employeeList.length > 0

  return (
    <div className="flex-1 overflow-y-auto bg-background">
      <div className="max-w-5xl mx-auto px-6 py-8">

        {/* Page header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight">Overview</h1>
          <div className="flex items-center gap-5 mt-2">
            {stats.map(({ label, value, cls }) => (
              <div key={label} className="flex items-center gap-1.5">
                <span className={cn('text-sm font-semibold tabular-nums', cls)}>{value}</span>
                <span className="text-xs text-muted-foreground">{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Body: main feed + team sidebar */}
        <div className="flex flex-col lg:flex-row gap-8 items-start">

          {/* Main content */}
          <div className="flex-1 min-w-0 flex flex-col gap-8">

            {isEmpty && projectList.length === 0 && (
              <div className="flex flex-col gap-3">
                {[
                  { n: '1', label: 'Add a project', desc: 'Connect a GitHub repo or local path.', path: '/projects' },
                  { n: '2', label: 'Add employees',  desc: 'Configure API keys and create named employees.',  path: '/employees' },
                  { n: '3', label: 'Dispatch work',  desc: 'Create tasks and assign them — employees run on separate branches.', path: '/work' },
                ].map(({ n, label, desc, path }) => (
                  <button
                    key={n}
                    onClick={() => navigate(path)}
                    className="flex items-start gap-3 px-4 py-3 rounded-xl bg-card border border-border/50 [box-shadow:var(--shadow-card)] hover:border-border transition-colors cursor-pointer text-left w-full"
                  >
                    <span className="font-mono text-xs font-bold text-primary/60 mt-0.5 shrink-0 w-4">{n}</span>
                    <div>
                      <p className="text-sm font-semibold text-foreground">{label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {running.length > 0 && (
              <Section title="Live" count={running.length}>
                {running.map(s => (
                  <LiveCard
                    key={s.id}
                    session={s}
                    employeeName={employeeName(s.agentId)}
                    employeeId={s.agentId}
                    projectName={projectName(s.projectId)}
                    taskTitle={taskTitle(s.workTaskId)}
                    onClick={() => navigate(`/sessions/${s.id}`)}
                  />
                ))}
              </Section>
            )}

            {review.length > 0 && (
              <Section title="Needs Review" count={review.length}>
                {review.map(s => (
                  <ReviewCard
                    key={s.id}
                    session={s}
                    employeeName={employeeName(s.agentId)}
                    employeeId={s.agentId}
                    projectName={projectName(s.projectId)}
                    taskTitle={taskTitle(s.workTaskId)}
                    isError={s.status === 'error'}
                    onClick={() => navigate(`/sessions/${s.id}`)}
                  />
                ))}
              </Section>
            )}

            {isEmpty && projectList.length > 0 && (
              <p className="text-sm text-muted-foreground">
                Nothing active right now. Head to <button onClick={() => navigate('/work')} className="text-foreground underline underline-offset-2 cursor-pointer bg-transparent border-none p-0 font-medium">Work</button> to dispatch tasks.
              </p>
            )}

            <ActivityFeed
              eventList={eventList}
              onSessionClick={id => navigate(`/sessions/${id}`)}
            />

          </div>

          {/* Team sidebar */}
          {hasTeam && (
            <div className="lg:w-64 xl:w-72 shrink-0 flex flex-col gap-3">
              <span className="text-xs font-semibold text-foreground">Team</span>
              <CompanyGrid
                deptList={deptList} employeeList={employeeList}
                runningMap={runningMap} taskTitleMap={taskTitleMap}
                onEmployeeClick={id => navigate(`/sessions/${id}`)}
              />
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
