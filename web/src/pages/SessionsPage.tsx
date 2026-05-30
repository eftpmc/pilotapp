import { useQuery } from '@tanstack/react-query'
import { useParams, useNavigate } from 'react-router-dom'
import { sessions, agents, tasks } from '../api/client'
import type { Session, Agent, Task } from '../api/client'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { EmptyState } from '@/components/EmptyState'
import { RowSkeleton } from '@/components/Skeleton'
import { AgentAvatar } from '@/components/AgentAvatar'
import { cn } from '@/lib/utils'
import { History, GitBranch } from 'lucide-react'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60)  return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60)  return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24)  return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

const STATUS_CONFIG = {
  running: { label: 'Running', variant: 'success'     as const, dot: 'bg-green-500 animate-[pulse_1.6s_ease-out_infinite]', glow: 'var(--glow-green)' },
  idle:    { label: 'Idle',    variant: 'outline'     as const, dot: 'bg-muted-foreground/40',                               glow: 'none' },
  done:    { label: 'Done',    variant: 'outline'     as const, dot: 'bg-muted-foreground/40',                               glow: 'none' },
  merged:  { label: 'Merged',  variant: 'outline'     as const, dot: 'bg-primary/50',                                        glow: 'none' },
  error:   { label: 'Error',   variant: 'destructive' as const, dot: 'bg-red-500',                                           glow: 'var(--glow-red)' },
}

// ---------------------------------------------------------------------------
// Session row
// ---------------------------------------------------------------------------

function SessionRow({ session, agent, task, onClick }: {
  session: Session; agent?: Agent; task?: Task; onClick: () => void
}) {
  const cfg = STATUS_CONFIG[session.status] ?? STATUS_CONFIG.idle
  const isSpec = !!session.specId

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3.5 px-5 py-3.5 text-left transition-colors hover:bg-muted/30 cursor-pointer bg-transparent border-none border-b border-border/40 last:border-0"
      style={cfg.glow !== 'none' ? { boxShadow: `inset 3px 0 0 var(--${session.status === 'running' ? 'green' : 'destructive'})` } : { boxShadow: 'inset 3px 0 0 transparent' }}
    >
      {/* Status dot */}
      <span className={cn('w-2 h-2 rounded-full shrink-0', cfg.dot)} />

      {/* Avatar */}
      <AgentAvatar agent={agent} size={28} />

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground truncate">
            {task?.title ?? (isSpec ? 'Planning session' : session.branch)}
          </span>
          {isSpec && (
            <span className="text-[10px] font-mono text-muted-foreground/60 shrink-0">plan</span>
          )}
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <GitBranch className="h-3 w-3 text-muted-foreground/50 shrink-0" />
          <span className="font-mono text-[11px] text-muted-foreground truncate">{session.branch}</span>
        </div>
      </div>

      {/* Right */}
      <div className="flex items-center gap-3 shrink-0">
        <span className="text-xs text-muted-foreground tabular-nums">{timeAgo(session.createdAt)}</span>
        <Badge variant={cfg.variant} className="text-[10px] shrink-0">{cfg.label}</Badge>
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
  const { data: agentList  = [] } = useQuery({ queryKey: ['agents'],           queryFn: () => agents.list() })
  const { data: taskList   = [] } = useQuery({ queryKey: ['tasks', projectId], queryFn: () => tasks.list({ projectId }), enabled: !!projectId })

  function agentFor(s: Session) { return agentList.find(a => a.id === s.agentId) }
  function taskFor(s: Session)  { return taskList.find(t => t.id === s.workTaskId) }

  const sorted = [...sessionList].sort((a, b) => {
    const order: Record<string, number> = { running: 0, idle: 1, error: 2, done: 3, merged: 4 }
    const od = (order[a.status] ?? 5) - (order[b.status] ?? 5)
    if (od !== 0) return od
    return b.createdAt.localeCompare(a.createdAt)
  })

  return (
    <div className="flex-1 flex flex-col bg-background">
      <div className="h-14 shrink-0 flex items-center gap-3 px-6 border-b border-border/60">
        <span className="text-sm font-semibold text-foreground">Sessions</span>
        {sessionList.length > 0 && (
          <span className="font-mono text-xs text-muted-foreground">{sessionList.length}</span>
        )}
      </div>

      <ScrollArea className="flex-1">
        {isLoading ? (
          <div className="flex flex-col">
            {Array.from({ length: 5 }).map((_, i) => <RowSkeleton key={i} />)}
          </div>
        ) : sorted.length === 0 ? (
          <EmptyState
            icon={History}
            title="No sessions yet"
            description="Sessions are created when you assign a task to an agent from the Board."
          />
        ) : (
          <div className="flex flex-col">
            {sorted.map(s => (
              <SessionRow
                key={s.id}
                session={s}
                agent={agentFor(s)}
                task={taskFor(s)}
                onClick={() => navigate(`/sessions/${s.id}`)}
              />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}
