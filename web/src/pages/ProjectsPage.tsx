import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { projects, sessions, tasks, agents } from '../api/client'
import type { Project, Session, Task, Agent } from '../api/client'
import { useTheme, KNOWN_FACES } from '../theme'

// ---------------------------------------------------------------------------
// Shared sub-components
// ---------------------------------------------------------------------------

function AgentAvatar({ agent, size = 32 }: { agent?: Agent; size?: number }) {
  const { T } = useTheme()
  const [failed, setFailed] = useState(false)
  const name = agent?.name ?? ''
  const providerColors: Record<string, string> = { claude: '#F0820B', codex: '#0A84FF' }
  const color = agent ? (providerColors[agent.provider] ?? T.tint) : T.faint
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
      <span style={{ fontFamily: T.mono, fontSize: Math.round(size * 0.38), fontWeight: 700, color }}>{name[0] ?? '?'}</span>
    </div>
  )
}

function SourceBadge({ project }: { project: Project }) {
  const { T } = useTheme()
  if (project.remoteUrl) {
    return <span style={{ fontFamily: T.mono, fontSize: 10, color: T.tint, background: T.tint + '18', border: `1px solid ${T.tint}30`, borderRadius: 5, padding: '1px 6px' }}>
      {project.remoteUrl.includes('github.com') ? 'GitHub' : 'Git'}
    </span>
  }
  if (project.localPath) {
    return <span style={{ fontFamily: T.mono, fontSize: 10, color: T.muted, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 5, padding: '1px 6px' }}>Local</span>
  }
  return null
}

// ---------------------------------------------------------------------------
// Section header
// ---------------------------------------------------------------------------

function SectionHeader({ title, count, action }: { title: string; count?: number; action?: React.ReactNode }) {
  const { T } = useTheme()
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
      <span style={{ fontFamily: T.sans, fontSize: 13, fontWeight: 600, color: T.text }}>{title}</span>
      {count !== undefined && count > 0 && (
        <span style={{ fontFamily: T.mono, fontSize: 11, color: T.faint }}>{count}</span>
      )}
      <div style={{ flex: 1 }} />
      {action}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Working cards
// ---------------------------------------------------------------------------

function WorkingCard({ session, agent, project, task, onClick }: {
  session: Session; agent?: Agent; project?: Project; task?: Task; onClick: () => void
}) {
  const { T } = useTheme()
  return (
    <button onClick={onClick} style={{ textAlign: 'left', background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: '14px 15px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 10, minWidth: 220, flex: '1 1 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <AgentAvatar agent={agent} size={36} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: T.sans, fontSize: 13.5, fontWeight: 600, color: T.text }}>{agent?.name ?? '—'}</div>
          <div style={{ fontFamily: T.mono, fontSize: 10.5, color: T.faint, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{project?.name ?? session.branch}</div>
        </div>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: T.sans, fontSize: 11, fontWeight: 600, color: T.green, background: T.green + '18', border: `1px solid ${T.green}30`, padding: '2px 8px', borderRadius: 999 }}>
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: T.green, display: 'inline-block', animation: 'pulse 1.6s ease-out infinite' }} />
          Working
        </span>
      </div>
      {task && (
        <div style={{ fontFamily: T.sans, fontSize: 12.5, color: T.muted, lineHeight: 1.35, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.title}</div>
      )}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Review row
// ---------------------------------------------------------------------------

function ReviewRow({ session, agent, project, task, onMerge, onClick, isLast }: {
  session: Session; agent?: Agent; project?: Project; task?: Task
  onMerge: () => void; onClick: () => void; isLast: boolean
}) {
  const { T } = useTheme()
  const isError = session.status === 'error'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', borderBottom: isLast ? 'none' : `1px solid ${T.border}`, cursor: 'pointer' }} onClick={onClick}>
      <AgentAvatar agent={agent} size={32} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 1 }}>
          <span style={{ fontFamily: T.sans, fontSize: 13, fontWeight: 600, color: T.text }}>{agent?.name ?? '—'}</span>
          <span style={{ fontFamily: T.mono, fontSize: 10.5, color: T.faint }}>·</span>
          <span style={{ fontFamily: T.sans, fontSize: 12, color: T.muted }}>{project?.name ?? '—'}</span>
        </div>
        {task && <div style={{ fontFamily: T.sans, fontSize: 12, color: T.faint, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.title}</div>}
      </div>
      <span style={{ fontFamily: T.sans, fontSize: 11, fontWeight: 600, color: isError ? T.danger : T.green, background: (isError ? T.danger : T.green) + '18', padding: '2px 8px', borderRadius: 999, flexShrink: 0 }}>
        {isError ? 'Error' : 'Ready'}
      </span>
      <div style={{ display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
        {!isError && (
          <button onClick={onMerge} style={{ fontFamily: T.sans, fontSize: 11, fontWeight: 600, color: '#fff', background: T.tint, border: 'none', borderRadius: 7, padding: '5px 12px', cursor: 'pointer' }}>
            Merge ✓
          </button>
        )}
        <button onClick={onClick} style={{ fontFamily: T.sans, fontSize: 11, fontWeight: 600, color: T.text, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 7, padding: '5px 12px', cursor: 'pointer' }}>
          {isError ? 'View log' : 'Log'}
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main home page
// ---------------------------------------------------------------------------

export default function ProjectsPage() {
  const { T } = useTheme()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [showNew, setShowNew] = useState(false)

  const { data: projectList = [] } = useQuery({ queryKey: ['projects'],  queryFn: () => projects.list() })
  const { data: sessionList = [] } = useQuery({ queryKey: ['sessions'],  queryFn: () => sessions.list(), refetchInterval: 5000 })
  const { data: taskList = [] }    = useQuery({ queryKey: ['tasks'],     queryFn: () => tasks.list(),    refetchInterval: 5000 })
  const { data: agentList = [] }   = useQuery({ queryKey: ['agents'],    queryFn: () => agents.list() })

  const createProject = useMutation({
    mutationFn: (body: Parameters<typeof projects.create>[0]) => projects.create(body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['projects'] }); setShowNew(false) },
  })

  const mergeSession = useMutation({
    mutationFn: (id: string) => sessions.merge(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sessions'] }),
  })

  const working = sessionList.filter(s => s.status === 'running' || s.status === 'idle')
  const review  = sessionList.filter(s => s.status === 'done' || s.status === 'error')
  const pending = taskList.filter(t => t.status === 'pending')

  function agentFor(s: Session)   { return agentList.find(a => a.id === s.agentId) }
  function projectFor(s: Session) { return projectList.find(p => p.id === s.projectId) }
  function taskFor(s: Session)    { return taskList.find(t => t.id === s.workTaskId) }

  function pendingCount(id: string) { return pending.filter(t => t.projectId === id).length }
  function activeCount(id: string)  { return working.filter(s => s.projectId === id).length }

  const hasActivity = working.length > 0 || review.length > 0

  // Empty onboarding state
  if (projectList.length === 0) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: T.bg, gap: 6 }}>
        <span style={{ fontFamily: T.mono, fontSize: 28, fontWeight: 700, color: T.text, letterSpacing: '-0.03em', marginBottom: 8 }}>pilot</span>
        <span style={{ fontFamily: T.sans, fontSize: 17, fontWeight: 500, color: T.text }}>Your AI coding team starts here</span>
        <span style={{ fontFamily: T.sans, fontSize: 14, color: T.muted, marginBottom: 24 }}>Add a project and an agent to dispatch your first task.</span>
        <button onClick={() => setShowNew(true)}
          style={{ fontFamily: T.sans, fontSize: 14, fontWeight: 600, color: '#fff', background: T.tint, border: 'none', borderRadius: 10, padding: '11px 22px', cursor: 'pointer' }}>
          + Add first project
        </button>
        {showNew && (
          <NewProjectModal onClose={() => setShowNew(false)}
            onCreate={body => createProject.mutate(body)}
            loading={createProject.isPending} error={createProject.error?.message} />
        )}
        <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }`}</style>
      </div>
    )
  }

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: T.bg }}>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }`}</style>
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '28px 24px 40px', display: 'flex', flexDirection: 'column', gap: 32 }}>

        {/* Working */}
        {working.length > 0 && (
          <section>
            <SectionHeader title="Working" count={working.length} />
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {working.map(s => (
                <WorkingCard key={s.id} session={s}
                  agent={agentFor(s)} project={projectFor(s)} task={taskFor(s)}
                  onClick={() => navigate(`/sessions/${s.id}`)} />
              ))}
            </div>
          </section>
        )}

        {/* Review */}
        {review.length > 0 && (
          <section>
            <SectionHeader title="Review" count={review.length} />
            <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, overflow: 'hidden' }}>
              {review.map((s, i) => (
                <ReviewRow key={s.id} session={s} isLast={i === review.length - 1}
                  agent={agentFor(s)} project={projectFor(s)} task={taskFor(s)}
                  onMerge={() => mergeSession.mutate(s.id)}
                  onClick={() => navigate(`/sessions/${s.id}`)} />
              ))}
            </div>
          </section>
        )}

        {/* Projects */}
        <section>
          <SectionHeader title="Projects"
            action={
              <button onClick={() => setShowNew(true)}
                style={{ fontFamily: T.sans, fontSize: 12.5, fontWeight: 600, color: '#fff', background: T.tint, border: 'none', borderRadius: 8, padding: '6px 13px', cursor: 'pointer' }}>
                + Add
              </button>
            }
          />

          {/* pending queue callout if any */}
          {!hasActivity && pending.length > 0 && (
            <div style={{ background: T.tint + '0e', border: `1px solid ${T.tint}30`, borderRadius: 10, padding: '10px 14px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontFamily: T.sans, fontSize: 13, color: T.tint }}>{pending.length} task{pending.length > 1 ? 's' : ''} queued — open a project to dispatch</span>
            </div>
          )}

          <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, overflow: 'hidden' }}>
            {projectList.map((p, i) => {
              const active  = activeCount(p.id)
              const pend    = pendingCount(p.id)
              return (
                <button key={p.id} onClick={() => navigate(`/projects/${p.id}`)}
                  style={{ width: '100%', textAlign: 'left', background: 'transparent', border: 'none', borderBottom: i < projectList.length - 1 ? `1px solid ${T.border}` : 'none', padding: '13px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                      <span style={{ fontFamily: T.sans, fontSize: 14, fontWeight: 600, color: T.text }}>{p.name}</span>
                      <SourceBadge project={p} />
                    </div>
                    <span style={{ fontFamily: T.mono, fontSize: 11, color: T.faint, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
                      {p.localPath ?? p.remoteUrl ?? p.repoPath}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
                    {active > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: T.green, animation: 'pulse 1.6s ease-out infinite' }} />
                        <span style={{ fontFamily: T.sans, fontSize: 12, color: T.green, fontWeight: 600 }}>{active} active</span>
                      </div>
                    )}
                    {pend > 0 && <span style={{ fontFamily: T.sans, fontSize: 12, color: T.muted }}>{pend} queued</span>}
                    <span style={{ fontFamily: T.sans, fontSize: 16, color: T.faint, lineHeight: 1 }}>›</span>
                  </div>
                </button>
              )
            })}
          </div>
        </section>

      </div>

      {showNew && (
        <NewProjectModal onClose={() => setShowNew(false)}
          onCreate={body => createProject.mutate(body)}
          loading={createProject.isPending} error={createProject.error?.message} />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Add project modal
// ---------------------------------------------------------------------------

type ImportMode = 'github' | 'local' | 'empty'

function NewProjectModal({ onClose, onCreate, loading, error }: {
  onClose: () => void
  onCreate: (body: { name: string; githubCloneUrl?: string; githubToken?: string; localPath?: string }) => void
  loading: boolean
  error?: string
}) {
  const { T } = useTheme()
  const [name, setName]               = useState('')
  const [mode, setMode]               = useState<ImportMode>('github')
  const [githubUrl, setGithubUrl]     = useState('')
  const [githubToken, setGithubToken] = useState('')
  const [localPath, setLocalPath]     = useState('')

  const isValid = name.trim().length > 0 && (
    mode === 'empty' ||
    (mode === 'github' && githubUrl.trim() && githubToken.trim()) ||
    (mode === 'local'  && localPath.trim())
  )

  function submit() {
    if (!isValid) return
    onCreate({
      name: name.trim(),
      ...(mode === 'github' ? { githubCloneUrl: githubUrl.trim(), githubToken: githubToken.trim() } : {}),
      ...(mode === 'local'  ? { localPath: localPath.trim() } : {}),
    })
  }

  const inp: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', background: T.surface, border: `1px solid ${T.border}`,
    borderRadius: 9, padding: '9px 11px', fontFamily: T.sans, fontSize: 13, color: T.text, outline: 'none',
  }
  const lbl = (t: string) => (
    <div style={{ fontFamily: T.mono, fontSize: 9.5, color: T.faint, textTransform: 'uppercase' as const, letterSpacing: '.1em', marginBottom: 6 }}>{t}</div>
  )
  const modes: { key: ImportMode; label: string }[] = [
    { key: 'github', label: 'GitHub' },
    { key: 'local',  label: 'Local path' },
    { key: 'empty',  label: 'Empty' },
  ]

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 440, background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, padding: '20px 22px 18px', boxShadow: '0 24px 60px rgba(0,0,0,.15)' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 18 }}>
          <span style={{ fontFamily: T.sans, fontSize: 17, fontWeight: 600, color: T.text }}>New project</span>
          <div style={{ flex: 1 }} />
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: T.muted, fontSize: 18, cursor: 'pointer', lineHeight: 1, padding: 4 }}>×</button>
        </div>

        <div style={{ marginBottom: 16 }}>
          {lbl('Name')}
          <input autoFocus value={name} onChange={e => setName(e.target.value)}
            placeholder="my-project" onKeyDown={e => { if (e.key === 'Enter' && isValid) submit() }} style={inp} />
        </div>

        <div style={{ display: 'flex', gap: 2, background: T.surface2, borderRadius: 9, padding: 2, marginBottom: 16 }}>
          {modes.map(({ key, label }) => (
            <button key={key} onClick={() => setMode(key)} style={{ flex: 1, fontFamily: T.sans, fontSize: 12.5, fontWeight: mode === key ? 600 : 500, color: mode === key ? T.text : T.muted, background: mode === key ? T.card : 'transparent', border: 'none', borderRadius: 7, padding: '7px 0', cursor: 'pointer', boxShadow: mode === key ? '0 1px 2px rgba(0,0,0,.1)' : 'none' }}>
              {label}
            </button>
          ))}
        </div>

        {mode === 'github' && <>
          <div style={{ marginBottom: 12 }}>
            {lbl('Clone URL')}
            <input value={githubUrl} onChange={e => setGithubUrl(e.target.value)} placeholder="https://github.com/org/repo.git" style={inp} />
          </div>
          <div style={{ marginBottom: 18 }}>
            {lbl('Access token')}
            <input type="password" value={githubToken} onChange={e => setGithubToken(e.target.value)} placeholder="ghp_…" style={inp} />
          </div>
        </>}

        {mode === 'local' && (
          <div style={{ marginBottom: 18 }}>
            {lbl('Path on this machine')}
            <input value={localPath} onChange={e => setLocalPath(e.target.value)}
              placeholder="/Users/you/code/myproject"
              style={{ ...inp, fontFamily: T.mono, fontSize: 12 }} />
            <div style={{ fontFamily: T.sans, fontSize: 12, color: T.faint, marginTop: 6 }}>Pilot clones a bare copy. Your working tree stays untouched.</div>
          </div>
        )}

        {mode === 'empty' && (
          <div style={{ marginBottom: 18, fontFamily: T.sans, fontSize: 13, color: T.muted, lineHeight: 1.5 }}>
            Starts with an empty repo. Agents can create files and commit from scratch.
          </div>
        )}

        {error && <p style={{ fontFamily: T.sans, fontSize: 13, color: T.danger, marginBottom: 12 }}>{error}</p>}

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{ flex: '0 0 auto', fontFamily: T.sans, fontSize: 13, fontWeight: 600, color: T.muted, background: 'transparent', border: `1px solid ${T.border}`, borderRadius: 10, padding: '10px 16px', cursor: 'pointer' }}>Cancel</button>
          <button onClick={submit} disabled={!isValid || loading}
            style={{ flex: 1, fontFamily: T.sans, fontSize: 13, fontWeight: 700, color: '#fff', background: T.tint, border: 'none', borderRadius: 10, padding: '10px 0', cursor: isValid && !loading ? 'pointer' : 'default', opacity: isValid && !loading ? 1 : 0.4 }}>
            {loading ? '…' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  )
}
