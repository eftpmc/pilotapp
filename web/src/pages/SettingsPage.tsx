import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { brains, employees } from '../api/client'
import type { Brain, AgentProvider, Employee } from '../api/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Provider badge
// ---------------------------------------------------------------------------

function ProviderBadge({ type }: { type: string }) {
  return (
    <Badge variant="outline" className={cn(
      'font-mono text-[10px]',
      type === 'claude' && 'text-orange-500 border-orange-500/30 bg-orange-500/10',
      type === 'codex'  && 'text-blue-500 border-blue-500/30 bg-blue-500/10',
    )}>
      {type}
    </Badge>
  )
}

// ---------------------------------------------------------------------------
// Add Brain dialog
// ---------------------------------------------------------------------------

function AddBrainDialog({ open, onClose, onCreate, loading, error }: {
  open: boolean; onClose: () => void
  onCreate: (body: { name: string; type: AgentProvider; apiKey?: string; model?: string }) => void
  loading: boolean; error?: string
}) {
  const [name, setName]     = useState('')
  const [type, setType]     = useState<AgentProvider>('claude')
  const [apiKey, setApiKey] = useState('')
  const [model, setModel]   = useState('')

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Add Connection</DialogTitle></DialogHeader>
        <div className="flex flex-col gap-4">
          <p className="text-xs text-muted-foreground -mt-1">
            A connection is an API credential agents use at runtime.
          </p>
          <div className="flex flex-col gap-1.5">
            <Label>Name</Label>
            <Input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="Anthropic · Pro" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Provider</Label>
            <div className="flex gap-2">
              {(['claude', 'codex'] as AgentProvider[]).map(t => (
                <button key={t} type="button" onClick={() => setType(t)} className={cn(
                  'flex-1 py-2 rounded-lg border text-sm font-semibold transition-colors cursor-pointer',
                  type === t ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-transparent text-muted-foreground hover:text-foreground'
                )}>{t}</button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>API Key <span className="opacity-60">(optional)</span></Label>
              <Input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)}
                placeholder={type === 'claude' ? 'sk-ant-…' : 'sk-…'} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Model <span className="opacity-60">(optional)</span></Label>
              <Input value={model} onChange={e => setModel(e.target.value)}
                placeholder={type === 'claude' ? 'claude-opus-4-7' : 'o4-mini'} className="font-mono text-xs" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {apiKey
              ? 'Tasks will use this API key — billed per token on your developer dashboard.'
              : `No key — tasks will use ${type === 'claude' ? 'Claude Code OAuth (your claude.ai subscription)' : 'machine auth'} on this server.`}
          </p>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button className="flex-1" disabled={!name || loading}
              onClick={() => onCreate({ name, type, apiKey: apiKey || undefined, model: model || undefined })}>
              {loading ? '…' : 'Add Connection'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Brain row
// ---------------------------------------------------------------------------

function BrainRow({ brain, employeeCount, onUpdate, onDelete, onClearQuota }: {
  brain: Brain; employeeCount: number
  onUpdate: (body: { name?: string; apiKey?: string; model?: string }) => void
  onDelete: () => void; onClearQuota: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [name,   setName]   = useState(brain.name)
  const [model,  setModel]  = useState(brain.model ?? '')
  const [apiKey, setApiKey] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  if (editing) {
    return (
      <div className="flex flex-col gap-3 px-4 py-3.5 bg-muted/30">
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Name</Label>
            <Input value={name} onChange={e => setName(e.target.value)} className="h-8 text-xs" />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Model</Label>
            <Input value={model} onChange={e => setModel(e.target.value)} placeholder="default" className="h-8 text-xs font-mono" />
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">New API Key <span className="text-muted-foreground font-normal">(leave blank to keep existing)</span></Label>
          <Input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)}
            placeholder={brain.hasKey ? '••••••••' : 'no key set'} className="h-8 text-xs font-mono" />
        </div>
        <div className="flex gap-2 justify-end">
          <Button size="sm" variant="outline" onClick={() => { setEditing(false); setName(brain.name); setModel(brain.model ?? ''); setApiKey('') }}>
            Cancel
          </Button>
          <Button size="sm" onClick={() => { onUpdate({ name, model: model || undefined, apiKey: apiKey || undefined }); setEditing(false); setApiKey('') }}>
            Save
          </Button>
        </div>
      </div>
    )
  }

  if (confirmDelete) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 bg-destructive/5">
        <p className="text-xs text-muted-foreground flex-1">
          {employeeCount > 0
            ? `This connection is used by ${employeeCount} agent${employeeCount !== 1 ? 's' : ''}. They will lose access.`
            : 'Delete this connection?'}
        </p>
        <Button size="sm" variant="outline" onClick={() => setConfirmDelete(false)}>Cancel</Button>
        <Button size="sm" variant="destructive" onClick={() => { onDelete(); setConfirmDelete(false) }}>Delete</Button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span className="text-sm text-foreground flex-1">{brain.name}</span>
      {brain.model && <span className="font-mono text-[10px] text-muted-foreground">{brain.model}</span>}
      {brain.quotaStatus === 'exceeded' && (
        <button onClick={onClearQuota} className="flex items-center gap-1 cursor-pointer bg-transparent border-none p-0">
          <Badge variant="warning" className="text-[10px] gap-1 hover:opacity-80 transition-opacity">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            Rate limited · clear
          </Badge>
        </button>
      )}
      <Badge variant="outline" className={cn(
        'font-mono text-[10px]',
        brain.hasKey ? 'text-muted-foreground' : 'text-green-500 border-green-500/30 bg-green-500/10'
      )}>
        {brain.hasKey ? 'API key' : brain.type === 'claude' ? 'subscription' : 'machine auth'}
      </Badge>
      <ProviderBadge type={brain.type} />
      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground" onClick={() => setEditing(true)}>Edit</Button>
      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive" onClick={() => setConfirmDelete(true)}>Delete</Button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SettingsPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [showAddBrain, setShowAddBrain] = useState(false)

  const { data: brainList    = [] } = useQuery({ queryKey: ['brains'],    queryFn: () => brains.list() })
  const { data: employeeList = [] } = useQuery({ queryKey: ['employees'], queryFn: () => employees.list() })

  const createBrain = useMutation({
    mutationFn: (body: Parameters<typeof brains.create>[0]) => brains.create(body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['brains'] }); setShowAddBrain(false) },
  })
  const updateBrain = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Parameters<typeof brains.update>[1] }) => brains.update(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['brains'] }),
  })
  const deleteBrain = useMutation({
    mutationFn: (id: string) => brains.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['brains'] }),
  })
  const clearQuota = useMutation({
    mutationFn: (id: string) => brains.clearQuota(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['brains'] }),
  })

  function employeeCountForBrain(brainId: string): number {
    return (employeeList as Employee[]).filter(e => e.connectionId === brainId).length
  }

  function signOut() {
    localStorage.removeItem('token')
    navigate('/login')
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg)' }}>
      <div className="page-content narrow" style={{ paddingTop: 52, paddingBottom: 80 }}>

        <h1 className="h-page" style={{ marginBottom: 40 }}>Settings</h1>

        {/* Connections */}
        <div className="section" style={{ marginTop: 0 }}>
          <div className="section-head" style={{ marginBottom: 8 }}>
            <h2>Connections</h2>
            <button className="btn sm" onClick={() => setShowAddBrain(true)}>+ Add</button>
          </div>
          <p style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 12 }}>API credentials agents use to run tasks.</p>
          {brainList.length === 0 ? (
            <p className="empty-line">No connections yet.</p>
          ) : (
            <div style={{ borderTop: '1px solid var(--rule-soft)', borderBottom: '1px solid var(--rule-soft)' }}>
              {brainList.map((b, i) => (
                <div key={b.id} style={i > 0 ? { borderTop: '1px solid var(--rule-soft)' } : {}}>
                  <BrainRow
                    brain={b}
                    employeeCount={employeeCountForBrain(b.id)}
                    onUpdate={body => updateBrain.mutate({ id: b.id, body })}
                    onDelete={() => deleteBrain.mutate(b.id)}
                    onClearQuota={() => clearQuota.mutate(b.id)}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Account */}
        <div className="section">
          <div className="section-head"><h2>Account</h2></div>
          <div style={{ borderTop: '1px solid var(--rule-soft)', borderBottom: '1px solid var(--rule-soft)', display: 'flex', alignItems: 'center', padding: '14px 4px', gap: 12 }}>
            <span style={{ flex: 1, fontSize: 14, color: 'var(--ink)' }}>Sign out of pilot</span>
            <button className="btn sm danger" onClick={signOut}>Sign out</button>
          </div>
        </div>

      </div>

      <AddBrainDialog
        open={showAddBrain}
        onClose={() => setShowAddBrain(false)}
        onCreate={body => createBrain.mutate(body)}
        loading={createBrain.isPending}
        error={createBrain.error?.message}
      />

    </div>
  )
}
