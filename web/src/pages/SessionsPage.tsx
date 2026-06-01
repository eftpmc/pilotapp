import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useParams, useNavigate } from 'react-router-dom'
import { sessions, employees, tasks } from '../api/client'
import type { Session, Employee, Task, SessionStatus } from '../api/client'
import { AgentAvatar } from '@/components/AgentAvatar'

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60)  return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60)  return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24)  return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

const STATUS_DOT: Record<string, string> = {
  running: 'green pulse',
  idle:    'idle',
  done:    'idle',
  merged:  'indigo',
  error:   'red',
}

const STATUS_LABEL: Record<string, [string, string]> = {
  running: ['Running', 'var(--green)'],
  idle:    ['Idle',    'var(--faint)'],
  done:    ['Done',    'var(--muted)'],
  merged:  ['Merged',  'var(--indigo)'],
  error:   ['Error',   'var(--red)'],
}

function SessionRow({ session, agent, task, onClick }: {
  session: Session; agent?: Employee; task?: Task; onClick: () => void
}) {
  const dotClass = STATUS_DOT[session.status] ?? 'idle'
  const [label, color] = STATUS_LABEL[session.status] ?? ['Unknown', 'var(--muted)']
  const isSpec = !!session.specId

  return (
    <button className="row" onClick={onClick}>
      <span className={`dot ${dotClass}`} />
      <AgentAvatar agent={agent} size={26} running={session.status === 'running'} />
      <div className="row-main">
        <div className="row-title">
          {task?.title ?? (isSpec ? 'Planning session' : session.branch)}
        </div>
        <div className="row-meta">
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{session.branch}</span>
          {isSpec && <><span className="sep">·</span><span>plan</span></>}
        </div>
      </div>
      <span className="row-time">{timeAgo(session.createdAt)}</span>
      <span className="chip" style={{ color, borderColor: 'transparent', background: 'color-mix(in srgb, ' + color + ' 10%, transparent)' }}>{label}</span>
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
  const { data: agentList = [] } = useQuery({ queryKey: ['employees'],         queryFn: () => employees.list() })
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
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflowY: 'auto', background: 'var(--bg)' }}>

      <div className="page-content narrow" style={{ paddingTop: 32, paddingBottom: 60 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 22 }}>
          <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 24, fontWeight: 420, letterSpacing: '-0.02em', margin: 0 }}>History</h2>
          <span className="count">{sessionList.length}</span>
        </div>

        {visibleFilters.length > 2 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 18, flexWrap: 'wrap' }}>
          {visibleFilters.map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              style={{
                padding: '5px 9px', borderRadius: 8, fontSize: 13, fontWeight: 500,
                border: 'none', cursor: 'pointer', background: 'none',
                color: filter === f.key ? 'var(--ink)' : 'var(--muted)',
                fontFamily: 'inherit',
              }}
              onMouseOver={e => { if (filter !== f.key) e.currentTarget.style.background = 'var(--panel)' }}
              onMouseOut={e => { if (filter !== f.key) e.currentTarget.style.background = 'none' }}
            >
              {f.label}
              {f.key !== 'all' && counts.get(f.key) && (
                <span style={{ marginLeft: 5, opacity: 0.45, fontFamily: 'var(--font-mono)', fontSize: 11 }}>{counts.get(f.key)}</span>
              )}
            </button>
          ))}
        </div>
        )}

        {isLoading ? (
          <div style={{ color: 'var(--muted)', fontSize: 13, padding: '32px 0' }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <p className="empty-line">{filter === 'all' ? 'No sessions yet.' : `No ${filter} sessions.`}</p>
        ) : (
          <div className="rows">
            {filtered.map(s => (
              <SessionRow key={s.id} session={s} agent={agentFor(s)} task={taskFor(s)}
                onClick={() => navigate(`/sessions/${s.id}`)} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
