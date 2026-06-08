import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { knowledge, agents, departments, AgentAvatar, cn } from '@pilot/shared'
import type { KnowledgeDoc, KnowledgeScope, Agent, Department } from '@pilot/shared'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@/components/ui/item'
import { KnowledgeDocDialog } from '@/components/KnowledgeDocDialog'

// ---------------------------------------------------------------------------
// Doc row
// ---------------------------------------------------------------------------

function DocRow({ doc, onEdit, onDelete }: {
  doc: KnowledgeDoc; onEdit: () => void; onDelete: () => void
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)

  if (confirmDelete) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 bg-destructive/5">
        <p className="text-xs text-muted-foreground flex-1">Delete <span className="font-semibold text-foreground">{doc.title}</span>?</p>
        <Button size="sm" variant="outline" onClick={() => setConfirmDelete(false)}>Cancel</Button>
        <Button size="sm" variant="destructive" onClick={() => { onDelete(); setConfirmDelete(false) }}>Delete</Button>
      </div>
    )
  }

  return (
    <Item className="px-4 py-3">
      <ItemContent>
        <ItemTitle>{doc.title}</ItemTitle>
        {doc.content && (
          <ItemDescription className="truncate text-xs">{doc.content.split('\n')[0].slice(0, 80)}</ItemDescription>
        )}
      </ItemContent>
      {!doc.content && <Badge variant="outline" className="text-[10px] text-muted-foreground">empty</Badge>}
      <ItemActions>
        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground" onClick={onEdit}>Edit</Button>
        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive" onClick={() => setConfirmDelete(true)}>Delete</Button>
      </ItemActions>
    </Item>
  )
}

// ---------------------------------------------------------------------------
// Department section
// ---------------------------------------------------------------------------

function DeptSection({ dept, docs, onAdd, onEdit, onDelete }: {
  dept: Department; docs: KnowledgeDoc[]
  onAdd: () => void; onEdit: (doc: KnowledgeDoc) => void; onDelete: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="bg-card/80 rounded-xl border border-border/60 overflow-hidden shadow-sm">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left cursor-pointer hover:bg-muted/30 transition-colors bg-transparent border-none">
        <span className="w-5 h-5 rounded-md shrink-0" style={{ background: dept.color + '30', border: `1.5px solid ${dept.color}60` }}>
          <span className="block w-2 h-2 rounded-sm m-1.5" style={{ background: dept.color }} />
        </span>
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium text-foreground">{dept.name}</span>
          {docs.length > 0 && <span className="ml-2 font-mono text-[10px] text-muted-foreground">{docs.length} doc{docs.length !== 1 ? 's' : ''}</span>}
        </div>
        <span className={cn('text-xs text-muted-foreground transition-transform', open && 'rotate-90')}>›</span>
      </button>
      {open && (
        <>
          {docs.length > 0 && docs.map((doc) => (
            <div key={doc.id} className="border-t border-border/40">
              <DocRow doc={doc} onEdit={() => onEdit(doc)} onDelete={() => onDelete(doc.id)} />
            </div>
          ))}
          <div className="border-t border-border/40" />
          <div className="px-4 py-2.5">
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-primary hover:text-primary/80" onClick={onAdd}>
              + Add knowledge for {dept.name}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Agent section
// ---------------------------------------------------------------------------

function EmployeeSection({ employee, docs, onAdd, onEdit, onDelete }: {
  employee: Agent; docs: KnowledgeDoc[]
  onAdd: () => void; onEdit: (doc: KnowledgeDoc) => void; onDelete: (id: string) => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="bg-card/80 rounded-xl border border-border/60 overflow-hidden shadow-sm">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left cursor-pointer hover:bg-muted/30 transition-colors bg-transparent border-none"
      >
        <AgentAvatar agent={employee} size={36} />
        <div className="flex-1 min-w-0">
          <span className="text-sm text-foreground">{employee.name}</span>
          {docs.length > 0 && (
            <span className="ml-2 font-mono text-[10px] text-muted-foreground">{docs.length} doc{docs.length !== 1 ? 's' : ''}</span>
          )}
        </div>
        <span className={cn('text-xs text-muted-foreground transition-transform', open && 'rotate-90')}>›</span>
      </button>

      {open && (
        <>
          {docs.length > 0 && docs.map((doc) => (
            <div key={doc.id} className="border-t border-border/40">
              <DocRow doc={doc} onEdit={() => onEdit(doc)} onDelete={() => onDelete(doc.id)} />
            </div>
          ))}
          <div className="border-t border-border/40" />
          <div className="px-4 py-2.5">
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-primary hover:text-primary/80" onClick={onAdd}>
              + Add knowledge for {employee.name}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function KnowledgePage() {
  const qc = useQueryClient()
  const [dialog, setDialog] = useState<{
    open: boolean; doc?: KnowledgeDoc; scope: KnowledgeScope; scopeId?: string; scopeLabel: string
  }>({ open: false, scope: 'company', scopeLabel: 'Company Library' })

  const { data: allKnowledge = [] } = useQuery({ queryKey: ['knowledge'],   queryFn: () => knowledge.list() })
  const { data: agentList    = [] } = useQuery({ queryKey: ['agents'],      queryFn: () => agents.list() })
  const { data: deptList     = [] } = useQuery({ queryKey: ['departments'], queryFn: () => departments.list() })

  const companyDocs  = allKnowledge.filter(d => d.scope === 'company')
  const deptDocs     = (id: string) => allKnowledge.filter(d => d.scope === 'department' && d.scopeId === id)
  const employeeDocs = (id: string) => allKnowledge.filter(d => d.scope === 'agent' && d.scopeId === id)

  const createDoc = useMutation({
    mutationFn: (body: Parameters<typeof knowledge.create>[0]) => knowledge.create(body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['knowledge'] }); setDialog(d => ({ ...d, open: false })) },
  })
  const updateDoc = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Parameters<typeof knowledge.update>[1] }) => knowledge.update(id, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['knowledge'] }); setDialog(d => ({ ...d, open: false })) },
  })
  const deleteDoc = useMutation({
    mutationFn: (id: string) => knowledge.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['knowledge'] }),
  })

  function openAdd(scope: KnowledgeScope, scopeId?: string, scopeLabel = 'Company Library') {
    setDialog({ open: true, doc: undefined, scope, scopeId, scopeLabel })
  }
  function openEdit(doc: KnowledgeDoc) {
    const emp  = doc.scopeId ? agentList.find(e => e.id === doc.scopeId) : undefined
    const dept = doc.scopeId ? deptList.find(d => d.id === doc.scopeId) : undefined
    const label = emp ? `${emp.name}'s Knowledge` : dept ? `${dept.name} Knowledge` : 'Company Library'
    setDialog({ open: true, doc, scope: doc.scope, scopeId: doc.scopeId, scopeLabel: label })
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-[960px] mx-auto px-6 pt-12 pb-10 flex flex-col gap-10">

        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Knowledge</h1>
            <p className="text-sm text-muted-foreground mt-1">Documents injected into agent prompts at runtime.</p>
          </div>
        </div>

        {/* Company Library */}
        <section className="flex flex-col gap-3">
          <div className="flex items-start justify-between gap-4">
            <p className="text-xs text-muted-foreground/50">Company library · shared across all agents</p>
            <Button size="sm" className="shrink-0" onClick={() => openAdd('company', undefined, 'Company Library')}>+ Add</Button>
          </div>

          {companyDocs.length === 0 ? (
            <Empty className="border border-dashed border-border/70 bg-card/30 py-10">
              <EmptyHeader>
                <EmptyTitle>No company knowledge</EmptyTitle>
                <EmptyDescription>Shared context for every agent will appear here.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <ItemGroup className="bg-card/80 rounded-xl border border-border/60 overflow-hidden shadow-sm">
              {companyDocs.map((doc, i) => (
                <div key={doc.id} className={i > 0 ? 'border-t border-border/40' : ''}>
                  <DocRow doc={doc} onEdit={() => openEdit(doc)} onDelete={() => deleteDoc.mutate(doc.id)} />
                </div>
              ))}
            </ItemGroup>
          )}
        </section>

        {/* Department Knowledge */}
        {deptList.length > 0 && (
          <section className="flex flex-col gap-3">
            <p className="text-xs text-muted-foreground/50">Team knowledge · injected for all agents in a team</p>
            <div className="flex flex-col gap-2">
              {deptList.map(dept => (
                <DeptSection
                  key={dept.id}
                  dept={dept}
                  docs={deptDocs(dept.id)}
                  onAdd={() => openAdd('department', dept.id, `${dept.name} Knowledge`)}
                  onEdit={doc => openEdit(doc)}
                  onDelete={id => deleteDoc.mutate(id)}
                />
              ))}
            </div>
          </section>
        )}

        {/* Agent Knowledge */}
        <section className="flex flex-col gap-3">
          <p className="text-xs text-muted-foreground/50">Agent knowledge · personal context per agent</p>

          {agentList.length === 0 ? (
            <Empty className="border border-dashed border-border/70 bg-card/30 py-10">
              <EmptyHeader>
                <EmptyTitle>No agents yet</EmptyTitle>
                <EmptyDescription>Personal knowledge attaches to agents once they exist.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="flex flex-col gap-2">
              {agentList.map(emp => (
                <EmployeeSection
                  key={emp.id}
                  employee={emp}
                  docs={employeeDocs(emp.id)}
                  onAdd={() => openAdd('agent', emp.id, `${emp.name}'s Knowledge`)}
                  onEdit={doc => openEdit(doc)}
                  onDelete={id => deleteDoc.mutate(id)}
                />
              ))}
            </div>
          )}
        </section>

      </div>

      <KnowledgeDocDialog
        open={dialog.open}
        doc={dialog.doc}
        scopeLabel={dialog.scopeLabel}
        onClose={() => setDialog(d => ({ ...d, open: false }))}
        onSave={body => {
          if (dialog.doc) {
            updateDoc.mutate({ id: dialog.doc.id, body })
          } else {
            createDoc.mutate({ ...body, scope: dialog.scope as KnowledgeScope, scopeId: dialog.scopeId })
          }
        }}
        loading={createDoc.isPending || updateDoc.isPending}
        error={createDoc.error?.message ?? updateDoc.error?.message}
      />
    </div>
  )
}
