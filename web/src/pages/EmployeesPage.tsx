import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { employees, brains, departments, sessions, tasks, knowledge, tools } from '../api/client'
import type { Employee, Brain, Department, EmployeeRole, KnowledgeDoc, Tool } from '../api/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AgentAvatar } from '@/components/AgentAvatar'
import { cn } from '@/lib/utils'
import { fmtSecs, useElapsed } from '@/lib/time'

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

const ROLES: { value: EmployeeRole; label: string; desc: string }[] = [
  { value: 'any',      label: 'Any',      desc: 'Does whatever is needed' },
  { value: 'worker',   label: 'Worker',   desc: 'Executes tasks, writes code' },
  { value: 'reviewer', label: 'Reviewer', desc: 'Reviews diffs, gives feedback' },
  { value: 'planner',  label: 'Planner',  desc: 'Writes specs and plans' },
  { value: 'lead',     label: 'Lead',     desc: 'Orchestrates team (Claude only)' },
]

function ProviderBadge({ type }: { type: string }) {
  return (
    <Badge variant="outline" className={cn(
      'font-mono text-[10px]',
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
      <div className={cn('grid gap-1.5', compact ? 'grid-cols-3' : 'grid-cols-3')}>
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
// Add Employee dialog
// ---------------------------------------------------------------------------

function AddEmployeeDialog({ open, brainList, deptList, defaultDeptId, onClose, onCreate, loading, error }: {
  open: boolean; brainList: Brain[]; deptList: Department[]; defaultDeptId?: string; onClose: () => void
  onCreate: (body: { name: string; connectionId: string; personality?: string; role?: EmployeeRole; departmentId?: string }) => void
  loading: boolean; error?: string
}) {
  const [name,         setName]    = useState('')
  const [connectionId, setConnId]  = useState('')
  const [personality,  setPersona] = useState('')
  const [role,         setRole]    = useState<EmployeeRole>('any')
  const [departmentId, setDeptId]  = useState(defaultDeptId ?? '')

  // Fall back to first brain if state hasn't been set yet (async load)
  const effectiveConnId = connectionId || brainList[0]?.id || ''

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Add Agent</DialogTitle></DialogHeader>
        {brainList.length === 0 ? (
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
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>Name</Label>
              <Input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="Atlas" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>Connection</Label>
                <Select value={effectiveConnId} onValueChange={setConnId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {brainList.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Department <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <Select value={departmentId || undefined} onValueChange={setDeptId}>
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    {deptList.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Default Role</Label>
              <div className="grid grid-cols-3 gap-1.5">
                {ROLES.map(r => (
                  <button key={r.value} type="button" onClick={() => setRole(r.value)} className={cn(
                    'py-1.5 px-2 rounded-lg border text-xs font-semibold transition-colors cursor-pointer text-left',
                    role === r.value ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-transparent text-muted-foreground hover:text-foreground'
                  )}>
                    {r.label}
                    <span className="block font-normal text-[10px] opacity-70 truncate">{r.desc}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Personality <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <PersonalityPicker value={personality} onChange={setPersona} />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button className="flex-1" disabled={!name || !effectiveConnId || loading}
                onClick={() => onCreate({ name, connectionId: effectiveConnId, personality: personality.trim() || undefined, role, departmentId: departmentId || undefined })}>
                {loading ? '…' : 'Add Agent'}
              </Button>
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
// Employee card
// ---------------------------------------------------------------------------

function EmployeeCard({ employee, brain, deptList, activeSession, activeTaskTitle, knowledgeDocs, allTools, assignedTools, onUpdate, onDelete, onAddKnowledge, onEditKnowledge, onDeleteKnowledge, onAssignTool, onUnassignTool }: {
  employee: Employee; brain?: Brain; deptList: Department[]
  activeSession?: { id: string; createdAt: string } | null
  activeTaskTitle?: string; knowledgeDocs: KnowledgeDoc[]
  allTools: Tool[]; assignedTools: Tool[]
  onUpdate: (body: { name?: string; personality?: string; role?: EmployeeRole; departmentId?: string | null }) => void
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
  const [role,        setRole]    = useState<EmployeeRole>(employee.role ?? 'any')
  const [deptId,      setDeptId]  = useState(employee.departmentId ?? '')

  const isActive = !!activeSession

  const panelStyle: React.CSSProperties = {
    padding: '14px 4px 14px 52px',
    borderTop: '1px solid var(--rule-soft)',
    background: 'var(--panel)',
    display: 'flex', flexDirection: 'column', gap: 12,
  }

  return (
    <div>
      {/* Main row */}
      <div className="row" style={{ cursor: 'default', alignItems: 'center' }}>
        <AgentAvatar agent={employee} size={32} running={isActive} />
        <div className="row-main">
          <div className="row-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {employee.name}
            {employee.role && employee.role !== 'any' && (
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--faint)', fontWeight: 400 }}>{employee.role}</span>
            )}
          </div>
          <div className="row-meta">
            {brain && <ProviderBadge type={brain.type} />}
            {brain?.model && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)' }}>{brain.model}</span>}
            {isActive ? <LiveBadge createdAt={activeSession!.createdAt} /> : <span style={{ fontSize: 10, color: 'var(--faint)' }}>idle</span>}
            {isActive && activeTaskTitle && <span style={{ fontSize: 10, color: 'var(--muted)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{activeTaskTitle}</span>}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          {[
            { key: 'tools',     label: assignedTools.length > 0 ? `${assignedTools.length} tools` : 'tools',           active: showT, toggle: () => setShowT(s => !s) },
            { key: 'knowledge', label: knowledgeDocs.length > 0 ? `${knowledgeDocs.length} docs` : 'knowledge',        active: showK, toggle: () => setShowK(s => !s) },
            { key: 'edit',      label: editing ? 'done' : 'edit',                                                       active: editing, toggle: () => setEditing(e => !e) },
          ].map(({ key, label, active, toggle }) => (
            <button key={key} onClick={toggle} style={{
              fontSize: 12, padding: '4px 10px', borderRadius: 7, border: 'none', cursor: 'pointer',
              background: active ? 'var(--panel-2)' : 'none',
              color: active ? 'var(--ink)' : 'var(--muted)',
              fontFamily: 'inherit', transition: 'color .12s, background .12s',
            }}>{label}</button>
          ))}
          {confirmDelete ? (
            <>
              <button onClick={() => setConfDel(false)} style={{ fontSize: 12, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>cancel</button>
              <button onClick={() => { onDelete(); setConfDel(false) }} style={{ fontSize: 12, color: 'var(--red)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>confirm</button>
            </>
          ) : (
            <button onClick={() => setConfDel(true)} style={{ fontSize: 12, color: 'var(--faint)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', transition: 'color .12s' }}
              onMouseOver={e => (e.currentTarget.style.color = 'var(--red)')}
              onMouseOut={e => (e.currentTarget.style.color = 'var(--faint)')}
            >delete</button>
          )}
        </div>
      </div>

      {/* Edit panel */}
      {editing && (
        <div style={panelStyle}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
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
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {ROLES.map(r => (
                <button key={r.value} type="button" onClick={() => setRole(r.value)}
                  className={cn('btn sm', role === r.value ? 'primary' : 'ghost')}>{r.label}</button>
              ))}
            </div>
          </div>
          <div className="field"><Label>Personality</Label><PersonalityPicker value={personality} onChange={setPersona} compact /></div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn sm" onClick={() => { setEditing(false); setName(employee.name); setPersona(employee.personality ?? ''); setRole(employee.role ?? 'any'); setDeptId(employee.departmentId ?? '') }}>Cancel</button>
            <button className="btn sm primary" onClick={() => { onUpdate({ name: name.trim(), personality: personality.trim() || undefined, role, departmentId: deptId || null }); setEditing(false) }}>Save</button>
          </div>
        </div>
      )}

      {/* Tools panel */}
      {showT && (
        <div style={panelStyle}>
          <p style={{ fontSize: 11, color: 'var(--muted)', margin: 0, fontFamily: 'var(--font-mono)', letterSpacing: '.08em', textTransform: 'uppercase' }}>Tools</p>
          {allTools.length === 0 ? (
            <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: 0 }}>No tools yet. <a href="/settings" style={{ color: 'var(--indigo)' }}>Add in Settings.</a></p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {allTools.map(tool => {
                const assigned = assignedTools.some(t => t.id === tool.id)
                return (
                  <button key={tool.id} type="button" onClick={() => assigned ? onUnassignTool(tool.id) : onAssignTool(tool.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', borderRadius: 7, border: `1px solid ${assigned ? 'color-mix(in srgb, var(--indigo) 30%, transparent)' : 'transparent'}`, background: assigned ? 'var(--indigo-wash)' : 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', width: '100%', transition: 'background .12s' }}
                    onMouseOver={e => { if (!assigned) e.currentTarget.style.background = 'var(--panel-2)' }}
                    onMouseOut={e => { if (!assigned) e.currentTarget.style.background = 'none' }}
                  >
                    <span style={{ width: 14, height: 14, borderRadius: 4, border: `1px solid ${assigned ? 'var(--indigo)' : 'var(--rule)'}`, background: assigned ? 'var(--indigo)' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 9, color: 'var(--on-indigo)' }}>{assigned ? '✓' : ''}</span>
                    <span style={{ fontSize: 13, color: 'var(--ink)' }}>{tool.name}</span>
                    {tool.description && <span style={{ fontSize: 11, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tool.description}</span>}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Knowledge panel */}
      {showK && (
        <div style={panelStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <p style={{ fontSize: 11, color: 'var(--muted)', margin: 0, fontFamily: 'var(--font-mono)', letterSpacing: '.08em', textTransform: 'uppercase', flex: 1 }}>Personal knowledge</p>
            <button onClick={onAddKnowledge} style={{ fontSize: 12.5, color: 'var(--indigo)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>+ Add</button>
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
                  <button onClick={() => onEditKnowledge(doc)} style={{ fontSize: 11, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px', fontFamily: 'inherit' }}>edit</button>
                  <button onClick={() => onDeleteKnowledge(doc.id)} style={{ fontSize: 13, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px', fontFamily: 'inherit', lineHeight: 1 }}>×</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Department section
// ---------------------------------------------------------------------------

function DepartmentSection({ dept, employeesInDept, brainList, deptList, sessionList, taskList, allKnowledge, allTools, assignedToolsMap, mutations, onAddEmployee }: {
  dept: Department | null
  employeesInDept: Employee[]
  brainList: Brain[]; deptList: Department[]
  sessionList: { agentId: string; status: string; id: string; createdAt: string; workTaskId?: string }[]
  taskList: { id: string; title: string }[]
  allKnowledge: KnowledgeDoc[]
  allTools: Tool[]
  assignedToolsMap: Map<string, Tool[]>
  mutations: {
    updateEmployee: (id: string, body: Parameters<typeof employees.update>[1]) => void
    deleteEmployee: (id: string) => void
    createKnowledge: (body: Parameters<typeof knowledge.create>[0]) => void
    updateKnowledge: (id: string, body: Parameters<typeof knowledge.update>[1]) => void
    deleteKnowledge: (id: string) => void
    assignTool: (toolId: string, agentId: string) => void
    unassignTool: (toolId: string, agentId: string) => void
    editDept: (dept: Department) => void
    deleteDept: (id: string) => void
  }
  onAddEmployee: (deptId?: string) => void
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
  function brainFor(emp: Employee) {
    return brainList.find(b => b.id === emp.connectionId)
  }
  function knowledgeFor(empId: string) {
    return allKnowledge.filter(d => d.scope === 'employee' && d.scopeId === empId)
  }

  const isUnassigned = dept === null

  return (
    <div className="section" style={{ marginTop: 36 }}>
      {/* Section header */}
      <div className="section-head" style={{ marginBottom: 4 }}>
        <h2 style={{ fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          {!isUnassigned && <span style={{ width: 8, height: 8, borderRadius: 2, background: dept.color, flexShrink: 0, display: 'inline-block' }} />}
          {isUnassigned ? 'Unassigned' : dept.name}
        </h2>
        <span className="count">{employeesInDept.length}</span>
        <div style={{ flex: 1 }} />
        {!isUnassigned && !confirmDelDept && (
          <>
            <button onClick={() => mutations.editDept(dept)} style={{ fontSize: 12, color: 'var(--faint)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', transition: 'color .12s' }} onMouseOver={e => (e.currentTarget.style.color = 'var(--muted)')} onMouseOut={e => (e.currentTarget.style.color = 'var(--faint)')}>edit</button>
            <button onClick={() => setConfirmDelDept(true)} style={{ fontSize: 12, color: 'var(--faint)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', transition: 'color .12s' }} onMouseOver={e => (e.currentTarget.style.color = 'var(--red)')} onMouseOut={e => (e.currentTarget.style.color = 'var(--faint)')}>delete</button>
          </>
        )}
        {confirmDelDept && (
          <>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>Delete {dept?.name}?</span>
            <button onClick={() => setConfirmDelDept(false)} style={{ fontSize: 12, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>cancel</button>
            <button onClick={() => { mutations.deleteDept(dept!.id); setConfirmDelDept(false) }} style={{ fontSize: 12, color: 'var(--red)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>delete</button>
          </>
        )}
      </div>

      {/* Employee rows */}
      <div className="rows">
        {employeesInDept.map(emp => (
          <EmployeeCard
            key={emp.id}
            employee={emp} brain={brainFor(emp)} deptList={deptList}
            activeSession={activeSessionFor(emp.id)} activeTaskTitle={activeTaskFor(emp.id)}
            knowledgeDocs={knowledgeFor(emp.id)}
            allTools={allTools}
            assignedTools={assignedToolsMap.get(emp.id) ?? []}
            onUpdate={body => mutations.updateEmployee(emp.id, body)}
            onDelete={() => mutations.deleteEmployee(emp.id)}
            onAddKnowledge={() => setKnowledgeDialog({ open: true, doc: undefined, employeeId: emp.id })}
            onEditKnowledge={doc => setKnowledgeDialog({ open: true, doc, employeeId: emp.id })}
            onDeleteKnowledge={id => mutations.deleteKnowledge(id)}
            onAssignTool={toolId => mutations.assignTool(toolId, emp.id)}
            onUnassignTool={toolId => mutations.unassignTool(toolId, emp.id)}
          />
        ))}
      </div>

      {/* Add agent */}
      <button onClick={() => onAddEmployee(dept?.id)}
        style={{ fontSize: 12.5, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', padding: '10px 0', transition: 'color .12s', display: 'block' }}
        onMouseOver={e => (e.currentTarget.style.color = 'var(--indigo)')}
        onMouseOut={e => (e.currentTarget.style.color = 'var(--muted)')}
      >+ Add agent{!isUnassigned && dept ? ` to ${dept.name}` : ''}</button>

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
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function EmployeesPage() {
  const qc = useQueryClient()

  const [addEmpDialog, setAddEmpDialog]   = useState<{ open: boolean; deptId?: string }>({ open: false })
  const [deptDialog,   setDeptDialog]     = useState<{ open: boolean; dept?: Department }>({ open: false })

  const { data: employeeList  = [] } = useQuery({ queryKey: ['employees'],   queryFn: () => employees.list() })
  const { data: brainList     = [] } = useQuery({ queryKey: ['brains'],      queryFn: () => brains.list() })
  const { data: deptList      = [] } = useQuery({ queryKey: ['departments'], queryFn: () => departments.list() })
  const { data: sessionList   = [] } = useQuery({ queryKey: ['sessions'],    queryFn: () => sessions.list(), refetchInterval: 5000 })
  const { data: taskList      = [] } = useQuery({ queryKey: ['tasks'],       queryFn: () => tasks.list(),    refetchInterval: 8000 })
  const { data: allKnowledge  = [] } = useQuery({ queryKey: ['knowledge'],   queryFn: () => knowledge.list() })
  const { data: allTools       = [] } = useQuery({ queryKey: ['tools'],        queryFn: () => tools.list() })
  const { data: toolAssignments = [] } = useQuery({ queryKey: ['agent-tools'], queryFn: () => tools.assignments() })

  const createEmployee = useMutation({
    mutationFn: (body: Parameters<typeof employees.create>[0]) => employees.create(body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['employees'] }); setAddEmpDialog({ open: false }) },
  })
  const updateEmployee = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Parameters<typeof employees.update>[1] }) => employees.update(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['employees'] }),
  })
  const deleteEmployee = useMutation({
    mutationFn: (id: string) => employees.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['employees'] }),
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
    updateEmployee: (id: string, body: Parameters<typeof employees.update>[1]) => updateEmployee.mutate({ id, body }),
    deleteEmployee: (id: string) => deleteEmployee.mutate(id),
    createKnowledge: (body: Parameters<typeof knowledge.create>[0]) => createKnowledge.mutate(body),
    updateKnowledge: (id: string, body: Parameters<typeof knowledge.update>[1]) => updateKnowledge.mutate({ id, body }),
    deleteKnowledge: (id: string) => deleteKnowledge.mutate(id),
    assignTool:   (toolId: string, agentId: string) => assignTool.mutate({ toolId, agentId }),
    unassignTool: (toolId: string, agentId: string) => unassignTool.mutate({ toolId, agentId }),
    editDept:   (dept: Department) => setDeptDialog({ open: true, dept }),
    deleteDept: (id: string) => deleteDept.mutate(id),
  }

  const busyCount = employeeList.filter(e => sessionList.some(s => s.agentId === e.id && s.status === 'running')).length

  // Group employees by department
  const empsByDept = new Map<string | null, Employee[]>()
  for (const emp of employeeList) {
    const key = emp.departmentId ?? null
    if (!empsByDept.has(key)) empsByDept.set(key, [])
    empsByDept.get(key)!.push(emp)
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg)' }}>
      <div className="page-content" style={{ paddingTop: 52, paddingBottom: 80 }}>

        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 8 }}>
          <div>
            <h1 className="h-page">Agents</h1>
            <p className="lede" style={{ marginTop: 12, fontSize: 15 }}>
              {employeeList.length} agent{employeeList.length !== 1 ? 's' : ''}
              {busyCount > 0 && <> · <span className="num">{busyCount} working</span></>}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0, marginTop: 8 }}>
            <button className="btn sm" onClick={() => setDeptDialog({ open: true })}>+ Department</button>
            <button className="btn sm primary" onClick={() => setAddEmpDialog({ open: true })}>+ Agent</button>
          </div>
        </div>

        {/* Departments with their employees */}
        {deptList.map(dept => (
          <DepartmentSection
            key={dept.id}
            dept={dept}
            employeesInDept={empsByDept.get(dept.id) ?? []}
            brainList={brainList} deptList={deptList}
            sessionList={sessionList as any} taskList={taskList as any}
            allKnowledge={allKnowledge}
            allTools={allTools} assignedToolsMap={assignedToolsMap}
            mutations={mutations}
            onAddEmployee={deptId => setAddEmpDialog({ open: true, deptId })}
          />
        ))}

        {/* Unassigned employees */}
        {(empsByDept.get(null)?.length ?? 0) > 0 && (
          <DepartmentSection
            dept={null}
            employeesInDept={empsByDept.get(null) ?? []}
            brainList={brainList} deptList={deptList}
            sessionList={sessionList as any} taskList={taskList as any}
            allKnowledge={allKnowledge}
            allTools={allTools} assignedToolsMap={assignedToolsMap}
            mutations={mutations}
            onAddEmployee={() => setAddEmpDialog({ open: true })}
          />
        )}

        {deptList.length === 0 && employeeList.length === 0 && brainList.length > 0 && (
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

      <AddEmployeeDialog
        open={addEmpDialog.open}
        brainList={brainList}
        deptList={deptList}
        defaultDeptId={addEmpDialog.deptId}
        onClose={() => setAddEmpDialog({ open: false })}
        onCreate={body => createEmployee.mutate(body)}
        loading={createEmployee.isPending}
        error={createEmployee.error?.message}
      />
    </div>
  )
}
