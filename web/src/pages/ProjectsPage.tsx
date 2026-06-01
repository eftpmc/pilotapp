import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { projects, tasks, sessions } from '../api/client'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

type ImportMode = 'github' | 'local' | 'empty'

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
    return { pending, running, review }
  }

  if (projectList.length === 0) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
        <div style={{ width: '100%', maxWidth: 400, padding: '0 24px', display: 'flex', flexDirection: 'column', gap: 32 }}>
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 36, letterSpacing: '-0.04em', color: 'var(--ink)', margin: 0 }}>pilot</p>
            <p style={{ fontSize: 14, color: 'var(--muted)', marginTop: 6 }}>Your AI coding crew, ready to ship.</p>
          </div>
          <div className="rows">
            {[
              { n: '1', label: 'Add a project',  desc: 'Connect a GitHub repo or local path.' },
              { n: '2', label: 'Add an agent',   desc: 'Configure an API key in Settings.' },
              { n: '3', label: 'Dispatch tasks', desc: 'Agents run in parallel on separate branches.' },
            ].map(({ n, label, desc }) => (
              <div key={n} className="row" style={{ cursor: 'default' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--indigo)', fontWeight: 600, width: 18, flexShrink: 0 }}>{n}</span>
                <div className="row-main">
                  <div className="row-title">{label}</div>
                  <div className="row-meta">{desc}</div>
                </div>
              </div>
            ))}
          </div>
          <button className="btn primary" style={{ width: '100%', justifyContent: 'center' }} onClick={() => setShowNew(true)}>
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
    <div style={{ overflowY: 'auto', flex: 1, background: 'var(--bg)' }}>
      <div className="page-content narrow" style={{ paddingTop: 52, paddingBottom: 80 }}>

        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 32 }}>
          <h1 className="h-page">Projects</h1>
          <button className="btn sm" onClick={() => setShowNew(true)}>+ New</button>
        </div>

        <div className="rows">
          {projectList.map(p => {
            const { pending, running, review } = statsFor(p.id)
            const repo = p.remoteUrl
              ? p.remoteUrl.replace(/^https?:\/\/(www\.)?github\.com\//, '').replace(/\.git$/, '')
              : p.localPath ?? 'local'
            return (
              <button key={p.id} className="row" onClick={() => navigate(`/projects/${p.id}`)}>
                <div className="row-main">
                  <div className="row-title" style={{ fontSize: 16 }}>{p.name}</div>
                  <div className="row-meta">
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{repo}</span>
                  </div>
                </div>
                <div className="row-meta" style={{ margin: 0, gap: 12 }}>
                  {running > 0 && <span className="stat green"><span className="dot green pulse" />{running} running</span>}
                  {review  > 0 && <span className="stat amber"><span className="dot amber" />{review} to review</span>}
                  {pending > 0 && <span style={{ fontSize: 12, color: 'var(--muted)' }}>{pending} queued</span>}
                  {running === 0 && review === 0 && pending === 0 && <span style={{ fontSize: 12, color: 'var(--faint)' }}>Idle</span>}
                </div>
                <svg className="row-go" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
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

          <div style={{ display: 'flex', gap: 4, background: 'var(--panel)', borderRadius: 10, padding: 3 }}>
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
