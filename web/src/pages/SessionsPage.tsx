import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useParams, useNavigate } from 'react-router-dom'
import { sessions, agents, tasks } from '../api/client'
import type { Session, Agent, Task, SessionStatus } from '../api/client'
import { AgentAvatar } from '@/components/AgentAvatar'
import { StatusBadge } from '@/components/StatusBadge'
import { timeAgo } from '@/lib/time'
import { cn } from '@/lib/utils'

function SessionCard({ session, agent, task, onClick }: {
  session: Session; agent?: Agent; task?: Task; onClick: () => void
}) {
  const isSpec = !!session.specId
  const title = task?.title ?? (isSpec ? 'Planning session' : session.branch)

  return (
    <button onClick={onClick} className="card-row">
      <AgentAvatar agent={agent} size={40} running={session.status === 'running'} />
      <div className="card-row-main">
        <p className="card-row-title">{title}</p>
        <p className="text-[11.5px] text-muted-foreground font-mono truncate mt-0.5">
          {session.branch}{isSpec && ' · plan'}
        </p>
      </div>
      <span className="text-[11px] text-muted-foreground/50 font-mono shrink-0">{timeAgo(session.createdAt)}</span>
      <StatusBadge status={session.status} />
    </button>
  )
}

type Filter = 'all' | SessionStatus

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all',     label: 'All'     },
  { key: 'running', label: 'Running' },
  { key: 'done',    label: 'Done'    },
  { key: 'error',   label: 'Error'   },
  { key: 'merged',  label: 'Merged'  },
]

export default function SessionsPage() {
  const { id: projectId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [filter, setFilter] = useState<Filter>('all')

  const { data: sessionList = [], isLoading } = useQuery({
    queryKey: ['sessions', projectId],
    queryFn: () => sessions.list({ projectId }),
    enabled: !!projectId,
    refetchInterval: 5000,
  })
  const { data: agentList = [] } = useQuery({ queryKey: ['agents'],         queryFn: () => agents.list() })
  const { data: taskList  = [] } = useQuery({ queryKey: ['tasks', projectId], queryFn: () => tasks.list({ projectId }), enabled: !!projectId })

  function agentFor(s: Session) { return agentList.find(a => a.id === s.agentId) }
  function taskFor(s: Session)  { return taskList.find(t => t.id === s.workTaskId) }

  const sorted = [...sessionList].sort((a, b) => {
    const order: Record<string, number> = { running: 0, idle: 1, error: 2, done: 3, merged: 4 }
    const od = (order[a.status] ?? 5) - (order[b.status] ?? 5)
    return od !== 0 ? od : b.createdAt.localeCompare(a.createdAt)
  })

  const filtered = filter === 'all' ? sorted : sorted.filter(s => s.status === filter)
  const counts = new Map<string, number>()
  for (const s of sessionList) counts.set(s.status, (counts.get(s.status) ?? 0) + 1)
  const visibleFilters = FILTERS.filter(f => f.key === 'all' || (counts.get(f.key) ?? 0) > 0)

  return (
    <div className="flex-1 overflow-y-auto bg-background">
      <div className="max-w-[960px] px-6 pt-6 pb-8 flex flex-col gap-6">

        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground/50">{sessionList.length} session{sessionList.length !== 1 ? 's' : ''}</p>
          {visibleFilters.length > 2 && (
            <div className="flex items-center gap-1 flex-wrap">
              {visibleFilters.map(f => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer',
                    filter === f.key
                      ? 'bg-card border-border text-foreground'
                      : 'bg-transparent border-transparent text-muted-foreground hover:text-foreground'
                  )}
                >
                  {f.label}
                  {f.key !== 'all' && counts.get(f.key) && (
                    <span className="ml-1.5 opacity-50 font-mono text-[10px]">{counts.get(f.key)}</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground/50 py-8 text-center">{filter === 'all' ? 'No sessions yet.' : `No ${filter} sessions.`}</p>
        ) : (
          <div className="flex flex-col gap-2">
            {filtered.map(s => (
              <SessionCard key={s.id} session={s} agent={agentFor(s)} task={taskFor(s)}
                onClick={() => navigate(`/sessions/${s.id}`)} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
