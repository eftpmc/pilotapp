import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { agents, departments, sessions, tasks } from '../api/client'
import type { Agent, Department } from '../api/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AgentAvatar } from '@/components/AgentAvatar'
import { LiveTimer } from '@/components/LiveTimer'
import { PERSONALITY_PRESETS, DEPT_COLORS } from '@/lib/agent-constants'
import { cn } from '@/lib/utils'

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
        <DialogHeader><DialogTitle>{dept ? 'Edit Team' : 'New Team'}</DialogTitle></DialogHeader>
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
// Agent card
// ---------------------------------------------------------------------------

function AgentCard({ employee, activeSession, activeTaskTitle, onDelete }: {
  employee: Agent
  activeSession?: { id: string; createdAt: string } | null
  activeTaskTitle?: string
  onDelete: () => void
}) {
  const navigate = useNavigate()
  const [confirmDelete, setConfDel] = useState(false)
  const isActive = !!activeSession
  const isLead = employee.role === 'lead'

  const chunks = (employee.personality ?? '').split('\n\n').map(c => c.trim()).filter(Boolean)
  const presetLabels = chunks
    .map(c => PERSONALITY_PRESETS.find(p => p.prompt === c)?.label)
    .filter(Boolean) as string[]
  const personalityLabel = presetLabels.length > 0
    ? presetLabels.length === 1 ? presetLabels[0] : `${presetLabels[0]} +${presetLabels.length - 1}`
    : (employee.personality ? employee.personality.split('\n')[0].slice(0, 40) : '')

  return (
    <article className={cn('agent-card', confirmDelete && 'is-open')}>
      <button className="agent-card-row" onClick={() => navigate(`/agents/${employee.id}`)}>
        <AgentAvatar agent={employee} size={44} running={isActive} />
        <div className="min-w-0 flex-1">
          <div className="agent-title-line">
            <span className="agent-name">{employee.name}</span>
            <div className={cn('agent-status-dot', isActive ? 'working' : 'idle')} />
          </div>
          <p className="agent-summary-line">
            {isLead && <span className="chip" style={{ color: 'var(--ember)', background: 'var(--ember-wash)', border: 'none' }}>Lead</span>}
            {personalityLabel && <span>{personalityLabel}</span>}
            {isActive && activeTaskTitle && (
              <><span className="sep">·</span><span className="text-[var(--green)]">{activeTaskTitle}</span></>
            )}
          </p>
        </div>
        {isActive
          ? <LiveTimer createdAt={activeSession!.createdAt} />
          : <span className="text-xs text-muted-foreground/40">Idle</span>
        }
        <svg className="w-3 h-3 text-muted-foreground/30 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
      </button>

      {confirmDelete && (
        <div className="agent-confirm-panel">
          <span>Delete {employee.name}?</span>
          <button onClick={() => setConfDel(false)}>Cancel</button>
          <button onClick={() => { onDelete(); setConfDel(false) }} className="danger">Delete</button>
        </div>
      )}
    </article>
  )
}

// ---------------------------------------------------------------------------
// Department section
// ---------------------------------------------------------------------------

function DepartmentSection({ dept, agentsInDept, sessionList, taskList, mutations, onAddAgent }: {
  dept: Department | null
  agentsInDept: Agent[]
  sessionList: { agentId: string; status: string; id: string; createdAt: string; workTaskId?: string }[]
  taskList: { id: string; title: string }[]
  mutations: {
    deleteAgent: (id: string) => void
    editDept: (dept: Department) => void
    deleteDept: (id: string) => void
  }
  onAddAgent: (deptId?: string) => void
}) {
  const [confirmDelDept, setConfirmDelDept] = useState(false)

  function activeSessionFor(empId: string) {
    return sessionList.find(s => s.agentId === empId && s.status === 'running') ?? null
  }
  function activeTaskFor(empId: string) {
    const s = activeSessionFor(empId)
    return s?.workTaskId ? taskList.find(t => t.id === s.workTaskId)?.title : undefined
  }

  const isUnassigned = dept === null
  const runningCount = agentsInDept.filter(emp => activeSessionFor(emp.id)).length

  return (
    <section className="agent-department-section">
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
              <button onClick={() => setConfirmDelDept(true)} className="agent-department-action danger">Delete team</button>
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

      <div className="agent-department-list">
        {agentsInDept.length === 0 ? (
          <button onClick={() => onAddAgent(dept?.id)} className="agent-empty-department">
            Add the first agent{!isUnassigned && dept ? ` to ${dept.name}` : ''}
          </button>
        ) : (
          agentsInDept.map(emp => (
            <AgentCard
              key={emp.id}
              employee={emp}
              activeSession={activeSessionFor(emp.id)}
              activeTaskTitle={activeTaskFor(emp.id)}
              onDelete={() => mutations.deleteAgent(emp.id)}
            />
          ))
        )}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AgentsPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [deptDialog, setDeptDialog] = useState<{ open: boolean; dept?: Department }>({ open: false })

  const { data: employeeList = [] } = useQuery({ queryKey: ['agents'],      queryFn: () => agents.list() })
  const { data: deptList     = [] } = useQuery({ queryKey: ['departments'], queryFn: () => departments.list() })
  const { data: sessionList  = [] } = useQuery({ queryKey: ['sessions'],    queryFn: () => sessions.list(), refetchInterval: 5000 })
  const { data: taskList     = [] } = useQuery({ queryKey: ['tasks'],       queryFn: () => tasks.list(),    refetchInterval: 8000 })

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

  const mutations = {
    deleteAgent: (id: string) => deleteAgent.mutate(id),
    editDept:    (dept: Department) => setDeptDialog({ open: true, dept }),
    deleteDept:  (id: string) => deleteDept.mutate(id),
  }

  const busyCount = employeeList.filter(e => sessionList.some(s => s.agentId === e.id && s.status === 'running')).length

  const empsByDept = new Map<string | null, Agent[]>()
  for (const emp of employeeList) {
    const key = emp.departmentId ?? null
    if (!empsByDept.has(key)) empsByDept.set(key, [])
    empsByDept.get(key)!.push(emp)
  }

  function goNewAgent(deptId?: string) {
    navigate(deptId ? `/agents/hire?dept=${deptId}` : '/agents/hire')
  }

  return (
    <div className="flex-1 overflow-y-auto bg-background">
      <div className="max-w-[960px] px-6 pt-10 pb-8">

        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Agents</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {employeeList.length} agent{employeeList.length !== 1 ? 's' : ''}
              {busyCount > 0 && <> · <span className="text-foreground font-semibold">{busyCount} working</span></>}
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button size="sm" variant="outline" onClick={() => setDeptDialog({ open: true })}>+ Team</Button>
            <Button size="sm" onClick={() => goNewAgent()}>Hire agent</Button>
          </div>
        </div>

        {deptList.map(dept => (
          <DepartmentSection
            key={dept.id}
            dept={dept}
            agentsInDept={empsByDept.get(dept.id) ?? []}
            sessionList={sessionList as any} taskList={taskList as any}
            mutations={mutations}
            onAddAgent={goNewAgent}
          />
        ))}

        {(empsByDept.get(null)?.length ?? 0) > 0 && (
          <DepartmentSection
            dept={null}
            agentsInDept={empsByDept.get(null) ?? []}
            sessionList={sessionList as any} taskList={taskList as any}
            mutations={mutations}
            onAddAgent={goNewAgent}
          />
        )}

        {deptList.length === 0 && employeeList.length === 0 && (
          <p className="empty-line">No agents yet. <button className="text-primary hover:underline" onClick={() => navigate('/agents/hire')}>Hire your first agent.</button></p>
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
    </div>
  )
}
