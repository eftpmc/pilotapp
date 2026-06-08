import { useEffect, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { sessions, agents, tasks, projects } from '@pilot/shared'
import type { Session } from '@pilot/shared'

const STATUS_COLOR: Record<string, string> = {
  idle:    'rgba(255,255,255,0.3)',
  running: '#3dd68c',
  waiting: '#facc15',
  done:    '#60a5fa',
  error:   '#f87171',
  merged:  'rgba(255,255,255,0.3)',
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

  const { data: session } = useQuery({
    queryKey: ['sessions', sessionId],
    queryFn: () => sessions.get(sessionId!),
    refetchInterval: 3000,
    enabled: !!sessionId,
  })

  const agentId = session?.agentId ?? agentIdProp ?? undefined
  const taskId  = session?.workTaskId

  const { data: agentList = [] } = useQuery({ queryKey: ['agents'],   queryFn: () => agents.list() })
  const { data: task            } = useQuery({ queryKey: ['tasks', taskId],  queryFn: () => tasks.get(taskId!), enabled: !!taskId })
  const { data: projectList = [] } = useQuery({ queryKey: ['projects'], queryFn: () => projects.list() })

  const agent   = agentList.find(a => a.id === agentId)
  const project = projectList.find(p => p.id === session?.projectId)

  const stop    = useMutation({ mutationFn: () => sessions.stop(sessionId!),   onSuccess: () => qc.invalidateQueries({ queryKey: ['sessions'] }) })
  const merge   = useMutation({ mutationFn: () => sessions.merge(sessionId!),  onSuccess: () => { qc.invalidateQueries({ queryKey: ['sessions'] }); onClose() } })
  const discard = useMutation({ mutationFn: () => sessions.delete(sessionId!), onSuccess: () => { qc.invalidateQueries({ queryKey: ['sessions'] }); onClose() } })

  // Auto-scroll log to bottom
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

  const status = sessionId ? (session?.status ?? 'idle') : 'idle'
  const color  = STATUS_COLOR[status] ?? STATUS_COLOR.idle
  const isRunning = status === 'running' || status === 'waiting'
  const isDone    = status === 'done' || status === 'error'

  return (
    <div style={{
      position: 'absolute', top: 0, right: 0, bottom: 0,
      width: 360, zIndex: 30,
      display: 'flex', flexDirection: 'column',
      background: 'rgba(14,12,10,0.92)',
      borderLeft: '1px solid rgba(255,255,255,0.07)',
      backdropFilter: 'blur(20px)',
    }}>

      {/* Header */}
      <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid rgba(255,255,255,0.07)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: '50%',
            background: 'rgba(255,255,255,0.06)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 14, fontWeight: 700, color: 'rgba(255,255,255,0.5)',
            flexShrink: 0,
          }}>
            {agent?.name?.[0]?.toUpperCase() ?? '?'}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', lineHeight: 1.2 }}>
              {agent?.name ?? 'Agent'}
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>
              {agent?.provider ?? ''}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              fontSize: 10, fontWeight: 600, letterSpacing: '0.04em',
              padding: '3px 8px', borderRadius: 20,
              background: `${color}18`, color, border: `1px solid ${color}30`,
            }}>
              {STATUS_LABEL[status]}
            </span>
            <button onClick={onClose} style={{
              width: 26, height: 26, borderRadius: 6,
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: 'rgba(255,255,255,0.4)', fontSize: 14, lineHeight: 1,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>×</button>
          </div>
        </div>

        {task && (
          <div style={{
            marginTop: 10, padding: '8px 10px', borderRadius: 8,
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.07)',
          }}>
            <div style={{ fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.25)', marginBottom: 4 }}>Task</div>
            <div style={{ fontSize: 12, color: '#fff', lineHeight: 1.4, fontWeight: 500 }}>{task.title}</div>
            {project && (
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 4 }}>
                {project.name}
                {session?.branch && <> · <span style={{ fontFamily: 'monospace' }}>{session.branch}</span></>}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Log */}
      <div
        ref={logRef}
        onScroll={onLogScroll}
        style={{
          flex: 1, overflowY: 'auto', padding: '10px 14px',
          fontFamily: 'monospace', fontSize: 11, lineHeight: 1.6,
          color: 'rgba(255,255,255,0.6)',
        }}
      >
        {logLines.length === 0 ? (
          <div style={{ color: 'rgba(255,255,255,0.2)', fontStyle: 'italic', marginTop: 8 }}>
            {!sessionId ? 'No active session' : isRunning ? 'Waiting for output…' : 'No output'}
          </div>
        ) : (
          logLines.map((line, i) => (
            <div key={i} style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
              {line}
            </div>
          ))
        )}
      </div>

      {/* Actions */}
      <div style={{
        padding: '12px 14px', borderTop: '1px solid rgba(255,255,255,0.07)',
        display: 'flex', gap: 8, flexShrink: 0,
      }}>
        {isRunning && (
          <button
            onClick={() => stop.mutate()}
            disabled={stop.isPending}
            style={{
              flex: 1, padding: '9px 0', borderRadius: 8, fontSize: 12, fontWeight: 600,
              background: 'rgba(248,113,113,0.12)', color: '#f87171',
              border: '1px solid rgba(248,113,113,0.25)', cursor: 'pointer',
            }}
          >
            {stop.isPending ? 'Stopping…' : 'Stop'}
          </button>
        )}
        {isDone && (
          <>
            <button
              onClick={() => discard.mutate()}
              disabled={discard.isPending}
              style={{
                flex: 1, padding: '9px 0', borderRadius: 8, fontSize: 12, fontWeight: 600,
                background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)',
                border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer',
              }}
            >
              {discard.isPending ? '…' : 'Discard'}
            </button>
            <button
              onClick={() => merge.mutate()}
              disabled={merge.isPending}
              style={{
                flex: 2, padding: '9px 0', borderRadius: 8, fontSize: 12, fontWeight: 700,
                background: status === 'error' ? 'rgba(248,113,113,0.15)' : '#3dd68c',
                color: status === 'error' ? '#f87171' : '#0e0c0a',
                border: status === 'error' ? '1px solid rgba(248,113,113,0.3)' : 'none',
                cursor: 'pointer',
              }}
            >
              {merge.isPending ? 'Merging…' : status === 'error' ? 'Merge anyway' : 'Merge'}
            </button>
          </>
        )}
        {status === 'merged' && (
          <div style={{ flex: 1, textAlign: 'center', fontSize: 12, color: 'rgba(255,255,255,0.3)', padding: '9px 0' }}>
            Merged
          </div>
        )}
      </div>
    </div>
  )
}
