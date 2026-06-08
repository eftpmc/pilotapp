import { useEffect, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { sessions, agents, tasks, projects, AgentAvatar, PERSONALITY_PRESETS, timeAgo } from '@pilot/shared'
import type { Session, Task } from '@pilot/shared'

const STATUS_COLOR: Record<string, string> = {
  idle:    'rgba(255,255,255,0.25)',
  running: '#3dd68c',
  waiting: '#facc15',
  done:    '#60a5fa',
  error:   '#f87171',
  merged:  'rgba(255,255,255,0.25)',
}
const STATUS_LABEL: Record<string, string> = {
  idle: 'Idle', running: 'Running', waiting: 'Waiting',
  done: 'Done', error: 'Error', merged: 'Merged',
}

interface Props {
  sessionId: string | null
  agentId: string | null
  logLines: string[]
  onClose: () => void
}

export default function SessionPanel({ sessionId, agentId: agentIdProp, logLines, onClose }: Props) {
  const qc = useQueryClient()
  const logRef = useRef<HTMLDivElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)
  const [visible, setVisible] = useState(false)
  const [assigning, setAssigning] = useState(false)
  const [taskSearch, setTaskSearch] = useState('')

  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(id)
  }, [])

  const { data: session } = useQuery({
    queryKey: ['sessions', sessionId],
    queryFn: () => sessions.get(sessionId!),
    refetchInterval: 3000,
    enabled: !!sessionId,
  })

  const agentId = session?.agentId ?? agentIdProp ?? undefined
  const taskId  = session?.workTaskId

  const { data: agentList   = [] } = useQuery({ queryKey: ['agents'],             queryFn: () => agents.list() })
  const { data: task              } = useQuery({ queryKey: ['tasks', taskId],      queryFn: () => tasks.get(taskId!), enabled: !!taskId })
  const { data: projectList = [] } = useQuery({ queryKey: ['projects'],            queryFn: () => projects.list() })
  const { data: allTasks    = [] } = useQuery({ queryKey: ['tasks'],               queryFn: () => tasks.list(), enabled: assigning })

  const agent   = agentList.find(a => a.id === agentId)
  const project = projectList.find(p => p.id === session?.projectId)

  const stop    = useMutation({ mutationFn: () => sessions.stop(sessionId!),   onSuccess: () => qc.invalidateQueries({ queryKey: ['sessions'] }) })
  const merge   = useMutation({ mutationFn: () => sessions.merge(sessionId!),  onSuccess: () => { qc.invalidateQueries({ queryKey: ['sessions'] }); onClose() } })
  const discard = useMutation({ mutationFn: () => sessions.delete(sessionId!), onSuccess: () => { qc.invalidateQueries({ queryKey: ['sessions'] }); onClose() } })
  const assign  = useMutation({
    mutationFn: (taskId: string) => tasks.assign(taskId, agentId!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sessions'] })
      qc.invalidateQueries({ queryKey: ['tasks'] })
      setAssigning(false)
    },
  })

  useEffect(() => {
    if (autoScroll && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [logLines, autoScroll])

  function onLogScroll() {
    if (!logRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = logRef.current
    setAutoScroll(scrollHeight - scrollTop - clientHeight < 40)
  }

  const status    = sessionId ? (session?.status ?? 'idle') : 'idle'
  const color     = STATUS_COLOR[status] ?? STATUS_COLOR.idle
  const isRunning = status === 'running' || status === 'waiting'
  const isDone    = status === 'done' || status === 'error'
  const hasSession = !!sessionId
  const panelTitle = !hasSession
    ? 'Ready for assignment'
    : isDone
      ? status === 'error' ? 'Needs review' : 'Ready to review'
      : isRunning
        ? 'Live session'
        : 'Session'
  const panelNote = !hasSession
    ? 'Pick a queued task to put this agent to work.'
    : isDone
      ? status === 'error' ? 'The run ended with an error. Inspect before merging.' : 'The run is complete and waiting for your decision.'
      : isRunning
        ? 'Streaming output from the active run.'
        : 'Session details'

  const chunks = (agent?.personality ?? '').split('\n\n').map(c => c.trim()).filter(Boolean)
  const activePresets = chunks
    .map(c => PERSONALITY_PRESETS.find(p => p.prompt === c))
    .filter(Boolean) as typeof PERSONALITY_PRESETS

  const pendingTasks = allTasks.filter((t: Task) =>
    t.status === 'pending' &&
    (taskSearch === '' || t.title.toLowerCase().includes(taskSearch.toLowerCase()))
  )

  return (
    <div style={{
      position: 'fixed',
      left: 20,
      bottom: `calc(var(--bar-h) + 16px)`,
      width: isRunning ? 340 : isDone ? 320 : 300,
      zIndex: 50,
      borderRadius: 16,
      background: 'oklch(0.13 0.008 265 / 0.95)',
      border: '1px solid rgba(255,255,255,0.1)',
      backdropFilter: 'blur(24px)',
      boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
      overflow: 'hidden',
      transform: visible ? 'translateY(0) scale(1)' : 'translateY(12px) scale(0.97)',
      opacity: visible ? 1 : 0,
      transition: 'transform 240ms cubic-bezier(0.32, 0.72, 0, 1), opacity 200ms ease',
    }}>

      {/* ── Identity row ── */}
      <div style={{ padding: '14px 14px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
        {agent
          ? <AgentAvatar agent={agent} size={40} running={isRunning} />
          : <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(255,255,255,0.06)', flexShrink: 0 }} />
        }
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', letterSpacing: '-0.02em', lineHeight: 1.2 }}>
            {agent?.name ?? 'Agent'}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 500, color }}>
              <span style={{
                width: 5, height: 5, borderRadius: '50%', background: color, flexShrink: 0,
                boxShadow: isRunning ? `0 0 5px ${color}` : 'none',
              }} />
              {STATUS_LABEL[status]}
            </span>
            {agent?.role === 'lead' && (
              <span style={{
                fontSize: 9, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase',
                padding: '1px 5px', borderRadius: 20,
                background: 'rgba(255,107,53,0.18)', color: '#ff6b35',
              }}>Lead</span>
            )}
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            width: 24, height: 24, borderRadius: 6, flexShrink: 0,
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)',
            color: 'rgba(255,255,255,0.3)', fontSize: 14,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', transition: 'background 120ms, color 120ms',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.12)'; e.currentTarget.style.color = 'rgba(255,255,255,0.7)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = 'rgba(255,255,255,0.3)' }}
        >×</button>
      </div>

      <div style={{
        margin: '0 12px 10px',
        padding: '8px 10px',
        borderRadius: 10,
        background: isDone ? `${color}12` : 'rgba(255,255,255,0.04)',
        border: `1px solid ${isDone ? `${color}2e` : 'rgba(255,255,255,0.06)'}`,
      }}>
        <div style={{ fontSize: 11, fontWeight: 750, color: isDone ? color : 'rgba(255,255,255,0.75)', letterSpacing: '0.01em' }}>
          {panelTitle}
        </div>
        <div style={{ fontSize: 10.5, lineHeight: 1.35, color: 'rgba(255,255,255,0.32)', marginTop: 3 }}>
          {panelNote}
        </div>
      </div>

      {/* ── Task card (active session) ── */}
      {task && (
        <div style={{ margin: '0 12px 10px', padding: '9px 11px', borderRadius: 10, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)', fontWeight: 500, lineHeight: 1.4,
            overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
            {task.title}
          </div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', marginTop: 5, display: 'flex', gap: 6 }}>
            {project && <span>{project.name}</span>}
            {session?.branch && <span style={{ fontFamily: 'monospace' }}>{session.branch}</span>}
            {session && <span>{timeAgo(session.createdAt)}</span>}
          </div>
        </div>
      )}

      {/* ── Idle: traits + assign ── */}
      {!hasSession && !assigning && (
        <div style={{ margin: '0 12px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {activePresets.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {activePresets.slice(0, 3).map(p => (
                <span key={p.label} style={{
                  fontSize: 10, fontWeight: 500, padding: '2px 8px', borderRadius: 20,
                  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)',
                  color: 'rgba(255,255,255,0.4)',
                }}>{p.label}</span>
              ))}
            </div>
          )}
          <button
            onClick={() => setAssigning(true)}
            style={{
              width: '100%', padding: '9px 0', borderRadius: 9,
              fontSize: 12, fontWeight: 600,
              background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)',
              border: '1px solid rgba(255,255,255,0.12)',
              cursor: 'pointer', transition: 'background 120ms, color 120ms',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.14)'; e.currentTarget.style.color = '#fff' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = 'rgba(255,255,255,0.7)' }}
          >
            Assign task
          </button>
        </div>
      )}

      {/* ── Task picker ── */}
      {assigning && (
        <div style={{ margin: '0 12px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
            <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.25)' }}>
              Pick a task
            </span>
            <button
              onClick={() => { setAssigning(false); setTaskSearch('') }}
              style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', background: 'none', cursor: 'pointer', padding: '2px 4px' }}
            >Cancel</button>
          </div>

          <input
            autoFocus
            placeholder="Search…"
            value={taskSearch}
            onChange={e => setTaskSearch(e.target.value)}
            style={{
              width: '100%', padding: '7px 10px', borderRadius: 8,
              background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)',
              color: '#fff', fontSize: 12, fontFamily: 'inherit', outline: 'none',
            }}
          />

          <div style={{ maxHeight: 180, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
            {pendingTasks.length === 0 ? (
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.2)', fontStyle: 'italic', padding: '8px 4px' }}>
                {taskSearch ? 'No matching tasks' : 'No tasks in queue'}
              </div>
            ) : (
              pendingTasks.map((t: Task) => {
                const proj = projectList.find(p => p.id === t.projectId)
                return (
                  <button
                    key={t.id}
                    onClick={() => assign.mutate(t.id)}
                    disabled={assign.isPending}
                    style={{
                      width: '100%', padding: '8px 10px', borderRadius: 8, textAlign: 'left',
                      background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)',
                      cursor: 'pointer', transition: 'background 100ms',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.09)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 500, color: '#fff', lineHeight: 1.3,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {t.title}
                    </div>
                    {proj && (
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 3 }}>{proj.name}</div>
                    )}
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}

      {/* ── Log (active session) ── */}
      {hasSession && (
        <div
          ref={logRef}
          onScroll={onLogScroll}
          style={{
            margin: '0 12px 10px', height: 140, overflowY: 'auto',
            borderRadius: 10, background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.06)',
            padding: '8px 10px',
            fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
            fontSize: 10.5, lineHeight: 1.65, color: 'rgba(255,255,255,0.5)',
          }}
        >
          {logLines.length === 0 ? (
            <span style={{ color: 'rgba(255,255,255,0.2)', fontStyle: 'italic' }}>
              {isRunning ? 'Waiting for output…' : 'No output'}
            </span>
          ) : (
            logLines.map((line, i) => (
              <div key={i} style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{line}</div>
            ))
          )}
        </div>
      )}

      {/* ── Actions ── */}
      {(isRunning || isDone) && (
        <div style={{ padding: '0 12px 12px', display: 'flex', gap: 7 }}>
          {isRunning && (
            <ActionBtn onClick={() => stop.mutate()} disabled={stop.isPending} variant="danger">
              {stop.isPending ? 'Stopping…' : 'Stop'}
            </ActionBtn>
          )}
          {isDone && (
            <>
              <ActionBtn onClick={() => discard.mutate()} disabled={discard.isPending} variant="ghost">
                {discard.isPending ? '…' : 'Discard'}
              </ActionBtn>
              <ActionBtn onClick={() => merge.mutate()} disabled={merge.isPending} variant={status === 'error' ? 'danger' : 'primary'}>
                {merge.isPending ? 'Merging…' : status === 'error' ? 'Merge anyway' : 'Merge'}
              </ActionBtn>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function ActionBtn({
  variant = 'ghost', children, ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'ghost' | 'primary' | 'danger' }) {
  const styles: Record<string, React.CSSProperties> = {
    ghost:   { background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.55)', border: '1px solid rgba(255,255,255,0.1)' },
    primary: { background: '#3dd68c', color: '#0e0c0a', border: 'none' },
    danger:  { background: 'rgba(248,113,113,0.14)', color: '#f87171', border: '1px solid rgba(248,113,113,0.28)' },
  }
  return (
    <button
      {...props}
      style={{
        flex: 1, padding: '8px 0', borderRadius: 8,
        fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
        cursor: 'pointer', transition: 'opacity 100ms',
        ...styles[variant],
      }}
      onMouseEnter={e => { if (!props.disabled) e.currentTarget.style.opacity = '0.75' }}
      onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
    >
      {children}
    </button>
  )
}
