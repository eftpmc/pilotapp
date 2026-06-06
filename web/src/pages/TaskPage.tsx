import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { tasks, agents, sessions, projects } from '../api/client'
import type { Task, Agent, Session } from '../api/client'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { AgentAvatar } from '@/components/AgentAvatar'
import { useElapsed, fmtSecs, timeAgo } from '@/lib/time'
import { cn } from '@/lib/utils'
import { ArrowLeft, ChevronRight, Upload, CheckCircle, XCircle, Clock } from 'lucide-react'
import { buildCampaigns } from './ProjectDetailPage'

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

function taskOverallStatus(task: Task, workSessions: Session[], leadSessionId?: string): {
  label: string; color: 'green' | 'amber' | 'red' | 'idle'; pulse?: boolean
} {
  // Only show "Accepted" when actual work sessions (not just the lead plan) are merged
  const nonLeadSessions = leadSessionId ? workSessions.filter(s => s.id !== leadSessionId) : workSessions
  const checkMerged = nonLeadSessions.length > 0 ? nonLeadSessions : workSessions
  if (checkMerged.length > 0 && checkMerged.every(s => s.status === 'merged')) return { label: 'Accepted', color: 'idle' }
  if (task.status === 'pending') return { label: 'Queued', color: 'idle' }
  if (task.status === 'running') {
    const live = workSessions.some(s => s.status === 'running' || s.status === 'waiting' || s.status === 'idle')
    return { label: 'Working', color: 'green', pulse: live }
  }
  if (task.status === 'failed') return { label: 'Failed', color: 'red' }
  if (task.status === 'done') {
    const verdict = workSessions.find(s => s.reviewVerdict)?.reviewVerdict
    if (verdict === 'approved')          return { label: 'Approved',         color: 'green' }
    if (verdict === 'changes_requested') return { label: 'Changes needed',   color: 'amber' }
    if (verdict === 'pending')           return { label: 'Reviewing',        color: 'amber', pulse: true }
    return { label: 'Done', color: 'green' }
  }
  return { label: task.status, color: 'idle' }
}

function StatusChip({ task, workSessions, leadSessionId }: { task: Task; workSessions: Session[]; leadSessionId?: string }) {
  const { label, color, pulse } = taskOverallStatus(task, workSessions, leadSessionId)
  const cls = {
    green: 'text-[var(--green)] bg-[color-mix(in_srgb,var(--green-dot)_12%,transparent)] border-[color-mix(in_srgb,var(--green-dot)_25%,transparent)]',
    amber: 'text-[var(--amber)] bg-[color-mix(in_srgb,var(--amber-dot)_12%,transparent)] border-[color-mix(in_srgb,var(--amber-dot)_25%,transparent)]',
    red:   'text-[var(--red)] bg-[color-mix(in_srgb,var(--red-dot)_12%,transparent)] border-[color-mix(in_srgb,var(--red-dot)_25%,transparent)]',
    idle:  'text-muted-foreground bg-muted/60 border-border/50',
  }[color]
  return (
    <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border', cls)}>
      <span className={cn('dot', color === 'idle' ? 'idle' : color, pulse && 'pulse')} style={{ width: 6, height: 6 }} />
      {label}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Elapsed timer
// ---------------------------------------------------------------------------

function ElapsedBadge({ createdAt }: { createdAt: string }) {
  const secs = useElapsed(createdAt, true)
  return <span className="font-mono text-xs text-[var(--green)] tabular-nums">{fmtSecs(secs)}</span>
}

// ---------------------------------------------------------------------------
// Phase label
// ---------------------------------------------------------------------------

function Phase({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 shrink-0">{label}</span>
      <div className="flex-1 h-px bg-border/40" />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Journal excerpt (3 lines max)
// ---------------------------------------------------------------------------

function JournalSummary({ text }: { text: string }) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  const paras: string[] = []
  for (const line of lines) {
    if (line.startsWith('#') || line.startsWith('**')) continue
    const clean = line.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*]+)\*/g, '$1')
    if (clean.length > 15) { paras.push(clean); if (paras.length >= 3) break }
  }
  if (!paras.length) return null
  return (
    <div className="flex flex-col gap-1.5">
      {paras.map((p, i) => (
        <p key={i} className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
          {p.slice(0, 200)}{p.length > 200 ? '…' : ''}
        </p>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Plan card
// ---------------------------------------------------------------------------

function PlanCard({ session, agent, onView }: { session: Session; agent?: Agent; onView: () => void }) {
  const isActive = session.status === 'running' || session.status === 'waiting' || session.status === 'idle'
  return (
    <div className="flex flex-col gap-3 p-4 rounded-xl border border-border/60 bg-card/60">
      <div className="flex items-center gap-3">
        <AgentAvatar agent={agent} size={30} running={isActive} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">{agent?.name ?? '—'}</span>
            {isActive && <span className="stat green text-xs"><span className="dot green pulse" style={{ width: 6, height: 6 }} />Planning</span>}
            {session.status === 'done' && <span className="text-xs text-muted-foreground/50">Plan complete</span>}
            {isActive && <ElapsedBadge createdAt={session.createdAt} />}
          </div>
        </div>
        <button onClick={onView} className="shrink-0 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
          View <ChevronRight size={12} />
        </button>
      </div>
      {session.journal && <JournalSummary text={session.journal} />}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Reviewer dropdown
// ---------------------------------------------------------------------------

function ReviewerDropdown({ excludeAgentId, agentList, onPick }: {
  excludeAgentId: string; agentList: Agent[]; onPick: (id: string) => void
}) {
  const eligible = agentList.filter(a => a.id !== excludeAgentId)
  if (eligible.length === 0) return null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline">Request Review</Button>
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
// Merge action bar — shared logic for work sessions
// ---------------------------------------------------------------------------

function MergeBar({
  session, project, isMerging, agentList, hasReview, isError,
  onMerge, onMergePush, onRequestReview, onDiscard,
}: {
  session: Session
  project?: { workspaceMode: string; remoteUrl?: string }
  isMerging: boolean
  agentList: Agent[]
  hasReview: boolean
  isError?: boolean
  onMerge: (id: string) => void
  onMergePush: (id: string) => void
  onRequestReview: (sessionId: string, agentId: string) => void
  onDiscard: (id: string) => void
}) {
  const reviewInProgress = session.reviewVerdict === 'pending' || hasReview
  if (reviewInProgress) return null

  const acceptLabel = isError ? 'Accept anyway' : 'Accept ✓'
  const pushLabel   = isError ? 'Push anyway'   : 'Push'

  return (
    <div className="flex items-center gap-2 justify-end">
      {!isError && (
        <ReviewerDropdown
          excludeAgentId={session.agentId}
          agentList={agentList}
          onPick={agentId => onRequestReview(session.id, agentId)}
        />
      )}
      <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => onDiscard(session.id)} disabled={isMerging}>
        Discard
      </Button>
      {project?.workspaceMode === 'workspace' ? (
        <Button size="sm" variant="primary" onClick={() => onMerge(session.id)} disabled={isMerging}>
          {isMerging ? '…' : 'Complete ✓'}
        </Button>
      ) : project?.remoteUrl ? (
        <>
          <Button size="sm" variant="outline" onClick={() => onMerge(session.id)} disabled={isMerging}>
            {isMerging ? '…' : isError ? 'Accept anyway' : 'Accept'}
          </Button>
          <Button size="sm" variant="primary" onClick={() => onMergePush(session.id)} disabled={isMerging}>
            <Upload size={12} />{isMerging ? '…' : pushLabel}
          </Button>
        </>
      ) : (
        <Button size="sm" variant="primary" onClick={() => onMerge(session.id)} disabled={isMerging}>
          {isMerging ? '…' : acceptLabel}
        </Button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Subtask row
// ---------------------------------------------------------------------------

function SubtaskRow({
  task, sessionList, agentList, project, isMerging,
  onMerge, onMergePush, onRequestReview, onDiscard, navigate,
}: {
  task: Task; sessionList: Session[]; agentList: Agent[]
  project?: { workspaceMode: string; remoteUrl?: string }
  isMerging: boolean
  onMerge: (id: string) => void; onMergePush: (id: string) => void
  onRequestReview: (sessionId: string, agentId: string) => void
  onDiscard: (id: string) => void
  navigate: (path: string) => void
}) {
  const workSession   = sessionList
    .filter(s => s.workTaskId === task.id && !s.parentSessionId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
  const reviewSession = workSession ? sessionList.find(s => s.parentSessionId === workSession.id) : undefined
  const workAgent     = workSession ? agentList.find(a => a.id === workSession.agentId) : undefined
  const reviewAgent   = reviewSession ? agentList.find(a => a.id === reviewSession.agentId) : undefined
  const isSynthesis   = task.title.startsWith('[Synthesis]')
  const isActive      = workSession && (workSession.status === 'running' || workSession.status === 'waiting' || workSession.status === 'idle')
  const isDone        = workSession?.status === 'done'
  const isError       = workSession?.status === 'error'
  const isMerged      = workSession?.status === 'merged'

  function dotColor() {
    if (!workSession) return 'idle'
    if (isMerged) return 'idle'
    if (isError) return 'red'
    if (isDone && reviewSession?.reviewVerdict === 'approved') return 'green'
    if (isDone && reviewSession?.reviewVerdict === 'changes_requested') return 'amber'
    if (isDone) return 'amber'
    if (isActive) return 'green'
    return 'idle'
  }

  return (
    <div className={cn('flex flex-col rounded-lg border border-border/50 bg-card/40 overflow-hidden', isSynthesis && 'opacity-70')}>
      {/* Main row */}
      <div className="flex items-center gap-3 px-3 py-2.5">
        <span className={cn('dot shrink-0', dotColor(), isActive && !isMerged && 'pulse')} style={{ width: 7, height: 7 }} />
        <p className={cn('flex-1 text-sm font-medium leading-snug min-w-0 truncate', isSynthesis && 'text-muted-foreground')}>
          {isSynthesis ? task.title.replace('[Synthesis] ', '') : task.title}
          {isSynthesis && <span className="ml-2 text-[10px] font-normal text-muted-foreground/40 uppercase tracking-wide">synthesis</span>}
        </p>
        {task.size && <span className="font-mono text-[10px] text-muted-foreground border border-border/40 rounded px-1 py-0.5 uppercase shrink-0">{task.size}</span>}
        {workAgent && <AgentAvatar agent={workAgent} size={20} running={!!isActive} />}
        {isActive && <ElapsedBadge createdAt={workSession!.createdAt} />}
        {!isActive && workSession && <span className="text-[11px] text-muted-foreground/40 tabular-nums shrink-0">{timeAgo(workSession.createdAt)}</span>}
        {workSession && (
          <button onClick={() => navigate(`/sessions/${workSession.id}`)} className="shrink-0 text-muted-foreground/40 hover:text-foreground transition-colors">
            <ChevronRight size={13} />
          </button>
        )}
        {!workSession && task.status === 'pending' && <span className="text-[11px] text-muted-foreground/40">Queued</span>}
      </div>

      {/* Review sub-row */}
      {reviewSession && (
        <div className="flex items-center gap-3 px-3 py-2 border-t border-border/30 bg-muted/20">
          <span className="w-[7px] shrink-0" />
          <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/40 w-10 shrink-0">Review</span>
          {reviewAgent && <AgentAvatar agent={reviewAgent} size={16} running={reviewSession.status === 'running'} />}
          <span className="text-xs text-muted-foreground flex-1">
            {reviewSession.reviewVerdict === 'approved'          ? <span className="text-[var(--green)] font-medium">Approved</span>
           : reviewSession.reviewVerdict === 'changes_requested' ? <span className="text-[var(--amber)] font-medium">Changes requested</span>
           : reviewSession.status === 'running'                  ? <span className="text-[var(--green)]">Reviewing…</span>
           : 'Pending'}
          </span>
          <button onClick={() => navigate(`/sessions/${reviewSession.id}`)} className="text-muted-foreground/40 hover:text-foreground transition-colors">
            <ChevronRight size={13} />
          </button>
        </div>
      )}

      {/* Merge */}
      {(isDone || isError) && (
        <div className="px-3 py-2.5 border-t border-border/30 bg-muted/10">
          <MergeBar
            session={workSession!}
            project={project}
            isMerging={isMerging}
            agentList={agentList}
            hasReview={!!reviewSession}
            isError={isError}
            onMerge={onMerge}
            onMergePush={onMergePush}
            onRequestReview={onRequestReview}
            onDiscard={onDiscard}
          />
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Review card
// ---------------------------------------------------------------------------

function ReviewCard({ session, agent, onView }: { session: Session; agent?: Agent; onView: () => void }) {
  const isActive = session.status === 'running' || session.status === 'waiting' || session.status === 'idle'
  const verdict  = session.reviewVerdict
  const isDone   = session.status === 'done'

  const verdictDisplay = isDone && verdict === 'approved'          ? { icon: <CheckCircle size={16} />, label: 'Approved',         cls: 'text-[var(--green)]' }
                       : isDone && verdict === 'changes_requested' ? { icon: <XCircle size={16} />,    label: 'Changes requested', cls: 'text-[var(--amber)]' }
                       : isActive                                  ? { icon: <Clock size={16} />,       label: 'Reviewing…',        cls: 'text-muted-foreground' }
                       : null

  return (
    <div className="flex flex-col gap-3 p-4 rounded-xl border border-border/60 bg-card/60">
      <div className="flex items-center gap-3">
        <AgentAvatar agent={agent} size={30} running={isActive} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">{agent?.name ?? '—'}</span>
            {verdictDisplay && (
              <span className={cn('flex items-center gap-1 text-xs font-medium', verdictDisplay.cls)}>
                {verdictDisplay.icon}{verdictDisplay.label}
              </span>
            )}
            {isActive && <ElapsedBadge createdAt={session.createdAt} />}
          </div>
        </div>
        <button onClick={onView} className="shrink-0 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
          View <ChevronRight size={12} />
        </button>
      </div>
      {session.journal && <JournalSummary text={session.journal} />}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Work session card (standalone)
// ---------------------------------------------------------------------------

function WorkSessionCard({
  session, agent, project, isMerging, agentList, reviewSession,
  onMerge, onMergePush, onRequestReview, onDiscard, onView,
}: {
  session: Session; agent?: Agent
  project?: { workspaceMode: string; remoteUrl?: string }
  isMerging: boolean; agentList: Agent[]; reviewSession?: Session
  onMerge: (id: string) => void; onMergePush: (id: string) => void
  onRequestReview: (sessionId: string, agentId: string) => void
  onDiscard: (id: string) => void
  onView: () => void
}) {
  const isActive = session.status === 'running' || session.status === 'waiting' || session.status === 'idle'
  const isDone   = session.status === 'done'
  const isError  = session.status === 'error'
  const isMerged = session.status === 'merged'

  return (
    <div className="flex flex-col rounded-xl border border-border/60 bg-card/60 overflow-hidden">
      <div className="flex items-center gap-3 p-4">
        <AgentAvatar agent={agent} size={32} running={isActive} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">{agent?.name ?? '—'}</span>
            <span className={cn(
              'flex items-center gap-1.5 text-xs',
              isMerged ? 'text-muted-foreground/50' : isError ? 'text-[var(--red)]' : isDone ? 'text-[var(--green)]' : isActive ? 'text-[var(--green)]' : 'text-muted-foreground'
            )}>
              <span className={cn('dot', isMerged ? 'idle' : isError ? 'red' : isDone ? 'green' : isActive ? 'green pulse' : 'idle')} style={{ width: 6, height: 6 }} />
              {isMerged ? 'Accepted' : isError ? 'Error' : isDone ? 'Done' : isActive ? 'Working' : 'Idle'}
            </span>
            {isActive && <ElapsedBadge createdAt={session.createdAt} />}
            {!isActive && <span className="text-[11px] text-muted-foreground/40">{timeAgo(session.createdAt)}</span>}
          </div>
          {session.journal && <JournalSummary text={session.journal} />}
        </div>
        <button onClick={onView} className="shrink-0 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
          View <ChevronRight size={12} />
        </button>
      </div>

      {(isDone || isError) && (
        <div className="px-4 py-2.5 border-t border-border/30 bg-muted/10">
          <MergeBar
            session={session}
            project={project}
            isMerging={isMerging}
            agentList={agentList}
            hasReview={!!reviewSession}
            isError={isError}
            onMerge={onMerge}
            onMergePush={onMergePush}
            onRequestReview={onRequestReview}
            onDiscard={onDiscard}
          />
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function TaskPage() {
  const { id: projectId, taskId } = useParams<{ id: string; taskId: string }>()
  const navigate = useNavigate()
  const qc       = useQueryClient()

  const { data: taskList    = [] } = useQuery({ queryKey: ['tasks',    projectId], queryFn: () => tasks.list({ projectId }),    refetchInterval: 4000 })
  const { data: agentList   = [] } = useQuery({ queryKey: ['agents'],              queryFn: () => agents.list() })
  const { data: sessionList = [] } = useQuery({ queryKey: ['sessions', projectId], queryFn: () => sessions.list({ projectId }), refetchInterval: 4000 })
  const { data: projectList = [] } = useQuery({ queryKey: ['projects'],             queryFn: () => projects.list() })

  const project  = projectList.find(p => p.id === projectId)
  const campaigns = buildCampaigns(taskList)
  const campaign  = campaigns.find(c => c.root.id === taskId)
  const task      = campaign?.root ?? taskList.find(t => t.id === taskId)

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

  if (!task) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        Task not found.
      </div>
    )
  }

  const isMerging  = mergeSession.isPending || mergePushSession.isPending || discardSession.isPending
  const isLeadTask = !!(campaign?.subtasks.length)

  // Most recent non-review session for the root task
  const rootSessions = sessionList
    .filter(s => s.workTaskId === task.id && !s.parentSessionId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const latestRootSession = rootSessions[0]

  const leadSession   = isLeadTask ? latestRootSession : undefined
  const workSession   = !isLeadTask ? latestRootSession : undefined
  const reviewSession = workSession ? sessionList.find(s => s.parentSessionId === workSession.id) : undefined
  const leadAgent     = leadSession ? agentList.find(a => a.id === leadSession.agentId) : undefined
  const workAgent     = workSession ? agentList.find(a => a.id === workSession.agentId) : undefined
  const reviewAgent   = reviewSession ? agentList.find(a => a.id === reviewSession.agentId) : undefined

  // All sessions across this campaign for status + roster
  const allTaskIds = new Set([task.id, ...(campaign?.subtasks.map(s => s.id) ?? [])])
  const allWorkSessions = sessionList.filter(s =>
    s.workTaskId && allTaskIds.has(s.workTaskId) && !s.parentSessionId && !s.specId
  )

  const seenAgentIds = new Set<string>()
  const rosterAgents: Agent[] = []
  const allSessions = [...allWorkSessions, reviewSession].filter(Boolean) as Session[]
  for (const s of allSessions) {
    if (!seenAgentIds.has(s.agentId)) {
      seenAgentIds.add(s.agentId)
      const a = agentList.find(a => a.id === s.agentId)
      if (a) rosterAgents.push(a)
    }
  }

  const subtasks = campaign?.subtasks.sort((a, b) => {
    if (a.title.startsWith('[Synthesis]')) return 1
    if (b.title.startsWith('[Synthesis]')) return -1
    return a.createdAt.localeCompare(b.createdAt)
  }) ?? []

  const mergeError = mergeSession.error ?? mergePushSession.error

  return (
    <div className="flex-1 flex flex-col bg-background" style={{ minHeight: 0 }}>

      {/* Header — matches SessionPage pattern */}
      <div className="shrink-0 bg-background px-6 pt-5 pb-4">
        <Button
          variant="ghost" size="sm"
          onClick={() => navigate(`/projects/${projectId}`)}
          className="-ml-2 mb-4 text-muted-foreground"
        >
          <ArrowLeft size={13} />
          {project?.name ?? 'Back'}
        </Button>

        <div className="flex items-start gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <StatusChip task={task} workSessions={allWorkSessions} leadSessionId={leadSession?.id} />
              {task.size && (
                <span className="font-mono text-[10px] text-muted-foreground border border-border/50 rounded px-1.5 py-0.5 uppercase">
                  {task.size}
                </span>
              )}
              <span className="text-xs text-muted-foreground/40">{timeAgo(task.createdAt)}</span>
            </div>
            <h1 className="text-lg font-semibold tracking-tight leading-snug">{task.title}</h1>
            {task.prompt && (
              <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed line-clamp-2">{task.prompt}</p>
            )}
          </div>

          {/* Agent roster */}
          {rosterAgents.length > 0 && (
            <div className="flex items-center shrink-0 mt-1">
              <div className="flex -space-x-2">
                {rosterAgents.slice(0, 5).map(a => (
                  <div key={a.id} className="rounded-full ring-2 ring-background">
                    <AgentAvatar agent={a} size={32} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[760px] px-6 pt-10 pb-16 flex flex-col gap-8">

          {/* Phase: Plan */}
          {isLeadTask && leadSession && (
            <div className="flex flex-col gap-3">
              <Phase label="Plan" />
              <PlanCard session={leadSession} agent={leadAgent} onView={() => navigate(`/sessions/${leadSession.id}`)} />
            </div>
          )}

          {/* Phase: Work — subtasks */}
          {isLeadTask && (
            <div className="flex flex-col gap-3">
              <Phase label={subtasks.length > 0 ? `Work · ${subtasks.length}` : 'Work'} />
              {subtasks.length > 0 ? (
                <div className="flex flex-col gap-2">
                  {subtasks.map(sub => (
                    <SubtaskRow
                      key={sub.id}
                      task={sub}
                      sessionList={sessionList}
                      agentList={agentList}
                      project={project}
                      isMerging={isMerging}
                      onMerge={id => mergeSession.mutate(id)}
                      onMergePush={id => mergePushSession.mutate(id)}
                      onRequestReview={(sid, agentId) => requestReview.mutate({ sessionId: sid, agentId })}
                      onDiscard={id => discardSession.mutate(id)}
                      navigate={navigate}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground/50 py-2">
                  Subtasks will appear here once the lead agent begins planning.
                </p>
              )}
            </div>
          )}

          {/* Phase: Work — standalone */}
          {!isLeadTask && (
            <div className="flex flex-col gap-3">
              <Phase label="Work" />
              {workSession ? (
                <WorkSessionCard
                  session={workSession}
                  agent={workAgent}
                  project={project}
                  isMerging={isMerging}
                  agentList={agentList}
                  reviewSession={reviewSession}
                  onMerge={id => mergeSession.mutate(id)}
                  onMergePush={id => mergePushSession.mutate(id)}
                  onRequestReview={(sid, agentId) => requestReview.mutate({ sessionId: sid, agentId })}
                  onDiscard={id => discardSession.mutate(id)}
                  onView={() => navigate(`/sessions/${workSession.id}`)}
                />
              ) : (
                <p className="text-sm text-muted-foreground/50 py-2">
                  No session yet — assign this task to an agent from the board.
                </p>
              )}
            </div>
          )}

          {/* Phase: Review — standalone */}
          {!isLeadTask && reviewSession && (
            <div className="flex flex-col gap-3">
              <Phase label="Review" />
              <ReviewCard
                session={reviewSession}
                agent={reviewAgent}
                onView={() => navigate(`/sessions/${reviewSession.id}`)}
              />
              {reviewSession.status === 'done' && workSession && (
                <div className="flex justify-end pt-1">
                  {project?.workspaceMode === 'workspace' ? (
                    <Button size="sm" variant="primary" onClick={() => mergeSession.mutate(workSession.id)} disabled={isMerging}>
                      {isMerging ? '…' : 'Complete ✓'}
                    </Button>
                  ) : project?.remoteUrl ? (
                    <>
                      <Button size="sm" variant="outline" onClick={() => mergeSession.mutate(workSession.id)} disabled={isMerging} className="mr-2">
                        {isMerging ? '…' : 'Accept'}
                      </Button>
                      <Button size="sm" variant="primary" onClick={() => mergePushSession.mutate(workSession.id)} disabled={isMerging}>
                        <Upload size={12} />{isMerging ? '…' : 'Push'}
                      </Button>
                    </>
                  ) : (
                    <Button size="sm" variant="primary" onClick={() => mergeSession.mutate(workSession.id)} disabled={isMerging}>
                      {isMerging ? '…' : 'Accept ✓'}
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}

        </div>

        {mergeError && (
          <div className="max-w-[760px] mx-6 flex items-center gap-3 px-4 py-2.5 rounded-lg border border-destructive/30 bg-destructive/5">
            <span className="text-sm text-destructive flex-1">{mergeError.message}</span>
            <Button size="sm" variant="ghost" className="text-muted-foreground"
              onClick={() => { mergeSession.reset(); mergePushSession.reset() }}>Dismiss</Button>
          </div>
        )}
      </div>
    </div>
  )
}
