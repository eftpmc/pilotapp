import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { connections, agents } from '../api/client'
import type { Connection, Agent, AgentProvider } from '../api/client'
import { useTheme, ACCENTS, type ThemeMode } from '../theme'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
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
          <div className="flex flex-col gap-1.5">
            <Label>Name</Label>
            <Input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="My Claude Key" />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Type</Label>
            <div className="flex gap-2">
              {(['claude', 'codex'] as AgentProvider[]).map(t => (
                <button key={t} type="button" onClick={() => setType(t)} className={cn(
                  'flex-1 py-2 rounded-lg border text-sm font-semibold transition-colors cursor-pointer',
                  type === t
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-transparent text-muted-foreground hover:text-foreground'
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
                placeholder={type === 'claude' ? 'claude-opus-4-7' : 'o4-mini'}
                className="font-mono text-xs" />
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
              {loading ? '…' : 'Add'}
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

function AddAgentDialog({ open, connectionList, onClose, onCreate, loading, error }: {
  open: boolean; connectionList: Connection[]; onClose: () => void
  onCreate: (body: { name: string; connectionId: string }) => void
  loading: boolean; error?: string
}) {
  const [name, setName]               = useState('')
  const [connectionId, setConnectionId] = useState(connectionList[0]?.id ?? '')

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Add Agent</DialogTitle></DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Name</Label>
            <Input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="Backend Claude" />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Connection</Label>
            {connectionList.length === 0 ? (
              <p className="text-sm text-muted-foreground">No connections yet — add one first.</p>
            ) : (
              <Select value={connectionId} onValueChange={setConnectionId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {connectionList.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name} ({c.type})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button className="flex-1" disabled={!name || !connectionId || loading}
              onClick={() => onCreate({ name, connectionId })}>
              {loading ? '…' : 'Add'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Confirm-delete button
// ---------------------------------------------------------------------------

function DeleteBtn({ onDelete }: { onDelete: () => void }) {
  const [confirming, setConfirming] = useState(false)
  if (confirming) return (
    <div className="flex gap-1.5">
      <Button size="sm" variant="outline" onClick={() => setConfirming(false)}>Cancel</Button>
      <Button size="sm" variant="destructive" onClick={onDelete}>Delete</Button>
    </div>
  )
  return (
    <Button size="sm" variant="outline" onClick={() => setConfirming(true)}
      className="text-muted-foreground hover:text-destructive hover:border-destructive/40">
      Delete
    </Button>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function SettingsPage() {
  const { theme, accent, setTheme, setAccent } = useTheme()
  const qc = useQueryClient()
  const [showAddConnection, setShowAddConnection] = useState(false)
  const [showAddAgent, setShowAddAgent]           = useState(false)

  const { data: connectionList = [] } = useQuery({ queryKey: ['connections'], queryFn: () => connections.list() })
  const { data: agentList = [] }      = useQuery({ queryKey: ['agents'],      queryFn: () => agents.list() })

  const createConnection = useMutation({
    mutationFn: (body: Parameters<typeof connections.create>[0]) => connections.create(body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['connections'] }); setShowAddConnection(false) },
  })
  const deleteConnection = useMutation({
    mutationFn: (id: string) => connections.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['connections'] }),
  })
  const createAgent = useMutation({
    mutationFn: (body: Parameters<typeof agents.create>[0]) => agents.create(body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['agents'] }); setShowAddAgent(false) },
  })
  const deleteAgent = useMutation({
    mutationFn: (id: string) => agents.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agents'] }),
  })

  function connectionFor(agent: Agent): Connection | undefined {
    return agent.connectionId ? connectionList.find(c => c.id === agent.connectionId) : undefined
  }

  function signOut() {
    localStorage.removeItem('token')
    window.location.href = '/login'
  }

  return (
    <div className="flex-1 overflow-y-auto bg-background">
      <div className="max-w-2xl mx-auto px-6 py-10 flex flex-col gap-10">

        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>

        {/* Connections */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center">
            <span className="text-sm font-semibold text-foreground">Connections</span>
            <div className="flex-1" />
            <Button size="sm" onClick={() => setShowAddConnection(true)}>+ Add</Button>
          </div>

          {connectionList.length === 0 ? (
            <p className="text-sm text-muted-foreground">No connections yet. Add an API key to get started.</p>
          ) : (
            <div className="bg-card rounded-2xl overflow-hidden [box-shadow:var(--shadow-card)]">
              {connectionList.map((c, i) => (
                <div key={c.id}>
                  <div className="flex items-center gap-3 px-4 py-3">
                    <span className="text-sm font-medium text-foreground flex-1">{c.name}</span>
                    {c.model && <span className="font-mono text-[10px] text-muted-foreground">{c.model}</span>}
                    <Badge variant="outline" className={cn(
                      'font-mono text-[10px]',
                      c.hasKey ? 'text-muted-foreground' : 'text-green-500 border-green-500/30 bg-green-500/10'
                    )}>
                      {c.hasKey ? 'API key' : c.type === 'claude' ? 'subscription' : 'machine auth'}
                    </Badge>
                    <ProviderBadge type={c.type} />
                    <DeleteBtn onDelete={() => deleteConnection.mutate(c.id)} />
                  </div>
                  {i < connectionList.length - 1 && <Separator />}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Agents */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center">
            <span className="text-sm font-semibold text-foreground">Agents</span>
            <div className="flex-1" />
            <Button size="sm" disabled={connectionList.length === 0} onClick={() => setShowAddAgent(true)}>+ Add</Button>
          </div>

          {agentList.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No agents yet.{connectionList.length === 0 ? ' Add a connection first.' : ' Add an agent to dispatch tasks.'}
            </p>
          ) : (
            <div className="bg-card rounded-2xl overflow-hidden [box-shadow:var(--shadow-card)]">
              {agentList.map((a, i) => {
                const conn = connectionFor(a)
                return (
                  <div key={a.id}>
                    <div className="flex items-center gap-3 px-4 py-3">
                      <span className="text-sm font-medium text-foreground flex-1">{a.name}</span>
                      {conn ? (
                        <div className="flex flex-col items-end gap-0.5">
                          <ProviderBadge type={conn.type} />
                          <span className="font-mono text-[10px] text-muted-foreground">
                            {conn.name}{conn.model ? ` · ${conn.model}` : ''}
                          </span>
                        </div>
                      ) : (
                        <ProviderBadge type={a.provider} />
                      )}
                      <DeleteBtn onDelete={() => deleteAgent.mutate(a.id)} />
                    </div>
                    {i < agentList.length - 1 && <Separator />}
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {/* Appearance */}
        <section className="flex flex-col gap-3">
          <span className="text-sm font-semibold text-foreground">Appearance</span>
          <div className="bg-card rounded-2xl overflow-hidden [box-shadow:var(--shadow-card)]">
            <div className="flex items-center gap-3 px-4 py-3">
              <span className="text-sm text-foreground flex-1">Theme</span>
              <div className="flex gap-0.5 bg-muted rounded-lg p-0.5">
                {(['dark', 'system', 'light'] as ThemeMode[]).map(t => (
                  <button key={t} onClick={() => setTheme(t)} className={cn(
                    'px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer border-none',
                    theme === t
                      ? 'bg-card text-foreground font-semibold shadow-sm'
                      : 'bg-transparent text-muted-foreground hover:text-foreground',
                  )}>{t}</button>
                ))}
              </div>
            </div>
            <Separator />
            <div className="flex items-center gap-3 px-4 py-3">
              <span className="text-sm text-foreground flex-1">Accent color</span>
              <div className="flex gap-2">
                {ACCENTS.map(({ hex, label }) => (
                  <button key={hex} title={label} onClick={() => setAccent(hex)} className={cn(
                    'w-5 h-5 rounded-full cursor-pointer border-2 transition-all',
                    accent === hex ? 'border-foreground scale-110' : 'border-transparent hover:scale-110',
                  )} style={{ background: hex }} />
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Account */}
        <section className="flex flex-col gap-3">
          <span className="text-sm font-semibold text-foreground">Account</span>
          <button onClick={signOut} className="text-sm text-destructive cursor-pointer bg-transparent border-none text-left underline underline-offset-3 hover:opacity-80 transition-opacity w-fit">
            Sign out
          </button>
        </section>

      </div>

      <AddConnectionDialog
        open={showAddConnection}
        onClose={() => setShowAddConnection(false)}
        onCreate={body => createConnection.mutate(body)}
        loading={createConnection.isPending}
        error={createConnection.error?.message}
      />
      <AddAgentDialog
        open={showAddAgent}
        connectionList={connectionList}
        onClose={() => setShowAddAgent(false)}
        onCreate={body => createAgent.mutate(body)}
        loading={createAgent.isPending}
        error={createAgent.error?.message}
      />
    </div>
  )
}
