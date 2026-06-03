import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { agents, connections, departments, sessions, tasks, knowledge, tools } from '../api/client'
import type { Agent, Connection, Department, AgentRole, KnowledgeDoc, Tool } from '../api/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { AgentAvatar } from '@/components/AgentAvatar'
import { SpineAvatar } from '@/components/SpineAvatar'
import { cn } from '@/lib/utils'
import { fmtSecs, useElapsed } from '@/lib/time'
import { BookOpen, MoreHorizontal, Pencil, Trash2, Wrench } from 'lucide-react'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEPT_COLORS = ['#6366f1','#f87171','#fb923c','#4ade80','#60a5fa','#c084fc','#f472b6','#facc15']

const PERSONALITY_PRESETS: { label: string; tag: string; prompt: string }[] = [
  {
    label: 'Methodical',
    tag: 'Careful & thorough',
    prompt: 'Approach tasks methodically. Before writing code, think through the requirements carefully and ask clarifying questions if anything is ambiguous. Write clean, readable code with good test coverage. Prefer small, focused changes over large sweeping ones.',
  },
  {
    label: 'Executor',
    tag: 'Ships fast',
    prompt: 'Move fast. Write working code first, optimize later. Avoid over-engineering. Ship the simplest solution that solves the problem, then iterate based on feedback.',
  },
  {
    label: 'Architect',
    tag: 'Thinks in systems',
    prompt: 'Think carefully about system design before writing code. Consider how changes fit into the broader architecture, what interfaces they expose, and how they will behave at scale. Document key decisions.',
  },
  {
    label: 'Reviewer',
    tag: 'Skeptical & precise',
    prompt: 'When reviewing code, be thorough and skeptical. Look for bugs, edge cases, security vulnerabilities, and performance issues. Be specific — point to exact lines and explain why something is a problem and how to fix it.',
  },
  {
    label: 'Pragmatist',
    tag: 'No gold-plating',
    prompt: 'Focus on getting things done. Do not over-engineer or gold-plate. Make pragmatic decisions that balance quality with speed. If something is good enough, ship it.',
  },
  {
    label: 'Communicator',
    tag: 'Leaves a clear trail',
    prompt: 'Communicate clearly throughout your work. Write descriptive commit messages explaining the why, not just the what. Add comments for non-obvious decisions. Update changelogs and documentation as part of the task.',
  },
]

const ROLES: { value: AgentRole; label: string; desc: string }[] = [
  { value: 'any',      label: 'Any',      desc: 'Does whatever is needed' },
  { value: 'worker',   label: 'Worker',   desc: 'Executes tasks, writes code' },
  { value: 'reviewer', label: 'Reviewer', desc: 'Reviews diffs, gives feedback' },
  { value: 'planner',  label: 'Planner',  desc: 'Writes specs and plans' },
  { value: 'lead',     label: 'Lead',     desc: 'Orchestrates team (Claude only)' },
]

function ProviderBadge({ type }: { type: string }) {
  return (
    <Badge variant="outline" className={cn(
      'text-[11px] font-semibold capitalize',
      type === 'claude' && 'text-orange-500 border-orange-500/30 bg-orange-500/10',
      type === 'codex'  && 'text-blue-500 border-blue-500/30 bg-blue-500/10',
    )}>{type}</Badge>
  )
}

// ---------------------------------------------------------------------------
// Personality picker
// ---------------------------------------------------------------------------

function PersonalityPicker({ value, onChange, compact = false }: {
  value: string
  onChange: (v: string) => void
  compact?: boolean
}) {
  const activeIdx = PERSONALITY_PRESETS.findIndex(p => p.prompt === value)

  return (
    <div className="flex flex-col gap-2">
      <div className={cn('grid gap-1.5', compact ? 'grid-cols-2' : 'grid-cols-3')}>
        {PERSONALITY_PRESETS.map((preset, i) => {
          const active = activeIdx === i
          return (
            <button
              key={preset.label}
              type="button"
              onClick={() => onChange(active ? '' : preset.prompt)}
              className={cn(
                'text-left px-2.5 py-2 rounded-lg border transition-colors cursor-pointer',
                compact ? 'py-1.5' : 'py-2',
                active
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border bg-transparent text-muted-foreground hover:text-foreground hover:border-border/80',
              )}
            >
              <span className={cn('block font-semibold leading-none', compact ? 'text-[10px]' : 'text-xs')}>{preset.label}</span>
              <span className={cn('block mt-0.5 leading-tight opacity-70 truncate', compact ? 'text-[9px]' : 'text-[10px]')}>{preset.tag}</span>
            </button>
          )
        })}
      </div>
      <Textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        rows={compact ? 2 : 2}
        placeholder="Describe how this agent should approach their work, or pick a preset above."
        className={cn('resize-none', compact && 'text-xs')}
      />
    </div>
  )
}

function LiveBadge({ createdAt }: { createdAt: string }) {
  const secs = useElapsed(createdAt, true)
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-[pulse_1.6s_ease-out_infinite]" />
      <span className="text-xs text-green-500 font-medium tabular-nums">{fmtSecs(secs)}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Add/Edit Department dialog
// ---------------------------------------------------------------------------

function DepartmentDialog({ open, dept, onClose, onSave, loading, error }: {
  open: boolean; dept?: Department; onClose: () => void
  onSave: (body: { name: string; color: string }) => void
  loading: boolean; error?: string
}) {
  const [name,  setName]  = useState(dept?.name  ?? '')
  const [color, setColor] = useState(dept?.color ?? DEPT_COLORS[0])

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{dept ? 'Edit Department' : 'New Department'}</DialogTitle></DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Name</Label>
            <Input autoFocus value={name} onChange={e => setName(e.target.value)}
              placeholder="Engineering" onKeyDown={e => { if (e.key === 'Enter' && name.trim()) onSave({ name: name.trim(), color }) }} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Color</Label>
            <div className="flex gap-2">
              {DEPT_COLORS.map(c => (
                <button key={c} type="button" onClick={() => setColor(c)} className={cn(
                  'w-6 h-6 rounded-full cursor-pointer border-2 transition-all',
                  color === c ? 'border-foreground scale-110' : 'border-transparent hover:scale-110'
                )} style={{ background: c }} />
              ))}
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button className="flex-1" disabled={!name.trim() || loading}
              onClick={() => onSave({ name: name.trim(), color })}>
              {loading ? '…' : dept ? 'Save' : 'Create'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Add Agent dialog
// ---------------------------------------------------------------------------

function AddAgentDialog({ open, connectionList, deptList, defaultDeptId, onClose, onCreate, loading, error }: {
  open: boolean; connectionList: Connection[]; deptList: Department[]; defaultDeptId?: string; onClose: () => void
  onCreate: (body: { name: string; connectionId: string; personality?: string; role?: AgentRole; departmentId?: string }) => void
  loading: boolean; error?: string
}) {
  const [step,         setStep]    = useState(0)
  const [name,         setName]    = useState('')
  const [connectionId, setConnId]  = useState('')
  const [personality,  setPersona] = useState('')
  const [role,         setRole]    = useState<AgentRole>('worker')
  const [departmentId, setDeptId]  = useState(defaultDeptId ?? '')

  useEffect(() => {
    if (!open) return
    setStep(0)
    setName('')
    setConnId('')
    setPersona('')
    setRole('worker')
    setDeptId(defaultDeptId ?? '')
  }, [open, defaultDeptId])

  const effectiveConnId = connectionId || connectionList[0]?.id || ''
  const selectedBrain = connectionList.find(b => b.id === effectiveConnId)
  const selectedDept = deptList.find(d => d.id === departmentId)
  const selectedRole = ROLES.find(r => r.value === role)
  const selectedPreset = PERSONALITY_PRESETS.find(p => p.prompt === personality)
  const brainAuthLabel = selectedBrain && !selectedBrain.hasKey
    ? selectedBrain.type === 'claude' ? 'subscription' : 'machine auth'
    : null
  const canCreate = name.trim().length > 0 && !!effectiveConnId

  function submit() {
    if (!canCreate) return
    onCreate({
      name: name.trim(),
      connectionId: effectiveConnId,
      personality: personality.trim() || undefined,
      role,
      departmentId: departmentId || undefined,
    })
  }

  const steps = ['Identity', 'Role + connection', 'Working style']

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="agent-wizard-dialog">
        <DialogHeader className="agent-wizard-header">
          <DialogTitle>Add Agent</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Hire a teammate, choose how they work, and put them on the right connection.
          </DialogDescription>
        </DialogHeader>
        {connectionList.length === 0 ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              You need a connection (API key) before you can add agents.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button className="flex-1" onClick={() => { onClose(); window.location.href = '/settings' }}>
                Go to Settings →
              </Button>
            </div>
          </div>
        ) : (
          <div className="agent-wizard">
            <div className="agent-wizard-steps">
              {steps.map((label, i) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => setStep(i)}
                  className={cn('agent-wizard-step', step === i && 'active', i < step && 'complete')}
                >
                  <span>{i + 1}</span>
                  {label}
                </button>
              ))}
            </div>

            <div className="agent-wizard-body">
              {step === 0 && (
                <div className="agent-wizard-panel">
                  <div>
                    <p className="agent-wizard-kicker">Identity</p>
                    <h3 className="agent-wizard-heading">Who is joining the team?</h3>
                  </div>
                  <div className="grid grid-cols-[48px_minmax(0,1fr)] gap-3 items-end max-sm:grid-cols-1">
                    <div className="h-12 w-12 rounded-xl bg-muted border border-border grid place-items-center font-bold text-sm text-foreground">
                      {name.trim().slice(0, 2).toUpperCase() || 'AI'}
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label>Name</Label>
                      <Input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="Carl" />
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label>Department <span className="text-muted-foreground font-normal">(optional)</span></Label>
                    <Select value={departmentId || '__none'} onValueChange={v => setDeptId(v === '__none' ? '' : v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">No department</SelectItem>
                        {deptList.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <p className="text-xs text-muted-foreground">Departments keep agents grouped by team. You can move them later.</p>
                </div>
              )}

              {step === 1 && (
                <div className="agent-wizard-panel">
                  <div>
                    <p className="agent-wizard-kicker">Role + connection</p>
                    <h3 className="agent-wizard-heading">What should this agent be responsible for?</h3>
                  </div>
                  <div className="agent-role-grid">
                    {ROLES.filter(r => r.value !== 'any').map(r => (
                      <button
                        key={r.value}
                        type="button"
                        onClick={() => setRole(r.value)}
                        className={cn('agent-choice-card', role === r.value && 'active')}
                      >
                        <span className="agent-choice-title">{r.label}</span>
                        <span className="agent-choice-desc">{r.desc}</span>
                      </button>
                    ))}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label>Connection</Label>
                    <Select value={effectiveConnId} onValueChange={setConnId}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {connectionList.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  {selectedBrain && (
                    <div className="agent-wizard-summary slim">
                      <span>{selectedBrain.name}</span>
                      <ProviderBadge type={selectedBrain.type} />
                      {selectedBrain.model && <span className="font-mono text-[10px] text-muted-foreground">{selectedBrain.model}</span>}
                      {brainAuthLabel && <Badge variant="outline" className="text-[10px] text-green-500 border-green-500/30 bg-green-500/10">{brainAuthLabel}</Badge>}
                    </div>
                  )}
                </div>
              )}

              {step === 2 && (
                <div className="agent-wizard-panel">
                  <div>
                    <p className="agent-wizard-kicker">Working style</p>
                    <h3 className="agent-wizard-heading">How should they approach work?</h3>
                  </div>
                  <div className="agent-personality-grid">
                    {PERSONALITY_PRESETS.map(preset => {
                      const active = personality === preset.prompt
                      return (
                        <button
                          key={preset.label}
                          type="button"
                          onClick={() => setPersona(active ? '' : preset.prompt)}
                          className={cn('agent-choice-card', active && 'active')}
                        >
                          <span className="agent-choice-title">{preset.label}</span>
                          <span className="agent-choice-desc">{preset.tag}</span>
                        </button>
                      )
                    })}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label>Custom instructions <span className="text-muted-foreground font-normal">(optional)</span></Label>
                    <Textarea
                      value={personality}
                      onChange={e => setPersona(e.target.value)}
                      rows={4}
                      placeholder="Describe how this agent should approach their work."
                      className="resize-y text-xs"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="agent-wizard-footer">
              <div className="agent-wizard-preview">
                <AgentAvatar name={name.trim() || undefined} size={30} />
                <div className="min-w-0 flex-1">
                  <p className="agent-wizard-preview-name">{name.trim() || 'Unnamed agent'}</p>
                  <p className="agent-wizard-preview-meta">
                    {selectedRole?.label ?? 'Worker'}
                    {selectedBrain && <> · {selectedBrain.name}</>}
                    {selectedDept && <> · {selectedDept.name}</>}
                  </p>
                </div>
                {selectedPreset && <span className="chip">{selectedPreset.label}</span>}
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={onClose}>Cancel</Button>
                {step > 0 && <Button variant="outline" onClick={() => setStep(s => Math.max(0, s - 1))}>Back</Button>}
                {step < 2 && <Button variant="secondary" onClick={() => setStep(s => Math.min(2, s + 1))}>Next</Button>}
                <Button disabled={!canCreate || loading} onClick={submit}>
                  {loading ? '…' : step < 2 ? 'Create now' : 'Create agent'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Knowledge doc dialog
// ---------------------------------------------------------------------------

function KnowledgeDocDialog({ open, doc, onClose, onSave, loading, error }: {
  open: boolean; doc?: KnowledgeDoc; onClose: () => void
  onSave: (body: { title: string; content: string }) => void
  loading: boolean; error?: string
}) {
  const [title,   setTitle]   = useState(doc?.title   ?? '')
  const [content, setContent] = useState(doc?.content ?? '')
  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>{doc ? 'Edit knowledge' : 'Add personal knowledge'}</DialogTitle></DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Title</Label>
            <Input autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Personal Preferences, Domain Knowledge" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Content</Label>
            <Textarea value={content} onChange={e => setContent(e.target.value)} rows={8}
              placeholder="Markdown injected only when this agent works." className="font-mono text-xs resize-y" />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button className="flex-1" disabled={!title.trim() || loading} onClick={() => onSave({ title: title.trim(), content })}>
              {loading ? '…' : doc ? 'Save' : 'Add'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Agent card
// ---------------------------------------------------------------------------

function AgentCard({ employee, connection, deptList, activeSession, activeTaskTitle, knowledgeDocs, allTools, assignedTools, onUpdate, onDelete, onAddKnowledge, onEditKnowledge, onDeleteKnowledge, onAssignTool, onUnassignTool }: {
  employee: Agent; connection?: Connection; deptList: Department[]
  activeSession?: { id: string; createdAt: string } | null
  activeTaskTitle?: string; knowledgeDocs: KnowledgeDoc[]
  allTools: Tool[]; assignedTools: Tool[]
  onUpdate: (body: { name?: string; personality?: string; role?: AgentRole; departmentId?: string | null }) => void
  onDelete: () => void
  onAddKnowledge: () => void; onEditKnowledge: (doc: KnowledgeDoc) => void; onDeleteKnowledge: (id: string) => void
  onAssignTool: (toolId: string) => void; onUnassignTool: (toolId: string) => void
}) {
  const [editing, setEditing]       = useState(false)
  const [showK,   setShowK]         = useState(false)
  const [showT,   setShowT]         = useState(false)
  const [confirmDelete, setConfDel] = useState(false)
  const [name,        setName]    = useState(employee.name)
  const [personality, setPersona] = useState(employee.personality ?? '')
  const [role,        setRole]    = useState<AgentRole>(employee.role ?? 'any')
  const [deptId,      setDeptId]  = useState(employee.departmentId ?? '')

  const isActive = !!activeSession
  const roleLabel = ROLES.find(r => r.value === (employee.role ?? 'any'))?.label
  const selectedPreset = PERSONALITY_PRESETS.find(p => p.prompt === employee.personality)
  const personalityLabel = selectedPreset?.label ?? (employee.personality ? employee.personality.split('\n')[0].slice(0, 48) : '')
  const statusLabel = isActive ? 'Working' : 'Idle'
  const modelLabel = connection?.model || (connection?.hasKey ? 'API key' : connection?.type === 'claude' ? 'subscription' : 'machine auth')

  return (
    <>
      <article className={cn('agent-card', confirmDelete && 'is-open')}>
        <div className="agent-card-head">
          <div className="agent-card-identity">
            <AgentAvatar agent={employee} size={44} running={isActive} />
            <div className="min-w-0">
              <div className="agent-title-line">
                <span className="agent-name">{employee.name}</span>
                <div className={cn('agent-status-dot', isActive ? 'working' : 'idle')} />
              </div>
              <div className="agent-meta-line">
                {connection && <ProviderBadge type={connection.type} />}
                {modelLabel && <span className="agent-meta-text">{modelLabel}</span>}
              </div>
            </div>
          </div>

          <div className="agent-card-right">
            <div className={cn('agent-status-chip', isActive ? 'working' : 'idle')}>
              {isActive ? <LiveBadge createdAt={activeSession!.createdAt} /> : statusLabel}
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="agent-menu-trigger" aria-label={`Agent options for ${employee.name}`}>
                  <MoreHorizontal size={16} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => { setEditing(true); setShowT(false); setShowK(false); setConfDel(false) }}>
                  <Pencil size={14} /> Edit agent
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => { setShowT(true); setEditing(false); setShowK(false); setConfDel(false) }}>
                  <Wrench size={14} /> Manage tools
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => { setShowK(true); setEditing(false); setShowT(false); setConfDel(false) }}>
                  <BookOpen size={14} /> Manage knowledge
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem destructive onSelect={() => { setConfDel(true); setEditing(false); setShowT(false); setShowK(false) }}>
                  <Trash2 size={14} /> Delete agent
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="agent-card-body">
          <p className="agent-summary-line">
            <span>{roleLabel ?? 'Any role'}</span>
            {personalityLabel && <><span className="sep">·</span><span>{personalityLabel}</span></>}
          </p>
          <div className="agent-card-stats">
            <span>{assignedTools.length} tool{assignedTools.length !== 1 ? 's' : ''}</span>
            <span>{knowledgeDocs.length} note{knowledgeDocs.length !== 1 ? 's' : ''}</span>
          </div>
        </div>

        {isActive && activeTaskTitle && (
          <div className="agent-active-task">
            <span>Current task</span>
            <strong>{activeTaskTitle}</strong>
          </div>
        )}

        {confirmDelete && (
          <div className="agent-confirm-panel">
            <span>Delete {employee.name}?</span>
            <button onClick={() => setConfDel(false)}>Cancel</button>
            <button onClick={() => { onDelete(); setConfDel(false) }} className="danger">Delete</button>
          </div>
        )}
      </article>

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="agent-manage-dialog">
          <DialogHeader>
            <DialogTitle>Edit {employee.name}</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Adjust their team, default role, and working style.
            </DialogDescription>
          </DialogHeader>
          <div className="agent-card-panel">
            <div className="agent-panel-grid">
              <div className="field"><Label>Name</Label><Input value={name} onChange={e => setName(e.target.value)} /></div>
              <div className="field">
                <Label>Department</Label>
                <Select value={deptId || undefined} onValueChange={setDeptId}>
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>{deptList.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="field">
              <Label>Default Role</Label>
              <div className="agent-role-pills">
                {ROLES.map(r => (
                  <button key={r.value} type="button" onClick={() => setRole(r.value)}
                    className={cn('btn sm', role === r.value ? 'primary' : 'ghost')}>{r.label}</button>
                ))}
              </div>
            </div>
            <div className="field"><Label>Personality</Label><PersonalityPicker value={personality} onChange={setPersona} compact /></div>
            <div className="agent-panel-actions">
              <button className="btn sm" onClick={() => { setEditing(false); setName(employee.name); setPersona(employee.personality ?? ''); setRole(employee.role ?? 'any'); setDeptId(employee.departmentId ?? '') }}>Cancel</button>
              <button className="btn sm primary" onClick={() => { onUpdate({ name: name.trim(), personality: personality.trim() || undefined, role, departmentId: deptId || null }); setEditing(false) }}>Save</button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showT} onOpenChange={setShowT}>
        <DialogContent className="agent-manage-dialog">
          <DialogHeader>
            <DialogTitle>{employee.name}'s tools</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Choose the tools this agent can use while working.
            </DialogDescription>
          </DialogHeader>
          <div className="agent-card-panel">
            {allTools.length === 0 ? (
              <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: 0 }}>No tools yet. <a href="/settings" style={{ color: 'var(--ember)' }}>Add in Settings.</a></p>
            ) : (
              <div className="agent-tool-list">
                {allTools.map(tool => {
                  const assigned = assignedTools.some(t => t.id === tool.id)
                  return (
                    <button key={tool.id} type="button" onClick={() => assigned ? onUnassignTool(tool.id) : onAssignTool(tool.id)}
                      className={cn('agent-tool-row', assigned && 'active')}
                    >
                      <span className="agent-tool-check">{assigned ? '✓' : ''}</span>
                      <span>{tool.name}</span>
                      {tool.description && <small>{tool.description}</small>}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showK} onOpenChange={setShowK}>
        <DialogContent className="agent-manage-dialog">
          <DialogHeader>
            <DialogTitle>{employee.name}'s knowledge</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Personal notes injected only when this agent works.
            </DialogDescription>
          </DialogHeader>
          <div className="agent-card-panel">
            <div className="agent-panel-head">
              <p className="agent-panel-title">Personal knowledge</p>
              <button onClick={() => { setShowK(false); onAddKnowledge() }} style={{ fontSize: 12.5, color: 'var(--ember)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>+ Add</button>
            </div>
            {knowledgeDocs.length === 0 ? (
              <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: 0 }}>No personal knowledge yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {knowledgeDocs.map(doc => (
                  <div key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: 13, color: 'var(--ink)' }}>{doc.title}</span>
                      {doc.content && <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 8 }}>{doc.content.split('\n')[0].slice(0, 60)}</span>}
                    </div>
                    <button onClick={() => { setShowK(false); onEditKnowledge(doc) }} style={{ fontSize: 11, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px', fontFamily: 'inherit' }}>edit</button>
                    <button onClick={() => onDeleteKnowledge(doc.id)} style={{ fontSize: 13, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px', fontFamily: 'inherit', lineHeight: 1 }}>×</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ---------------------------------------------------------------------------
// Department section
// ---------------------------------------------------------------------------

function DepartmentSection({ dept, agentsInDept, connectionList, deptList, sessionList, taskList, allKnowledge, allTools, assignedToolsMap, mutations, onAddAgent }: {
  dept: Department | null
  agentsInDept: Agent[]
  connectionList: Connection[]; deptList: Department[]
  sessionList: { agentId: string; status: string; id: string; createdAt: string; workTaskId?: string }[]
  taskList: { id: string; title: string }[]
  allKnowledge: KnowledgeDoc[]
  allTools: Tool[]
  assignedToolsMap: Map<string, Tool[]>
  mutations: {
    updateAgent: (id: string, body: Parameters<typeof agents.update>[1]) => void
    deleteAgent: (id: string) => void
    createKnowledge: (body: Parameters<typeof knowledge.create>[0]) => void
    updateKnowledge: (id: string, body: Parameters<typeof knowledge.update>[1]) => void
    deleteKnowledge: (id: string) => void
    assignTool: (toolId: string, agentId: string) => void
    unassignTool: (toolId: string, agentId: string) => void
    editDept: (dept: Department) => void
    deleteDept: (id: string) => void
  }
  onAddAgent: (deptId?: string) => void
}) {
  const [knowledgeDialog, setKnowledgeDialog] = useState<{ open: boolean; doc?: KnowledgeDoc; employeeId: string }>({ open: false, employeeId: '' })
  const [confirmDelDept, setConfirmDelDept] = useState(false)

  function activeSessionFor(empId: string) {
    return sessionList.find(s => s.agentId === empId && s.status === 'running') ?? null
  }
  function activeTaskFor(empId: string) {
    const s = activeSessionFor(empId)
    return s?.workTaskId ? taskList.find(t => t.id === s.workTaskId)?.title : undefined
  }
  function connectionFor(emp: Agent) {
    return connectionList.find(b => b.id === emp.connectionId)
  }
  function knowledgeFor(empId: string) {
    return allKnowledge.filter(d => d.scope === 'employee' && d.scopeId === empId)
  }

  const isUnassigned = dept === null
  const runningCount = agentsInDept.filter(emp => activeSessionFor(emp.id)).length

  return (
    <section className="agent-department-section">
      {/* Section header */}
      <div className="agent-department-header">
        <div className="agent-department-title">
          {!isUnassigned && <span className="agent-department-dot" style={{ background: dept.color }} />}
          <div className="min-w-0">
            <h2>{isUnassigned ? 'Unassigned' : dept.name}</h2>
            <p>
              {agentsInDept.length} agent{agentsInDept.length !== 1 ? 's' : ''}
              {runningCount > 0 && <> · {runningCount} working</>}
            </p>
          </div>
        </div>
        <div className="agent-department-actions">
          {!isUnassigned && !confirmDelDept && (
            <>
              <button onClick={() => mutations.editDept(dept)} className="agent-department-action">Edit</button>
              <button onClick={() => setConfirmDelDept(true)} className="agent-department-action danger">Delete</button>
            </>
          )}
          {confirmDelDept && (
            <div className="agent-department-confirm">
              <span>Delete {dept?.name}?</span>
              <button onClick={() => setConfirmDelDept(false)}>Cancel</button>
              <button onClick={() => { mutations.deleteDept(dept!.id); setConfirmDelDept(false) }} className="danger">Delete</button>
            </div>
          )}
          <button onClick={() => onAddAgent(dept?.id)} className="agent-add-inline">
            + Agent{!isUnassigned && dept ? ` to ${dept.name}` : ''}
          </button>
        </div>
      </div>

      {/* Agent rows */}
      <div className="agent-department-list">
        {agentsInDept.length === 0 ? (
          <button onClick={() => onAddAgent(dept?.id)} className="agent-empty-department">
            Add the first agent{!isUnassigned && dept ? ` to ${dept.name}` : ''}
          </button>
        ) : (
          agentsInDept.map(emp => (
            <AgentCard
              key={emp.id}
              employee={emp} connection={connectionFor(emp)} deptList={deptList}
              activeSession={activeSessionFor(emp.id)} activeTaskTitle={activeTaskFor(emp.id)}
              knowledgeDocs={knowledgeFor(emp.id)}
              allTools={allTools}
              assignedTools={assignedToolsMap.get(emp.id) ?? []}
              onUpdate={body => mutations.updateAgent(emp.id, body)}
              onDelete={() => mutations.deleteAgent(emp.id)}
              onAddKnowledge={() => setKnowledgeDialog({ open: true, doc: undefined, employeeId: emp.id })}
              onEditKnowledge={doc => setKnowledgeDialog({ open: true, doc, employeeId: emp.id })}
              onDeleteKnowledge={id => mutations.deleteKnowledge(id)}
              onAssignTool={toolId => mutations.assignTool(toolId, emp.id)}
              onUnassignTool={toolId => mutations.unassignTool(toolId, emp.id)}
            />
          ))
        )}
      </div>

      <KnowledgeDocDialog
        open={knowledgeDialog.open}
        doc={knowledgeDialog.doc}
        onClose={() => setKnowledgeDialog(d => ({ ...d, open: false }))}
        onSave={body => {
          if (knowledgeDialog.doc) {
            mutations.updateKnowledge(knowledgeDialog.doc.id, body)
          } else {
            mutations.createKnowledge({ ...body, scope: 'employee', scopeId: knowledgeDialog.employeeId })
          }
          setKnowledgeDialog(d => ({ ...d, open: false }))
        }}
        loading={false}
      />
    </section>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AgentsPage() {
  const qc = useQueryClient()

  const [addAgentDialog, setaddAgentDialog]   = useState<{ open: boolean; deptId?: string }>({ open: false })
  const [deptDialog,   setDeptDialog]     = useState<{ open: boolean; dept?: Department }>({ open: false })

  const { data: employeeList  = [] } = useQuery({ queryKey: ['agents'],   queryFn: () => agents.list() })
  const { data: connectionList     = [] } = useQuery({ queryKey: ['connections'],      queryFn: () => connections.list() })
  const { data: deptList      = [] } = useQuery({ queryKey: ['departments'], queryFn: () => departments.list() })
  const { data: sessionList   = [] } = useQuery({ queryKey: ['sessions'],    queryFn: () => sessions.list(), refetchInterval: 5000 })
  const { data: taskList      = [] } = useQuery({ queryKey: ['tasks'],       queryFn: () => tasks.list(),    refetchInterval: 8000 })
  const { data: allKnowledge  = [] } = useQuery({ queryKey: ['knowledge'],   queryFn: () => knowledge.list() })
  const { data: allTools       = [] } = useQuery({ queryKey: ['tools'],        queryFn: () => tools.list() })
  const { data: toolAssignments = [] } = useQuery({ queryKey: ['agent-tools'], queryFn: () => tools.assignments() })

  const createAgent = useMutation({
    mutationFn: (body: Parameters<typeof agents.create>[0]) => agents.create(body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['agents'] }); setaddAgentDialog({ open: false }) },
  })
  const updateAgent = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Parameters<typeof agents.update>[1] }) => agents.update(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agents'] }),
  })
  const deleteAgent = useMutation({
    mutationFn: (id: string) => agents.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agents'] }),
  })
  const createDept = useMutation({
    mutationFn: (body: Parameters<typeof departments.create>[0]) => departments.create(body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['departments'] }); setDeptDialog({ open: false }) },
  })
  const updateDept = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Parameters<typeof departments.update>[1] }) => departments.update(id, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['departments'] }); setDeptDialog({ open: false }) },
  })
  const deleteDept = useMutation({
    mutationFn: (id: string) => departments.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['departments'] }),
  })
  const createKnowledge = useMutation({
    mutationFn: (body: Parameters<typeof knowledge.create>[0]) => knowledge.create(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['knowledge'] }),
  })
  const updateKnowledge = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Parameters<typeof knowledge.update>[1] }) => knowledge.update(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['knowledge'] }),
  })
  const deleteKnowledge = useMutation({
    mutationFn: (id: string) => knowledge.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['knowledge'] }),
  })
  const assignTool = useMutation({
    mutationFn: ({ toolId, agentId }: { toolId: string; agentId: string }) => tools.assign(toolId, agentId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agent-tools'] }),
  })
  const unassignTool = useMutation({
    mutationFn: ({ toolId, agentId }: { toolId: string; agentId: string }) => tools.unassign(toolId, agentId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agent-tools'] }),
  })

  const toolById = new Map(allTools.map(t => [t.id, t]))
  const assignedToolsMap = new Map<string, Tool[]>()
  for (const { agentId, toolId } of toolAssignments) {
    const tool = toolById.get(toolId)
    if (!tool) continue
    if (!assignedToolsMap.has(agentId)) assignedToolsMap.set(agentId, [])
    assignedToolsMap.get(agentId)!.push(tool)
  }

  const mutations = {
    updateAgent: (id: string, body: Parameters<typeof agents.update>[1]) => updateAgent.mutate({ id, body }),
    deleteAgent: (id: string) => deleteAgent.mutate(id),
    createKnowledge: (body: Parameters<typeof knowledge.create>[0]) => createKnowledge.mutate(body),
    updateKnowledge: (id: string, body: Parameters<typeof knowledge.update>[1]) => updateKnowledge.mutate({ id, body }),
    deleteKnowledge: (id: string) => deleteKnowledge.mutate(id),
    assignTool:   (toolId: string, agentId: string) => assignTool.mutate({ toolId, agentId }),
    unassignTool: (toolId: string, agentId: string) => unassignTool.mutate({ toolId, agentId }),
    editDept:   (dept: Department) => setDeptDialog({ open: true, dept }),
    deleteDept: (id: string) => deleteDept.mutate(id),
  }

  const busyCount = employeeList.filter(e => sessionList.some(s => s.agentId === e.id && s.status === 'running')).length

  // Group agents by department
  const empsByDept = new Map<string | null, Agent[]>()
  for (const emp of employeeList) {
    const key = emp.departmentId ?? null
    if (!empsByDept.has(key)) empsByDept.set(key, [])
    empsByDept.get(key)!.push(emp)
  }

  return (
    <div className="flex-1 overflow-y-auto bg-background">
      <div className="px-6 pt-10 pb-8">

        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Agents</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {employeeList.length} agent{employeeList.length !== 1 ? 's' : ''}
              {busyCount > 0 && <> · <span className="text-foreground font-semibold">{busyCount} working</span></>}
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button size="sm" variant="outline" onClick={() => setDeptDialog({ open: true })}>+ Department</Button>
            <Button size="sm" onClick={() => setaddAgentDialog({ open: true })}>+ Agent</Button>
          </div>
        </div>

        {/* Departments with their agents */}
        {deptList.map(dept => (
          <DepartmentSection
            key={dept.id}
            dept={dept}
            agentsInDept={empsByDept.get(dept.id) ?? []}
            connectionList={connectionList} deptList={deptList}
            sessionList={sessionList as any} taskList={taskList as any}
            allKnowledge={allKnowledge}
            allTools={allTools} assignedToolsMap={assignedToolsMap}
            mutations={mutations}
            onAddAgent={deptId => setaddAgentDialog({ open: true, deptId })}
          />
        ))}

        {/* Unassigned agents */}
        {(empsByDept.get(null)?.length ?? 0) > 0 && (
          <DepartmentSection
            dept={null}
            agentsInDept={empsByDept.get(null) ?? []}
            connectionList={connectionList} deptList={deptList}
            sessionList={sessionList as any} taskList={taskList as any}
            allKnowledge={allKnowledge}
            allTools={allTools} assignedToolsMap={assignedToolsMap}
            mutations={mutations}
            onAddAgent={() => setaddAgentDialog({ open: true })}
          />
        )}

        {deptList.length === 0 && employeeList.length === 0 && connectionList.length > 0 && (
          <p className="empty-line">No agents yet. Create a department or add an agent directly.</p>
        )}

      </div>

      <DepartmentDialog
        open={deptDialog.open}
        dept={deptDialog.dept}
        onClose={() => setDeptDialog({ open: false })}
        onSave={body => {
          if (deptDialog.dept) updateDept.mutate({ id: deptDialog.dept.id, body })
          else createDept.mutate(body)
        }}
        loading={createDept.isPending || updateDept.isPending}
        error={createDept.error?.message ?? updateDept.error?.message}
      />

      <AddAgentDialog
        open={addAgentDialog.open}
        connectionList={connectionList}
        deptList={deptList}
        defaultDeptId={addAgentDialog.deptId}
        onClose={() => setaddAgentDialog({ open: false })}
        onCreate={body => createAgent.mutate(body)}
        loading={createAgent.isPending}
        error={createAgent.error?.message}
      />
    </div>
  )
}
