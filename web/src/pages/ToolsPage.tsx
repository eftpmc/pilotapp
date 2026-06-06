import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { tools, departments } from '../api/client'
import type { Tool, Department } from '../api/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Field, FieldLabel } from '@/components/ui/field'
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from '@/components/ui/item'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'
import {
  Globe, Brain, Wrench, Plus, Pencil, Trash2, Users,
  BookMarked, Server,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

// ---------------------------------------------------------------------------
// Preset catalog
// ---------------------------------------------------------------------------

interface Preset {
  id:          string
  name:        string
  icon?:       LucideIcon
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
    description: 'Let agents browse URLs and fetch web content during their sessions.',
    mcpConfig: { fetch: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-fetch'] } },
    envVars: [],
  },
  {
    id: 'brave-search',
    name: 'Brave Search',
    tagline: 'Web search',
    description: 'Search the web via Brave Search API. Better than fetch for discovery tasks.',
    mcpConfig: {
      'brave-search': {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-brave-search'],
        env: { BRAVE_API_KEY: '__TOKEN__' },
      },
    },
    envVars: [{ key: 'BRAVE_API_KEY', label: 'Brave API Key', placeholder: 'BSA...' }],
  },
  {
    id: 'github',
    name: 'GitHub',
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
    id: 'gitlab',
    name: 'GitLab',
    tagline: 'Issues, MRs, repos',
    description: 'Read and write GitLab issues, merge requests, and repository content.',
    mcpConfig: {
      gitlab: {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-gitlab'],
        env: { GITLAB_PERSONAL_ACCESS_TOKEN: '__TOKEN__', GITLAB_API_URL: 'https://gitlab.com/api/v4' },
      },
    },
    envVars: [{ key: 'GITLAB_PERSONAL_ACCESS_TOKEN', label: 'Personal Access Token', placeholder: 'glpat-...' }],
  },
  {
    id: 'sequential-thinking',
    name: 'Sequential Thinking',
    icon: Brain,
    tagline: 'Structured reasoning',
    description: 'Step-by-step reasoning that helps agents break down complex tasks before acting.',
    mcpConfig: { 'sequential-thinking': { command: 'npx', args: ['-y', '@modelcontextprotocol/server-sequential-thinking'] } },
    envVars: [],
  },
  {
    id: 'memory',
    name: 'Memory',
    icon: BookMarked,
    tagline: 'Persistent knowledge',
    description: 'Lets agents store and recall facts across sessions using a knowledge graph.',
    mcpConfig: { memory: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-memory'] } },
    envVars: [],
  },
  {
    id: 'postgres',
    name: 'PostgreSQL',
    tagline: 'Database queries',
    description: 'Read-only access to a Postgres database. Agents can query schema and run SELECTs.',
    mcpConfig: {
      postgres: {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-postgres'],
        env: { DATABASE_URL: '__TOKEN__' },
      },
    },
    envVars: [{ key: 'DATABASE_URL', label: 'Connection String', placeholder: 'postgresql://user:pass@host/db' }],
  },
  {
    id: 'puppeteer',
    name: 'Puppeteer',
    tagline: 'Browser automation',
    description: 'Control a real browser — navigate pages, click, fill forms, take screenshots.',
    mcpConfig: { puppeteer: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-puppeteer'] } },
    envVars: [],
  },
  {
    id: 'slack',
    name: 'Slack',
    tagline: 'Messaging',
    description: 'Read channels and post messages to Slack workspaces.',
    mcpConfig: {
      slack: {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-slack'],
        env: { SLACK_BOT_TOKEN: '__TOKEN__', SLACK_TEAM_ID: '__TEAM_ID__' },
      },
    },
    envVars: [
      { key: 'SLACK_BOT_TOKEN', label: 'Bot Token', placeholder: 'xoxb-...' },
      { key: 'SLACK_TEAM_ID',   label: 'Team ID',   placeholder: 'T...' },
    ],
  },
  {
    id: 'sentry',
    name: 'Sentry',
    tagline: 'Error monitoring',
    description: 'Query Sentry for errors, issues, and stack traces to help agents debug.',
    mcpConfig: {
      sentry: {
        command: 'uvx',
        args: ['mcp-server-sentry', '--auth-token', '__TOKEN__'],
      },
    },
    envVars: [{ key: '__TOKEN__', label: 'Auth Token', placeholder: 'sntrys_...' }],
  },
  {
    id: 'linear',
    name: 'Linear',
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
  {
    id: 'playwright',
    name: 'Playwright',
    tagline: 'Browser automation',
    description: 'Automate browsers with Playwright — navigate, click, fill forms, take screenshots. More reliable than Puppeteer for modern sites.',
    mcpConfig: { playwright: { command: 'npx', args: ['-y', '@executeautomation/playwright-mcp-server'] } },
    envVars: [],
  },
  {
    id: 'cloudflare',
    name: 'Cloudflare',
    tagline: 'Edge & workers',
    description: 'Manage Workers, KV, D1 databases, R2, and DNS. Lets agents deploy and inspect edge resources.',
    mcpConfig: {
      cloudflare: {
        command: 'npx',
        args: ['-y', '@cloudflare/mcp-server-cloudflare'],
        env: { CLOUDFLARE_API_TOKEN: '__TOKEN__', CLOUDFLARE_ACCOUNT_ID: '__TOKEN__' },
      },
    },
    envVars: [
      { key: 'CLOUDFLARE_API_TOKEN', label: 'API Token', placeholder: 'cf...' },
      { key: 'CLOUDFLARE_ACCOUNT_ID', label: 'Account ID', placeholder: 'abc123...' },
    ],
  },
  {
    id: 'stripe',
    name: 'Stripe',
    tagline: 'Payments & billing',
    description: 'Query customers, subscriptions, invoices, and payment intents. Useful for debugging billing issues.',
    mcpConfig: {
      stripe: {
        command: 'npx',
        args: ['-y', '@stripe/mcp-server'],
        env: { STRIPE_SECRET_KEY: '__TOKEN__' },
      },
    },
    envVars: [{ key: 'STRIPE_SECRET_KEY', label: 'Secret Key', placeholder: 'sk_...' }],
  },
  {
    id: 'resend',
    name: 'Resend',
    tagline: 'Transactional email',
    description: 'Send and manage transactional emails. Lets agents notify or communicate during workflows.',
    mcpConfig: {
      resend: {
        command: 'npx',
        args: ['-y', 'resend-mcp'],
        env: { RESEND_API_KEY: '__TOKEN__' },
      },
    },
    envVars: [{ key: 'RESEND_API_KEY', label: 'API Key', placeholder: 're_...' }],
  },
  {
    id: 'supabase',
    name: 'Supabase',
    icon: Server,
    tagline: 'Database & backend',
    description: 'Query and manage your Supabase project — tables, auth, storage, and edge functions.',
    mcpConfig: {
      supabase: {
        command: 'npx',
        args: ['-y', '@supabase/mcp-server-supabase'],
        env: { SUPABASE_ACCESS_TOKEN: '__TOKEN__' },
      },
    },
    envVars: [{ key: 'SUPABASE_ACCESS_TOKEN', label: 'Access Token', placeholder: 'sbp_...' }],
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
            <Field>
              <FieldLabel>Name</FieldLabel>
              <Input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="My Tool" />
            </Field>
            <Field>
              <FieldLabel className="text-muted-foreground font-normal">Description</FieldLabel>
              <Input value={desc} onChange={e => setDesc(e.target.value)} placeholder="What it does" />
            </Field>
          </div>
          <Field>
            <FieldLabel>MCP Config <span className="text-muted-foreground font-normal text-xs">(JSON)</span></FieldLabel>
            <Textarea
              value={configStr}
              onChange={e => setConfig(e.target.value)}
              rows={8}
              placeholder={MCP_PLACEHOLDER}
              className="font-mono text-xs resize-y"
            />
            {jsonErr && <p className="text-xs text-destructive">{jsonErr}</p>}
          </Field>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button className="flex-1" disabled={!name.trim() || loading} onClick={submit}>
              {loading ? <Spinner /> : tool ? 'Save' : 'Add Tool'}
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
  const Icon = preset.icon ?? Wrench

  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className="h-4 w-4" />
            Add {preset.name}
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <p className="text-xs text-muted-foreground">{preset.description}</p>
          {preset.envVars.map(v => (
            <Field key={v.key}>
              <FieldLabel>{v.label}</FieldLabel>
              <Input
                autoFocus
                value={envValues[v.key] ?? ''}
                onChange={e => setEnvValues(prev => ({ ...prev, [v.key]: e.target.value }))}
                placeholder={v.placeholder}
                type="password"
              />
            </Field>
          ))}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button className="flex-1" disabled={!canSubmit || loading} onClick={submit}>
              {loading ? <Spinner /> : 'Add to company'}
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
    <div className="bg-card/80 rounded-xl shadow-sm border border-border/60 overflow-hidden flex flex-col">
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
          <Button variant="ghost" size="icon" onClick={onEdit} className="h-7 w-7 text-muted-foreground">
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setConfirmDelete(true)} className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
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
          <p className="text-xs text-muted-foreground/50 mb-2">Teams</p>
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
// Preset shop row
// ---------------------------------------------------------------------------

function PresetRow({ preset, installedTool, onAdd }: { preset: Preset; installedTool?: Tool; onAdd: () => void }) {
  const Icon = preset.icon
  const installed = !!installedTool
  const serverCount = installedTool ? Object.keys(installedTool.mcpConfig).length : 0
  return (
    <Item className={cn(
      'rounded-xl border transition-colors group',
      installed ? 'border-border/40 bg-muted/10 opacity-60' : 'border-border/50 bg-card/50 hover:bg-card hover:border-border/70'
    )}>
      <ItemMedia variant="icon">
        {Icon ? <Icon className="h-4 w-4 text-foreground/70" /> : <Wrench className="h-4 w-4 text-foreground/70" />}
      </ItemMedia>
      <ItemContent>
        <ItemTitle>
          {preset.name}
          <span className="text-xs font-normal text-muted-foreground">{preset.tagline}</span>
        </ItemTitle>
        <ItemDescription className="text-xs">
          {installed ? `Installed · ${serverCount} server${serverCount !== 1 ? 's' : ''}` : preset.description}
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        <Button
          variant="outline"
          size="sm"
          onClick={onAdd}
          disabled={installed}
          title={installed ? `${preset.name} is already installed.` : `Add ${preset.name}`}
          className="shrink-0"
        >
          {installed ? 'Installed' : 'Add'}
        </Button>
      </ItemActions>
    </Item>
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

  const installedByName = new Map(toolList.map(t => [t.name.toLowerCase(), t]))

  return (
    <div className="flex-1 overflow-y-auto bg-background">
      <div className="max-w-[1040px] px-6 pt-12 pb-10">

        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Tools</h1>
            <p className="text-sm text-muted-foreground mt-1">MCP servers available to your agents.</p>
          </div>
          <Button onClick={() => setShowCustom(true)} className="gap-1.5 mt-1">
            <Plus className="h-4 w-4" />
            Custom tool
          </Button>
        </div>

        {/* Installed tools */}
        {toolList.length > 0 && (
          <section className="mb-10">
            <p className="text-xs text-muted-foreground/50 mb-3">Installed · {toolList.length}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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
        {PRESETS.length > 0 && (
          <section>
            <p className="text-xs text-muted-foreground/50 mb-1">Available</p>
            <ItemGroup className="gap-2">
              {PRESETS.map(preset => (
                <PresetRow
                  key={preset.id}
                  preset={preset}
                  installedTool={installedByName.get(preset.name.toLowerCase())}
                  onAdd={() => setAddPreset(preset)}
                />
              ))}
            </ItemGroup>
          </section>
        )}

        {toolList.length === 0 && PRESETS.length === 0 && (
          <Empty className="border border-dashed border-border/70 bg-card/30">
            <EmptyHeader>
              <EmptyTitle>All preset tools installed</EmptyTitle>
              <EmptyDescription>Your agents have access to every preset in the catalog.</EmptyDescription>
            </EmptyHeader>
          </Empty>
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
