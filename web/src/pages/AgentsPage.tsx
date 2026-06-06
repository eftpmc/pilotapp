import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { agents, departments, sessions, tasks } from '../api/client'
import type { Agent, Department, Session } from '../api/client'
import { Button } from '@/components/ui/button'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from '@/components/ui/item'
import { Spinner } from '@/components/ui/spinner'
import { AgentAvatar } from '@/components/AgentAvatar'
import { LiveTimer } from '@/components/LiveTimer'
import { PERSONALITY_PRESETS, DEPT_COLORS } from '@/lib/agent-constants'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Department dialog
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
          <Field>
            <FieldLabel>Name</FieldLabel>
            <Input autoFocus value={name} onChange={e => setName(e.target.value)}
              placeholder="Engineering" onKeyDown={e => { if (e.key === 'Enter' && name.trim()) onSave({ name: name.trim(), color }) }} />
          </Field>
          <Field>
            <FieldLabel>Color</FieldLabel>
            <div className="flex gap-2">
              {DEPT_COLORS.map(c => (
                <button key={c} type="button" onClick={() => setColor(c)} className={cn(
                  'w-6 h-6 rounded-full cursor-pointer border-2 transition-all',
                  color === c ? 'border-foreground scale-110' : 'border-transparent hover:scale-110'
                )} style={{ background: c }} />
              ))}
            </div>
          </Field>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button className="flex-1" disabled={!name.trim() || loading}
              onClick={() => onSave({ name: name.trim(), color })}>
              {loading ? <Spinner /> : dept ? 'Save' : 'Create'}
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

function AgentCard({ employee, activeSession, activeTaskTitle, sessionCount, totalCost, onDelete }: {
  employee: Agent
  activeSession?: { id: string; createdAt: string } | null
  activeTaskTitle?: string
  sessionCount?: number
  totalCost?: number
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

  return (
    <article>
      <Item asChild variant="outline" className="w-full bg-card/70 transition-all hover:-translate-y-0.5 hover:bg-card">
        <button onClick={() => !confirmDelete && navigate(`/agents/${employee.id}`)}>
          <ItemMedia>
            <AgentAvatar agent={employee} size={42} running={isActive} />
          </ItemMedia>
          <ItemContent className="min-w-0">
            <ItemTitle className="max-w-full truncate">
              {employee.name}
            {isLead && <Badge variant="default" className="text-[10px] px-1.5 py-0">Lead</Badge>}
            </ItemTitle>
            <ItemDescription className="flex w-full items-center gap-1.5 flex-wrap text-left">
            {presetLabels.slice(0, 2).map(label => (
              <Badge key={label} variant="secondary" className="text-[10px] px-1.5 py-0 font-normal">{label}</Badge>
            ))}
            {presetLabels.length > 2 && (
              <span className="text-[11px] text-muted-foreground">+{presetLabels.length - 2}</span>
            )}
            {isActive && activeTaskTitle && (
              <span className="text-[11px] text-[var(--green)] truncate">{activeTaskTitle}</span>
            )}
            {!isActive && (sessionCount ?? 0) > 0 && (
              <span className="text-[11px] text-muted-foreground/60">
                {sessionCount} session{sessionCount !== 1 ? 's' : ''}
                {(totalCost ?? 0) > 0 && ` · $${totalCost!.toFixed(2)}`}
              </span>
            )}
            </ItemDescription>
          </ItemContent>
          <ItemActions>
            {isActive
              ? <LiveTimer createdAt={activeSession!.createdAt} />
              : <span className="flex items-center gap-1.5 text-xs text-muted-foreground/40"><span className="dot idle" />Idle</span>
            }
          </ItemActions>
        </button>
      </Item>

      {confirmDelete && (
        <div className="flex items-center gap-3 px-4 py-2.5 mt-1 bg-card rounded-xl">
          <span className="text-sm text-foreground flex-1">Delete {employee.name}?</span>
          <Button size="sm" variant="ghost" onClick={() => setConfDel(false)}>Cancel</Button>
          <Button size="sm" variant="destructive" onClick={() => { onDelete(); setConfDel(false) }}>Delete</Button>
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
  sessionList: Session[]
  taskList: { id: string; title: string }[]
  mutations: { deleteAgent: (id: string) => void }
  onAddAgent: (deptId?: string) => void
}) {
  const navigate = useNavigate()

  function activeSessionFor(empId: string) {
    return sessionList.find(s => s.agentId === empId && s.status === 'running') ?? null
  }
  function activeTaskFor(empId: string) {
    const s = activeSessionFor(empId)
    return s?.workTaskId ? taskList.find(t => t.id === s.workTaskId)?.title : undefined
  }
  function agentStats(empId: string) {
    const empSessions = sessionList.filter(s => s.agentId === empId)
    return { count: empSessions.length, cost: empSessions.reduce((sum, s) => sum + (s.totalCostUsd ?? 0), 0) }
  }

  const isUnassigned = dept === null
  const runningCount = agentsInDept.filter(emp => activeSessionFor(emp.id)).length
  const lead    = !isUnassigned ? agentsInDept.find(a => a.role === 'lead')   : undefined
  const workers = !isUnassigned ? agentsInDept.filter(a => a.role !== 'lead') : agentsInDept

  return (
    <section className="mb-8">
      {/* Section header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {!isUnassigned && (
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: dept.color }} />
          )}
          <div>
            {!isUnassigned ? (
              <button
                className="text-sm font-semibold text-foreground hover:text-primary transition-colors"
                onClick={() => navigate(`/departments/${dept.id}`)}
              >
                {dept.name}
              </button>
            ) : (
              <span className="text-sm font-semibold text-foreground">Unassigned</span>
            )}
          </div>
          <span className="text-xs text-muted-foreground/50">
            {agentsInDept.length} agent{agentsInDept.length !== 1 ? 's' : ''}
            {runningCount > 0 && <> · <span className="text-[var(--green)]">{runningCount} working</span></>}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {!isUnassigned && (
            <Button size="sm" variant="ghost" className="text-muted-foreground h-7 px-2 text-xs"
              onClick={() => navigate(`/departments/${dept.id}`)}>
              Manage
            </Button>
          )}
          {isUnassigned && (
            <Button size="sm" variant="ghost" className="text-muted-foreground h-7 px-2 text-xs"
              onClick={() => onAddAgent(undefined)}>+ Agent</Button>
          )}
        </div>
      </div>

      {/* Agent list */}
      {agentsInDept.length === 0 ? (
        <button
          onClick={() => onAddAgent(dept?.id)}
          className="w-full px-4 py-6 rounded-2xl border border-dashed border-border/50 text-sm text-muted-foreground/50 hover:text-muted-foreground hover:border-border transition-colors text-center"
        >
          Add the first agent{!isUnassigned && dept ? ` to ${dept.name}` : ''}
        </button>
      ) : (
        <ItemGroup className="gap-3">
          {lead && (
            <AgentCard
              employee={lead}
              activeSession={activeSessionFor(lead.id)}
              activeTaskTitle={activeTaskFor(lead.id)}
              sessionCount={agentStats(lead.id).count}
              totalCost={agentStats(lead.id).cost}
              onDelete={() => mutations.deleteAgent(lead.id)}
            />
          )}
          {workers.map(emp => (
            <AgentCard
              key={emp.id}
              employee={emp}
              activeSession={activeSessionFor(emp.id)}
              activeTaskTitle={activeTaskFor(emp.id)}
              sessionCount={agentStats(emp.id).count}
              totalCost={agentStats(emp.id).cost}
              onDelete={() => mutations.deleteAgent(emp.id)}
            />
          ))}
        </ItemGroup>
      )}
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
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-[960px] px-6 pt-12 pb-10">

        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Agents</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {employeeList.length} agent{employeeList.length !== 1 ? 's' : ''}
              {busyCount > 0 && <> · <span className="text-foreground font-semibold">{busyCount} working</span></>}
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => setDeptDialog({ open: true })}>+ Team</Button>
            <Button size="sm" onClick={() => goNewAgent()}>Hire agent</Button>
          </div>
        </div>

        {deptList.length > 0 && (
          <>
            {deptList.map((dept, i) => (
              <div key={dept.id}>
                <DepartmentSection
                  dept={dept}
                  agentsInDept={empsByDept.get(dept.id) ?? []}
                  sessionList={sessionList as any} taskList={taskList as any}
                  mutations={{ deleteAgent: (id) => deleteAgent.mutate(id) }}
                  onAddAgent={goNewAgent}
                />
                {i < deptList.length - 1 && <Separator className="mb-8" />}
              </div>
            ))}
            {(empsByDept.get(null)?.length ?? 0) > 0 && (
              <>
                <Separator className="mb-8" />
                <DepartmentSection
                  dept={null}
                  agentsInDept={empsByDept.get(null) ?? []}
                  sessionList={sessionList as any} taskList={taskList as any}
                  mutations={{ deleteAgent: (id) => deleteAgent.mutate(id) }}
                  onAddAgent={goNewAgent}
                />
              </>
            )}
          </>
        )}

        {deptList.length === 0 && (empsByDept.get(null)?.length ?? 0) > 0 && (
          <DepartmentSection
            dept={null}
            agentsInDept={empsByDept.get(null) ?? []}
            sessionList={sessionList as any} taskList={taskList as any}
            mutations={{ deleteAgent: (id) => deleteAgent.mutate(id) }}
            onAddAgent={goNewAgent}
          />
        )}

        {deptList.length === 0 && employeeList.length === 0 && (
          <Empty className="border border-dashed border-border/70 bg-card/30">
            <EmptyHeader>
              <EmptyTitle>No agents yet</EmptyTitle>
              <EmptyDescription>Hire an agent, give them a personality, and start assigning work.</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button onClick={() => navigate('/agents/hire')}>Hire your first agent</Button>
            </EmptyContent>
          </Empty>
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
