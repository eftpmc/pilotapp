import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, useNavigate } from 'react-router-dom'
import { projects } from '../api/client'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

function InfoRow({ label, value }: { label: string; value?: string }) {
  if (!value) return null
  return (
    <div className="row quiet" style={{ cursor: 'default' }}>
      <div className="row-main">
        <div className="row-meta" style={{ marginTop: 0 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted)' }}>{label}</span>
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, color: 'var(--ink)', overflowWrap: 'anywhere', marginTop: 4 }}>{value}</div>
      </div>
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
    <div style={{ overflowY: 'auto', flex: 1, background: 'var(--bg)' }}>
      <div className="page-content narrow" style={{ paddingTop: 32, paddingBottom: 80 }}>

          <section className="section" style={{ marginTop: 0 }}>
            <div className="section-head">
              <h2>Project</h2>
              <div style={{ flex: 1 }} />
              {!editing && project && (
                <button
                  onClick={startEdit}
                  style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--indigo)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0', fontFamily: 'inherit' }}
                >
                  Edit
                </button>
              )}
            </div>

            <div className="rows">
              {isLoading ? (
                <p className="empty-line">Loading project settings…</p>
              ) : editing ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '14px 0 4px' }}>
                  <div className="field">
                    <Label>Name</Label>
                    <Input value={name} onChange={e => setName(e.target.value)} autoFocus />
                  </div>
                  <div className="field">
                    <Label>Remote URL <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(optional)</span></Label>
                    <Input value={remoteUrl} onChange={e => setRemoteUrl(e.target.value)}
                      placeholder="https://github.com/org/repo.git" />
                  </div>
                  <div className="field">
                    <Label>GitHub token <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(leave blank to keep existing)</span></Label>
                    <Input type="password" value={githubToken} onChange={e => setGithubToken(e.target.value)}
                      placeholder="ghp_…" />
                  </div>
                  {updateProject.isError && (
                    <p style={{ fontSize: 13, color: 'var(--red)', margin: 0 }}>{updateProject.error?.message}</p>
                  )}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn" onClick={() => setEditing(false)}>Cancel</button>
                    <button className="btn primary" style={{ flex: 1, justifyContent: 'center' }} disabled={!name.trim() || updateProject.isPending}
                      onClick={() => updateProject.mutate({
                        name: name.trim(),
                        remoteUrl: remoteUrl.trim() || undefined,
                        githubToken: githubToken.trim() || undefined,
                      })}>
                      {updateProject.isPending ? '…' : 'Save'}
                    </button>
                  </div>
                </div>
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

          {project && (
          <section className="section">
            <div className="section-head">
              <h2 style={{ color: 'var(--red)' }}>Danger zone</h2>
            </div>
            <div className="rows">
              <div className="row" style={{ cursor: 'default' }}>
                <div className="row-main">
                  <div className="row-title">Delete project</div>
                  <div className="row-meta">Permanently deletes this project and all its tasks and sessions. This cannot be undone.</div>
                </div>
                {!confirming && (
                  <button className="btn sm danger" onClick={() => setConfirming(true)}>
                    Delete
                  </button>
                )}
              </div>

              {confirming ? (
                <div className="row quiet" style={{ cursor: 'default' }}>
                  <div className="row-main">
                    <div className="row-meta" style={{ marginTop: 0 }}>Are you sure?</div>
                  </div>
                  <button className="btn sm" onClick={() => setConfirming(false)}>Cancel</button>
                  <button className="btn sm danger"
                    onClick={() => deleteProject.mutate()}
                    disabled={deleteProject.isPending}>
                    {deleteProject.isPending ? 'Deleting…' : 'Yes, delete'}
                  </button>
                </div>
              ) : null}
            </div>
          </section>
          )}

      </div>
    </div>
  )
}
