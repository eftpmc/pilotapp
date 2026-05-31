import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, useNavigate } from 'react-router-dom'
import { projects } from '../api/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/Skeleton'
import { cn } from '@/lib/utils'

function InfoRow({ label, value }: { label: string; value?: string }) {
  if (!value) return null
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-mono text-muted-foreground/60 uppercase tracking-widest">{label}</span>
      <span className="text-sm text-foreground font-mono break-all">{value}</span>
    </div>
  )
}

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
    <div className="flex-1 flex flex-col bg-background">
      <div className="h-14 shrink-0 flex items-center gap-3 px-6 border-b border-border/60">
        <span className="text-sm font-semibold text-foreground">Settings</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-lg mx-auto px-6 py-8 flex flex-col gap-8">

          {/* Project info */}
          <section className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest flex-1">Project</h2>
              {!editing && project && (
                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                  onClick={startEdit}>Edit</Button>
              )}
            </div>

            <div className="bg-card border border-border/60 rounded-2xl p-5 flex flex-col gap-4 [box-shadow:var(--shadow-card)]">
              {isLoading ? (
                <>
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-64" />
                </>
              ) : editing ? (
                <>
                  <div className="flex flex-col gap-1.5">
                    <Label>Name</Label>
                    <Input value={name} onChange={e => setName(e.target.value)} autoFocus />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label>Remote URL <span className="text-muted-foreground font-normal">(optional)</span></Label>
                    <Input value={remoteUrl} onChange={e => setRemoteUrl(e.target.value)}
                      placeholder="https://github.com/org/repo.git" />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label>GitHub token <span className="text-muted-foreground font-normal">(leave blank to keep existing)</span></Label>
                    <Input type="password" value={githubToken} onChange={e => setGithubToken(e.target.value)}
                      placeholder="ghp_…" />
                  </div>
                  {updateProject.isError && (
                    <p className="text-xs text-destructive">{updateProject.error?.message}</p>
                  )}
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
                    <Button className="flex-1" disabled={!name.trim() || updateProject.isPending}
                      onClick={() => updateProject.mutate({
                        name: name.trim(),
                        remoteUrl: remoteUrl.trim() || undefined,
                        githubToken: githubToken.trim() || undefined,
                      })}>
                      {updateProject.isPending ? '…' : 'Save'}
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <InfoRow label="Name"       value={project?.name} />
                  <InfoRow label="Repository" value={project?.repoPath} />
                  <InfoRow label="Remote"     value={project?.remoteUrl} />
                  <InfoRow label="Local path" value={project?.localPath} />
                  <InfoRow label="Created"    value={project ? new Date(project.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : undefined} />
                </>
              )}
            </div>
          </section>

          <Separator className="opacity-40" />

          {/* Danger zone */}
          <section className="flex flex-col gap-4">
            <h2 className="text-xs font-semibold text-destructive/80 uppercase tracking-widest">Danger zone</h2>
            <div className="bg-card border border-destructive/20 rounded-2xl p-5 flex flex-col gap-3 [box-shadow:var(--shadow-card)]">
              <div>
                <p className="text-sm font-semibold text-foreground">Delete project</p>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  Permanently deletes this project and all its tasks and sessions. This cannot be undone.
                </p>
              </div>

              {confirming ? (
                <div className="flex items-center gap-2 pt-1">
                  <p className="text-xs text-muted-foreground flex-1">Are you sure?</p>
                  <Button size="sm" variant="outline" onClick={() => setConfirming(false)}>Cancel</Button>
                  <Button size="sm" variant="destructive"
                    onClick={() => deleteProject.mutate()}
                    disabled={deleteProject.isPending}
                    className={cn(deleteProject.isPending && 'opacity-60')}>
                    {deleteProject.isPending ? 'Deleting…' : 'Yes, delete'}
                  </Button>
                </div>
              ) : (
                <Button size="sm" variant="outline" onClick={() => setConfirming(true)}
                  className="self-start text-destructive border-destructive/30 hover:bg-destructive/10 hover:border-destructive/50">
                  Delete project
                </Button>
              )}
            </div>
          </section>

        </div>
      </div>
    </div>
  )
}
