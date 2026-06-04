import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { agents, connections, departments, sessions, tasks, projects, knowledge, tools } from '../api/client'
import type { AgentRole, KnowledgeDoc } from '../api/client'
import { AgentAvatar } from '@/components/AgentAvatar'
import { ProviderBadge } from '@/components/ProviderBadge'
import { LiveTimer } from '@/components/LiveTimer'
import { KnowledgeDocDialog } from '@/components/KnowledgeDocDialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PersonalityPicker } from '@/components/PersonalityPicker'
import { PERSONALITY_PRESETS } from '@/lib/agent-constants'
import { timeAgo } from '@/lib/time'
import { cn } from '@/lib/utils'
import { ArrowLeft, Pencil, Trash2 } from 'lucide-react'

export default function AgentPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const { data: agentList    = [] } = useQuery({ queryKey: ['agents'],                queryFn: () => agents.list() })
  const { data: connList     = [] } = useQuery({ queryKey: ['connections'],           queryFn: () => connections.list() })
  const { data: deptList     = [] } = useQuery({ queryKey: ['departments'],           queryFn: () => departments.list() })
  const { data: allTools     = [] } = useQuery({ queryKey: ['tools'],                 queryFn: () => tools.list() })
  const { data: toolAssigns  = [] } = useQuery({ queryKey: ['agent-tools'],           queryFn: () => tools.assignments() })
  const { data: deptAssigns  = [] } = useQuery({ queryKey: ['dept-tools'],            queryFn: () => tools.deptAssignments() })
  const { data: allKnowledge = [] } = useQuery({ queryKey: ['knowledge'],             queryFn: () => knowledge.list() })
  const { data: sessionList  = [] } = useQuery({ queryKey: ['sessions', 'agent', id], queryFn: () => sessions.list({ agentId: id }), refetchInterval: 8000 })
  const { data: taskList     = [] } = useQuery({ queryKey: ['tasks'],                 queryFn: () => tasks.list() })
  const { data: projectList  = [] } = useQuery({ queryKey: ['projects'],              queryFn: () => projects.list() })

  const agent      = agentList.find(a => a.id === id)
  const connection = connList.find(c => c.id === agent?.connectionId)
  const dept       = deptList.find(d => d.id === agent?.departmentId)
  const agentDocs  = allKnowledge.filter(d => d.scope === 'agent' && d.scopeId === id)
  const assignedToolIds  = new Set(toolAssigns.filter(a => a.agentId === id).map(a => a.toolId))
  const deptToolIds      = new Set(deptAssigns.filter(a => a.departmentId === agent?.departmentId).map(a => a.toolId))
  const activeSession   = sessionList.find(s => s.status === 'running') ?? null

  // Edit mode toggle
  const [editing, setEditing] = useState(false)

  const [name,   setName]   = useState('')
  const [deptId, setDeptId] = useState('')
  const [connectionId, setConnectionId] = useState('')
  const [role,   setRole]   = useState<AgentRole>('worker')
  const [identityDirty, setIdentityDirty] = useState(false)

  const [personality, setPersonality] = useState('')
  const [personalityDirty, setPersonalityDirty] = useState(false)

  const [seeded, setSeeded] = useState<string | null>(null)
  if (agent && seeded !== agent.id) {
    setName(agent.name)
    setDeptId(agent.departmentId ?? '')
    setConnectionId(agent.connectionId ?? '')
    setRole(agent.role ?? 'worker')
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
      knowledge.create({ ...body, scope: 'agent', scopeId: id! }),
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

  const totalCost = sessionList.reduce((sum, s) => sum + (s.totalCostUsd ?? 0), 0)

  const recentSessions = [...sessionList]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 10)

  function taskTitle(wid?: string) { return wid ? taskList.find(t => t.id === wid)?.title : undefined }
  function projectName(pid: string) { return projectList.find(p => p.id === pid)?.name ?? '—' }

  // Compute personality display info
  const chunks = (agent.personality ?? '').split('\n\n').map(c => c.trim()).filter(Boolean)
  const activePresets = chunks
    .map(c => PERSONALITY_PRESETS.find(p => p.prompt === c))
    .filter(Boolean) as typeof PERSONALITY_PRESETS
  const isCustomPersonality = agent.personality && activePresets.length === 0

  function cancelEdit() {
    setName(agent.name)
    setDeptId(agent.departmentId ?? '')
    setConnectionId(agent.connectionId ?? '')
    setRole(agent.role ?? 'worker')
    setPersonality(agent.personality ?? '')
    setIdentityDirty(false)
    setPersonalityDirty(false)
    setEditing(false)
  }

  return (
    <div className="flex-1 overflow-y-auto bg-background">
      <div className="max-w-[960px] px-6 pt-10 pb-16">

        {/* Back */}
        <Button variant="ghost" size="sm" onClick={() => navigate('/agents')} className="mb-8 -ml-2 text-muted-foreground">
          <ArrowLeft size={13} />
          Agents
        </Button>

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
              {agent.role === 'lead' && (
                <>
                  <span className="text-muted-foreground/30 text-xs">·</span>
                  <span className="text-xs font-medium" style={{ color: 'var(--ember)' }}>Lead</span>
                </>
              )}
              {totalCost > 0 && (
                <>
                  <span className="text-muted-foreground/30 text-xs">·</span>
                  <span className="text-xs text-muted-foreground font-mono">${totalCost.toFixed(2)} total</span>
                </>
              )}
            </div>
          </div>
          <div className="shrink-0 pb-1 flex items-center gap-3">
            {activeSession
              ? <LiveTimer createdAt={activeSession.createdAt} />
              : <span className="text-xs text-muted-foreground">Idle</span>
            }
            {!editing ? (
              <Button variant="ghost" size="sm" onClick={() => setEditing(true)} className="text-muted-foreground">
                <Pencil size={12} />
                Edit
              </Button>
            ) : (
              <Button variant="ghost" size="sm" onClick={cancelEdit} className="text-muted-foreground">
                Done
              </Button>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-10">

          {/* ── Identity ── */}
          {editing && <section>
            <div className="flex flex-col gap-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label>Name</Label>
                    <Input value={name} onChange={e => { setName(e.target.value); setIdentityDirty(true) }} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label>Connection</Label>
                    <Select value={connectionId || agent.connectionId || ''} onValueChange={v => { setConnectionId(v); setIdentityDirty(true) }}>
                      <SelectTrigger><SelectValue placeholder="Select connection" /></SelectTrigger>
                      <SelectContent>
                        {connList.map(c => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}{c.model ? ` · ${c.model}` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
                <label className="flex items-center gap-3 px-4 py-3 bg-card rounded-xl border border-border/50 w-full transition-colors hover:bg-muted/30 cursor-pointer">
                  <Checkbox
                    checked={role === 'lead'}
                    onCheckedChange={v => { setRole(v ? 'lead' : 'worker'); setIdentityDirty(true) }}
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">Lead agent</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Orchestrates the team — breaks down briefs, creates subtasks, and coordinates workers. Cannot write or edit code.</p>
                  </div>
                </label>
                {identityDirty && (
                  <div className="flex gap-2 justify-end">
                    <Button size="sm" variant="outline" onClick={() => {
                      setName(agent.name); setDeptId(agent.departmentId ?? ''); setConnectionId(agent.connectionId ?? ''); setRole(agent.role ?? 'worker'); setIdentityDirty(false)
                    }}>Cancel</Button>
                    <Button size="sm" disabled={updateAgent.isPending || !connectionId} onClick={() => {
                      updateAgent.mutate({ name: name.trim(), connectionId, role, departmentId: deptId || null })
                      setIdentityDirty(false)
                    }}>Save</Button>
                  </div>
                )}
                {updateAgent.isError && (
                  <p className="text-xs text-destructive">{updateAgent.error.message}</p>
                )}
            </div>
          </section>}

          {/* ── Personality ── */}
          <section>
            <p className="text-xs font-medium text-muted-foreground/50 mb-4">Personality</p>
            {!editing ? (
              <div className="flex flex-col gap-3">
                {activePresets.length > 0 ? (
                  <>
                    <div className="flex flex-wrap gap-1.5">
                      {activePresets.map(p => (
                        <span key={p.label} className="na-roster-tag" style={{ fontSize: 11 }}>{p.label}</span>
                      ))}
                    </div>
                    <div className="flex flex-col gap-1.5 px-3 py-2.5 rounded-lg bg-muted/30 border border-border/40">
                      {activePresets.map(p => (
                        <p key={p.label} className="text-xs text-muted-foreground leading-relaxed">
                          <span className="font-medium text-foreground">{p.label}. </span>
                          {p.prompt}
                        </p>
                      ))}
                    </div>
                  </>
                ) : isCustomPersonality ? (
                  <p className="text-xs text-muted-foreground whitespace-pre-wrap">{agent.personality}</p>
                ) : (
                  <p className="text-xs text-muted-foreground/50">No personality set.</p>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <PersonalityPicker
                  value={personality}
                  onChange={v => { setPersonality(v); setPersonalityDirty(true) }}
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
            )}
          </section>

          {/* ── Tools ── */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs font-medium text-muted-foreground/50">Tools</p>
              {dept && deptToolIds.size > 0 && (
                <span className="text-xs text-muted-foreground/50">{deptToolIds.size} from {dept.name}</span>
              )}
            </div>
            {allTools.length === 0 ? (
              <p className="text-xs text-muted-foreground">No tools configured. <a href="/tools" className="text-primary hover:underline">Add in Tools.</a></p>
            ) : !editing ? (
              (() => {
                const assigned = allTools.filter(t => deptToolIds.has(t.id) || assignedToolIds.has(t.id))
                return assigned.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No tools assigned.</p>
                ) : (
                  <div className="flex flex-col divide-y divide-border/40">
                    {assigned.map(tool => {
                      const fromDept = deptToolIds.has(tool.id)
                      return (
                        <div key={tool.id} className="flex items-center gap-3 py-2.5">
                          <div className="min-w-0 flex-1">
                            <span className="text-sm font-medium text-foreground">{tool.name}</span>
                            {tool.description && <span className="text-xs text-muted-foreground ml-2">{tool.description}</span>}
                          </div>
                          {fromDept && (
                            <span className="text-[10px] text-muted-foreground/50 shrink-0 flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: dept?.color }} />
                              {dept?.name}
                            </span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )
              })()
            ) : (
              <div className="flex flex-col divide-y divide-border/40">
                {allTools.map(tool => {
                  const fromDept = deptToolIds.has(tool.id)
                  const assigned = fromDept || assignedToolIds.has(tool.id)
                  return fromDept ? (
                    <div key={tool.id} className="flex items-center gap-3 py-2.5 px-2 -mx-2">
                      <span className="w-4 h-4 rounded border border-primary/40 bg-primary/10 flex items-center justify-center shrink-0 text-[10px] font-bold text-primary">✓</span>
                      <div className="min-w-0 flex-1">
                        <span className="text-sm font-medium text-foreground">{tool.name}</span>
                        {tool.description && <span className="text-xs text-muted-foreground ml-2">{tool.description}</span>}
                      </div>
                      <span className="text-[10px] text-muted-foreground/50 shrink-0 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: dept?.color }} />
                        {dept?.name}
                      </span>
                    </div>
                  ) : (
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
              <p className="text-xs font-medium text-muted-foreground/50">Knowledge</p>
              <Button variant="ghost" size="sm" onClick={() => setKnDialog({ open: true, doc: undefined })}>+ Add</Button>
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
                    <Button variant="ghost" size="sm" onClick={() => setKnDialog({ open: true, doc })} className="text-muted-foreground h-7 px-2">edit</Button>
                    <Button variant="ghost" size="icon" onClick={() => deleteKnowledge.mutate(doc.id)} className="text-muted-foreground hover:text-destructive h-7 w-7">×</Button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* ── Sessions ── */}
          {recentSessions.length > 0 && (
            <section>
              <p className="text-xs font-medium text-muted-foreground/50 mb-4">Recent sessions</p>
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
                        isRunning ? 'bg-[var(--green-dot)] animate-pulse'
                          : isError ? 'bg-destructive'
                          : s.status === 'merged' ? 'bg-primary'
                          : 'bg-muted-foreground/40'
                      )} />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium text-foreground truncate block">{title ?? s.id.slice(0, 8)}</span>
                        <span className="text-xs text-muted-foreground">{proj}</span>
                      </div>
                      <span className="text-xs text-muted-foreground/50 shrink-0 tabular-nums">{timeAgo(s.createdAt)}</span>
                      <span className={cn(
                        'text-xs font-medium shrink-0 capitalize',
                        isRunning ? 'text-[var(--green)]' : isError ? 'text-destructive' : 'text-muted-foreground'
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
              <Button variant="ghost" size="sm" onClick={() => setConfirmDel(true)} className="text-muted-foreground hover:text-destructive -ml-2">
                <Trash2 size={12} />
                Delete {agent.name}
              </Button>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm text-foreground">Delete {agent.name}? This can't be undone.</span>
                <Button variant="ghost" size="sm" onClick={() => setConfirmDel(false)}>Cancel</Button>
                <Button variant="destructive" size="sm" onClick={() => deleteAgent.mutate()}>Delete</Button>
              </div>
            )}
          </section>

        </div>
      </div>

      <KnowledgeDocDialog
        open={knowledgeDialog.open}
        doc={knowledgeDialog.doc}
        scopeLabel={`${agent.name}'s knowledge`}
        rows={6}
        onClose={() => setKnDialog({ open: false })}
        onSave={body => {
          if (knowledgeDialog.doc) updateKnowledge.mutate({ docId: knowledgeDialog.doc.id, body })
          else createKnowledge.mutate(body)
        }}
        loading={createKnowledge.isPending || updateKnowledge.isPending}
        error={createKnowledge.error?.message ?? updateKnowledge.error?.message}
      />
    </div>
  )
}
