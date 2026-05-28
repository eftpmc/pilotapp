import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { tasks, agents, projects, sessions } from '../api/client'
import type { Task, Agent, Session } from '../api/client'

export default function WorkPage() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [showNew, setShowNew] = useState(false)

  const { data: taskList = [] }    = useQuery({ queryKey: ['tasks'],    queryFn: () => tasks.list() })
  const { data: agentList = [] }   = useQuery({ queryKey: ['agents'],   queryFn: () => agents.list() })
  const { data: projectList = [] } = useQuery({ queryKey: ['projects'], queryFn: () => projects.list() })
  const { data: sessionList = [] } = useQuery({ queryKey: ['sessions'], queryFn: () => sessions.list() })

  const runQueue = useMutation({
    mutationFn: () => tasks.runQueue(),
    onSuccess: ({ dispatched }) => {
      qc.invalidateQueries({ queryKey: ['tasks'] })
      qc.invalidateQueries({ queryKey: ['sessions'] })
      if (dispatched[0]) navigate(`/sessions/${dispatched[0].session.id}`)
    },
  })

  const deleteTask = useMutation({
    mutationFn: (id: string) => tasks.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  })

  const assignTask = useMutation({
    mutationFn: ({ taskId, agentId }: { taskId: string; agentId: string }) =>
      tasks.assign(taskId, agentId),
    onSuccess: ({ session }) => {
      qc.invalidateQueries({ queryKey: ['tasks'] })
      qc.invalidateQueries({ queryKey: ['sessions'] })
      navigate(`/sessions/${session.id}`)
    },
  })

  const pending  = taskList.filter(t => t.status === 'pending').sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const active   = sessionList.filter(s => s.status === 'running' || s.status === 'idle')
  const recent   = sessionList.filter(s => s.status === 'done' || s.status === 'error').slice(0, 20)
  const busyIds  = new Set(sessionList.filter(s => s.status === 'running').map(s => s.agentId))
  const idleCount = agentList.filter(a => !busyIds.has(a.id)).length

  function eligibleAgents(task: Task): Agent[] {
    const proj = projectList.find(p => p.id === task.projectId)
    if (!proj) return []
    return agentList.filter(a => proj.role === 'any' || proj.role === a.provider)
  }

  function agentFor(s: Session) { return agentList.find(a => a.id === s.agentId) }
  function projectFor(s: Session) { return projectList.find(p => p.id === s.projectId) }
  function taskFor(s: Session) { return taskList.find(t => t.id === s.workTaskId) }

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Work</h1>
        <button
          onClick={() => setShowNew(true)}
          disabled={agentList.length === 0 || projectList.length === 0}
          className="px-4 py-2 bg-[#22c55e] hover:bg-[#16a34a] disabled:opacity-40 text-black text-sm font-semibold rounded-lg transition-colors"
        >
          + New task
        </button>
      </div>

      {/* Queue */}
      {pending.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <div>
              <span className="text-xs font-semibold text-white/40 uppercase tracking-wider">Queue</span>
              <span className="ml-2 text-xs text-white/30">{pending.length} pending · {idleCount} idle</span>
            </div>
            {idleCount > 0 && (
              <button
                onClick={() => runQueue.mutate()}
                disabled={runQueue.isPending}
                className="px-3 py-1 bg-[#22c55e] hover:bg-[#16a34a] disabled:opacity-50 text-black text-xs font-semibold rounded-full transition-colors"
              >
                {runQueue.isPending ? '…' : '▶ Run queue'}
              </button>
            )}
          </div>
          <div className="space-y-2">
            {pending.map(task => (
              <div key={task.id} className="flex items-center gap-3 bg-white/4 border border-white/8 rounded-xl px-4 py-3">
                <div className="w-1.5 h-1.5 rounded-full bg-white/20 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{task.title}</p>
                  <p className="text-xs text-white/40">{projectList.find(p => p.id === task.projectId)?.name}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {eligibleAgents(task).length > 0 ? (
                    <select
                      className="bg-white/6 border border-white/10 rounded-lg px-2 py-1 text-xs text-white/80 outline-none"
                      defaultValue=""
                      onChange={e => { if (e.target.value) assignTask.mutate({ taskId: task.id, agentId: e.target.value }) }}
                    >
                      <option value="" disabled>Assign…</option>
                      {eligibleAgents(task).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                  ) : (
                    <span className="text-xs text-white/30">No agents</span>
                  )}
                  <button
                    onClick={() => deleteTask.mutate(task.id)}
                    className="text-white/20 hover:text-red-400 transition-colors text-xs"
                  >✕</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Active sessions */}
      {active.length > 0 && (
        <section>
          <p className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3">Active</p>
          <div className="space-y-2">
            {active.map(s => (
              <SessionRow key={s.id} session={s}
                agentName={agentFor(s)?.name} projectName={projectFor(s)?.name}
                taskTitle={taskFor(s)?.title}
                onClick={() => navigate(`/sessions/${s.id}`)}
              />
            ))}
          </div>
        </section>
      )}

      {/* Recent */}
      {recent.length > 0 && (
        <section>
          <p className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3">Recent</p>
          <div className="space-y-2">
            {recent.map(s => (
              <SessionRow key={s.id} session={s}
                agentName={agentFor(s)?.name} projectName={projectFor(s)?.name}
                taskTitle={taskFor(s)?.title}
                onClick={() => navigate(`/sessions/${s.id}`)}
              />
            ))}
          </div>
        </section>
      )}

      {pending.length === 0 && active.length === 0 && recent.length === 0 && (
        <div className="text-center py-24 text-white/30">
          <p className="text-lg mb-1">Nothing running</p>
          <p className="text-sm">Add a task or hire agents to get started</p>
        </div>
      )}

      {/* New task modal */}
      {showNew && (
        <NewTaskModal
          agents={agentList} projects={projectList}
          onClose={() => setShowNew(false)}
          onCreate={async (body) => {
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

function SessionRow({ session, agentName, projectName, taskTitle, onClick }: {
  session: Session; agentName?: string; projectName?: string; taskTitle?: string; onClick: () => void
}) {
  const statusColor = { running: 'bg-[#22c55e]', idle: 'bg-yellow-400', done: 'bg-white/20', error: 'bg-red-400' }
  const statusLabel = { running: 'Running', idle: 'Ready', done: 'Done', error: 'Error' }

  return (
    <button onClick={onClick} className="w-full flex items-center gap-4 bg-white/4 hover:bg-white/6 border border-white/8 rounded-xl px-4 py-3 text-left transition-colors">
      <div className={`w-2 h-2 rounded-full shrink-0 ${statusColor[session.status]}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white">
          {agentName && <span>{agentName}</span>}
          {projectName && <span className="text-white/40"> · {projectName}</span>}
        </p>
        {taskTitle
          ? <p className="text-xs text-white/40 truncate">{taskTitle}</p>
          : <p className="text-xs text-white/30 font-mono truncate">{session.branch}</p>
        }
      </div>
      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
        session.status === 'running' ? 'bg-[#22c55e]/15 text-[#22c55e]' :
        session.status === 'error'   ? 'bg-red-400/15 text-red-400' :
        session.status === 'idle'    ? 'bg-yellow-400/15 text-yellow-400' :
                                       'bg-white/8 text-white/40'
      }`}>
        {statusLabel[session.status]}
      </span>
    </button>
  )
}

function NewTaskModal({ agents: agentList2, projects: projectList, onClose, onCreate }: {
  agents: Agent[]
  projects: import('../api/client').Project[]
  onClose: () => void
  onCreate: (body: { projectId: string; title: string; prompt: string; baseBranch: string }) => Promise<void>
}) {
  void agentList2
  const [projectId, setProjectId] = useState(projectList[0]?.id ?? '')
  const [title, setTitle] = useState('')
  const [prompt, setPrompt] = useState('')
  const [baseBranch, setBaseBranch] = useState('main')
  const [loading, setLoading] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try { await onCreate({ projectId, title, prompt, baseBranch }) }
    finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <form onSubmit={submit} onClick={e => e.stopPropagation()}
        className="bg-[#111] border border-white/10 rounded-2xl p-6 w-full max-w-md space-y-4">
        <h2 className="text-base font-semibold text-white">New Task</h2>

        <div>
          <label className="text-xs text-white/40 uppercase tracking-wider">Project</label>
          <select value={projectId} onChange={e => setProjectId(e.target.value)}
            className="mt-1 w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none">
            {projectList.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>

        <div>
          <label className="text-xs text-white/40 uppercase tracking-wider">Title</label>
          <input value={title} onChange={e => setTitle(e.target.value)} required placeholder="Brief description"
            className="mt-1 w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/20 outline-none focus:border-white/30" />
        </div>

        <div>
          <label className="text-xs text-white/40 uppercase tracking-wider">Prompt</label>
          <textarea value={prompt} onChange={e => setPrompt(e.target.value)} required rows={4}
            placeholder="What should the agent do?"
            className="mt-1 w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/20 outline-none focus:border-white/30 resize-none" />
        </div>

        <div>
          <label className="text-xs text-white/40 uppercase tracking-wider">Base branch</label>
          <input value={baseBranch} onChange={e => setBaseBranch(e.target.value)}
            className="mt-1 w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-white/30" />
        </div>

        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose}
            className="flex-1 py-2.5 border border-white/10 text-white/60 text-sm rounded-lg hover:bg-white/5 transition-colors">
            Cancel
          </button>
          <button type="submit" disabled={loading || !projectId || !title || !prompt}
            className="flex-1 py-2.5 bg-[#22c55e] hover:bg-[#16a34a] disabled:opacity-40 text-black text-sm font-semibold rounded-lg transition-colors">
            {loading ? '…' : 'Add to queue'}
          </button>
        </div>
      </form>
    </div>
  )
}
