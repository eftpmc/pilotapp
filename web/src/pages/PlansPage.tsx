import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { specs, employees, sessions } from '../api/client'
import type { Spec, Employee } from '../api/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ViewToggle, type ViewMode } from '@/components/ViewToggle'
import { CardSkeleton } from '@/components/Skeleton'
import { cn } from '@/lib/utils'
import { FileText, ChevronRight, Play, Trash2, ClipboardList } from 'lucide-react'

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

function statusColor(spec: Spec) {
  if (spec.status === 'planning') return 'bg-amber-400'
  if (spec.content.trim())        return 'bg-green-500'
  return 'bg-border'
}

function StatusPill({ spec }: { spec: Spec }) {
  if (spec.status === 'planning')
    return <Badge variant="warning" className="text-[10px] gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-[pulse_1.6s_ease-out_infinite]" />Planning…</Badge>
  if (spec.content.trim())
    return <Badge variant="success" className="text-[10px]">Ready</Badge>
  return <Badge variant="outline" className="text-[10px] text-muted-foreground">Draft</Badge>
}

// ---------------------------------------------------------------------------
// Grid card
// ---------------------------------------------------------------------------

function PlanGridCard({ spec, onDelete, onExecute, onWatch, onStop, isExecuting, isDeleting }: {
  spec: Spec
  onDelete: () => void
  onExecute: () => void
  onWatch: () => void
  onStop: () => void
  isExecuting: boolean
  isDeleting: boolean
}) {
  return (
    <div className={cn(
      'bg-card rounded-2xl flex flex-col overflow-hidden [box-shadow:var(--shadow-card)] border border-border/60',
      'hover:[box-shadow:var(--shadow-card-hover)] transition-shadow',
    )}>
      {/* Status strip */}
      <div className={cn('h-0.5 w-full shrink-0', statusColor(spec))} />

      {/* Body */}
      <div className="flex flex-col gap-2.5 p-4 flex-1">
        <div className="flex items-start gap-2.5">
          <FileText className="h-4 w-4 text-muted-foreground shrink-0 mt-px" />
          <p className="text-sm font-semibold text-foreground leading-snug flex-1">{spec.title}</p>
        </div>

        {spec.status === 'planning' ? (
          <p className="text-xs text-muted-foreground">Agent is writing the spec…</p>
        ) : spec.content ? (
          <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">
            {spec.content.replace(/^#.*\n?/gm, '').trim().slice(0, 180)}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground/50 italic">No content yet.</p>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-border/40 flex items-center gap-2">
        <StatusPill spec={spec} />
        <div className="flex-1" />
        {spec.status === 'planning' && spec.sessionId && (
          <>
            <Button size="sm" variant="ghost" onClick={onWatch} className="h-7 px-2 text-xs text-muted-foreground">Watch</Button>
            <Button size="sm" variant="ghost" onClick={onStop} className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive">Stop</Button>
          </>
        )}
        <Button size="sm" variant="ghost" onClick={onDelete} disabled={isDeleting}
          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
        <Button size="sm" onClick={onExecute} disabled={!spec.content.trim() || isExecuting || spec.status === 'planning'}
          className="h-7 px-2.5 text-xs gap-1.5">
          <Play className="h-3 w-3" />
          Execute
        </Button>
      </div>
    </div>
  )
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
    <div className={cn(
      'bg-card rounded-2xl overflow-hidden [box-shadow:var(--shadow-card)] border border-border/60',
      expanded && 'ring-1 ring-primary/20'
    )}>
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3.5 cursor-pointer bg-transparent border-none hover:bg-muted/30 transition-colors text-left"
      >
        <div className={cn('w-1.5 h-1.5 rounded-full shrink-0', statusColor(spec))} />
        <span className="text-sm font-semibold text-foreground flex-1 truncate">{spec.title}</span>
        <StatusPill spec={spec} />
        <ChevronRight className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform shrink-0 ml-1', expanded && 'rotate-90')} />
      </button>

      {expanded && (
        <>
          <Separator />
          <div className="p-4 flex flex-col gap-3">
            {spec.status === 'planning' ? (
              <div className="flex items-center gap-2.5 text-xs text-muted-foreground py-1">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-[pulse_1.6s_ease-out_infinite] shrink-0" />
                Agent is writing the spec…
                {spec.sessionId && (
                  <button onClick={onWatch}
                    className="text-primary underline underline-offset-2 cursor-pointer bg-transparent border-none text-xs">
                    Watch live
                  </button>
                )}
              </div>
            ) : (
              <SpecEditor spec={spec} onUpdate={onUpdate} />
            )}

            <div className="flex items-center gap-2 justify-end">
              {spec.status === 'planning' && spec.sessionId && (
                <Button size="sm" variant="ghost" onClick={onStop}
                  className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 mr-auto">
                  Stop
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={onDelete} disabled={isDeleting}
                className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 gap-1.5">
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </Button>
              <Button size="sm" onClick={onExecute}
                disabled={!spec.content.trim() || isExecuting || spec.status === 'planning'}
                className="gap-1.5">
                <Play className="h-3.5 w-3.5" />
                Execute
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// New plan dialog
// ---------------------------------------------------------------------------

function NewPlanDialog({ projectId, agentList, onClose, onCreate }: {
  projectId: string
  agentList: Employee[]
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
  const [mode, setMode]           = useState<ViewMode>('list')
  const [expandedSpec, setExpanded] = useState<string | null>(null)
  const [showNew, setShowNew]       = useState(false)

  const anyPlanning = (list: Spec[]) => list.some(s => s.status === 'planning')

  const { data: specList  = [], isLoading } = useQuery({
    queryKey: ['specs', projectId],
    queryFn: () => specs.list(projectId!),
    enabled: !!projectId,
    refetchInterval: q => anyPlanning(q.state.data ?? []) ? 3000 : false,
  })
  const { data: agentList = [] } = useQuery({ queryKey: ['employees'], queryFn: () => employees.list() })

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
    <div className="flex-1 flex flex-col bg-background">

      {/* Top bar */}
      <div className="h-14 shrink-0 flex items-center gap-3 px-6 border-b border-border/60">
        <span className="text-sm font-semibold text-foreground">Plans</span>
        {specList.length > 0 && (
          <span className="font-mono text-xs text-muted-foreground">{specList.length}</span>
        )}
        <div className="flex-1" />
        {specList.length > 0 && <ViewToggle mode={mode} onChange={setMode} />}
        <Button size="sm" onClick={() => setShowNew(true)}>+ New plan</Button>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        {isLoading ? (
          <div className="max-w-2xl mx-auto flex flex-col gap-2.5 p-6">
            {Array.from({ length: 3 }).map((_, i) => <CardSkeleton key={i} />)}
          </div>
        ) : specList.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 py-24 text-center px-8">
            <div className="w-14 h-14 rounded-2xl bg-muted/60 border border-border/40 flex items-center justify-center">
              <ClipboardList className="h-7 w-7 text-muted-foreground/40" strokeWidth={1.5} />
            </div>
            <div className="flex flex-col gap-1.5">
              <p className="text-sm font-semibold text-foreground">No plans yet</p>
              <p className="text-xs text-muted-foreground leading-relaxed max-w-[220px]">
                Create a plan and an agent will read your codebase and write a spec. Then execute it as a task.
              </p>
            </div>
            <Button size="sm" onClick={() => setShowNew(true)}>+ New plan</Button>
          </div>
        ) : mode === 'grid' ? (  // closes isLoading ternary above
          <div
            className="p-6 grid gap-4"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}
          >
            {specList.map(spec => (
              <PlanGridCard
                key={spec.id}
                spec={spec}
                onDelete={() => deleteSpec.mutate(spec.id)}
                onExecute={() => executeSpec.mutate(spec.id)}
                onWatch={() => navigate(`/sessions/${spec.sessionId}`)}
                onStop={() => spec.sessionId && stopPlan.mutate(spec.sessionId)}
                isExecuting={executeSpec.isPending}
                isDeleting={deleteSpec.isPending}
              />
            ))}
          </div>
        ) : (
          <div className="max-w-2xl mx-auto flex flex-col gap-2.5 p-6">
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
      </ScrollArea>

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
