import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { tasks, agents, projects, sessions } from '../api/client'
import type { Task, Agent, Session, Project } from '../api/client'

const T = {
  bg:      '#F2F2F7',
  card:    '#FFFFFF',
  surface: '#F2F2F7',
  surface2:'#E7E7EC',
  border:  'rgba(60,60,67,0.15)',
  text:    '#1C1C1E',
  muted:   'rgba(60,60,67,0.62)',
  faint:   'rgba(60,60,67,0.34)',
  green:   '#34C759',
  danger:  '#FF3B30',
  amber:   '#FF9500',
  tint:    '#0A84FF',
  sans:    '-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif',
  mono:    'ui-monospace, "SF Mono", Menlo, monospace',
}

function ColHead({ title, count, color }: { title: string; count: number; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 12 }}>
      <span style={{ width: 7, height: 7, borderRadius: 2, background: color, flexShrink: 0 }} />
      <span style={{ fontFamily: T.sans, fontSize: 13, fontWeight: 600, color: T.text }}>{title}</span>
      <span style={{ fontFamily: T.mono, fontSize: 11, color: T.faint }}>{count}</span>
    </div>
  )
}

function QueueCard({ task, agentList, onAssign, onDelete }: {
  task: Task; agentList: Agent[]; onAssign: (agentId: string) => void; onDelete: () => void
}) {
  return (
    <div style={{ background: T.card, border: `1px dashed ${T.border}`, borderRadius: 12, padding: '11px 13px', display: 'flex', flexDirection: 'column', gap: 9 }}>
      <div style={{ fontFamily: T.sans, fontSize: 13, fontWeight: 500, lineHeight: 1.35, color: T.text }}>{task.title}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontFamily: T.mono, fontSize: 10.5, color: T.faint, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {task.baseBranch || 'main'}
        </span>
        {agentList.length > 0 ? (
          <select
            defaultValue=""
            onChange={e => { if (e.target.value) onAssign(e.target.value) }}
            style={{ fontFamily: T.sans, fontSize: 11, fontWeight: 600, color: T.tint, background: 'transparent', border: 'none', cursor: 'pointer', outline: 'none', padding: 0 }}
          >
            <option value="" disabled>Assign ›</option>
            {agentList.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        ) : (
          <span style={{ fontFamily: T.sans, fontSize: 11, color: T.faint }}>No agents</span>
        )}
        <button onClick={onDelete} style={{ background: 'transparent', border: 'none', color: T.faint, cursor: 'pointer', fontSize: 13, padding: '0 2px', lineHeight: 1 }}>×</button>
      </div>
    </div>
  )
}

function WorkingCard({ session, agent, task, onClick }: {
  session: Session; agent?: Agent; task?: Task; onClick: () => void
}) {
  return (
    <button onClick={onClick} style={{ width: '100%', textAlign: 'left', background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: '12px 13px', display: 'flex', flexDirection: 'column', gap: 9, cursor: 'pointer', position: 'relative', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        <AgentDot agent={agent} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: T.sans, fontSize: 13.5, fontWeight: 600, color: T.text }}>{agent?.name ?? '—'}</div>
          <div style={{ fontFamily: T.mono, fontSize: 10, color: T.faint, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{session.branch}</div>
        </div>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: T.sans, fontSize: 11, fontWeight: 600, color: T.green, background: T.green + '18', border: `1px solid ${T.green}30`, padding: '2px 8px', borderRadius: 999 }}>
          <LiveDot /> Working
        </span>
      </div>
      {task && (
        <div style={{ fontFamily: T.sans, fontSize: 12.5, color: T.text, lineHeight: 1.3 }}>{task.title}</div>
      )}
    </button>
  )
}

function ReviewCard({ session, agent, task, onMerge, onClick }: {
  session: Session; agent?: Agent; task?: Task; onMerge: () => void; onClick: () => void
}) {
  const isError = session.status === 'error'
  return (
    <div onClick={onClick} style={{ background: T.card, border: `1px solid ${isError ? T.danger + '44' : T.border}`, borderRadius: 12, padding: '12px 13px', display: 'flex', flexDirection: 'column', gap: 9, cursor: 'pointer' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        <AgentDot agent={agent} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: T.sans, fontSize: 13.5, fontWeight: 600, color: T.text }}>{agent?.name ?? '—'}</div>
          {task && <div style={{ fontFamily: T.mono, fontSize: 10.5, color: T.faint, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{task.title}</div>}
        </div>
        <span style={{ fontFamily: T.sans, fontSize: 11, fontWeight: 600, color: isError ? T.danger : T.green, background: (isError ? T.danger : T.green) + '18', border: `1px solid ${(isError ? T.danger : T.green)}30`, padding: '2px 8px', borderRadius: 999 }}>
          {isError ? 'Error' : 'Ready'}
        </span>
      </div>
      <div style={{ fontFamily: T.mono, fontSize: 10.5, color: T.faint, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{session.branch}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }} onClick={e => e.stopPropagation()}>
        <div style={{ flex: 1 }} />
        <GhostBtn label="Log" onClick={onClick} />
        {isError
          ? <TintBtn label="Retry" onClick={onClick} />
          : <TintBtn label="Merge ✓" onClick={onMerge} />
        }
      </div>
    </div>
  )
}

function AgentDot({ agent }: { agent?: Agent }) {
  const colors: Record<string, string> = { claude: '#F0820B', codex: '#0A84FF' }
  const color = agent ? (colors[agent.provider] ?? T.tint) : T.faint
  return (
    <div style={{ width: 32, height: 32, borderRadius: 8, background: color + '20', border: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <span style={{ fontFamily: T.sans, fontSize: 12, fontWeight: 700, color }}>{agent?.name?.[0] ?? '?'}</span>
    </div>
  )
}

function LiveDot() {
  return (
    <span style={{ width: 5, height: 5, borderRadius: '50%', background: T.green, display: 'inline-block', animation: 'pulse 1.6s ease-out infinite' }} />
  )
}

function GhostBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ fontFamily: T.sans, fontSize: 11, fontWeight: 600, color: T.text, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 7, padding: '5px 11px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
      {label}
    </button>
  )
}

function TintBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ fontFamily: T.sans, fontSize: 11, fontWeight: 600, color: '#FFFFFF', background: T.tint, border: 'none', borderRadius: 7, padding: '5px 11px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
      {label}
    </button>
  )
}

// ---------------------------------------------------------------------------

export default function WorkPage() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [showNew, setShowNew] = useState(false)

  const { data: taskList    = [] } = useQuery({ queryKey: ['tasks'],    queryFn: () => tasks.list() })
  const { data: agentList   = [] } = useQuery({ queryKey: ['agents'],   queryFn: () => agents.list() })
  const { data: projectList = [] } = useQuery({ queryKey: ['projects'], queryFn: () => projects.list() })
  const { data: sessionList = [] } = useQuery({ queryKey: ['sessions'], queryFn: () => sessions.list() })

  const runQueue = useMutation({
    mutationFn: () => tasks.runQueue(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] })
      qc.invalidateQueries({ queryKey: ['sessions'] })
    },
  })

  const deleteTask = useMutation({
    mutationFn: (id: string) => tasks.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  })

  const assignTask = useMutation({
    mutationFn: ({ taskId, agentId }: { taskId: string; agentId: string }) => tasks.assign(taskId, agentId),
    onSuccess: ({ session }) => {
      qc.invalidateQueries({ queryKey: ['tasks'] })
      qc.invalidateQueries({ queryKey: ['sessions'] })
      navigate(`/sessions/${session.id}`)
    },
  })

  const mergeSession = useMutation({
    mutationFn: (id: string) => sessions.merge(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sessions'] }),
  })

  const busyIds  = new Set(sessionList.filter(s => s.status === 'running').map(s => s.agentId))
  const idleAgents = agentList.filter(a => !busyIds.has(a.id))

  const queue   = taskList.filter(t => t.status === 'pending').sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const working = sessionList.filter(s => s.status === 'running' || s.status === 'idle')
  const review  = sessionList.filter(s => s.status === 'done' || s.status === 'error')

  function agentFor(s: Session)  { return agentList.find(a => a.id === s.agentId) }
  function taskFor(s: Session)   { return taskList.find(t => t.id === s.workTaskId) }
  function projectFor(s: Session){ return projectList.find(p => p.id === s.projectId) }
  void projectFor

  const stats = [
    { label: 'Queue',   value: queue.length,   color: T.text },
    { label: 'Working', value: working.length,  color: T.green },
    { label: 'Review',  value: review.length,   color: T.amber },
    { label: 'Free',    value: idleAgents.length, color: T.muted },
  ]

  const col: React.CSSProperties = { flex: '1 1 0', display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }
  const colInner: React.CSSProperties = { flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, paddingBottom: 8 }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: T.bg }}>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }`}</style>

      {/* stat strip + actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 28, padding: '14px 22px 10px', flexShrink: 0 }}>
        {stats.map(({ label, value, color }) => (
          <div key={label} style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontFamily: T.sans, fontSize: 22, fontWeight: 600, color, letterSpacing: '-.02em', lineHeight: 1.1 }}>{value}</span>
            <span style={{ fontFamily: T.mono, fontSize: 10, color: T.faint, textTransform: 'uppercase', letterSpacing: '.08em', marginTop: 1 }}>{label}</span>
          </div>
        ))}
        <div style={{ flex: 1 }} />
        {queue.length > 0 && idleAgents.length > 0 && (
          <button onClick={() => runQueue.mutate()} disabled={runQueue.isPending}
            style={{ fontFamily: T.sans, fontSize: 12, fontWeight: 600, color: T.text, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 9, padding: '7px 12px', cursor: 'pointer', whiteSpace: 'nowrap', opacity: runQueue.isPending ? 0.5 : 1 }}>
            {runQueue.isPending ? '…' : '▶ Run queue'}
          </button>
        )}
        <button onClick={() => setShowNew(true)} disabled={agentList.length === 0 || projectList.length === 0}
          style={{ fontFamily: T.sans, fontSize: 12.5, fontWeight: 600, color: '#FFFFFF', background: T.tint, border: 'none', borderRadius: 9, padding: '8px 14px', cursor: 'pointer', whiteSpace: 'nowrap', opacity: (agentList.length === 0 || projectList.length === 0) ? 0.4 : 1 }}>
          + New task
        </button>
      </div>

      {/* kanban columns */}
      <div style={{ display: 'flex', gap: 16, padding: '4px 22px 16px', flex: 1, minHeight: 0 }}>

        {/* queue */}
        <div style={col}>
          <ColHead title="Queue" count={queue.length} color={T.faint} />
          <div style={colInner}>
            {queue.map(task => (
              <QueueCard key={task.id} task={task} agentList={idleAgents}
                onAssign={agentId => assignTask.mutate({ taskId: task.id, agentId })}
                onDelete={() => deleteTask.mutate(task.id)}
              />
            ))}
            {queue.length === 0 && (
              <div style={{ fontFamily: T.mono, fontSize: 11, color: T.faint, padding: '6px 2px' }}>queue empty ✦</div>
            )}
          </div>
        </div>

        {/* working */}
        <div style={col}>
          <ColHead title="Working" count={working.length} color={T.green} />
          <div style={colInner}>
            {working.map(s => (
              <WorkingCard key={s.id} session={s} agent={agentFor(s)} task={taskFor(s)}
                onClick={() => navigate(`/sessions/${s.id}`)} />
            ))}
            {working.length === 0 && (
              <div style={{ fontFamily: T.mono, fontSize: 11, color: T.faint, padding: '6px 2px' }}>nobody's coding yet</div>
            )}
          </div>
        </div>

        {/* review */}
        <div style={col}>
          <ColHead title="Review" count={review.length} color={T.amber} />
          <div style={colInner}>
            {review.map(s => (
              <ReviewCard key={s.id} session={s} agent={agentFor(s)} task={taskFor(s)}
                onMerge={() => mergeSession.mutate(s.id)}
                onClick={() => navigate(`/sessions/${s.id}`)} />
            ))}
            {review.length === 0 && (
              <div style={{ fontFamily: T.mono, fontSize: 11, color: T.faint, padding: '6px 2px' }}>nothing to review</div>
            )}
          </div>
        </div>

      </div>

      {showNew && (
        <NewTaskModal
          projects={projectList}
          onClose={() => setShowNew(false)}
          onCreate={async body => {
            await tasks.create(body)
            qc.invalidateQueries({ queryKey: ['tasks'] })
            setShowNew(false)
          }}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------

const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', background: T.surface, border: `1px solid ${T.border}`,
  borderRadius: 9, padding: '9px 11px', fontFamily: T.sans, fontSize: 13, color: T.text, outline: 'none',
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontFamily: T.mono, fontSize: 9.5, color: T.faint, textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 6 }}>
      {children}
    </div>
  )
}

function NewTaskModal({ projects: projectList, onClose, onCreate }: {
  projects: Project[]
  onClose: () => void
  onCreate: (body: { projectId: string; title: string; prompt: string; baseBranch: string }) => Promise<void>
}) {
  const [projectId, setProjectId] = useState(projectList[0]?.id ?? '')
  const [title, setTitle]         = useState('')
  const [prompt, setPrompt]       = useState('')
  const [baseBranch, setBaseBranch] = useState('main')
  const [loading, setLoading]     = useState(false)
  const valid = title.trim().length > 2 && !!projectId

  async function submit() {
    if (!valid) return
    setLoading(true)
    try { await onCreate({ projectId, title: title.trim(), prompt, baseBranch }) }
    finally { setLoading(false) }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 440, background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, padding: '20px 22px 18px', boxShadow: '0 30px 80px rgba(0,0,0,.18)' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 18 }}>
          <span style={{ fontFamily: T.sans, fontSize: 17, fontWeight: 600, color: T.text }}>New task</span>
          <div style={{ flex: 1 }} />
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: T.muted, fontSize: 18, cursor: 'pointer', lineHeight: 1, padding: 4 }}>×</button>
        </div>

        <div style={{ marginBottom: 14 }}>
          <FieldLabel>Title</FieldLabel>
          <input autoFocus value={title} onChange={e => setTitle(e.target.value)}
            placeholder="What should the agent do?"
            onKeyDown={e => { if (e.key === 'Enter' && valid) submit() }}
            style={inputStyle} />
        </div>

        <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
          <div style={{ flex: 1 }}>
            <FieldLabel>Project</FieldLabel>
            <select value={projectId} onChange={e => setProjectId(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
              {projectList.map(p => <option key={p.id} value={p.id} style={{ background: T.surface }}>{p.name}</option>)}
            </select>
          </div>
          <div style={{ width: 120 }}>
            <FieldLabel>Base branch</FieldLabel>
            <input value={baseBranch} onChange={e => setBaseBranch(e.target.value)} style={{ ...inputStyle, fontFamily: T.mono, fontSize: 12 }} />
          </div>
        </div>

        <div style={{ marginBottom: 20 }}>
          <FieldLabel>Prompt</FieldLabel>
          <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={3}
            placeholder="Additional context for the agent…"
            style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }} />
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{ flex: '0 0 auto', fontFamily: T.sans, fontSize: 13, fontWeight: 600, color: T.muted, background: 'transparent', border: `1px solid ${T.border}`, borderRadius: 10, padding: '10px 16px', cursor: 'pointer' }}>
            Cancel
          </button>
          <button onClick={submit} disabled={!valid || loading} style={{ flex: 1, fontFamily: T.sans, fontSize: 13, fontWeight: 700, color: '#FFFFFF', background: T.tint, border: 'none', borderRadius: 10, padding: '10px 0', cursor: valid && !loading ? 'pointer' : 'default', opacity: valid && !loading ? 1 : 0.4 }}>
            {loading ? '…' : 'Add to queue'}
          </button>
        </div>
      </div>
    </div>
  )
}
