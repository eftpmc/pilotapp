import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { knowledge, employees, departments } from '../api/client'
import type { KnowledgeDoc, Employee, Department } from '../api/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AgentAvatar } from '@/components/AgentAvatar'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Knowledge doc dialog
// ---------------------------------------------------------------------------

function KnowledgeDocDialog({ open, doc, scopeLabel, onClose, onSave, loading, error }: {
  open: boolean; doc?: KnowledgeDoc; scopeLabel: string; onClose: () => void
  onSave: (body: { title: string; content: string }) => void
  loading: boolean; error?: string
}) {
  const [title,   setTitle]   = useState(doc?.title   ?? '')
  const [content, setContent] = useState(doc?.content ?? '')
  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>{doc ? 'Edit document' : `Add to ${scopeLabel}`}</DialogTitle></DialogHeader>
        <div className="flex flex-col gap-4">
          {!doc && (
            <p className="text-xs text-muted-foreground -mt-1">
              {scopeLabel === 'Company Library'
                ? "Injected into every agent's prompt."
                : `Injected only when this agent works.`}
            </p>
          )}
          <div className="flex flex-col gap-1.5">
            <Label>Title</Label>
            <Input autoFocus value={title} onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Coding Standards, Architecture Overview" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Content</Label>
            <Textarea value={content} onChange={e => setContent(e.target.value)} rows={10}
              placeholder="Markdown — included verbatim in the agent's prompt context."
              className="font-mono text-xs resize-y" />
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
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">{doc.title}</p>
        {doc.content && (
          <p className="text-xs text-muted-foreground truncate mt-0.5">{doc.content.split('\n')[0].slice(0, 80)}</p>
        )}
      </div>
      {!doc.content && <Badge variant="outline" className="text-[10px] text-muted-foreground">empty</Badge>}
      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground" onClick={onEdit}>Edit</Button>
      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive" onClick={() => setConfirmDelete(true)}>Delete</Button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Employee section
// ---------------------------------------------------------------------------

function DeptSection({ dept, docs, onAdd, onEdit, onDelete }: {
  dept: Department; docs: KnowledgeDoc[]
  onAdd: () => void; onEdit: (doc: KnowledgeDoc) => void; onDelete: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="bg-card rounded-xl border border-border/50 overflow-hidden [box-shadow:var(--shadow-card)]">
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

function EmployeeSection({ employee, docs, onAdd, onEdit, onDelete }: {
  employee: Employee; docs: KnowledgeDoc[]
  onAdd: () => void; onEdit: (doc: KnowledgeDoc) => void; onDelete: (id: string) => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="bg-card rounded-xl border border-border/50 overflow-hidden [box-shadow:var(--shadow-card)]">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left cursor-pointer hover:bg-muted/30 transition-colors bg-transparent border-none"
      >
        <AgentAvatar agent={employee} size={28} />
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
    open: boolean; doc?: KnowledgeDoc; scope: 'company' | 'department' | 'employee'; scopeId?: string; scopeLabel: string
  }>({ open: false, scope: 'company', scopeLabel: 'Company Library' })

  const { data: allKnowledge  = [] } = useQuery({ queryKey: ['knowledge'],   queryFn: () => knowledge.list() })
  const { data: employeeList  = [] } = useQuery({ queryKey: ['employees'],   queryFn: () => employees.list() })
  const { data: deptList      = [] } = useQuery({ queryKey: ['departments'], queryFn: () => departments.list() })

  const companyDocs  = allKnowledge.filter(d => d.scope === 'company')
  const deptDocs     = (id: string) => allKnowledge.filter(d => d.scope === 'department' && d.scopeId === id)
  const employeeDocs = (id: string) => allKnowledge.filter(d => d.scope === 'employee'   && d.scopeId === id)

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

  function openAdd(scope: 'company' | 'department' | 'employee', scopeId?: string, scopeLabel = 'Company Library') {
    setDialog({ open: true, doc: undefined, scope, scopeId, scopeLabel })
  }
  function openEdit(doc: KnowledgeDoc) {
    const emp  = doc.scopeId ? employeeList.find(e => e.id === doc.scopeId) : undefined
    const dept = doc.scopeId ? deptList.find(d => d.id === doc.scopeId) : undefined
    const label = emp ? `${emp.name}'s Knowledge` : dept ? `${dept.name} Knowledge` : 'Company Library'
    setDialog({ open: true, doc, scope: doc.scope as any, scopeId: doc.scopeId, scopeLabel: label })
  }

  return (
    <div className="flex-1 overflow-y-auto bg-background">
      <div className="px-6 pt-10 pb-8 flex flex-col gap-8">

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
            <p className="text-sm text-muted-foreground/50">No company knowledge yet.</p>
          ) : (
            <div className="bg-card rounded-xl border border-border/50 overflow-hidden [box-shadow:var(--shadow-card)]">
              {companyDocs.map((doc, i) => (
                <div key={doc.id} className={i > 0 ? 'border-t border-border/40' : ''}>
                  <DocRow doc={doc} onEdit={() => openEdit(doc)} onDelete={() => deleteDoc.mutate(doc.id)} />
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Department Knowledge */}
        {deptList.length > 0 && (
          <section className="flex flex-col gap-3">
            <p className="text-xs text-muted-foreground/50">Department knowledge · injected for all agents in a department</p>
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

          {employeeList.length === 0 ? (
            <p className="text-sm text-muted-foreground/50">No agents yet.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {employeeList.map(emp => (
                <EmployeeSection
                  key={emp.id}
                  employee={emp}
                  docs={employeeDocs(emp.id)}
                  onAdd={() => openAdd('employee', emp.id, `${emp.name}'s Knowledge`)}
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
            createDoc.mutate({ ...body, scope: dialog.scope, scopeId: dialog.scopeId })
          }
        }}
        loading={createDoc.isPending || updateDoc.isPending}
        error={createDoc.error?.message ?? updateDoc.error?.message}
      />
    </div>
  )
}
