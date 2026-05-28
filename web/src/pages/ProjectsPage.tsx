import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { projects } from '../api/client'
import type { ProjectRole } from '../api/client'

export default function ProjectsPage() {
  const qc = useQueryClient()
  const [showNew, setShowNew] = useState(false)

  const { data: list = [] } = useQuery({ queryKey: ['projects'], queryFn: () => projects.list() })

  const create = useMutation({
    mutationFn: (body: Parameters<typeof projects.create>[0]) => projects.create(body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['projects'] }); setShowNew(false) },
  })

  const remove = useMutation({
    mutationFn: (id: string) => projects.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  })

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold">Projects</h1>
        <button onClick={() => setShowNew(true)}
          className="px-4 py-2 bg-[#22c55e] hover:bg-[#16a34a] text-black text-sm font-semibold rounded-lg transition-colors">
          + Add project
        </button>
      </div>

      {list.length === 0 ? (
        <p className="text-white/30 text-center py-20">No projects yet — add one to give agents a repo to work in.</p>
      ) : (
        <div className="space-y-2">
          {list.map(p => (
            <div key={p.id} className="flex items-center gap-4 bg-white/4 border border-white/8 rounded-xl px-4 py-3">
              <div className="w-8 h-8 rounded-lg bg-white/6 flex items-center justify-center text-white/50 text-sm">⬜</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white">{p.name}</p>
                <p className="text-xs text-white/30 font-mono truncate">{p.repoPath}</p>
              </div>
              <span className="text-xs text-white/30 capitalize">{p.role}</span>
              <button onClick={() => remove.mutate(p.id)}
                className="text-white/20 hover:text-red-400 text-xs transition-colors px-2">
                Delete
              </button>
            </div>
          ))}
        </div>
      )}

      {showNew && (
        <NewProjectModal
          onClose={() => setShowNew(false)}
          onCreate={(body) => create.mutate(body)}
          loading={create.isPending}
          error={create.error?.message}
        />
      )}
    </div>
  )
}

function NewProjectModal({ onClose, onCreate, loading, error }: {
  onClose: () => void
  onCreate: (body: { name: string; role: ProjectRole; githubCloneUrl?: string; githubToken?: string }) => void
  loading: boolean
  error?: string
}) {
  const [name, setName] = useState('')
  const [role, setRole] = useState<ProjectRole>('any')
  const [githubUrl, setGithubUrl] = useState('')
  const [githubToken, setGithubToken] = useState('')

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        className="bg-[#111] border border-white/10 rounded-2xl p-6 w-full max-w-sm space-y-4">
        <h2 className="text-base font-semibold">New Project</h2>

        <div>
          <label className="text-xs text-white/40 uppercase tracking-wider">Name</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="my-project"
            className="mt-1 w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/20 outline-none focus:border-white/30" />
        </div>

        <div>
          <label className="text-xs text-white/40 uppercase tracking-wider mb-1 block">Agent role</label>
          <div className="grid grid-cols-3 gap-1.5">
            {(['any', 'claude', 'codex'] as ProjectRole[]).map(r => (
              <button key={r} type="button" onClick={() => setRole(r)}
                className={`py-2 rounded-lg text-xs font-medium border transition-colors capitalize ${
                  role === r ? 'border-white/30 bg-white/8 text-white' : 'border-white/8 text-white/40 hover:text-white/70'
                }`}>
                {r}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs text-white/40 uppercase tracking-wider">GitHub clone URL <span className="normal-case">(optional)</span></label>
          <input value={githubUrl} onChange={e => setGithubUrl(e.target.value)} placeholder="https://github.com/org/repo.git"
            className="mt-1 w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/20 outline-none focus:border-white/30" />
        </div>

        {githubUrl && (
          <div>
            <label className="text-xs text-white/40 uppercase tracking-wider">GitHub token</label>
            <input type="password" value={githubToken} onChange={e => setGithubToken(e.target.value)}
              className="mt-1 w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-white/30" />
          </div>
        )}

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <div className="flex gap-3">
          <button onClick={onClose}
            className="flex-1 py-2.5 border border-white/10 text-white/60 text-sm rounded-lg hover:bg-white/5 transition-colors">
            Cancel
          </button>
          <button
            onClick={() => onCreate({ name, role, githubCloneUrl: githubUrl || undefined, githubToken: githubToken || undefined })}
            disabled={!name || loading}
            className="flex-1 py-2.5 bg-[#22c55e] hover:bg-[#16a34a] disabled:opacity-40 text-black text-sm font-semibold rounded-lg transition-colors">
            {loading ? '…' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  )
}
