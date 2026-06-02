import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { connections, agents } from '../api/client'
import type { Connection, AgentProvider, Agent } from '../api/client'
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
// Add Connection dialog
// ---------------------------------------------------------------------------

function AddConnectionDialog({ open, onClose, onCreate, loading, error }: {
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
// Connection row
// ---------------------------------------------------------------------------

function ConnectionRow({ connection, agentCount, onUpdate, onDelete, onClearQuota }: {
  connection: Connection; agentCount: number
  onUpdate: (body: { name?: string; apiKey?: string; model?: string }) => void
  onDelete: () => void; onClearQuota: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [name,   setName]   = useState(connection.name)
  const [model,  setModel]  = useState(connection.model ?? '')
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
            placeholder={connection.hasKey ? '••••••••' : 'no key set'} className="h-8 text-xs font-mono" />
        </div>
        <div className="flex gap-2 justify-end">
          <Button size="sm" variant="outline" onClick={() => { setEditing(false); setName(connection.name); setModel(connection.model ?? ''); setApiKey('') }}>
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
          {agentCount > 0
            ? `This connection is used by ${agentCount} agent${agentCount !== 1 ? 's' : ''}. They will lose access.`
            : 'Delete this connection?'}
        </p>
        <Button size="sm" variant="outline" onClick={() => setConfirmDelete(false)}>Cancel</Button>
        <Button size="sm" variant="destructive" onClick={() => { onDelete(); setConfirmDelete(false) }}>Delete</Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-3">
      <div className="min-w-0 flex-1">
        <span className="block truncate text-sm text-foreground">{connection.name}</span>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 sm:hidden">
          {connection.model && <span className="font-mono text-[10px] text-muted-foreground">{connection.model}</span>}
          <Badge variant="outline" className={cn(
            'font-mono text-[10px]',
            connection.hasKey ? 'text-muted-foreground' : 'text-green-500 border-green-500/30 bg-green-500/10'
          )}>
            {connection.hasKey ? 'API key' : connection.type === 'claude' ? 'subscription' : 'machine auth'}
          </Badge>
          <ProviderBadge type={connection.type} />
        </div>
      </div>
      <div className="hidden items-center gap-2 sm:flex">
        {connection.model && <span className="font-mono text-[10px] text-muted-foreground">{connection.model}</span>}
        <Badge variant="outline" className={cn(
          'font-mono text-[10px]',
          connection.hasKey ? 'text-muted-foreground' : 'text-green-500 border-green-500/30 bg-green-500/10'
        )}>
          {connection.hasKey ? 'API key' : connection.type === 'claude' ? 'subscription' : 'machine auth'}
        </Badge>
        <ProviderBadge type={connection.type} />
      </div>
      <div className="flex flex-wrap items-center justify-end gap-1.5 sm:gap-2">
        {connection.quotaStatus === 'exceeded' && (
          <button onClick={onClearQuota} className="flex items-center gap-1 cursor-pointer bg-transparent border-none p-0">
            <Badge variant="warning" className="text-[10px] gap-1 hover:opacity-80 transition-opacity">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              Rate limited · clear
            </Badge>
          </button>
        )}
        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground" onClick={() => setEditing(true)}>Edit</Button>
        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive" onClick={() => setConfirmDelete(true)}>Delete</Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SettingsPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [showAddConnection, setShowAddBrain] = useState(false)

  const { data: connectionList    = [] } = useQuery({ queryKey: ['connections'],    queryFn: () => connections.list() })
  const { data: agentList = [] } = useQuery({ queryKey: ['agents'], queryFn: () => agents.list() })

  const createConnection = useMutation({
    mutationFn: (body: Parameters<typeof connections.create>[0]) => connections.create(body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['connections'] }); setShowAddBrain(false) },
  })
  const updateConnection = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Parameters<typeof connections.update>[1] }) => connections.update(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['connections'] }),
  })
  const deleteConnection = useMutation({
    mutationFn: (id: string) => connections.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['connections'] }),
  })
  const clearQuota = useMutation({
    mutationFn: (id: string) => connections.clearQuota(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['connections'] }),
  })

  function agentCountForBrain(brainId: string): number {
    return (agentList as Agent[]).filter(e => e.connectionId === brainId).length
  }

  function signOut() {
    localStorage.removeItem('token')
    navigate('/login')
  }

  return (
    <div className="flex-1 overflow-y-auto bg-background">
      <div className="px-6 pt-10 pb-8 flex flex-col gap-8">

        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">Connections, account, and workspace configuration.</p>
        </div>

        {/* Connections */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground/50">Connections · API credentials agents use to run tasks</p>
            <Button size="sm" onClick={() => setShowAddBrain(true)}>+ Add</Button>
          </div>
          {connectionList.length === 0 ? (
            <p className="text-sm text-muted-foreground/50">No connections yet.</p>
          ) : (
            <div className="bg-card rounded-xl border border-border overflow-hidden">
              {connectionList.map((b, i) => (
                <div key={b.id} className={i > 0 ? 'border-t border-border/40' : ''}>
                  <ConnectionRow
                    connection={b}
                    agentCount={agentCountForBrain(b.id)}
                    onUpdate={body => updateConnection.mutate({ id: b.id, body })}
                    onDelete={() => deleteConnection.mutate(b.id)}
                    onClearQuota={() => clearQuota.mutate(b.id)}
                  />
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Account */}
        <section className="flex flex-col gap-3">
          <p className="text-xs text-muted-foreground/50">Account</p>
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3">
              <span className="text-sm text-foreground flex-1">Sign out of pilot</span>
              <Button size="sm" variant="destructive" onClick={signOut}>Sign out</Button>
            </div>
          </div>
        </section>

      </div>

      <AddConnectionDialog
        open={showAddConnection}
        onClose={() => setShowAddBrain(false)}
        onCreate={body => createConnection.mutate(body)}
        loading={createConnection.isPending}
        error={createConnection.error?.message}
      />

    </div>
  )
}
