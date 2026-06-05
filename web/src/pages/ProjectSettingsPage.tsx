import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, useNavigate } from 'react-router-dom'
import { projects } from '../api/client'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@/components/ui/item'
import { Spinner } from '@/components/ui/spinner'


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
      <div className="max-w-[960px] px-6 pt-8 pb-10 flex flex-col gap-8">

        {/* Project info */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground/50">Project</p>
            {!editing && project && (
              <Button size="sm" variant="ghost" className="text-xs font-semibold text-primary h-auto py-0.5" onClick={startEdit}>
                Edit
              </Button>
            )}
          </div>

          {isLoading ? (
            <p className="text-sm text-muted-foreground/50">Loading…</p>
          ) : editing ? (
            <div className="bg-card/70 border border-border/60 rounded-xl p-4 flex flex-col gap-4">
              <Field>
                <FieldLabel>Name</FieldLabel>
                <Input value={name} onChange={e => setName(e.target.value)} autoFocus />
              </Field>
              <Field>
                <FieldLabel>Remote URL <span className="text-muted-foreground font-normal">(optional)</span></FieldLabel>
                <Input value={remoteUrl} onChange={e => setRemoteUrl(e.target.value)} placeholder="https://github.com/org/repo.git" />
              </Field>
              <Field>
                <FieldLabel>GitHub token <span className="text-muted-foreground font-normal">(leave blank to keep existing)</span></FieldLabel>
                <Input type="password" value={githubToken} onChange={e => setGithubToken(e.target.value)} placeholder="ghp_..." />
              </Field>
              {updateProject.isError && <p className="text-sm text-destructive">{updateProject.error?.message}</p>}
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
                <Button className="flex-1 justify-center"
                  disabled={!name.trim() || updateProject.isPending}
                  onClick={() => updateProject.mutate({ name: name.trim(), remoteUrl: remoteUrl.trim() || undefined, githubToken: githubToken.trim() || undefined })}>
                  {updateProject.isPending ? <Spinner /> : 'Save'}
                </Button>
              </div>
            </div>
          ) : (
            <ItemGroup className="gap-2">
              {[
                { label: 'Name',       value: project?.name },
                { label: 'Repository', value: project?.repoPath },
                { label: 'Remote',     value: project?.remoteUrl },
                { label: 'Local path', value: project?.localPath },
                { label: 'Created',    value: project ? new Date(project.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : undefined },
              ].filter(r => r.value).map(row => (
                <Item key={row.label} variant="outline" className="bg-card/60">
                  <ItemContent>
                    <ItemDescription className="text-xs">{row.label}</ItemDescription>
                    <ItemTitle className="break-all font-mono text-sm">{row.value}</ItemTitle>
                  </ItemContent>
                </Item>
              ))}
            </ItemGroup>
          )}
        </section>

        {/* Danger zone */}
        {project && (
          <section className="flex flex-col gap-3">
            <p className="text-xs text-destructive/60">Danger zone</p>
            <Item variant="outline" className="bg-card/60 border-destructive/20">
                <ItemContent>
                  <ItemTitle>Delete project</ItemTitle>
                  <ItemDescription className="text-xs">Permanently deletes this project and all its tasks and sessions. This cannot be undone.</ItemDescription>
                </ItemContent>
                <ItemActions>
                {!confirming ? (
                  <Button size="sm" variant="destructive" className="shrink-0" onClick={() => setConfirming(true)}>Delete</Button>
                ) : (
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-muted-foreground">Sure?</span>
                    <Button size="sm" variant="outline" onClick={() => setConfirming(false)}>Cancel</Button>
                    <Button size="sm" variant="destructive" onClick={() => deleteProject.mutate()} disabled={deleteProject.isPending}>
                      {deleteProject.isPending ? 'Deleting…' : 'Yes, delete'}
                    </Button>
                  </div>
                )}
                </ItemActions>
            </Item>
          </section>
        )}

      </div>
    </div>
  )
}
