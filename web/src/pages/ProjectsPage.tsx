import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { projects, tasks, sessions } from '../api/client'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { timeAgo } from '@/lib/time'
import { cn } from '@/lib/utils'

type GitSource = 'none' | 'github' | 'local' | 'empty'

function timeAgoOrDefault(iso?: string) {
  return iso ? timeAgo(iso) : 'No activity'
}

export default function ProjectsPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [showNew, setShowNew] = useState(false)

  const { data: projectList = [] } = useQuery({ queryKey: ['projects'], queryFn: () => projects.list() })
  const { data: taskList    = [] } = useQuery({ queryKey: ['tasks'],    queryFn: () => tasks.list() })
  const { data: sessionList = [] } = useQuery({ queryKey: ['sessions'], queryFn: () => sessions.list() })

  const createProject = useMutation({
    mutationFn: (body: Parameters<typeof projects.create>[0]) => projects.create(body),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['projects'] })
      setShowNew(false)
      navigate(`/projects/${data.id}`)
    },
  })

  function statsFor(pid: string) {
    const pending = taskList.filter(t => t.projectId === pid && t.status === 'pending').length
    const running = sessionList.filter(s => s.projectId === pid && s.status === 'running').length
    const review  = sessionList.filter(s => s.projectId === pid && (s.status === 'done' || s.status === 'error')).length
    const latestSession = sessionList
      .filter(s => s.projectId === pid)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
    const latestTask = taskList
      .filter(t => t.projectId === pid)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
    const latestAt = latestSession?.createdAt ?? latestTask?.createdAt
    return { pending, running, review, latestAt }
  }

  if (projectList.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background">
        <Empty className="w-full max-w-md border-none bg-transparent px-6">
          <EmptyHeader>
            <EmptyTitle className="text-2xl font-bold">pilot</EmptyTitle>
            <EmptyDescription>Your AI coding crew, ready to ship.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <div className="grid w-full gap-2">
              {[
                { n: '1', label: 'Add a project',  desc: 'Any folder, with or without git.' },
                { n: '2', label: 'Add an agent',   desc: 'Connect an API key in Settings.' },
                { n: '3', label: 'Dispatch tasks', desc: 'Review the work and merge what lands.' },
              ].map(({ n, label, desc }) => (
                <div key={n} className="flex items-start gap-3.5 rounded-xl border border-border/70 bg-card/80 px-4 py-3.5 text-left">
                  <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-md bg-primary/10 text-[11px] font-bold text-primary">{n}</span>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{label}</p>
                    <p className="text-xs text-muted-foreground">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <Button className="w-full justify-center" onClick={() => setShowNew(true)}>
              New project
            </Button>
          </EmptyContent>
        </Empty>
        <NewProjectDialog open={showNew} onClose={() => setShowNew(false)}
          onCreate={body => createProject.mutate(body)}
          loading={createProject.isPending} error={createProject.error?.message} />
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto bg-background">
      <div className="max-w-[1040px] px-6 pt-12 pb-10">

        <div className="flex items-start justify-between mb-10">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
            <p className="text-sm text-muted-foreground mt-1">{projectList.length} project{projectList.length !== 1 ? 's' : ''}</p>
          </div>
          <Button onClick={() => setShowNew(true)}>New project</Button>
        </div>

        <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
          {projectList.map(p => {
            const { pending, running, review, latestAt } = statsFor(p.id)
            const repo = p.remoteUrl
              ? p.remoteUrl.replace(/^https?:\/\/(www\.)?github\.com\//, '').replace(/\.git$/, '')
              : p.localPath ?? undefined
            const total = pending + running + review
            return (
              <button
                key={p.id}
                onClick={() => navigate(`/projects/${p.id}`)}
                className="group flex flex-col gap-3 min-h-36 p-5 w-full rounded-2xl border border-border/60 bg-card/60 shadow-sm hover:shadow-md hover:bg-card hover:border-border hover:-translate-y-0.5 transition-all text-left"
              >
                <div className="flex items-start justify-between gap-2 w-full">
                  <span className="text-base font-semibold text-foreground leading-tight">{p.name}</span>
                  {(running > 0 || review > 0) && (
                    <span className="flex items-center gap-1 shrink-0 mt-0.5">
                      {running > 0 && <span className="dot green pulse" />}
                      {review > 0  && <span className="dot amber" />}
                    </span>
                  )}
                </div>
                {repo && <p className="font-mono text-[11px] text-muted-foreground leading-none">{repo}</p>}
                <div className="flex gap-1 w-full" aria-hidden="true">
                  <span className={cn('h-0.5 flex-1 rounded-full transition-colors', running > 0 ? 'bg-[var(--green-dot)]' : 'bg-border/50')} />
                  <span className={cn('h-0.5 flex-1 rounded-full transition-colors', review  > 0 ? 'bg-[var(--amber-dot)]' : 'bg-border/50')} />
                  <span className={cn('h-0.5 flex-1 rounded-full transition-colors', pending > 0 ? 'bg-muted-foreground/40' : 'bg-border/50')} />
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  {running > 0 && <span className="stat green text-xs"><span className="dot green pulse" />{running} running</span>}
                  {review  > 0 && <span className="stat amber text-xs"><span className="dot amber" />{review} to review</span>}
                  {pending > 0 && <span className="text-xs text-muted-foreground">{pending} queued</span>}
                  {running === 0 && review === 0 && pending === 0 && (
                    <span className="text-xs text-muted-foreground/40">Idle</span>
                  )}
                </div>
                <div className="flex justify-between gap-3 w-full mt-auto font-mono text-[10.5px] text-muted-foreground/40">
                  <span>{total > 0 ? `${total} active` : 'Quiet'}</span>
                  <span>{timeAgoOrDefault(latestAt)}</span>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      <NewProjectDialog open={showNew} onClose={() => setShowNew(false)}
        onCreate={body => createProject.mutate(body)}
        loading={createProject.isPending} error={createProject.error?.message} />
    </div>
  )
}

function NewProjectDialog({ open, onClose, onCreate, loading, error }: {
  open: boolean; onClose: () => void
  onCreate: (body: Parameters<typeof projects.create>[0]) => void
  loading: boolean; error?: string
}) {
  const [name, setName]           = useState('')
  const [source, setSource]       = useState<GitSource>('none')
  const [githubUrl, setGithubUrl] = useState('')
  const [githubToken, setToken]   = useState('')
  const [localPath, setLocal]     = useState('')

  const isValid = name.trim().length > 0 && (
    source === 'none'  || source === 'empty' ||
    (source === 'github' && githubUrl.trim() && githubToken.trim()) ||
    (source === 'local'  && localPath.trim())
  )

  function submit() {
    if (!isValid) return
    onCreate({
      name: name.trim(),
      ...(source === 'github' ? { githubCloneUrl: githubUrl.trim(), githubToken: githubToken.trim() } : {}),
      ...(source === 'local'  ? { localPath: localPath.trim() } : {}),
      ...(source === 'empty'  ? { initGit: true } : {}),
    })
  }

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>New project</DialogTitle></DialogHeader>
        <div className="flex flex-col gap-5">

          <Field>
            <FieldLabel>Name</FieldLabel>
            <Input autoFocus value={name} onChange={e => setName(e.target.value)}
              placeholder="my-project"
              onKeyDown={e => { if (e.key === 'Enter' && isValid) submit() }} />
          </Field>

          <FieldGroup className="gap-3">
            <Label className="text-muted-foreground">Repository <span className="text-[11px]">(optional)</span></Label>
            <ButtonGroup className="w-full rounded-[10px] bg-[var(--panel)] p-[3px]">
              {([
                { id: 'none'   as GitSource, label: 'None'   },
                { id: 'github' as GitSource, label: 'GitHub' },
                { id: 'local'  as GitSource, label: 'Local'  },
                { id: 'empty'  as GitSource, label: 'New'    },
              ]).map(s => (
                <button key={s.id} onClick={() => setSource(s.id)} className={cn(
                  'flex-1 text-[13px] font-medium rounded-lg py-1.5 transition-colors',
                  source === s.id ? 'bg-background text-foreground shadow-sm' : 'bg-transparent text-muted-foreground'
                )}>{s.label}</button>
              ))}
            </ButtonGroup>

            {source === 'github' && (
              <FieldGroup className="gap-3">
                <Field><FieldLabel>Clone URL</FieldLabel><Input value={githubUrl} onChange={e => setGithubUrl(e.target.value)} placeholder="https://github.com/org/repo.git" /></Field>
                <Field><FieldLabel>Access token</FieldLabel><Input type="password" value={githubToken} onChange={e => setToken(e.target.value)} placeholder="ghp_..." /></Field>
              </FieldGroup>
            )}
            {source === 'local' && (
              <Field>
                <FieldLabel>Path</FieldLabel>
                <Input value={localPath} onChange={e => setLocal(e.target.value)} placeholder="/Users/you/code/myproject" className="font-mono text-xs" />
                <FieldDescription>Pilot clones a bare copy. Your working tree stays untouched.</FieldDescription>
              </Field>
            )}
            {source === 'empty' && (
              <p className="text-sm text-muted-foreground">Empty git repo — agents create files and commit from scratch.</p>
            )}
            {source === 'none' && (
              <p className="text-sm text-muted-foreground">Plain folder — no git. Agents write files directly; you accept their output.</p>
            )}
          </FieldGroup>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button className="flex-1 justify-center" disabled={!isValid || loading} onClick={submit}>
              {loading ? '…' : 'Create'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
