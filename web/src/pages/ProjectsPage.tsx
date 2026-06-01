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

function timeAgo(iso?: string) {
  if (!iso) return 'No activity'
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000)
  if (m < 1)  return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
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
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
        <div style={{ width: '100%', maxWidth: 380, padding: '0 24px', display: 'flex', flexDirection: 'column', gap: 28 }}>
          <div>
            <p style={{ fontWeight: 700, fontSize: 24, letterSpacing: '-0.02em', color: 'var(--ink)', margin: '0 0 6px' }}>pilot</p>
            <p style={{ fontSize: 14, color: 'var(--muted)', margin: 0 }}>Your AI coding crew, ready to ship.</p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { n: '1', label: 'Add a project',  desc: 'Connect a GitHub repo or local path.' },
              { n: '2', label: 'Add an agent',   desc: 'Configure an API key in Settings.' },
              { n: '3', label: 'Dispatch tasks', desc: 'Agents run in parallel on separate branches.' },
            ].map(({ n, label, desc }) => (
              <div key={n} style={{
                display: 'flex', alignItems: 'flex-start', gap: 14,
                padding: '14px 16px', background: 'var(--panel)',
                border: '1px solid var(--rule)', borderRadius: 12,
              }}>
                <span style={{
                  width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                  background: 'var(--ember-wash)', color: 'var(--ember)',
                  display: 'grid', placeItems: 'center',
                  fontSize: 11, fontWeight: 700,
                }}>{n}</span>
                <div>
                  <p style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)', margin: '0 0 2px' }}>{label}</p>
                  <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>{desc}</p>
                </div>
              </div>
            ))}
          </div>

          <button className="btn primary" style={{ width: '100%', justifyContent: 'center', padding: '10px 16px', borderRadius: 10, fontSize: 14 }} onClick={() => setShowNew(true)}>
            Add first project
          </button>
        </div>
        <NewProjectDialog open={showNew} onClose={() => setShowNew(false)}
          onCreate={body => createProject.mutate(body)}
          loading={createProject.isPending} error={createProject.error?.message} />
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto bg-background">
      <div className="px-6 pt-10 pb-8">

        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
            <p className="text-sm text-muted-foreground mt-1">{projectList.length} project{projectList.length !== 1 ? 's' : ''} · git repos your agents work in</p>
          </div>
          <Button onClick={() => setShowNew(true)}>+ New</Button>
        </div>

        <div className="project-card-grid">
          {projectList.map(p => {
            const { pending, running, review, latestAt } = statsFor(p.id)
            const repo = p.remoteUrl
              ? p.remoteUrl.replace(/^https?:\/\/(www\.)?github\.com\//, '').replace(/\.git$/, '')
              : p.localPath ?? 'local'
            const total = pending + running + review
            return (
              <button
                key={p.id}
                onClick={() => navigate(`/projects/${p.id}`)}
                className="project-card"
              >
                <div className="project-card-head">
                  <span className="project-card-title">{p.name}</span>
                  {(running > 0 || review > 0) && (
                    <span className="project-card-dots">
                      {running > 0 && <span className="dot green pulse" />}
                      {review > 0  && <span className="dot amber" />}
                    </span>
                  )}
                </div>
                <p className="project-card-repo">{repo}</p>
                <div className="project-card-lanes" aria-hidden="true">
                  <span className={cn('lane green', running > 0 && 'active')} />
                  <span className={cn('lane amber', review > 0 && 'active')} />
                  <span className={cn('lane muted', pending > 0 && 'active')} />
                </div>
                <div className="project-card-stats">
                  {running > 0 && <span className="stat green" style={{ fontSize: 12 }}><span className="dot green pulse" />{running} running</span>}
                  {review  > 0 && <span className="stat amber" style={{ fontSize: 12 }}><span className="dot amber" />{review} to review</span>}
                  {pending > 0 && <span style={{ fontSize: 12, color: 'var(--muted)' }}>{pending} queued</span>}
                  {running === 0 && review === 0 && pending === 0 && (
                    <span style={{ fontSize: 12, color: 'var(--faint)' }}>Idle</span>
                  )}
                </div>
                <div className="project-card-foot">
                  <span>{total > 0 ? `${total} active item${total !== 1 ? 's' : ''}` : 'Quiet'}</span>
                  <span>{timeAgo(latestAt)}</span>
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
  onCreate: (body: { name: string; githubCloneUrl?: string; githubToken?: string; localPath?: string }) => void
  loading: boolean; error?: string
}) {
  const [name, setName]           = useState('')
  const [mode, setMode]           = useState<ImportMode>('github')
  const [githubUrl, setGithubUrl] = useState('')
  const [githubToken, setToken]   = useState('')
  const [localPath, setLocal]     = useState('')

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

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>New project</DialogTitle></DialogHeader>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="field">
            <Label>Name</Label>
            <Input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="my-project"
              onKeyDown={e => { if (e.key === 'Enter' && isValid) submit() }} />
          </div>

          <div style={{ display: 'flex', gap: 3, background: 'var(--panel)', borderRadius: 10, padding: 3 }}>
            {(['github', 'local', 'empty'] as ImportMode[]).map(k => (
              <button key={k} onClick={() => setMode(k)} className={cn(
                'flex-1 text-[13px] font-medium rounded-lg py-1.5 border-none cursor-pointer transition-colors',
                mode === k ? 'bg-[var(--bg)] text-[var(--ink)] shadow-sm' : 'bg-transparent text-[var(--muted)]'
              )}>{k === 'github' ? 'GitHub' : k === 'local' ? 'Local path' : 'Empty'}</button>
            ))}
          </div>

          {mode === 'github' && <>
            <div className="field"><Label>Clone URL</Label><Input value={githubUrl} onChange={e => setGithubUrl(e.target.value)} placeholder="https://github.com/org/repo.git" /></div>
            <div className="field"><Label>Access token</Label><Input type="password" value={githubToken} onChange={e => setToken(e.target.value)} placeholder="ghp_…" /></div>
          </>}
          {mode === 'local' && (
            <div className="field">
              <Label>Path on this machine</Label>
              <Input value={localPath} onChange={e => setLocal(e.target.value)} placeholder="/Users/you/code/myproject" style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }} />
              <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>Pilot clones a bare copy. Your working tree stays untouched.</p>
            </div>
          )}
          {mode === 'empty' && <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>Starts with an empty repo. Agents can create files and commit from scratch.</p>}

          {error && <p style={{ fontSize: 13, color: 'var(--red)', margin: 0 }}>{error}</p>}

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" onClick={onClose}>Cancel</button>
            <button className="btn primary" style={{ flex: 1, justifyContent: 'center' }} disabled={!isValid || loading} onClick={submit}>
              {loading ? '…' : 'Create'}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
