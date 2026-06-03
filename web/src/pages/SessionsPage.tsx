import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useParams, useNavigate } from 'react-router-dom'
import { sessions, agents, tasks } from '../api/client'
import type { Session, Agent, Task, SessionStatus } from '../api/client'
import { AgentAvatar } from '@/components/AgentAvatar'
import { cn } from '@/lib/utils'

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60)  return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60)  return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24)  return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

const STATUS_CONFIG: Record<string, { dot: string; label: string; color: string; bg: string }> = {
  running: { dot: 'green pulse', label: 'Running', color: 'var(--green)',  bg: 'color-mix(in srgb, var(--green) 12%, transparent)' },
  idle:    { dot: 'idle',        label: 'Idle',    color: 'var(--faint)',  bg: 'var(--panel-2)' },
  done:    { dot: 'idle',        label: 'Done',    color: 'var(--muted)',  bg: 'var(--panel-2)' },
  merged:  { dot: 'indigo',      label: 'Merged',  color: 'var(--ember)',  bg: 'var(--ember-wash)' },
  error:   { dot: 'red',         label: 'Error',   color: 'var(--red)',    bg: 'color-mix(in srgb, var(--red) 12%, transparent)' },
}

function SessionCard({ session, agent, task, onClick }: {
  session: Session; agent?: Agent; task?: Task; onClick: () => void
}) {
  const cfg = STATUS_CONFIG[session.status] ?? STATUS_CONFIG.idle
  const isSpec = !!session.specId
  const title = task?.title ?? (isSpec ? 'Planning session' : session.branch)

  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 14, width: '100%', textAlign: 'left',
        padding: '14px 16px', background: 'var(--panel)', border: '1px solid var(--rule)',
        borderRadius: 12, boxShadow: 'var(--shadow-sm)', cursor: 'pointer',
        transition: 'background .1s, border-color .1s',
      }}
      onMouseOver={e => { e.currentTarget.style.background = 'var(--panel-2)' }}
      onMouseOut={e => { e.currentTarget.style.background = 'var(--panel)' }}
    >
      <AgentAvatar agent={agent} size={40} running={session.status === 'running'} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {title}
        </p>
        <p style={{ fontSize: 11.5, color: 'var(--muted)', margin: '3px 0 0', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {session.branch}{isSpec && ' · plan'}
        </p>
      </div>
      <span style={{ fontSize: 11, color: 'var(--faint)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>{timeAgo(session.createdAt)}</span>
      <span style={{
        fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6, flexShrink: 0,
        color: cfg.color, background: cfg.bg,
        display: 'flex', alignItems: 'center', gap: 5,
      }}>
        <span className={`dot ${cfg.dot}`} style={{ width: 5, height: 5 }} />
        {cfg.label}
      </span>
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
      <div className="px-6 pt-6 pb-8 flex flex-col gap-6">

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
