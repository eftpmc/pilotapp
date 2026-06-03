import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { agents, connections, departments, sessions, tasks, projects, knowledge, tools } from '../api/client'
import type { AgentRole, KnowledgeDoc } from '../api/client'
import { AgentAvatar } from '@/components/AgentAvatar'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { fmtSecs, useElapsed } from '@/lib/time'
import { ArrowLeft, BookOpen, Pencil, Trash2, Wrench } from 'lucide-react'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PERSONALITY_PRESETS: { label: string; tag: string; prompt: string }[] = [
  { label: 'Methodical',   tag: 'Careful & thorough',  prompt: 'Approach tasks methodically. Before writing code, think through the requirements carefully and ask clarifying questions if anything is ambiguous. Write clean, readable code with good test coverage. Prefer small, focused changes over large sweeping ones.' },
  { label: 'Executor',     tag: 'Ships fast',           prompt: 'Move fast. Write working code first, optimize later. Avoid over-engineering. Ship the simplest solution that solves the problem, then iterate based on feedback.' },
  { label: 'Architect',    tag: 'Thinks in systems',    prompt: 'Think carefully about system design before writing code. Consider how changes fit into the broader architecture, what interfaces they expose, and how they will behave at scale. Document key decisions.' },
  { label: 'Reviewer',     tag: 'Skeptical & precise',  prompt: 'When reviewing code, be thorough and skeptical. Look for bugs, edge cases, security vulnerabilities, and performance issues. Be specific — point to exact lines and explain why something is a problem and how to fix it.' },
  { label: 'Pragmatist',   tag: 'No gold-plating',      prompt: 'Focus on getting things done. Do not over-engineer or gold-plate. Make pragmatic decisions that balance quality with speed. If something is good enough, ship it.' },
  { label: 'Communicator', tag: 'Leaves a clear trail', prompt: 'Communicate clearly throughout your work. Write descriptive commit messages explaining the why, not just the what. Add comments for non-obvious decisions. Update changelogs and documentation as part of the task.' },
]

const ROLES: { value: AgentRole; label: string }[] = [
  { value: 'any',      label: 'Any'      },
  { value: 'worker',   label: 'Worker'   },
  { value: 'reviewer', label: 'Reviewer' },
  { value: 'planner',  label: 'Planner'  },
  { value: 'lead',     label: 'Lead'     },
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ProviderBadge({ type }: { type: string }) {
  return (
    <Badge variant="outline" className={cn(
      'text-[11px] font-semibold capitalize',
      type === 'claude' && 'text-orange-500 border-orange-500/30 bg-orange-500/10',
      type === 'codex'  && 'text-blue-500 border-blue-500/30 bg-blue-500/10',
    )}>{type}</Badge>
  )
}

function LiveTimer({ createdAt }: { createdAt: string }) {
  const secs = useElapsed(createdAt, true)
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-[pulse_1.6s_ease-out_infinite]" />
      <span className="text-xs text-green-500 font-medium tabular-nums">{fmtSecs(secs)}</span>
    </div>
  )
}

function SectionHeading({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <span className="text-muted-foreground/50">{icon}</span>
      <h2 className="text-xs font-semibold text-muted-foreground/60 uppercase tracking-wider">{children}</h2>
    </div>
  )
}

function timeAgo(iso: string) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

// ---------------------------------------------------------------------------
// Knowledge dialog
// ---------------------------------------------------------------------------

function KnowledgeDialog({ open, doc, onClose, onSave, loading }: {
  open: boolean; doc?: KnowledgeDoc; onClose: () => void
  onSave: (body: { title: string; content: string }) => void
  loading: boolean
}) {
  const [title,   setTitle]   = useState(doc?.title   ?? '')
  const [content, setContent] = useState(doc?.content ?? '')
  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{doc ? 'Edit knowledge' : 'Add knowledge'}</DialogTitle></DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Title</Label>
            <Input autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Personal Preferences" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Content</Label>
            <Textarea value={content} onChange={e => setContent(e.target.value)} rows={6}
              placeholder="Markdown injected when this agent works." className="font-mono text-xs resize-y" />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button className="flex-1" disabled={!title.trim() || loading}
              onClick={() => onSave({ title: title.trim(), content })}>
              {loading ? '…' : doc ? 'Save' : 'Add'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AgentPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const { data: agentList    = [] } = useQuery({ queryKey: ['agents'],                queryFn: () => agents.list() })
  const { data: connList     = [] } = useQuery({ queryKey: ['connections'],           queryFn: () => connections.list() })
  const { data: deptList     = [] } = useQuery({ queryKey: ['departments'],           queryFn: () => departments.list() })
  const { data: allTools     = [] } = useQuery({ queryKey: ['tools'],                 queryFn: () => tools.list() })
  const { data: toolAssigns  = [] } = useQuery({ queryKey: ['agent-tools'],           queryFn: () => tools.assignments() })
  const { data: allKnowledge = [] } = useQuery({ queryKey: ['knowledge'],             queryFn: () => knowledge.list() })
  const { data: sessionList  = [] } = useQuery({ queryKey: ['sessions', 'agent', id], queryFn: () => sessions.list({ agentId: id }), refetchInterval: 8000 })
  const { data: taskList     = [] } = useQuery({ queryKey: ['tasks'],                 queryFn: () => tasks.list() })
  const { data: projectList  = [] } = useQuery({ queryKey: ['projects'],              queryFn: () => projects.list() })

  const agent      = agentList.find(a => a.id === id)
  const connection = connList.find(c => c.id === agent?.connectionId)
  const dept       = deptList.find(d => d.id === agent?.departmentId)
  const agentDocs  = allKnowledge.filter(d => d.scope === 'employee' && d.scopeId === id)
  const assignedToolIds = new Set(toolAssigns.filter(a => a.agentId === id).map(a => a.toolId))
  const activeSession   = sessionList.find(s => s.status === 'running') ?? null

  const [name,   setName]   = useState('')
  const [deptId, setDeptId] = useState('')
  const [role,   setRole]   = useState<AgentRole>('any')
  const [identityDirty, setIdentityDirty] = useState(false)

  const [personality, setPersonality] = useState('')
  const [personalityDirty, setPersonalityDirty] = useState(false)

  const [seeded, setSeeded] = useState<string | null>(null)
  if (agent && seeded !== agent.id) {
    setName(agent.name)
    setDeptId(agent.departmentId ?? '')
    setRole(agent.role ?? 'any')
    setPersonality(agent.personality ?? '')
    setIdentityDirty(false)
    setPersonalityDirty(false)
    setSeeded(agent.id)
  }

  const [knowledgeDialog, setKnDialog]   = useState<{ open: boolean; doc?: KnowledgeDoc }>({ open: false })
  const [confirmDelete,   setConfirmDel] = useState(false)

  const updateAgent = useMutation({
    mutationFn: (body: Parameters<typeof agents.update>[1]) => agents.update(id!, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agents'] }),
  })
  const deleteAgent = useMutation({
    mutationFn: () => agents.delete(id!),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['agents'] }); navigate('/agents') },
  })
  const assignTool = useMutation({
    mutationFn: (toolId: string) => tools.assign(toolId, id!),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agent-tools'] }),
  })
  const unassignTool = useMutation({
    mutationFn: (toolId: string) => tools.unassign(toolId, id!),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agent-tools'] }),
  })
  const createKnowledge = useMutation({
    mutationFn: (body: { title: string; content: string }) =>
      knowledge.create({ ...body, scope: 'employee', scopeId: id! }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['knowledge'] }); setKnDialog({ open: false }) },
  })
  const updateKnowledge = useMutation({
    mutationFn: ({ docId, body }: { docId: string; body: { title: string; content: string } }) =>
      knowledge.update(docId, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['knowledge'] }); setKnDialog({ open: false }) },
  })
  const deleteKnowledge = useMutation({
    mutationFn: (docId: string) => knowledge.delete(docId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['knowledge'] }),
  })

  if (!agent) return null

  const modelLabel = connection?.model
    || (connection?.hasKey ? 'API key' : connection?.type === 'claude' ? 'subscription' : 'machine auth')

  const recentSessions = [...sessionList]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 10)

  function taskTitle(wid?: string) { return wid ? taskList.find(t => t.id === wid)?.title : undefined }
  function projectName(pid: string) { return projectList.find(p => p.id === pid)?.name ?? '—' }

  return (
    <div className="flex-1 overflow-y-auto bg-background">
      <div className="px-6 pt-10 pb-16">

        {/* Back */}
        <button
          onClick={() => navigate('/agents')}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-8"
        >
          <ArrowLeft size={13} />
          Agents
        </button>

        {/* ── Hero ── */}
        <div className="flex items-end gap-5 mb-10">
          <div className="shrink-0">
            <AgentAvatar agent={agent} size={80} running={!!activeSession} />
          </div>
          <div className="min-w-0 flex-1 pb-1">
            <h1 className="text-2xl font-semibold tracking-tight leading-none mb-2">{agent.name}</h1>
            <div className="flex flex-wrap items-center gap-2">
              {connection && <ProviderBadge type={connection.type} />}
              {modelLabel && <span className="text-xs text-muted-foreground">{modelLabel}</span>}
              {dept && (
                <>
                  <span className="text-muted-foreground/30 text-xs">·</span>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <span className="w-2 h-2 rounded-full" style={{ background: dept.color }} />
                    {dept.name}
                  </span>
                </>
              )}
            </div>
          </div>
          <div className="shrink-0 pb-1">
            {activeSession
              ? <LiveTimer createdAt={activeSession.createdAt} />
              : <span className="text-xs text-muted-foreground">Idle</span>
            }
          </div>
        </div>

        <div className="flex flex-col gap-10">

          {/* ── Identity ── */}
          <section>
            <SectionHeading icon={<Pencil size={13} />}>Identity</SectionHeading>
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label>Name</Label>
                  <Input value={name} onChange={e => { setName(e.target.value); setIdentityDirty(true) }} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Team</Label>
                  <Select value={deptId || '__none'} onValueChange={v => { setDeptId(v === '__none' ? '' : v); setIdentityDirty(true) }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">No team</SelectItem>
                      {deptList.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Role</Label>
                <div className="flex gap-1.5 flex-wrap">
                  {ROLES.map(r => (
                    <button key={r.value} type="button"
                      onClick={() => { setRole(r.value); setIdentityDirty(true) }}
                      className={cn(
                        'px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors cursor-pointer',
                        role === r.value
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border text-muted-foreground hover:text-foreground hover:border-border/80'
                      )}
                    >{r.label}</button>
                  ))}
                </div>
              </div>
              {identityDirty && (
                <div className="flex gap-2 justify-end">
                  <Button size="sm" variant="outline" onClick={() => {
                    setName(agent.name); setDeptId(agent.departmentId ?? ''); setRole(agent.role ?? 'any'); setIdentityDirty(false)
                  }}>Cancel</Button>
                  <Button size="sm" disabled={updateAgent.isPending} onClick={() => {
                    updateAgent.mutate({ name: name.trim(), role, departmentId: deptId || null })
                    setIdentityDirty(false)
                  }}>Save</Button>
                </div>
              )}
            </div>
          </section>

          {/* ── Working style ── */}
          <section>
            <SectionHeading icon={<span className="text-[13px]">✦</span>}>Working style</SectionHeading>
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {PERSONALITY_PRESETS.map(preset => {
                  const active = personality === preset.prompt
                  return (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => { setPersonality(active ? '' : preset.prompt); setPersonalityDirty(true) }}
                      className={cn(
                        'text-left px-2.5 py-2 rounded-lg border transition-colors cursor-pointer',
                        active
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border text-muted-foreground hover:text-foreground hover:border-border/80'
                      )}
                    >
                      <span className="block text-xs font-semibold leading-none">{preset.label}</span>
                      <span className="block text-[10px] mt-0.5 opacity-70 truncate">{preset.tag}</span>
                    </button>
                  )
                })}
              </div>
              <Textarea
                value={personality}
                onChange={e => { setPersonality(e.target.value); setPersonalityDirty(true) }}
                rows={3}
                placeholder="Describe how this agent should approach work, or pick a preset above."
                className="resize-y text-xs"
              />
              {personalityDirty && (
                <div className="flex gap-2 justify-end">
                  <Button size="sm" variant="outline" onClick={() => { setPersonality(agent.personality ?? ''); setPersonalityDirty(false) }}>Cancel</Button>
                  <Button size="sm" disabled={updateAgent.isPending} onClick={() => {
                    updateAgent.mutate({ personality: personality.trim() || undefined })
                    setPersonalityDirty(false)
                  }}>Save</Button>
                </div>
              )}
            </div>
          </section>

          {/* ── Tools ── */}
          <section>
            <SectionHeading icon={<Wrench size={13} />}>Tools</SectionHeading>
            {allTools.length === 0 ? (
              <p className="text-xs text-muted-foreground">No tools configured. <a href="/tools" className="text-primary hover:underline">Add in Tools.</a></p>
            ) : (
              <div className="flex flex-col divide-y divide-border/40">
                {allTools.map(tool => {
                  const assigned = assignedToolIds.has(tool.id)
                  return (
                    <button
                      key={tool.id}
                      type="button"
                      onClick={() => assigned ? unassignTool.mutate(tool.id) : assignTool.mutate(tool.id)}
                      className="flex items-center gap-3 py-2.5 text-left hover:bg-muted/30 transition-colors rounded-lg px-2 -mx-2 cursor-pointer"
                    >
                      <span className={cn(
                        'w-4 h-4 rounded border flex items-center justify-center shrink-0 text-[10px] font-bold transition-colors',
                        assigned ? 'bg-primary border-primary text-primary-foreground' : 'border-border text-transparent'
                      )}>✓</span>
                      <div className="min-w-0 flex-1">
                        <span className="text-sm font-medium text-foreground">{tool.name}</span>
                        {tool.description && <span className="text-xs text-muted-foreground ml-2">{tool.description}</span>}
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </section>

          {/* ── Knowledge ── */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <SectionHeading icon={<BookOpen size={13} />}>Knowledge</SectionHeading>
              <button
                onClick={() => setKnDialog({ open: true, doc: undefined })}
                className="text-xs text-primary hover:underline cursor-pointer"
              >+ Add</button>
            </div>
            {agentDocs.length === 0 ? (
              <p className="text-xs text-muted-foreground">No personal knowledge yet.</p>
            ) : (
              <div className="flex flex-col divide-y divide-border/40">
                {agentDocs.map(doc => (
                  <div key={doc.id} className="flex items-center gap-3 py-2.5">
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-foreground">{doc.title}</span>
                      {doc.content && (
                        <span className="text-xs text-muted-foreground ml-2 truncate hidden sm:inline">
                          {doc.content.split('\n')[0].slice(0, 60)}
                        </span>
                      )}
                    </div>
                    <button onClick={() => setKnDialog({ open: true, doc })}
                      className="text-xs text-muted-foreground hover:text-foreground px-1 cursor-pointer shrink-0">edit</button>
                    <button onClick={() => deleteKnowledge.mutate(doc.id)}
                      className="text-sm text-muted-foreground hover:text-destructive px-1 cursor-pointer leading-none shrink-0">×</button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* ── Sessions ── */}
          {recentSessions.length > 0 && (
            <section>
              <SectionHeading icon={<span className="text-[13px]">◎</span>}>Recent sessions</SectionHeading>
              <div className="flex flex-col divide-y divide-border/40">
                {recentSessions.map(s => {
                  const title     = taskTitle(s.workTaskId)
                  const proj      = projectName(s.projectId)
                  const isRunning = s.status === 'running'
                  const isError   = s.status === 'error'
                  return (
                    <button
                      key={s.id}
                      onClick={() => navigate(`/sessions/${s.id}`)}
                      className="flex items-center gap-3 py-2.5 text-left hover:bg-muted/30 transition-colors rounded-lg px-2 -mx-2 cursor-pointer"
                    >
                      <span className={cn(
                        'w-1.5 h-1.5 rounded-full shrink-0',
                        isRunning ? 'bg-green-500 animate-pulse' : isError ? 'bg-destructive' : s.status === 'merged' ? 'bg-primary' : 'bg-muted-foreground/40'
                      )} />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium text-foreground truncate block">{title ?? s.id.slice(0, 8)}</span>
                        <span className="text-xs text-muted-foreground">{proj}</span>
                      </div>
                      <span className="text-xs text-muted-foreground/50 shrink-0 tabular-nums">{timeAgo(s.createdAt)}</span>
                      <span className={cn(
                        'text-xs font-medium shrink-0 capitalize',
                        isRunning ? 'text-green-500' : isError ? 'text-destructive' : 'text-muted-foreground'
                      )}>{s.status}</span>
                    </button>
                  )
                })}
              </div>
            </section>
          )}

          {/* ── Danger zone ── */}
          <section className="pt-2 border-t border-border/40">
            {!confirmDelete ? (
              <button
                onClick={() => setConfirmDel(true)}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
              >
                <Trash2 size={12} />
                Delete {agent.name}
              </button>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-xs text-foreground">Delete {agent.name}? This can't be undone.</span>
                <button onClick={() => setConfirmDel(false)} className="text-xs text-muted-foreground hover:text-foreground cursor-pointer">Cancel</button>
                <button onClick={() => deleteAgent.mutate()} className="text-xs text-destructive font-medium hover:underline cursor-pointer">Delete</button>
              </div>
            )}
          </section>

        </div>
      </div>

      <KnowledgeDialog
        open={knowledgeDialog.open}
        doc={knowledgeDialog.doc}
        onClose={() => setKnDialog({ open: false })}
        onSave={body => {
          if (knowledgeDialog.doc) updateKnowledge.mutate({ docId: knowledgeDialog.doc.id, body })
          else createKnowledge.mutate(body)
        }}
        loading={createKnowledge.isPending || updateKnowledge.isPending}
      />
    </div>
  )
}
