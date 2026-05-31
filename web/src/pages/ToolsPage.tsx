import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { tools, departments } from '../api/client'
import type { Tool, Department } from '../api/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import {
  Globe, GitBranch, Brain, HardDrive, Wrench, Zap, Plus, Pencil, Trash2, Users,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Preset catalog
// ---------------------------------------------------------------------------

interface Preset {
  id:          string
  name:        string
  icon:        React.ElementType
  tagline:     string
  description: string
  mcpConfig:   Record<string, unknown>
  envVars:     { key: string; label: string; placeholder: string }[]
}

const PRESETS: Preset[] = [
  {
    id: 'fetch',
    name: 'Fetch',
    icon: Globe,
    tagline: 'Web browsing',
    description: 'Let employees browse URLs and fetch web content during their sessions.',
    mcpConfig: { fetch: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-fetch'] } },
    envVars: [],
  },
  {
    id: 'github',
    name: 'GitHub',
    icon: GitBranch,
    tagline: 'Issues, PRs, repos',
    description: 'Read and write issues, pull requests, and repository content.',
    mcpConfig: {
      github: {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-github'],
        env: { GITHUB_PERSONAL_ACCESS_TOKEN: '__TOKEN__' },
      },
    },
    envVars: [{ key: 'GITHUB_PERSONAL_ACCESS_TOKEN', label: 'Personal Access Token', placeholder: 'ghp_...' }],
  },
  {
    id: 'sequential-thinking',
    name: 'Sequential Thinking',
    icon: Brain,
    tagline: 'Structured reasoning',
    description: 'Step-by-step reasoning that helps employees break down complex tasks before acting.',
    mcpConfig: { 'sequential-thinking': { command: 'npx', args: ['-y', '@modelcontextprotocol/server-sequential-thinking'] } },
    envVars: [],
  },
  {
    id: 'filesystem',
    name: 'Filesystem',
    icon: HardDrive,
    tagline: 'Local file access',
    description: 'Read and write files on the local filesystem. Useful for reading shared config or docs.',
    mcpConfig: { filesystem: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', '.'] } },
    envVars: [],
  },
  {
    id: 'linear',
    name: 'Linear',
    icon: Zap,
    tagline: 'Issues & projects',
    description: 'Read and create Linear issues, projects, and cycles.',
    mcpConfig: {
      linear: {
        command: 'npx',
        args: ['-y', '@linear/mcp-server'],
        env: { LINEAR_API_KEY: '__TOKEN__' },
      },
    },
    envVars: [{ key: 'LINEAR_API_KEY', label: 'API Key', placeholder: 'lin_api_...' }],
  },
]

// ---------------------------------------------------------------------------
// Tool config dialog (create / edit custom)
// ---------------------------------------------------------------------------

const MCP_PLACEHOLDER = `{
  "my-tool": {
    "command": "npx",
    "args": ["-y", "my-mcp-server"]
  }
}`

function ToolConfigDialog({ open, tool, onClose, onSave, loading, error }: {
  open: boolean; tool?: Tool; onClose: () => void
  onSave: (body: { name: string; description: string; mcpConfig: Record<string, unknown> }) => void
  loading: boolean; error?: string
}) {
  const [name,      setName]   = useState(tool?.name        ?? '')
  const [desc,      setDesc]   = useState(tool?.description ?? '')
  const [configStr, setConfig] = useState(tool ? JSON.stringify(tool.mcpConfig, null, 2) : '')
  const [jsonErr,   setJsonErr] = useState('')

  function submit() {
    try {
      const mcpConfig = configStr.trim() ? JSON.parse(configStr) : {}
      setJsonErr('')
      onSave({ name: name.trim(), description: desc.trim(), mcpConfig })
    } catch {
      setJsonErr('Invalid JSON.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{tool ? 'Edit tool' : 'Add custom tool'}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <p className="text-xs text-muted-foreground -mt-1">
            MCP servers are passed via <span className="font-mono bg-muted px-1 rounded">--mcp-config</span> when an employee runs. The JSON should be the contents of <span className="font-mono bg-muted px-1 rounded">mcpServers</span>.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Name</Label>
              <Input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="My Tool" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-muted-foreground font-normal">Description</Label>
              <Input value={desc} onChange={e => setDesc(e.target.value)} placeholder="What it does" />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>MCP Config <span className="text-muted-foreground font-normal text-xs">(JSON)</span></Label>
            <Textarea
              value={configStr}
              onChange={e => setConfig(e.target.value)}
              rows={8}
              placeholder={MCP_PLACEHOLDER}
              className="font-mono text-xs resize-y"
            />
            {jsonErr && <p className="text-xs text-destructive">{jsonErr}</p>}
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button className="flex-1" disabled={!name.trim() || loading} onClick={submit}>
              {loading ? '…' : tool ? 'Save' : 'Add Tool'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Preset install dialog (fills in env vars then creates)
// ---------------------------------------------------------------------------

function PresetInstallDialog({ preset, onClose, onInstall, loading, error }: {
  preset: Preset; onClose: () => void
  onInstall: (body: { name: string; description: string; mcpConfig: Record<string, unknown> }) => void
  loading: boolean; error?: string
}) {
  const [envValues, setEnvValues] = useState<Record<string, string>>(
    Object.fromEntries(preset.envVars.map(v => [v.key, '']))
  )

  function submit() {
    // Deep-clone the MCP config and substitute env var placeholders
    const config = JSON.parse(JSON.stringify(preset.mcpConfig)) as Record<string, unknown>
    for (const server of Object.values(config)) {
      const s = server as { env?: Record<string, string> }
      if (s.env) {
        for (const [k, v] of Object.entries(s.env)) {
          if (v === '__TOKEN__' && envValues[k]) s.env[k] = envValues[k]
        }
      }
    }
    onInstall({ name: preset.name, description: preset.tagline, mcpConfig: config })
  }

  const canSubmit = preset.envVars.every(v => envValues[v.key]?.trim()) || preset.envVars.length === 0

  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <preset.icon className="h-4 w-4" />
            Add {preset.name}
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <p className="text-xs text-muted-foreground">{preset.description}</p>
          {preset.envVars.map(v => (
            <div key={v.key} className="flex flex-col gap-1.5">
              <Label>{v.label}</Label>
              <Input
                autoFocus
                value={envValues[v.key] ?? ''}
                onChange={e => setEnvValues(prev => ({ ...prev, [v.key]: e.target.value }))}
                placeholder={v.placeholder}
                type="password"
              />
            </div>
          ))}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button className="flex-1" disabled={!canSubmit || loading} onClick={submit}>
              {loading ? '…' : 'Add to company'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Installed tool card
// ---------------------------------------------------------------------------

function ToolCard({ tool, deptList, deptToolIds, employeeToolIds, onEdit, onDelete, onToggleDept }: {
  tool: Tool
  deptList: Department[]
  deptToolIds: Set<string>   // deptIds that have this tool
  employeeToolIds: Set<string> // agentIds that have this tool directly
  onEdit: () => void
  onDelete: () => void
  onToggleDept: (deptId: string, assigned: boolean) => void
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const serverCount = Object.keys(tool.mcpConfig).length
  const directCount = employeeToolIds.size

  return (
    <div className="bg-card rounded-2xl [box-shadow:var(--shadow-card)] border border-border/50 overflow-hidden flex flex-col">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 flex items-start gap-3">
        <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <Wrench className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">{tool.name}</p>
          {tool.description && (
            <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{tool.description}</p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={onEdit}
            className="h-7 w-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer bg-transparent border-none"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setConfirmDelete(true)}
            className="h-7 w-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer bg-transparent border-none"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Meta */}
      <div className="px-4 pb-3 flex items-center gap-3">
        <Badge variant="outline" className="font-mono text-[10px] text-muted-foreground">
          {serverCount} server{serverCount !== 1 ? 's' : ''}
        </Badge>
        {directCount > 0 && (
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Users className="h-3 w-3" />
            {directCount} direct
          </span>
        )}
      </div>

      {/* Department assignments */}
      {deptList.length > 0 && (
        <div className="px-4 pb-4 border-t border-border/40 pt-3">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Departments</p>
          <div className="flex flex-wrap gap-1.5">
            {deptList.map(dept => {
              const assigned = deptToolIds.has(dept.id)
              return (
                <button
                  key={dept.id}
                  onClick={() => onToggleDept(dept.id, assigned)}
                  className={cn(
                    'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all cursor-pointer bg-transparent',
                    assigned
                      ? 'text-foreground border-transparent'
                      : 'text-muted-foreground border-border/50 hover:border-border hover:text-foreground'
                  )}
                  style={assigned ? { background: dept.color + '22', borderColor: dept.color + '55', color: dept.color } : {}}
                >
                  {assigned && <span className="w-1 h-1 rounded-full" style={{ background: dept.color }} />}
                  {dept.name}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {confirmDelete && (
        <div className="border-t border-destructive/20 bg-destructive/5 px-4 py-3 flex items-center gap-3">
          <p className="text-xs text-muted-foreground flex-1">Remove <span className="font-semibold text-foreground">{tool.name}</span>?</p>
          <Button size="sm" variant="outline" onClick={() => setConfirmDelete(false)}>Cancel</Button>
          <Button size="sm" variant="destructive" onClick={() => { onDelete(); setConfirmDelete(false) }}>Remove</Button>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Preset shop card
// ---------------------------------------------------------------------------

function PresetCard({ preset, onAdd }: { preset: Preset; onAdd: () => void }) {
  const Icon = preset.icon
  return (
    <div className="bg-card rounded-2xl border border-dashed border-border/50 px-4 py-4 flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-xl bg-muted flex items-center justify-center shrink-0">
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">{preset.name}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{preset.tagline}</p>
        </div>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">{preset.description}</p>
      <Button size="sm" variant="outline" className="w-full gap-1.5" onClick={onAdd}>
        <Plus className="h-3.5 w-3.5" />
        Add to company
      </Button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ToolsPage() {
  const qc = useQueryClient()

  const { data: toolList     = [] } = useQuery({ queryKey: ['tools'],        queryFn: () => tools.list() })
  const { data: deptList     = [] } = useQuery({ queryKey: ['departments'],   queryFn: () => departments.list() })
  const { data: agentAssigns = [] } = useQuery({ queryKey: ['agent-tools'],   queryFn: () => tools.assignments() })
  const { data: deptAssigns  = [] } = useQuery({ queryKey: ['dept-tools'],    queryFn: () => tools.deptAssignments() })

  const [editTool,     setEditTool]    = useState<Tool | null>(null)
  const [showCustom,   setShowCustom]  = useState(false)
  const [addPreset,    setAddPreset]   = useState<Preset | null>(null)

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['tools'] })
    qc.invalidateQueries({ queryKey: ['dept-tools'] })
    qc.invalidateQueries({ queryKey: ['agent-tools'] })
  }

  const createTool = useMutation({
    mutationFn: (body: Parameters<typeof tools.create>[0]) => tools.create(body),
    onSuccess: () => { invalidate(); setShowCustom(false); setAddPreset(null) },
  })
  const updateTool = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Parameters<typeof tools.update>[1] }) => tools.update(id, body),
    onSuccess: () => { invalidate(); setEditTool(null) },
  })
  const deleteTool = useMutation({
    mutationFn: (id: string) => tools.delete(id),
    onSuccess: () => invalidate(),
  })
  const toggleDept = useMutation({
    mutationFn: ({ toolId, deptId, assign }: { toolId: string; deptId: string; assign: boolean }) =>
      assign ? tools.assignDept(toolId, deptId) : tools.unassignDept(toolId, deptId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dept-tools'] }),
  })

  // Build lookup maps
  const deptToolMap = new Map<string, Set<string>>() // toolId → Set<deptId>
  for (const { departmentId, toolId } of deptAssigns) {
    if (!deptToolMap.has(toolId)) deptToolMap.set(toolId, new Set())
    deptToolMap.get(toolId)!.add(departmentId)
  }

  const agentToolMap = new Map<string, Set<string>>() // toolId → Set<agentId>
  for (const { agentId, toolId } of agentAssigns) {
    if (!agentToolMap.has(toolId)) agentToolMap.set(toolId, new Set())
    agentToolMap.get(toolId)!.add(agentId)
  }

  // Presets not yet installed (matched by name)
  const installedNames = new Set(toolList.map(t => t.name.toLowerCase()))
  const uninstalledPresets = PRESETS.filter(p => !installedNames.has(p.name.toLowerCase()))

  return (
    <div className="flex-1 overflow-y-auto bg-background">
      <div className="max-w-4xl mx-auto px-6 py-8">

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Tools</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Equipment available to your employees via MCP.
            </p>
          </div>
          <Button onClick={() => setShowCustom(true)} className="gap-1.5">
            <Plus className="h-4 w-4" />
            Custom tool
          </Button>
        </div>

        {/* Installed tools */}
        {toolList.length > 0 && (
          <section className="mb-10">
            <div className="flex items-center gap-2 mb-4">
              <h2 className="text-xs font-semibold text-foreground uppercase tracking-wide">Installed</h2>
              <span className="font-mono text-xs text-muted-foreground">{toolList.length}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {toolList.map(tool => (
                <ToolCard
                  key={tool.id}
                  tool={tool}
                  deptList={deptList}
                  deptToolIds={deptToolMap.get(tool.id) ?? new Set()}
                  employeeToolIds={agentToolMap.get(tool.id) ?? new Set()}
                  onEdit={() => setEditTool(tool)}
                  onDelete={() => deleteTool.mutate(tool.id)}
                  onToggleDept={(deptId, assigned) =>
                    toggleDept.mutate({ toolId: tool.id, deptId, assign: !assigned })
                  }
                />
              ))}
            </div>
          </section>
        )}

        {/* Shop */}
        {uninstalledPresets.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-4">
              <h2 className="text-xs font-semibold text-foreground uppercase tracking-wide">Shop</h2>
              <span className="text-xs text-muted-foreground">Common equipment packages</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {uninstalledPresets.map(preset => (
                <PresetCard key={preset.id} preset={preset} onAdd={() => setAddPreset(preset)} />
              ))}
            </div>
          </section>
        )}

        {toolList.length === 0 && uninstalledPresets.length === 0 && (
          <p className="text-sm text-muted-foreground">All preset tools installed.</p>
        )}

        {/* Empty installed state with shop */}
        {toolList.length === 0 && (
          <div className="mb-8 p-4 rounded-xl border border-dashed border-border/50 text-center">
            <p className="text-sm text-muted-foreground">No tools installed yet. Add one from the shop below or create a custom MCP server.</p>
          </div>
        )}

      </div>

      {/* Dialogs */}
      {showCustom && (
        <ToolConfigDialog
          open
          onClose={() => setShowCustom(false)}
          onSave={body => createTool.mutate(body)}
          loading={createTool.isPending}
          error={createTool.error?.message}
        />
      )}
      {editTool && (
        <ToolConfigDialog
          open
          tool={editTool}
          onClose={() => setEditTool(null)}
          onSave={body => updateTool.mutate({ id: editTool.id, body })}
          loading={updateTool.isPending}
          error={updateTool.error?.message}
        />
      )}
      {addPreset && (
        <PresetInstallDialog
          preset={addPreset}
          onClose={() => setAddPreset(null)}
          onInstall={body => createTool.mutate(body)}
          loading={createTool.isPending}
          error={createTool.error?.message}
        />
      )}
    </div>
  )
}
