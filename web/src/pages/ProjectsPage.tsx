import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { projects, tasks, sessions } from '../api/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

type ImportMode = 'github' | 'local' | 'empty'

const PROJECT_COLORS = ['#f87171','#fb923c','#facc15','#4ade80','#60a5fa','#c084fc','#f472b6']

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

  function statsFor(projectId: string) {
    const pending = taskList.filter(t => t.projectId === projectId && t.status === 'pending').length
    const running = sessionList.filter(s => s.projectId === projectId && s.status === 'running').length
    const review  = sessionList.filter(s => s.projectId === projectId && (s.status === 'done' || s.status === 'error')).length
    return { pending, running, review }
  }

  if (projectList.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-background px-8">
        <div className="w-full max-w-sm flex flex-col gap-8">
          <div className="text-center">
            <p className="font-mono font-bold text-4xl tracking-tight text-foreground">pilot</p>
            <p className="text-sm text-muted-foreground mt-2">Your AI coding crew, ready to ship.</p>
          </div>

          <div className="flex flex-col gap-3">
            {[
              { n: '1', label: 'Add a project', desc: 'Connect a GitHub repo or local path.' },
              { n: '2', label: 'Add an agent',  desc: 'Configure an API key in Settings.' },
              { n: '3', label: 'Dispatch tasks', desc: 'Agents run in parallel on separate branches.' },
            ].map(({ n, label, desc }) => (
              <div key={n} className="flex items-start gap-3 px-4 py-3 rounded-xl bg-card border border-border/50 [box-shadow:var(--shadow-card)]">
                <span className="font-mono text-xs font-bold text-primary/60 mt-0.5 shrink-0 w-4">{n}</span>
                <div>
                  <p className="text-sm font-semibold text-foreground">{label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                </div>
              </div>
            ))}
          </div>

          <Button size="lg" className="w-full" onClick={() => setShowNew(true)}>Add first project</Button>
        </div>

        <NewProjectDialog
          open={showNew}
          onClose={() => setShowNew(false)}
          onCreate={body => createProject.mutate(body)}
          loading={createProject.isPending}
          error={createProject.error?.message}
        />
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto bg-background">
      <div className="max-w-3xl mx-auto px-6 py-10">

        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Projects</h1>
            <p className="text-sm text-muted-foreground mt-1">{projectList.length} project{projectList.length !== 1 ? 's' : ''}</p>
          </div>
          <Button onClick={() => setShowNew(true)}>+ New project</Button>
        </div>

        <div className="flex flex-col gap-2">
          {projectList.map((p, i) => {
            const { pending, running, review } = statsFor(p.id)
            return (
              <button
                key={p.id}
                onClick={() => navigate(`/projects/${p.id}`)}
                className="w-full text-left bg-card border border-border/60 rounded-2xl px-5 py-4 flex items-center gap-4 hover:border-border transition-colors cursor-pointer [box-shadow:var(--shadow-card)] hover:[box-shadow:var(--shadow-card-hover)] group"
              >
                <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: PROJECT_COLORS[i % PROJECT_COLORS.length] }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground">{p.name}</p>
                  <p className="text-xs text-muted-foreground font-mono mt-0.5 truncate">
                    {p.remoteUrl
                      ? p.remoteUrl.replace(/^https?:\/\/(www\.)?github\.com\//, '').replace(/\.git$/, '')
                      : p.localPath ?? 'Local repo'}
                  </p>
                </div>

                {/* Activity chips */}
                <div className="flex items-center gap-2 shrink-0">
                  {running > 0 && (
                    <span className="flex items-center gap-1 text-[11px] font-semibold text-green-500">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-[pulse_1.6s_ease-out_infinite]" />
                      {running} running
                    </span>
                  )}
                  {review > 0 && (
                    <span className="text-[11px] font-semibold text-amber-500">{review} in review</span>
                  )}
                  {pending > 0 && (
                    <span className="text-[11px] text-muted-foreground">{pending} queued</span>
                  )}
                  {running === 0 && review === 0 && pending === 0 && (
                    <span className="text-[11px] text-muted-foreground/40">idle</span>
                  )}
                </div>

                <span className="text-muted-foreground group-hover:text-foreground transition-colors text-sm">→</span>
              </button>
            )
          })}
        </div>
      </div>

      <NewProjectDialog
        open={showNew}
        onClose={() => setShowNew(false)}
        onCreate={body => createProject.mutate(body)}
        loading={createProject.isPending}
        error={createProject.error?.message}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// New project dialog
// ---------------------------------------------------------------------------

function NewProjectDialog({ open, onClose, onCreate, loading, error }: {
  open: boolean; onClose: () => void
  onCreate: (body: { name: string; githubCloneUrl?: string; githubToken?: string; localPath?: string }) => void
  loading: boolean; error?: string
}) {
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

  const modes: { key: ImportMode; label: string }[] = [
    { key: 'github', label: 'GitHub' },
    { key: 'local',  label: 'Local path' },
    { key: 'empty',  label: 'Empty' },
  ]

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>New project</DialogTitle></DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Name</Label>
            <Input autoFocus value={name} onChange={e => setName(e.target.value)}
              placeholder="my-project"
              onKeyDown={e => { if (e.key === 'Enter' && isValid) submit() }} />
          </div>

          <div className="flex gap-1 bg-muted rounded-xl p-0.5">
            {modes.map(({ key, label }) => (
              <button key={key} onClick={() => setMode(key)} className={cn(
                'flex-1 text-xs font-medium rounded-lg py-1.5 transition-colors cursor-pointer border-none',
                mode === key ? 'bg-card text-foreground font-semibold shadow-sm' : 'bg-transparent text-muted-foreground hover:text-foreground'
              )}>{label}</button>
            ))}
          </div>

          {mode === 'github' && (
            <>
              <div className="flex flex-col gap-1.5">
                <Label>Clone URL</Label>
                <Input value={githubUrl} onChange={e => setGithubUrl(e.target.value)} placeholder="https://github.com/org/repo.git" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Access token</Label>
                <Input type="password" value={githubToken} onChange={e => setGithubToken(e.target.value)} placeholder="ghp_…" />
              </div>
            </>
          )}
          {mode === 'local' && (
            <div className="flex flex-col gap-1.5">
              <Label>Path on this machine</Label>
              <Input value={localPath} onChange={e => setLocalPath(e.target.value)}
                placeholder="/Users/you/code/myproject" className="font-mono text-xs" />
              <p className="text-xs text-muted-foreground">Pilot clones a bare copy. Your working tree stays untouched.</p>
            </div>
          )}
          {mode === 'empty' && (
            <p className="text-sm text-muted-foreground leading-relaxed">
              Starts with an empty repo. Agents can create files and commit from scratch.
            </p>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button className="flex-1" disabled={!isValid || loading} onClick={submit}>
              {loading ? '…' : 'Create'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
