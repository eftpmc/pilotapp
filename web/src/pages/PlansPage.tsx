import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { specs, agents, sessions } from '../api/client'
import type { Spec, Agent } from '../api/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Play, Trash2 } from 'lucide-react'

// ---------------------------------------------------------------------------
// Spec editor (inline textarea)
// ---------------------------------------------------------------------------

function SpecEditor({ spec, onUpdate }: { spec: Spec; onUpdate: (b: { content: string }) => void }) {
  const [content, setContent] = useState(spec.content)
  if (content !== spec.content && document.activeElement?.tagName !== 'TEXTAREA') {
    setContent(spec.content)
  }
  return (
    <Textarea
      value={content}
      onChange={e => setContent(e.target.value)}
      onBlur={() => { if (content !== spec.content) onUpdate({ content }) }}
      placeholder="Spec content — edit freely…"
      className="font-mono text-xs leading-relaxed resize-y min-h-[140px]"
    />
  )
}

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

function StatusPill({ spec }: { spec: Spec }) {
  if (spec.status === 'planning')
    return <span className="stat amber"><span className="dot amber pulse" />Planning</span>
  if (spec.content.trim())
    return <span className="stat green"><span className="dot green" />Ready</span>
  return <span className="stat" style={{ color: 'var(--muted)' }}><span className="dot idle" />Draft</span>
}

// ---------------------------------------------------------------------------
// List row (expandable)
// ---------------------------------------------------------------------------

function PlanListRow({ spec, expanded, onToggle, onDelete, onExecute, onUpdate, onWatch, onStop, isExecuting, isDeleting }: {
  spec: Spec
  expanded: boolean
  onToggle: () => void
  onDelete: () => void
  onExecute: () => void
  onUpdate: (b: { content: string }) => void
  onWatch: () => void
  onStop: () => void
  isExecuting: boolean
  isDeleting: boolean
}) {
  return (
    <div>
      <button
        onClick={onToggle}
        className="row"
      >
        <div className="row-main">
          <div className="row-title">{spec.title}</div>
          <div className="row-meta">
            {spec.content.trim()
              ? <span>{spec.content.replace(/^#.*\n?/gm, '').trim().slice(0, 140)}</span>
              : <span>No content yet.</span>
            }
          </div>
        </div>
        <StatusPill spec={spec} />
        <span className="row-go" style={{ opacity: expanded ? 1 : undefined, transform: expanded ? 'rotate(90deg)' : undefined }}>›</span>
      </button>

      {expanded && (
        <div style={{ padding: '4px 4px 6px 4px', marginTop: 6 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {spec.status === 'planning' ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--muted)', padding: '8px 0' }}>
                <span className="dot amber pulse" />
                Agent is writing the spec…
                {spec.sessionId && (
                  <button onClick={onWatch}
                    style={{ color: 'var(--ember)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13 }}>
                    Watch live
                  </button>
                )}
              </div>
            ) : (
              <SpecEditor spec={spec} onUpdate={onUpdate} />
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
              {spec.status === 'planning' && spec.sessionId && (
                <Button size="sm" variant="ghost" onClick={onStop} style={{ marginRight: 'auto' }}>
                  Stop
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={onDelete} disabled={isDeleting}>
                <Trash2 size={13} />
                Delete
              </Button>
              <Button size="sm" onClick={onExecute}
                disabled={!spec.content.trim() || isExecuting || spec.status === 'planning'}>
                <Play size={13} />
                Execute
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// New plan dialog
// ---------------------------------------------------------------------------

function NewPlanDialog({ projectId, agentList, onClose, onCreate }: {
  projectId: string
  agentList: Agent[]
  onClose: () => void
  onCreate: (body: { projectId: string; title: string; brief?: string; agentId?: string }) => Promise<void>
}) {
  const [title,   setTitle]   = useState('')
  const [brief,   setBrief]   = useState('')
  const [agentId, setAgentId] = useState(agentList[0]?.id ?? '')
  const [loading, setLoading] = useState(false)

  const isValid = title.trim().length > 1

  async function submit() {
    if (!isValid) return
    setLoading(true)
    try { await onCreate({ projectId, title: title.trim(), brief: brief.trim() || undefined, agentId: agentId || undefined }) }
    finally { setLoading(false) }
  }

  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>New plan</DialogTitle></DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Title</Label>
            <Input autoFocus value={title} onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Refactor auth middleware"
              onKeyDown={e => { if (e.key === 'Enter' && isValid && !loading) void submit() }} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Brief <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Textarea value={brief} onChange={e => setBrief(e.target.value)} rows={3}
              placeholder="Describe the goal — the agent will read the codebase and write the spec." />
          </div>
          {agentList.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <Label>Agent</Label>
              <Select value={agentId} onValueChange={setAgentId}>
                <SelectTrigger><SelectValue placeholder="Select an agent" /></SelectTrigger>
                <SelectContent>
                  {agentList.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                The agent reads your codebase and writes a SPEC.md. You review it, then execute.
              </p>
            </div>
          )}
          <div className="flex gap-2 pt-1">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button className="flex-1" disabled={!isValid || loading || agentList.length === 0} onClick={() => void submit()}>
              {loading ? '…' : 'Create plan'}
            </Button>
          </div>
          {agentList.length === 0 && (
            <p className="text-xs text-destructive text-center -mt-2">Add an agent in Settings first.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function PlansPage() {
  const { id: projectId } = useParams<{ id: string }>()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [expandedSpec, setExpanded] = useState<string | null>(null)
  const [showNew, setShowNew]       = useState(false)

  const anyPlanning = (list: Spec[]) => list.some(s => s.status === 'planning')

  const { data: specList  = [], isLoading } = useQuery({
    queryKey: ['specs', projectId],
    queryFn: () => specs.list(projectId!),
    enabled: !!projectId,
    refetchInterval: q => anyPlanning(q.state.data ?? []) ? 3000 : false,
  })
  const { data: agentList = [] } = useQuery({ queryKey: ['agents'], queryFn: () => agents.list() })

  const stopPlan = useMutation({
    mutationFn: (sessionId: string) => sessions.stop(sessionId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['specs', projectId] }),
  })
  const createSpec = useMutation({
    mutationFn: (body: Parameters<typeof specs.create>[0]) => specs.create(body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['specs', projectId] }); setShowNew(false) },
  })
  const updateSpec = useMutation({
    mutationFn: ({ id, body }: { id: string; body: { content: string } }) => specs.update(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['specs', projectId] }),
  })
  const deleteSpec = useMutation({
    mutationFn: (id: string) => specs.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['specs', projectId] }); setExpanded(null) },
  })
  const executeSpec = useMutation({
    mutationFn: (id: string) => specs.execute(id),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['tasks', data.projectId] })
      navigate(`/projects/${data.projectId}`)
    },
  })

  return (
    <div className="flex-1 overflow-y-auto bg-background">
      <div className="max-w-[960px] px-6 pt-6 pb-8 flex flex-col gap-4">

        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground/50">{specList.length > 0 ? `${specList.length} plan${specList.length !== 1 ? 's' : ''}` : 'No plans yet'}</p>
          <Button size="sm" onClick={() => setShowNew(true)}>New plan</Button>
        </div>

        {isLoading ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-14 bg-card border border-border rounded-xl animate-pulse" />
            ))}
          </div>
        ) : specList.length === 0 ? (
          <p className="text-sm text-muted-foreground/50 py-8 text-center">No plans yet. Create one and an agent will write the spec.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {specList.map(spec => (
              <PlanListRow
                key={spec.id}
                spec={spec}
                expanded={expandedSpec === spec.id}
                onToggle={() => setExpanded(expandedSpec === spec.id ? null : spec.id)}
                onDelete={() => deleteSpec.mutate(spec.id)}
                onExecute={() => executeSpec.mutate(spec.id)}
                onUpdate={body => updateSpec.mutate({ id: spec.id, body })}
                onWatch={() => navigate(`/sessions/${spec.sessionId}`)}
                onStop={() => spec.sessionId && stopPlan.mutate(spec.sessionId)}
                isExecuting={executeSpec.isPending}
                isDeleting={deleteSpec.isPending}
              />
            ))}
          </div>
        )}
      </div>

      {showNew && projectId && (
        <NewPlanDialog
          projectId={projectId}
          agentList={agentList}
          onClose={() => setShowNew(false)}
          onCreate={async body => { await createSpec.mutateAsync(body) }}
        />
      )}
    </div>
  )
}
