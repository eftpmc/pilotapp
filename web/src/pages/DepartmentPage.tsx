import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { departments, agents, tools, sessions } from '../api/client'
import { AgentAvatar } from '@/components/AgentAvatar'
import { Button } from '@/components/ui/button'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from '@/components/ui/item'
import { LiveTimer } from '@/components/LiveTimer'
import { DEPT_COLORS } from '@/lib/agent-constants'
import { cn } from '@/lib/utils'
import { ArrowLeft, Pencil } from 'lucide-react'

export default function DepartmentPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const { data: deptList    = [] } = useQuery({ queryKey: ['departments'],  queryFn: () => departments.list() })
  const { data: agentList   = [] } = useQuery({ queryKey: ['agents'],       queryFn: () => agents.list() })
  const { data: allTools    = [] } = useQuery({ queryKey: ['tools'],        queryFn: () => tools.list() })
  const { data: deptAssigns = [] } = useQuery({ queryKey: ['dept-tools'],   queryFn: () => tools.deptAssignments() })
  const { data: sessionList = [] } = useQuery({ queryKey: ['sessions'],     queryFn: () => sessions.list(), refetchInterval: 8000 })

  const dept    = deptList.find(d => d.id === id)
  const members = agentList.filter(a => a.departmentId === id)
  const lead    = members.find(a => a.role === 'lead')
  const workers = members.filter(a => a.role === 'worker')
  const deptToolIds = new Set(deptAssigns.filter(a => a.departmentId === id).map(a => a.toolId))

  const [editing, setEditing]   = useState(false)
  const [name,    setName]      = useState('')
  const [color,   setColor]     = useState('')
  const [seeded,  setSeeded]    = useState<string | null>(null)
  const [confirmDelete, setCD]  = useState(false)

  if (dept && seeded !== dept.id) {
    setName(dept.name); setColor(dept.color); setSeeded(dept.id)
  }

  const updateDept = useMutation({
    mutationFn: (body: { name?: string; color?: string }) => departments.update(id!, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['departments'] }); setEditing(false) },
  })
  const deleteDept = useMutation({
    mutationFn: () => departments.delete(id!),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['departments'] }); navigate('/agents') },
  })
  const assignTool = useMutation({
    mutationFn: (toolId: string) => tools.assignDept(toolId, id!),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dept-tools'] }),
  })
  const unassignTool = useMutation({
    mutationFn: (toolId: string) => tools.unassignDept(toolId, id!),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dept-tools'] }),
  })

  if (!dept) return null

  function activeSessionFor(agentId: string) {
    return sessionList.find(s => s.agentId === agentId && s.status === 'running') ?? null
  }

  const runningCount  = members.filter(m => activeSessionFor(m.id)).length
  const totalSessions = sessionList.filter(s => members.some(m => m.id === s.agentId)).length
  const totalCost     = sessionList
    .filter(s => members.some(m => m.id === s.agentId))
    .reduce((sum, s) => sum + (s.totalCostUsd ?? 0), 0)

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-[960px] mx-auto px-6 pt-10 pb-16">

        <Button variant="ghost" size="sm" onClick={() => navigate('/agents')} className="mb-8 -ml-2 text-muted-foreground">
          <ArrowLeft size={13} />
          Agents
        </Button>

        {/* Hero */}
        <div className="flex items-end gap-5 mb-10">
          <div className="shrink-0">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{
                background: `color-mix(in srgb, ${dept.color} 15%, transparent)`,
                border: `1.5px solid color-mix(in srgb, ${dept.color} 35%, transparent)`,
              }}
            >
              <div className="w-5 h-5 rounded-full" style={{ background: dept.color }} />
            </div>
          </div>
          <div className="min-w-0 flex-1 pb-1">
            <h1 className="text-2xl font-semibold tracking-tight leading-none mb-2">{dept.name}</h1>
            <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              <span>{members.length} agent{members.length !== 1 ? 's' : ''}</span>
              {runningCount > 0 && (
                <>
                  <span className="text-muted-foreground/30">·</span>
                  <span className="text-[var(--green)]">{runningCount} working</span>
                </>
              )}
              {totalSessions > 0 && (
                <>
                  <span className="text-muted-foreground/30">·</span>
                  <span>{totalSessions} sessions</span>
                </>
              )}
              {totalCost > 0 && (
                <>
                  <span className="text-muted-foreground/30">·</span>
                  <span className="font-mono">${totalCost.toFixed(2)}</span>
                </>
              )}
            </div>
          </div>
          <div className="shrink-0 pb-1">
            {!editing ? (
              <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
                <Pencil size={12} />
                Edit
              </Button>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                Done
              </Button>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-10">

          {/* Edit form */}
          {editing && (
            <section className="flex flex-col gap-4 px-4 py-4 bg-card/70 border border-border/60 rounded-xl">
              <Field>
                <FieldLabel>Name</FieldLabel>
                <Input value={name} onChange={e => setName(e.target.value)} />
              </Field>
              <Field>
                <FieldLabel>Color</FieldLabel>
                <div className="flex gap-2">
                  {DEPT_COLORS.map(c => (
                    <button
                      key={c} type="button" onClick={() => setColor(c)}
                      className={cn('w-6 h-6 rounded-full cursor-pointer border-2 transition-all',
                        color === c ? 'border-foreground scale-110' : 'border-transparent hover:scale-110')}
                      style={{ background: c }}
                    />
                  ))}
                </div>
              </Field>
              {updateDept.isError && <p className="text-xs text-destructive">{updateDept.error.message}</p>}
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
                <Button size="sm" disabled={updateDept.isPending || !name.trim()}
                  onClick={() => updateDept.mutate({ name: name.trim(), color })}>Save</Button>
              </div>
            </section>
          )}

          {/* Lead */}
          <section>
            <p className="text-xs font-medium text-muted-foreground/50 mb-4">Lead</p>
            {lead ? (
              <Item asChild variant="outline" className="w-full bg-card/70 transition-colors hover:bg-card">
                <button onClick={() => navigate(`/agents/${lead.id}`)}>
                  <ItemMedia><AgentAvatar agent={lead} size={40} running={!!activeSessionFor(lead.id)} /></ItemMedia>
                  <ItemContent className="items-start">
                    <ItemTitle>
                      {lead.name}
                    <span
                      className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                      style={{ color: 'var(--ember)', background: 'var(--ember-wash)' }}
                    >Lead</span>
                    </ItemTitle>
                    <ItemDescription className="w-full text-left text-xs">
                      {lead.personality?.split('\n')[0]?.slice(0, 90) ?? lead.provider}
                    </ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    {activeSessionFor(lead.id)
                      ? <LiveTimer createdAt={activeSessionFor(lead.id)!.createdAt} />
                      : <span className="text-xs text-muted-foreground/40 shrink-0">Idle</span>
                    }
                  </ItemActions>
                </button>
              </Item>
            ) : (
              <Empty className="border border-dashed border-border/70 bg-card/30 py-10">
                <EmptyHeader>
                  <EmptyTitle>No lead yet</EmptyTitle>
                  <EmptyDescription>Hire a Lead agent to coordinate this team.</EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <Button size="sm" onClick={() => navigate('/agents/hire')}>Hire lead</Button>
                </EmptyContent>
              </Empty>
            )}
          </section>

          {/* Workers */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs font-medium text-muted-foreground/50">
                Workers{workers.length > 0 ? ` · ${workers.length}` : ''}
              </p>
              {workers.length > 0 && (
                <Button size="sm" variant="ghost" onClick={() => navigate('/agents/hire')}>+ Add</Button>
              )}
            </div>
            {workers.length > 0 ? (
              <ItemGroup className="gap-2">
                {workers.map(w => {
                  const active = activeSessionFor(w.id)
                  const agentSessions = sessionList.filter(s => s.agentId === w.id)
                  const agentCost = agentSessions.reduce((sum, s) => sum + (s.totalCostUsd ?? 0), 0)
                  return (
                    <Item
                      key={w.id}
                      asChild
                      variant="outline"
                      className="w-full bg-card/60 transition-colors hover:bg-card"
                    >
                      <button onClick={() => navigate(`/agents/${w.id}`)}>
                        <ItemMedia><AgentAvatar agent={w} size={36} running={!!active} /></ItemMedia>
                        <ItemContent className="items-start">
                          <ItemTitle>{w.name}</ItemTitle>
                          {agentSessions.length > 0 && (
                            <ItemDescription className="w-full text-left text-xs">
                              {agentSessions.length} session{agentSessions.length !== 1 ? 's' : ''}
                              {agentCost > 0 && ` · $${agentCost.toFixed(2)}`}
                            </ItemDescription>
                          )}
                        </ItemContent>
                        <ItemActions>
                          {active
                            ? <LiveTimer createdAt={active.createdAt} />
                            : <span className="text-xs text-muted-foreground/40 shrink-0">Idle</span>
                          }
                        </ItemActions>
                      </button>
                    </Item>
                  )
                })}
              </ItemGroup>
            ) : (
              <Empty className="border border-dashed border-border/70 bg-card/30 py-10">
                <EmptyHeader>
                  <EmptyTitle>No workers yet</EmptyTitle>
                  <EmptyDescription>Add agents to this team.</EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <Button size="sm" onClick={() => navigate('/agents/hire')}>Add worker</Button>
                </EmptyContent>
              </Empty>
            )}
          </section>

          {/* Team tools */}
          {allTools.length > 0 && (
            <section>
              <p className="text-xs font-medium text-muted-foreground/50 mb-1">Team tools</p>
              <p className="text-xs text-muted-foreground mb-4">Available to every agent in this team.</p>
              <ItemGroup className="gap-2">
                {allTools.map(tool => {
                  const assigned = deptToolIds.has(tool.id)
                  return (
                    <Item
                      key={tool.id}
                      asChild
                      variant="outline"
                      className="w-full bg-card/60 transition-colors hover:bg-card"
                    >
                      <button
                        type="button"
                        onClick={() => assigned ? unassignTool.mutate(tool.id) : assignTool.mutate(tool.id)}
                      >
                        <ItemMedia><span className={cn(
                          'w-4 h-4 rounded border flex items-center justify-center shrink-0 text-[10px] font-bold transition-colors',
                          assigned ? 'bg-primary border-primary text-primary-foreground' : 'border-border text-transparent'
                        )}>✓</span></ItemMedia>
                        <ItemContent className="items-start">
                          <ItemTitle>{tool.name}</ItemTitle>
                          {tool.description && <ItemDescription className="w-full text-left text-xs">{tool.description}</ItemDescription>}
                        </ItemContent>
                      </button>
                    </Item>
                  )
                })}
              </ItemGroup>
            </section>
          )}

          {/* Danger zone */}
          <section className="pt-2 border-t border-border/40">
            {!confirmDelete ? (
              <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-destructive" onClick={() => setCD(true)}>
                Delete {dept.name}
              </Button>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm text-foreground">Delete {dept.name}? Agents will be unassigned.</span>
                <Button size="sm" variant="ghost" onClick={() => setCD(false)}>Cancel</Button>
                <Button size="sm" variant="destructive" onClick={() => deleteDept.mutate()}>Delete</Button>
              </div>
            )}
          </section>

        </div>
      </div>
    </div>
  )
}
