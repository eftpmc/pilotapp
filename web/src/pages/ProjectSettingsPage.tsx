import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, useNavigate } from 'react-router-dom'
import { projects } from '../api/client'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'


export default function ProjectSettingsPage() {
  const { id: projectId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [confirming, setConfirming] = useState(false)
  const [editing, setEditing]       = useState(false)

  const { data: projectList = [], isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projects.list(),
  })

  const project = projectList.find(p => p.id === projectId)

  const [name,        setName]        = useState('')
  const [remoteUrl,   setRemoteUrl]   = useState('')
  const [githubToken, setGithubToken] = useState('')

  function startEdit() {
    setName(project?.name ?? '')
    setRemoteUrl(project?.remoteUrl ?? '')
    setGithubToken('')
    setEditing(true)
  }

  const updateProject = useMutation({
    mutationFn: (body: Parameters<typeof projects.update>[1]) => projects.update(projectId!, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['projects'] }); setEditing(false) },
  })

  const deleteProject = useMutation({
    mutationFn: () => projects.delete(projectId!),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['projects'] }); navigate('/') },
  })

  return (
    <div className="flex-1 overflow-y-auto bg-background">
      <div className="px-6 pt-6 pb-8 flex flex-col gap-6">

        {/* Project info */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground/50">Project</p>
            {!editing && project && (
              <button onClick={startEdit} className="text-xs font-semibold text-primary bg-transparent border-none cursor-pointer">
                Edit
              </button>
            )}
          </div>

          {isLoading ? (
            <p className="text-sm text-muted-foreground/50">Loading…</p>
          ) : editing ? (
            <div className="bg-card border border-border rounded-xl p-4 flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label>Name</Label>
                <Input value={name} onChange={e => setName(e.target.value)} autoFocus />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Remote URL <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <Input value={remoteUrl} onChange={e => setRemoteUrl(e.target.value)} placeholder="https://github.com/org/repo.git" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>GitHub token <span className="text-muted-foreground font-normal">(leave blank to keep existing)</span></Label>
                <Input type="password" value={githubToken} onChange={e => setGithubToken(e.target.value)} placeholder="ghp_…" />
              </div>
              {updateProject.isError && <p className="text-sm text-destructive">{updateProject.error?.message}</p>}
              <div className="flex gap-2">
                <button className="btn" onClick={() => setEditing(false)}>Cancel</button>
                <button className="btn primary" style={{ flex: 1, justifyContent: 'center' }}
                  disabled={!name.trim() || updateProject.isPending}
                  onClick={() => updateProject.mutate({ name: name.trim(), remoteUrl: remoteUrl.trim() || undefined, githubToken: githubToken.trim() || undefined })}>
                  {updateProject.isPending ? '…' : 'Save'}
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              {[
                { label: 'Name',       value: project?.name },
                { label: 'Repository', value: project?.repoPath },
                { label: 'Remote',     value: project?.remoteUrl },
                { label: 'Local path', value: project?.localPath },
                { label: 'Created',    value: project ? new Date(project.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : undefined },
              ].filter(r => r.value).map((row, i) => (
                <div key={row.label} className={`px-4 py-3 ${i > 0 ? 'border-t border-border/40' : ''}`}>
                  <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/50 mb-1">{row.label}</p>
                  <p className="text-sm text-foreground font-mono break-all">{row.value}</p>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Danger zone */}
        {project && (
          <section className="flex flex-col gap-3">
            <p className="text-xs text-destructive/60">Danger zone</p>
            <div className="bg-card border border-destructive/20 rounded-xl overflow-hidden">
              <div className="flex items-center gap-4 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground">Delete project</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Permanently deletes this project and all its tasks and sessions. This cannot be undone.</p>
                </div>
                {!confirming ? (
                  <button className="btn sm danger shrink-0" onClick={() => setConfirming(true)}>Delete</button>
                ) : (
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-muted-foreground">Sure?</span>
                    <button className="btn sm" onClick={() => setConfirming(false)}>Cancel</button>
                    <button className="btn sm danger" onClick={() => deleteProject.mutate()} disabled={deleteProject.isPending}>
                      {deleteProject.isPending ? 'Deleting…' : 'Yes, delete'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

      </div>
    </div>
  )
}
