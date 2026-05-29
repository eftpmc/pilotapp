import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { tasks, agents, projects, sessions, specs } from '../api/client'
import type { Task, Agent, Session, Spec } from '../api/client'
import { useTheme, KNOWN_FACES } from '../theme'

// ---------------------------------------------------------------------------
// Shared avatar
// ---------------------------------------------------------------------------

function AgentAvatar({ agent, size = 34 }: { agent?: Agent; size?: number }) {
  const { T } = useTheme()
  const [failed, setFailed] = useState(false)
  const name = agent?.name ?? ''
  const colors: Record<string, string> = { claude: '#F0820B', codex: '#0A84FF' }
  const color = agent ? (colors[agent.provider] ?? T.tint) : T.faint
  const r = Math.round(size * 0.28)

  if (KNOWN_FACES.includes(name.toLowerCase()) && !failed) {
    return (
      <div style={{ width: size, height: size, borderRadius: r, background: color + '18', border: `1px solid ${T.border}`, overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
        <img src={`/faces/face_${name.toLowerCase()}.png`} alt={name} onError={() => setFailed(true)}
          style={{ width: '88%', imageRendering: 'pixelated', display: 'block', marginBottom: -1 }} />
      </div>
    )
  }
  return (
    <div style={{ width: size, height: size, borderRadius: r, background: color + '18', border: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <span style={{ fontFamily: 'ui-monospace,monospace', fontSize: Math.round(size * 0.38), fontWeight: 700, color }}>{name[0] ?? '?'}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Kanban card components
// ---------------------------------------------------------------------------

function ColHead({ title, count, color }: { title: string; count: number; color: string }) {
  const { T } = useTheme()
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 12 }}>
      <span style={{ width: 7, height: 7, borderRadius: 2, background: color, flexShrink: 0 }} />
      <span style={{ fontFamily: T.sans, fontSize: 13, fontWeight: 600, color: T.text }}>{title}</span>
      <span style={{ fontFamily: T.mono, fontSize: 11, color: T.faint }}>{count}</span>
    </div>
  )
}

function QueueCard({ task, agentList, onAssign, onDelete }: {
  task: Task; agentList: Agent[]; onAssign: (id: string) => void; onDelete: () => void
}) {
  const { T } = useTheme()
  return (
    <div style={{ background: T.card, border: `1px dashed ${T.border}`, borderRadius: 12, padding: '11px 13px', display: 'flex', flexDirection: 'column', gap: 9 }}>
      <div style={{ fontFamily: T.sans, fontSize: 13, fontWeight: 500, lineHeight: 1.35, color: T.text }}>{task.title}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontFamily: T.mono, fontSize: 10.5, color: T.faint, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.baseBranch || 'main'}</span>
        {agentList.length > 0 ? (
          <select defaultValue="" onChange={e => { if (e.target.value) onAssign(e.target.value) }}
            style={{ fontFamily: T.sans, fontSize: 11, fontWeight: 600, color: T.tint, background: 'transparent', border: 'none', cursor: 'pointer', outline: 'none', padding: 0 }}>
            <option value="" disabled>Assign ›</option>
            {agentList.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        ) : <span style={{ fontFamily: T.sans, fontSize: 11, color: T.faint }}>No agents</span>}
        <button onClick={onDelete} style={{ background: 'transparent', border: 'none', color: T.faint, cursor: 'pointer', fontSize: 13, padding: '0 2px', lineHeight: 1 }}>×</button>
      </div>
    </div>
  )
}

function WorkingCard({ session, agent, task, onClick }: {
  session: Session; agent?: Agent; task?: Task; onClick: () => void
}) {
  const { T } = useTheme()
  return (
    <button onClick={onClick} style={{ width: '100%', textAlign: 'left', background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: '12px 13px', display: 'flex', flexDirection: 'column', gap: 9, cursor: 'pointer' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        <AgentAvatar agent={agent} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: T.sans, fontSize: 13.5, fontWeight: 600, color: T.text }}>{agent?.name ?? '—'}</div>
          <div style={{ fontFamily: T.mono, fontSize: 10, color: T.faint, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{session.branch}</div>
        </div>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: T.sans, fontSize: 11, fontWeight: 600, color: T.green, background: T.green + '18', border: `1px solid ${T.green}30`, padding: '2px 8px', borderRadius: 999 }}>
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: T.green, display: 'inline-block', animation: 'pulse 1.6s ease-out infinite' }} />
          Working
        </span>
      </div>
      {task && <div style={{ fontFamily: T.sans, fontSize: 12.5, color: T.text, lineHeight: 1.3 }}>{task.title}</div>}
    </button>
  )
}

function ReviewCard({ session, agent, task, onMerge, onClick }: {
  session: Session; agent?: Agent; task?: Task; onMerge: () => void; onClick: () => void
}) {
  const { T } = useTheme()
  const isError = session.status === 'error'
  return (
    <div onClick={onClick} style={{ background: T.card, border: `1px solid ${isError ? T.danger + '44' : T.border}`, borderRadius: 12, padding: '12px 13px', display: 'flex', flexDirection: 'column', gap: 9, cursor: 'pointer' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        <AgentAvatar agent={agent} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: T.sans, fontSize: 13.5, fontWeight: 600, color: T.text }}>{agent?.name ?? '—'}</div>
          {task && <div style={{ fontFamily: T.mono, fontSize: 10.5, color: T.faint, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.title}</div>}
        </div>
        <span style={{ fontFamily: T.sans, fontSize: 11, fontWeight: 600, color: isError ? T.danger : T.green, background: (isError ? T.danger : T.green) + '18', border: `1px solid ${(isError ? T.danger : T.green)}30`, padding: '2px 8px', borderRadius: 999 }}>
          {isError ? 'Error' : 'Ready'}
        </span>
      </div>
      <div style={{ fontFamily: T.mono, fontSize: 10.5, color: T.faint, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{session.branch}</div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }} onClick={e => e.stopPropagation()}>
        <button onClick={onClick} style={{ fontFamily: T.sans, fontSize: 11, fontWeight: 600, color: T.text, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 7, padding: '5px 11px', cursor: 'pointer' }}>Log</button>
        {isError
          ? <button onClick={onClick} style={{ fontFamily: T.sans, fontSize: 11, fontWeight: 600, color: '#fff', background: T.tint, border: 'none', borderRadius: 7, padding: '5px 11px', cursor: 'pointer' }}>Retry</button>
          : <button onClick={onMerge} style={{ fontFamily: T.sans, fontSize: 11, fontWeight: 600, color: '#fff', background: T.tint, border: 'none', borderRadius: 7, padding: '5px 11px', cursor: 'pointer' }}>Merge ✓</button>}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Bottom sheet — plans + files
// ---------------------------------------------------------------------------

function BottomSheet({ projectId, specCount, onExecuteSpec }: {
  projectId: string; specCount: number; onExecuteSpec: () => void
}) {
  const { T } = useTheme()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<'plans' | 'files'>('plans')
  const [expandedSpec, setExpandedSpec] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<string | null>(null)

  const anyPlanning = (list: Spec[]) => list.some(s => s.status === 'planning')

  const { data: specList = [] } = useQuery({
    queryKey: ['specs', projectId],
    queryFn: () => specs.list(projectId),
    refetchInterval: q => anyPlanning(q.state.data ?? []) ? 3000 : false,
  })
  const { data: fileData } = useQuery({
    queryKey: ['files', projectId],
    queryFn: () => projects.files(projectId),
    enabled: open && tab === 'files',
  })
  const { data: fileContent } = useQuery({
    queryKey: ['file', projectId, selectedFile],
    queryFn: () => projects.file(projectId, selectedFile!),
    enabled: !!selectedFile,
  })

  const updateSpec = useMutation({
    mutationFn: ({ id, body }: { id: string; body: { title?: string; content?: string } }) => specs.update(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['specs', projectId] }),
  })
  const deleteSpec = useMutation({
    mutationFn: (id: string) => specs.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['specs', projectId] }),
  })
  const executeSpec = useMutation({
    mutationFn: (id: string) => specs.execute(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tasks', projectId] }); setOpen(false); onExecuteSpec() },
  })

  const fileList = fileData?.files ?? []

  // group files by directory for a simple tree feel
  function fileIcon(f: string) {
    const ext = f.split('.').pop() ?? ''
    const icons: Record<string, string> = { ts: '⬡', tsx: '⬡', js: '⬡', jsx: '⬡', json: '{}', md: '¶', css: '◈', py: '⬡', go: '⬡', rs: '⬡', html: '<>' }
    return icons[ext] ?? '·'
  }

  return (
    <div style={{ flexShrink: 0, background: T.card, borderTop: `1px solid ${T.border}`, transition: 'height .22s ease', height: open ? '42vh' : 44, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

      {/* handle */}
      <div onClick={() => setOpen(o => !o)} style={{ height: 44, display: 'flex', alignItems: 'center', gap: 12, padding: '0 20px', cursor: 'pointer', flexShrink: 0 }}>
        <div style={{ width: 32, height: 3, borderRadius: 2, background: T.border, margin: '0 auto', position: 'absolute', left: '50%', transform: 'translateX(-50%)' }} />
        <span style={{ fontFamily: T.sans, fontSize: 12.5, fontWeight: 600, color: T.muted }}>Plans</span>
        {specCount > 0 && <span style={{ fontFamily: T.mono, fontSize: 11, color: T.tint, background: T.tint + '18', borderRadius: 999, padding: '1px 7px' }}>{specCount}</span>}
        <span style={{ fontFamily: T.sans, fontSize: 12.5, color: T.faint, marginLeft: 4 }}>·</span>
        <span style={{ fontFamily: T.sans, fontSize: 12.5, fontWeight: 600, color: T.muted }}>Files</span>
        <div style={{ flex: 1 }} />
        <span style={{ fontFamily: T.sans, fontSize: 12, color: T.faint, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s', display: 'inline-block' }}>⌃</span>
      </div>

      {/* content */}
      {open && (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          {/* tabs */}
          <div style={{ display: 'flex', gap: 2, padding: '0 16px 10px', flexShrink: 0 }}>
            {(['plans', 'files'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)} style={{ fontFamily: T.sans, fontSize: 12, fontWeight: tab === t ? 600 : 500, color: tab === t ? T.text : T.muted, background: tab === t ? T.surface2 : 'transparent', border: 'none', borderRadius: 6, padding: '4px 12px', cursor: 'pointer', textTransform: 'capitalize' }}>{t}</button>
            ))}
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 12px' }}>

            {/* Plans tab */}
            {tab === 'plans' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {specList.length === 0 && (
                  <div style={{ fontFamily: T.mono, fontSize: 12, color: T.faint, textAlign: 'center', paddingTop: 24 }}>No plans yet — create one via "+ New task" → Plan.</div>
                )}
                {specList.map(spec => {
                  const exp = expandedSpec === spec.id
                  return (
                    <div key={spec.id} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, overflow: 'hidden' }}>
                      <div onClick={() => setExpandedSpec(exp ? null : spec.id)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', cursor: 'pointer' }}>
                        <span style={{ fontFamily: T.sans, fontSize: 13, fontWeight: 600, color: T.text, flex: 1 }}>{spec.title}</span>
                        {spec.status === 'planning'
                          ? <span style={{ fontFamily: T.sans, fontSize: 11, color: T.amber, background: T.amber + '18', borderRadius: 999, padding: '2px 8px' }}>Planning…</span>
                          : spec.content && <span style={{ fontFamily: T.sans, fontSize: 11, color: T.green, background: T.green + '18', borderRadius: 999, padding: '2px 8px' }}>Ready</span>}
                        <span style={{ color: T.faint, fontSize: 12, transform: exp ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>›</span>
                      </div>
                      {exp && (
                        <div style={{ borderTop: `1px solid ${T.border}`, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {spec.status === 'planning' ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: T.sans, fontSize: 12, color: T.muted }}>
                              <span style={{ width: 6, height: 6, borderRadius: '50%', background: T.amber, animation: 'pulse 1.6s ease-out infinite', display: 'inline-block' }} />
                              Agent is writing the spec…
                              {spec.sessionId && <button onClick={() => navigate(`/sessions/${spec.sessionId}`)} style={{ fontFamily: T.sans, fontSize: 12, color: T.tint, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline', textUnderlineOffset: 2 }}>Watch</button>}
                            </div>
                          ) : (
                            <SpecEditor spec={spec} onUpdate={body => updateSpec.mutate({ id: spec.id, body })} />
                          )}
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                            <button onClick={() => deleteSpec.mutate(spec.id)} style={{ fontFamily: T.sans, fontSize: 11, color: T.faint, background: 'transparent', border: `1px solid ${T.border}`, borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>Delete</button>
                            <button onClick={() => executeSpec.mutate(spec.id)} disabled={!spec.content.trim() || executeSpec.isPending || spec.status === 'planning'}
                              style={{ fontFamily: T.sans, fontSize: 11, fontWeight: 600, color: '#fff', background: T.tint, border: 'none', borderRadius: 6, padding: '4px 12px', cursor: 'pointer', opacity: spec.content.trim() && spec.status !== 'planning' ? 1 : 0.4 }}>
                              Execute →
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {/* Files tab */}
            {tab === 'files' && (
              <div style={{ display: 'flex', gap: 12, height: '100%' }}>
                <div style={{ width: 220, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {fileList.length === 0 && <div style={{ fontFamily: T.mono, fontSize: 12, color: T.faint, paddingTop: 16 }}>No files committed yet.</div>}
                  {fileList.map(f => (
                    <button key={f} onClick={() => setSelectedFile(f === selectedFile ? null : f)}
                      style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 7, fontFamily: T.mono, fontSize: 11, color: selectedFile === f ? T.tint : T.text, background: selectedFile === f ? T.tint + '12' : 'transparent', border: 'none', borderRadius: 6, padding: '4px 8px', cursor: 'pointer' }}>
                      <span style={{ color: T.faint, flexShrink: 0, width: 14 }}>{fileIcon(f)}</span>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f}</span>
                    </button>
                  ))}
                </div>
                {selectedFile && (
                  <div style={{ flex: 1, minWidth: 0, background: T.surface, borderRadius: 8, padding: '10px 12px', overflow: 'auto' }}>
                    {fileContent
                      ? <pre style={{ fontFamily: T.mono, fontSize: 11, lineHeight: 1.6, color: T.text, margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{fileContent.content}</pre>
                      : <div style={{ fontFamily: T.mono, fontSize: 12, color: T.faint }}>Loading…</div>}
                  </div>
                )}
              </div>
            )}

          </div>
        </div>
      )}
    </div>
  )
}

function SpecEditor({ spec, onUpdate }: { spec: Spec; onUpdate: (b: { title?: string; content?: string }) => void }) {
  const { T } = useTheme()
  const [content, setContent] = useState(spec.content)
  if (content !== spec.content && document.activeElement?.tagName !== 'TEXTAREA') {
    setContent(spec.content)
  }
  return (
    <textarea value={content} onChange={e => setContent(e.target.value)}
      onBlur={() => content !== spec.content && onUpdate({ content })}
      placeholder="Spec content — edit freely…"
      style={{ fontFamily: T.mono, fontSize: 11, lineHeight: 1.65, color: T.text, background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, padding: '8px 10px', resize: 'vertical', outline: 'none', minHeight: 120 }} />
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function ProjectDetailPage() {
  const { T } = useTheme()
  const { id: projectId } = useParams<{ id: string }>()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [showNew, setShowNew] = useState(false)

  const { data: project }         = useQuery({ queryKey: ['project', projectId], queryFn: () => projects.list().then(l => l.find(p => p.id === projectId)) })
  const { data: taskList    = [] } = useQuery({ queryKey: ['tasks',    projectId], queryFn: () => tasks.list({ projectId }),    refetchInterval: 4000 })
  const { data: agentList   = [] } = useQuery({ queryKey: ['agents'],              queryFn: () => agents.list() })
  const { data: sessionList = [] } = useQuery({ queryKey: ['sessions', projectId], queryFn: () => sessions.list({ projectId }), refetchInterval: 4000 })
  const { data: specList    = [] } = useQuery({ queryKey: ['specs',    projectId], queryFn: () => specs.list(projectId!), enabled: !!projectId })

  const runQueue = useMutation({
    mutationFn: () => tasks.runQueue(),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tasks', projectId] }); qc.invalidateQueries({ queryKey: ['sessions', projectId] }) },
  })
  const deleteTask = useMutation({
    mutationFn: (id: string) => tasks.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks', projectId] }),
  })
  const assignTask = useMutation({
    mutationFn: ({ taskId, agentId }: { taskId: string; agentId: string }) => tasks.assign(taskId, agentId),
    onSuccess: ({ session }) => { qc.invalidateQueries({ queryKey: ['tasks', projectId] }); qc.invalidateQueries({ queryKey: ['sessions', projectId] }); navigate(`/sessions/${session.id}`) },
  })
  const mergeSession = useMutation({
    mutationFn: (id: string) => sessions.merge(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sessions', projectId] }),
  })

  const codeSessions = sessionList.filter(s => !s.specId)
  const busyIds      = new Set(codeSessions.filter(s => s.status === 'running').map(s => s.agentId))
  const idleAgents   = agentList.filter(a => !busyIds.has(a.id))
  const queue        = taskList.filter(t => t.status === 'pending').sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const working      = codeSessions.filter(s => s.status === 'running' || s.status === 'idle')
  const review       = codeSessions.filter(s => s.status === 'done' || s.status === 'error')

  function agentFor(s: Session) { return agentList.find(a => a.id === s.agentId) }
  function taskFor(s: Session)  { return taskList.find(t => t.id === s.workTaskId) }

  const stats = [
    { label: 'Queue',   value: queue.length,     color: T.text  },
    { label: 'Working', value: working.length,    color: T.green },
    { label: 'Review',  value: review.length,     color: T.amber },
    { label: 'Free',    value: idleAgents.length, color: T.muted },
  ]

  const col: React.CSSProperties = { flex: '1 1 0', display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }
  const colInner: React.CSSProperties = { flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, paddingBottom: 8 }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: T.bg }}>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }`}</style>

      {/* stat strip */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 22, padding: '12px 22px 10px', flexShrink: 0 }}>
        <button onClick={() => navigate('/')} style={{ background: 'transparent', border: 'none', fontFamily: T.sans, fontSize: 13, color: T.muted, cursor: 'pointer', padding: 0 }}>←</button>
        {project && <span style={{ fontFamily: T.sans, fontSize: 14, fontWeight: 600, color: T.text }}>{project.name}</span>}
        <div style={{ width: 1, height: 16, background: T.border }} />
        {stats.map(({ label, value, color }) => (
          <div key={label} style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontFamily: T.sans, fontSize: 20, fontWeight: 600, color, letterSpacing: '-.02em', lineHeight: 1.1 }}>{value}</span>
            <span style={{ fontFamily: T.mono, fontSize: 9.5, color: T.faint, textTransform: 'uppercase', letterSpacing: '.07em', marginTop: 1 }}>{label}</span>
          </div>
        ))}
        <div style={{ flex: 1 }} />
        {queue.length > 0 && idleAgents.length > 0 && (
          <button onClick={() => runQueue.mutate()} disabled={runQueue.isPending}
            style={{ fontFamily: T.sans, fontSize: 12, fontWeight: 600, color: T.text, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 9, padding: '7px 12px', cursor: 'pointer', opacity: runQueue.isPending ? 0.5 : 1 }}>
            {runQueue.isPending ? '…' : '▶ Run queue'}
          </button>
        )}
        <button onClick={() => setShowNew(true)} disabled={agentList.length === 0}
          style={{ fontFamily: T.sans, fontSize: 12.5, fontWeight: 600, color: '#fff', background: T.tint, border: 'none', borderRadius: 9, padding: '8px 16px', cursor: 'pointer', opacity: agentList.length === 0 ? 0.4 : 1 }}>
          + New task
        </button>
      </div>

      {/* kanban */}
      <div style={{ display: 'flex', gap: 16, padding: '4px 22px 8px', flex: 1, minHeight: 0 }}>
        <div style={col}>
          <ColHead title="Queue" count={queue.length} color={T.faint} />
          <div style={colInner}>
            {queue.map(task => (
              <QueueCard key={task.id} task={task} agentList={idleAgents}
                onAssign={agentId => assignTask.mutate({ taskId: task.id, agentId })}
                onDelete={() => deleteTask.mutate(task.id)} />
            ))}
            {queue.length === 0 && <div style={{ fontFamily: T.mono, fontSize: 11, color: T.faint, padding: '6px 2px' }}>queue empty ✦</div>}
          </div>
        </div>
        <div style={col}>
          <ColHead title="Working" count={working.length} color={T.green} />
          <div style={colInner}>
            {working.map(s => <WorkingCard key={s.id} session={s} agent={agentFor(s)} task={taskFor(s)} onClick={() => navigate(`/sessions/${s.id}`)} />)}
            {working.length === 0 && <div style={{ fontFamily: T.mono, fontSize: 11, color: T.faint, padding: '6px 2px' }}>nobody's coding yet</div>}
          </div>
        </div>
        <div style={col}>
          <ColHead title="Review" count={review.length} color={T.amber} />
          <div style={colInner}>
            {review.map(s => <ReviewCard key={s.id} session={s} agent={agentFor(s)} task={taskFor(s)} onMerge={() => mergeSession.mutate(s.id)} onClick={() => navigate(`/sessions/${s.id}`)} />)}
            {review.length === 0 && <div style={{ fontFamily: T.mono, fontSize: 11, color: T.faint, padding: '6px 2px' }}>nothing to review</div>}
          </div>
        </div>
      </div>

      {/* bottom sheet */}
      {projectId && (
        <BottomSheet projectId={projectId} specCount={specList.length} onExecuteSpec={() => {}} />
      )}

      {/* new task modal */}
      {showNew && projectId && (
        <UnifiedNewTaskModal
          projectId={projectId}
          agentList={agentList}
          onClose={() => setShowNew(false)}
          onCreateTask={async body => { await tasks.create(body); qc.invalidateQueries({ queryKey: ['tasks', projectId] }); setShowNew(false) }}
          onCreateSpec={async body => { await specs.create(body); qc.invalidateQueries({ queryKey: ['specs', projectId] }); setShowNew(false) }}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Unified new task modal — Work / Plan
// ---------------------------------------------------------------------------

type TaskMode = 'work' | 'plan'

function UnifiedNewTaskModal({ projectId, agentList, onClose, onCreateTask, onCreateSpec }: {
  projectId: string
  agentList: Agent[]
  onClose: () => void
  onCreateTask: (body: { projectId: string; title: string; prompt: string; baseBranch: string }) => Promise<void>
  onCreateSpec: (body: { projectId: string; title: string; brief?: string; agentId?: string }) => Promise<void>
}) {
  const { T } = useTheme()
  const [mode, setMode]           = useState<TaskMode>('work')
  const [title, setTitle]         = useState('')
  const [prompt, setPrompt]       = useState('')
  const [baseBranch, setBaseBranch] = useState('main')
  const [brief, setBrief]         = useState('')
  const [agentId, setAgentId]     = useState('')
  const [loading, setLoading]     = useState(false)

  const validWork = title.trim().length > 2
  const validPlan = title.trim().length > 1

  async function submit() {
    setLoading(true)
    try {
      if (mode === 'work') {
        await onCreateTask({ projectId, title: title.trim(), prompt, baseBranch })
      } else {
        await onCreateSpec({ projectId, title: title.trim(), brief: brief.trim() || undefined, agentId: agentId || undefined })
      }
    } finally {
      setLoading(false)
    }
  }

  const inp: React.CSSProperties = { width: '100%', boxSizing: 'border-box', background: T.surface, border: `1px solid ${T.border}`, borderRadius: 9, padding: '9px 11px', fontFamily: T.sans, fontSize: 13, color: T.text, outline: 'none' }
  const lbl = (t: string) => <div style={{ fontFamily: T.mono, fontSize: 9.5, color: T.faint, textTransform: 'uppercase' as const, letterSpacing: '.1em', marginBottom: 6 }}>{t}</div>
  const isValid = mode === 'work' ? validWork : validPlan

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.38)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 460, background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, padding: '20px 22px 18px', boxShadow: '0 24px 60px rgba(0,0,0,.18)' }}>

        {/* header + mode toggle */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 18, gap: 12 }}>
          <span style={{ fontFamily: T.sans, fontSize: 17, fontWeight: 600, color: T.text }}>New task</span>
          <div style={{ display: 'flex', gap: 2, background: T.surface2, borderRadius: 8, padding: 2 }}>
            {(['work', 'plan'] as TaskMode[]).map(m => (
              <button key={m} onClick={() => setMode(m)} style={{ fontFamily: T.sans, fontSize: 12, fontWeight: mode === m ? 600 : 500, color: mode === m ? T.text : T.muted, background: mode === m ? T.card : 'transparent', border: 'none', borderRadius: 6, padding: '5px 14px', cursor: 'pointer', boxShadow: mode === m ? '0 1px 2px rgba(0,0,0,.1)' : 'none', textTransform: 'capitalize' }}>{m}</button>
            ))}
          </div>
          <div style={{ flex: 1 }} />
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: T.muted, fontSize: 18, cursor: 'pointer', lineHeight: 1, padding: 4 }}>×</button>
        </div>

        <div style={{ marginBottom: 14 }}>
          {lbl('Title')}
          <input autoFocus value={title} onChange={e => setTitle(e.target.value)}
            placeholder={mode === 'work' ? 'What should the agent do?' : 'e.g. Refactor auth middleware'}
            onKeyDown={e => { if (e.key === 'Enter' && isValid) submit() }}
            style={inp} />
        </div>

        {mode === 'work' && <>
          <div style={{ marginBottom: 14 }}>
            {lbl('Prompt')}
            <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={3}
              placeholder="Additional context for the agent…"
              style={{ ...inp, resize: 'vertical', lineHeight: 1.5 }} />
          </div>
          <div style={{ marginBottom: 20 }}>
            {lbl('Base branch')}
            <input value={baseBranch} onChange={e => setBaseBranch(e.target.value)} style={{ ...inp, fontFamily: T.mono, fontSize: 12 }} />
          </div>
        </>}

        {mode === 'plan' && <>
          <div style={{ marginBottom: 14 }}>
            {lbl('Brief')}
            <textarea value={brief} onChange={e => setBrief(e.target.value)} rows={2}
              placeholder="Describe the goal — agent will read the codebase and write the plan."
              style={{ ...inp, resize: 'vertical', lineHeight: 1.5 }} />
          </div>
          <div style={{ marginBottom: 20 }}>
            {lbl('Write with agent')}
            <select value={agentId} onChange={e => setAgentId(e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
              <option value="">Write manually (I'll fill in the plan)</option>
              {agentList.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            {agentId && <div style={{ fontFamily: T.sans, fontSize: 12, color: T.muted, marginTop: 5 }}>Agent reads the codebase and writes a SPEC.md — appears in Plans once done.</div>}
          </div>
        </>}

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{ flex: '0 0 auto', fontFamily: T.sans, fontSize: 13, fontWeight: 600, color: T.muted, background: 'transparent', border: `1px solid ${T.border}`, borderRadius: 10, padding: '10px 16px', cursor: 'pointer' }}>Cancel</button>
          <button onClick={submit} disabled={!isValid || loading}
            style={{ flex: 1, fontFamily: T.sans, fontSize: 13, fontWeight: 700, color: '#fff', background: T.tint, border: 'none', borderRadius: 10, padding: '10px 0', cursor: isValid && !loading ? 'pointer' : 'default', opacity: isValid && !loading ? 1 : 0.4 }}>
            {loading ? '…' : mode === 'plan' ? (agentId ? 'Create & plan' : 'Create plan') : 'Add to queue'}
          </button>
        </div>
      </div>
    </div>
  )
}
