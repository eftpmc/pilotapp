import { useQuery } from '@tanstack/react-query'
import { useParams, useNavigate } from 'react-router-dom'
import { sessions, agents, tasks } from '../api/client'
import type { Session, Agent, Task } from '../api/client'
import { AgentAvatar } from '@/components/AgentAvatar'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Spinner } from '@/components/ui/spinner'
import { timeAgo } from '@/lib/time'
import { cn } from '@/lib/utils'
import { ChevronRight } from 'lucide-react'

// ---------------------------------------------------------------------------
// Task row
// ---------------------------------------------------------------------------

function TaskRow({
  task, taskSessions, agentList, onClick,
}: {
  task: Task
  taskSessions: Session[]
  agentList: Agent[]
  onClick: () => void
}) {
  const workSessions   = taskSessions.filter(s => !s.parentSessionId && !s.specId)
  const reviewSessions = taskSessions.filter(s => !!s.parentSessionId)

  const overallStatus = (() => {
    if (workSessions.some(s => s.status === 'running' || s.status === 'waiting' || s.status === 'idle')) return 'running'
    if (workSessions.some(s => s.status === 'error'))   return 'error'
    if (workSessions.some(s => s.status === 'done'))    return 'done'
    if (workSessions.every(s => s.status === 'merged')) return 'merged'
    return 'done'
  })()

  const verdict = reviewSessions.find(s => s.reviewVerdict && s.reviewVerdict !== 'pending')?.reviewVerdict

  const statusLabel = verdict === 'approved'          ? 'Approved'
                    : verdict === 'changes_requested' ? 'Changes needed'
                    : overallStatus === 'running'      ? 'Working'
                    : overallStatus === 'error'        ? 'Error'
                    : overallStatus === 'merged'       ? 'Merged'
                    : reviewSessions.some(s => s.status === 'running' || s.reviewVerdict === 'pending') ? 'Reviewing'
                    : overallStatus === 'done'         ? 'Done'
                    : 'Done'

  const dotCls = overallStatus === 'running'             ? 'dot green pulse'
               : overallStatus === 'error'               ? 'dot red'
               : verdict === 'approved'                  ? 'dot green'
               : verdict === 'changes_requested'         ? 'dot amber'
               : overallStatus === 'merged'              ? 'dot idle'
               : overallStatus === 'done'                ? 'dot amber'
               : 'dot idle'

  const agents = workSessions.reduce<Agent[]>((acc, s) => {
    const a = agentList.find(ag => ag.id === s.agentId)
    if (a && !acc.find(x => x.id === a.id)) acc.push(a)
    return acc
  }, [])

  const latestSession = [...workSessions].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]

  return (
    <button
      onClick={onClick}
      className="flex items-center gap-4 w-full px-4 py-3.5 rounded-xl border border-border/60 bg-card/70 shadow-sm text-left hover:bg-card hover:-translate-y-0.5 transition-all"
    >
      {/* Status dot */}
      <span className={cn(dotCls, 'shrink-0')} style={{ width: 7, height: 7 }} />

      {/* Title + meta */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{task.title}</p>
        {task.prompt && (
          <p className="text-xs text-muted-foreground/60 truncate mt-0.5 leading-snug">{task.prompt.slice(0, 100)}</p>
        )}
      </div>

      {/* Right side */}
      <div className="flex items-center gap-3 shrink-0">
        {agents.length > 0 && (
          <div className="flex -space-x-1.5">
            {agents.slice(0, 3).map(a => (
              <div key={a.id} className="rounded-[10px] ring-2 ring-card">
                <AgentAvatar agent={a} size={22} running={overallStatus === 'running'} />
              </div>
            ))}
          </div>
        )}
        <span className={cn(
          'text-xs font-medium',
          overallStatus === 'running'             ? 'text-[var(--green)]'       :
          overallStatus === 'error'               ? 'text-[var(--red)]'         :
          verdict === 'changes_requested'         ? 'text-[var(--amber)]'       :
          verdict === 'approved'                  ? 'text-[var(--green)]'       :
          overallStatus === 'merged'              ? 'text-muted-foreground/40'  :
          'text-muted-foreground/60'
        )}>{statusLabel}</span>
        <span className="text-[11px] text-muted-foreground/30 tabular-nums">
          {timeAgo(latestSession?.createdAt ?? task.createdAt)}
        </span>
        <ChevronRight size={13} className="text-muted-foreground/30" />
      </div>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SessionsPage() {
  const { id: projectId } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const { data: sessionList = [], isLoading } = useQuery({
    queryKey: ['sessions', projectId],
    queryFn: () => sessions.list({ projectId }),
    enabled: !!projectId,
    refetchInterval: 5000,
  })
  const { data: agentList = [] } = useQuery({ queryKey: ['agents'], queryFn: () => agents.list() })
  const { data: taskList  = [] } = useQuery({
    queryKey: ['tasks', projectId],
    queryFn: () => tasks.list({ projectId }),
    enabled: !!projectId,
    refetchInterval: 5000,
  })

  // Group sessions by workTaskId
  const sessionsByTask = new Map<string, Session[]>()
  for (const s of sessionList) {
    if (s.workTaskId) {
      const arr = sessionsByTask.get(s.workTaskId) ?? []
      arr.push(s)
      sessionsByTask.set(s.workTaskId, arr)
    }
  }

  // Map: parentTaskId → subtasks
  const subtasksByParent = new Map<string, Task[]>()
  for (const t of taskList) {
    if (t.parentTaskId) {
      const arr = subtasksByParent.get(t.parentTaskId) ?? []
      arr.push(t)
      subtasksByParent.set(t.parentTaskId, arr)
    }
  }

  // Gather all sessions for a root task (root + all its subtasks)
  function sessionsForRoot(root: Task): Session[] {
    const subtasks = subtasksByParent.get(root.id) ?? []
    const allTaskIds = [root.id, ...subtasks.map(t => t.id)]
    return allTaskIds.flatMap(tid => sessionsByTask.get(tid) ?? [])
  }

  // Root tasks (no parentTaskId) that have been started (not pending)
  const activeTasks = taskList
    .filter(t => !t.parentTaskId && t.status !== 'pending')
    .sort((a, b) => {
      const aLast = sessionsForRoot(a).map(s => s.createdAt).sort().at(-1) ?? a.createdAt
      const bLast = sessionsForRoot(b).map(s => s.createdAt).sort().at(-1) ?? b.createdAt
      return bLast.localeCompare(aLast)
    })

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-[960px] mx-auto px-6 pt-10 pb-10 flex flex-col gap-6">

        <p className="text-xs text-muted-foreground/50">
          {activeTasks.length} task{activeTasks.length !== 1 ? 's' : ''}
        </p>

        {isLoading ? (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Spinner />
            Loading history
          </div>
        ) : activeTasks.length === 0 ? (
          <Empty className="border border-dashed border-border/70 bg-card/30">
            <EmptyHeader>
              <EmptyTitle>No history yet</EmptyTitle>
              <EmptyDescription>Tasks that have been assigned to agents will appear here.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="flex flex-col gap-2">
            {activeTasks.map(task => (
              <TaskRow
                key={task.id}
                task={task}
                taskSessions={sessionsForRoot(task)}
                agentList={agentList}
                onClick={() => navigate(`/projects/${projectId}/tasks/${task.id}`)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
