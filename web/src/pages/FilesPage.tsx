import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { Highlight, themes } from 'prism-react-renderer'
import { projects } from '../api/client'
import type { Project, ProjectAppInfo, ProjectCommand } from '../api/client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import {
  Archive, Braces, ChevronRight, ExternalLink, File, FileCode2, FileText, Folder,
  Globe, Image, Monitor, Paintbrush, Play, Search, Server, Square, SquareTerminal, Terminal, X,
} from 'lucide-react'

const PRISM_LANG: Record<string, string> = {
  ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx',
  py: 'python', go: 'go', rs: 'rust', rb: 'ruby', java: 'java',
  json: 'json', yaml: 'yaml', yml: 'yaml', toml: 'toml',
  md: 'markdown', mdx: 'markdown', css: 'css', scss: 'scss',
  sass: 'scss', html: 'html', xml: 'xml', sh: 'bash', bash: 'bash',
  sql: 'sql', graphql: 'graphql', swift: 'swift', kt: 'kotlin',
}

const EXT_META: Record<string, { icon: typeof File; color: string }> = {
  ts: { icon: FileCode2, color: '#3b82f6' }, tsx: { icon: FileCode2, color: '#3b82f6' },
  js: { icon: FileCode2, color: '#eab308' }, jsx: { icon: FileCode2, color: '#eab308' },
  py: { icon: FileCode2, color: '#22c55e' }, go: { icon: FileCode2, color: '#06b6d4' },
  rs: { icon: FileCode2, color: '#f97316' }, rb: { icon: FileCode2, color: '#ef4444' },
  java: { icon: FileCode2, color: '#f97316' },
  json: { icon: Braces, color: '#f97316' }, yaml: { icon: Braces, color: '#a855f7' },
  yml: { icon: Braces, color: '#a855f7' }, toml: { icon: Braces, color: '#a855f7' },
  md: { icon: FileText, color: '#8b5cf6' }, mdx: { icon: FileText, color: '#8b5cf6' },
  txt: { icon: FileText, color: '#6b7280' },
  css: { icon: Paintbrush, color: '#06b6d4' }, scss: { icon: Paintbrush, color: '#ec4899' },
  sass: { icon: Paintbrush, color: '#ec4899' },
  html: { icon: Globe, color: '#ef4444' }, htm: { icon: Globe, color: '#ef4444' },
  svg: { icon: Image, color: '#10b981' }, png: { icon: Image, color: '#10b981' },
  jpg: { icon: Image, color: '#10b981' }, jpeg: { icon: Image, color: '#10b981' },
}

interface TreeNode {
  name: string
  path: string
  children: Map<string, TreeNode>
  file?: string
}

function extOf(path: string) {
  return path.split('.').pop()?.toLowerCase() ?? ''
}

function fileMeta(path: string) {
  return EXT_META[extOf(path)] ?? { icon: File, color: 'var(--muted)' }
}

function buildTree(files: string[]): TreeNode {
  const root: TreeNode = { name: '', path: '', children: new Map() }
  for (const file of files) {
    let node = root
    const parts = file.split('/')
    for (let i = 0; i < parts.length; i++) {
      const name = parts[i]
      const childPath = parts.slice(0, i + 1).join('/')
      if (!node.children.has(name)) {
        node.children.set(name, { name, path: childPath, children: new Map() })
      }
      node = node.children.get(name)!
    }
    node.file = file
  }
  return root
}

function sortedChildren(node: TreeNode) {
  return [...node.children.values()].sort((a, b) => {
    if (!!a.file !== !!b.file) return a.file ? 1 : -1
    return a.name.localeCompare(b.name)
  })
}

function isRenderableHtml(path?: string | null) {
  return !!path && /\.html?$/i.test(path)
}

function CodePreview({ content, filePath }: { content: string; filePath: string }) {
  const ext = extOf(filePath)
  const language = PRISM_LANG[ext] ?? 'plain'
  const dark = document.documentElement.classList.contains('dark') ||
    (!document.documentElement.classList.contains('light') && window.matchMedia('(prefers-color-scheme: dark)').matches)

  return (
    <Highlight theme={dark ? themes.oneDark : themes.oneLight} code={content.trimEnd()} language={language}>
      {({ tokens, getLineProps, getTokenProps }) => (
        <div className="min-w-0 overflow-auto rounded-lg border border-border/50 bg-card">
          <div className="flex font-mono text-xs leading-relaxed min-w-max py-3">
            <div className="select-none text-right shrink-0 border-r border-border/40 min-w-[3rem] pr-3 pl-4 text-muted-foreground/40">
              {tokens.map((_, i) => <div key={i}>{i + 1}</div>)}
            </div>
            <pre className="flex-1 m-0 px-4 overflow-x-visible whitespace-pre bg-transparent">
              {tokens.map((line, i) => (
                <div key={i} {...getLineProps({ line })}>
                  {line.map((token, key) => <span key={key} {...getTokenProps({ token })} />)}
                </div>
              ))}
            </pre>
          </div>
        </div>
      )}
    </Highlight>
  )
}

type WorkspaceTool = 'files' | 'commands' | 'artifacts' | 'environments'

const WORKSPACE_TOOLS: { id: WorkspaceTool; label: string; icon: typeof File; description: string }[] = [
  { id: 'files', label: 'Explorer', icon: FileCode2, description: 'Main branch files' },
  { id: 'commands', label: 'Run', icon: Terminal, description: 'Project commands' },
  { id: 'artifacts', label: 'Artifacts', icon: Archive, description: 'Generated outputs' },
  { id: 'environments', label: 'Services', icon: Server, description: 'Runtime state' },
]

function AppPanel({ info, selectedCommand, setSelectedCommand, onStart, onStop, starting, stopping }: {
  info?: ProjectAppInfo
  selectedCommand: string
  setSelectedCommand: (command: string) => void
  onStart: () => void
  onStop: () => void
  starting: boolean
  stopping: boolean
}) {
  const commands = info?.commands?.length
    ? info.commands
    : Object.keys(info?.scripts ?? {}).map<ProjectCommand>(script => ({
        id: `npm:${script}`,
        label: script,
        command: `npm run ${script}`,
        source: 'package.json',
      }))
  const status = info?.status
  const hasCommands = commands.length > 0
  const activeCommand = commands.find(command => command.id === (selectedCommand || commands[0]?.id))

  return (
    <section className="rounded-lg border border-border/60 bg-card px-4 py-4">
      <div className="flex items-start gap-3">
        <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary grid place-items-center shrink-0">
          <Terminal size={15} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-foreground">Project commands</p>
            {status?.running && <span className="stat green"><span className="dot green pulse" />{status.command ?? status.script}</span>}
            {!status?.running && status?.command && <span className="text-xs text-muted-foreground">last run: {status.command}</span>}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Run discovered commands from package scripts, task files, make targets, and scripts folders.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {hasCommands && (
            <Select value={selectedCommand || commands[0].id} onValueChange={setSelectedCommand}>
              <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {commands.map(command => <SelectItem key={command.id} value={command.id}>{command.label}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          {status?.running ? (
            <Button size="sm" variant="outline" onClick={onStop} disabled={stopping}>
              <Square size={12} />{stopping ? '…' : 'Stop'}
            </Button>
          ) : (
            <Button size="sm" onClick={onStart} disabled={!hasCommands || starting}>
              <Play size={12} />{starting ? '…' : 'Start'}
            </Button>
          )}
        </div>
      </div>
      {activeCommand && (
        <div className="mt-4 rounded-md border border-border/50 bg-background px-3 py-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline">{activeCommand.source}</Badge>
            <code className="text-xs text-foreground">{activeCommand.command}</code>
          </div>
        </div>
      )}
      {status?.url && (
        <a className="mt-3 inline-flex items-center gap-1.5 text-xs text-primary hover:underline" href={status.url} target="_blank" rel="noreferrer">
          <ExternalLink size={12} />{status.url}
        </a>
      )}
      {status?.output && (
        <pre className="mt-3 max-h-36 overflow-auto rounded-md bg-background border border-border/50 px-3 py-2 text-[11px] leading-relaxed font-mono text-muted-foreground whitespace-pre-wrap">
          {status.output}
        </pre>
      )}
      {!hasCommands && (
        <p className="mt-3 text-xs text-muted-foreground">No project commands found yet.</p>
      )}
    </section>
  )
}

function TreeRow({ node, depth, selected, openDirs, setOpenDirs, onSelect }: {
  node: TreeNode
  depth: number
  selected: string | null
  openDirs: Set<string>
  setOpenDirs: React.Dispatch<React.SetStateAction<Set<string>>>
  onSelect: (path: string) => void
}) {
  const isFile = !!node.file
  const open = openDirs.has(node.path)
  const { icon: Icon, color } = fileMeta(node.path)

  function toggle() {
    setOpenDirs(prev => {
      const next = new Set(prev)
      next.has(node.path) ? next.delete(node.path) : next.add(node.path)
      return next
    })
  }

  return (
    <div>
      <button
        onClick={() => isFile ? onSelect(node.file!) : toggle()}
        className={cn('flex items-center gap-2 w-full h-8 px-2 rounded-md text-left text-sm hover:bg-muted/50 transition-colors', selected === node.file && 'bg-primary/10 text-primary')}
        style={{ paddingLeft: 8 + depth * 14 }}
      >
        {isFile ? <Icon size={14} style={{ color }} /> : (
          <>
            <ChevronRight size={13} className={cn('transition-transform text-muted-foreground/50', open && 'rotate-90')} />
            <Folder size={14} className="text-muted-foreground" />
          </>
        )}
        <span className={cn('truncate', isFile ? 'font-mono text-xs' : 'font-medium text-muted-foreground')}>{node.name}</span>
      </button>
      {!isFile && open && sortedChildren(node).map(child => (
        <TreeRow key={child.path} node={child} depth={depth + 1} selected={selected} openDirs={openDirs} setOpenDirs={setOpenDirs} onSelect={onSelect} />
      ))}
    </div>
  )
}

function ProjectPicker({ projects: projectList, onOpen }: { projects: Project[]; onOpen: (id: string) => void }) {
  const [query, setQuery] = useState('')
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return projectList
    return projectList.filter(project => {
      const repo = project.remoteUrl ?? project.localPath ?? project.repoPath ?? ''
      return project.name.toLowerCase().includes(q) || repo.toLowerCase().includes(q)
    })
  }, [projectList, query])

  return (
    <div className="flex-1 overflow-y-auto bg-background">
      <div className="mx-auto flex min-h-full w-full max-w-[1040px] flex-col px-6 py-10">
        <div className="mb-7 grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
          <div className="rounded-lg border border-border/60 bg-card p-4">
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-md border border-border/60 bg-background text-primary">
              <SquareTerminal size={18} />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Workspace</h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Open a project workbench for files, commands, artifacts, and runtime state.
            </p>
          </div>
          <div className="flex min-w-0 flex-col justify-end">
            <div className="relative max-w-xl">
              <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/50" />
              <Input
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="Find a project"
                className="h-9 text-sm"
                style={{ paddingLeft: 32 }}
              />
            </div>
          </div>
        </div>

        {projectList.length === 0 ? (
          <section className="grid min-h-[360px] place-items-center rounded-lg border border-border/60 bg-card px-8 text-center">
            <div>
              <Folder size={30} className="mx-auto mb-3 text-muted-foreground/40" />
              <p className="text-sm font-semibold text-foreground">No projects yet</p>
              <p className="mt-1 max-w-sm text-xs text-muted-foreground">
                Add a project first, then open it here as a workspace.
              </p>
            </div>
          </section>
        ) : filtered.length === 0 ? (
          <section className="grid min-h-[280px] place-items-center rounded-lg border border-border/60 bg-card px-8 text-center">
            <div>
              <Search size={28} className="mx-auto mb-3 text-muted-foreground/40" />
              <p className="text-sm font-semibold text-foreground">No matching projects</p>
              <p className="mt-1 text-xs text-muted-foreground">Try another project name or repository path.</p>
            </div>
          </section>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border/60 bg-card">
            {filtered.map(project => {
              const repo = project.remoteUrl
                ? project.remoteUrl.replace(/^https?:\/\/(www\.)?github\.com\//, '').replace(/\.git$/, '')
                : project.localPath ?? project.repoPath ?? 'local'
              return (
                <button
                  key={project.id}
                  className="group flex w-full items-center gap-3 border-b border-border/50 px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-muted/30"
                  onClick={() => onOpen(project.id)}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <Folder size={15} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-foreground">{project.name}</span>
                    <span className="mt-0.5 block truncate font-mono text-[11px] text-muted-foreground">{repo}</span>
                  </span>
                  <Badge variant="outline" className="hidden md:inline-flex">Open</Badge>
                  <ChevronRight size={15} className="shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export default function WorkspacePage() {
  const { id: projectId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [tool, setTool] = useState<WorkspaceTool>('files')
  const [selectedFile, setSelected] = useState<string | null>(null)
  const [fileContent, setContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [openDirs, setOpenDirs] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')
  const [view, setView] = useState<'code' | 'render'>('code')
  const [selectedCommand, setSelectedCommand] = useState('')

  const { data: projectList = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projects.list(),
  })

  const { data: fileData, isLoading: filesLoading } = useQuery({
    queryKey: ['files', projectId],
    queryFn: () => projects.files(projectId!),
    enabled: !!projectId,
  })
  const { data: appInfo } = useQuery({
    queryKey: ['project-app', projectId],
    queryFn: () => projects.appInfo(projectId!),
    enabled: !!projectId,
    refetchInterval: data => data.state.data?.status.running ? 1500 : 5000,
  })

  const startApp = useMutation({
    mutationFn: () => projects.startApp(projectId!, selectedCommand || appInfo?.commands?.[0]?.id || Object.keys(appInfo?.scripts ?? {})[0]),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project-app', projectId] }),
  })
  const stopApp = useMutation({
    mutationFn: () => projects.stopApp(projectId!),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project-app', projectId] }),
  })

  const fileList = fileData?.files ?? []
  const filteredFiles = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? fileList.filter(f => f.toLowerCase().includes(q)) : fileList
  }, [fileList, query])
  const tree = useMemo(() => buildTree(filteredFiles), [filteredFiles])

  async function selectFile(path: string) {
    setSelected(path)
    setLoading(true)
    if (isRenderableHtml(path)) setView('render')
    else setView('code')
    try {
      const res = await projects.file(projectId!, path)
      setContent(res.content)
      const parentDirs = path.split('/').slice(0, -1)
      setOpenDirs(prev => {
        const next = new Set(prev)
        for (let i = 0; i < parentDirs.length; i++) next.add(parentDirs.slice(0, i + 1).join('/'))
        return next
      })
    } finally {
      setLoading(false)
    }
  }

  const htmlEntries = appInfo?.htmlEntries ?? []
  const project = projectList.find(item => item.id === projectId)
  const canRender = isRenderableHtml(selectedFile) || /\.svg$/i.test(selectedFile ?? '')
  const activeTool = WORKSPACE_TOOLS.find(item => item.id === tool)!

  if (!projectId) {
    return <ProjectPicker projects={projectList} onOpen={id => navigate(`/workspace/${id}`)} />
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-card/50 px-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-md border border-border/60 bg-background text-primary">
            <SquareTerminal size={15} />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-normal text-muted-foreground">Workspace</p>
            <h1 className="truncate text-sm font-semibold text-foreground">{project?.name ?? 'Project workspace'}</h1>
          </div>
        </div>
        <div className="hidden min-w-0 flex-1 items-center justify-center md:flex">
          <div className="flex w-full max-w-xl items-center gap-2 rounded-md border border-border/60 bg-background px-3 py-1.5 text-xs text-muted-foreground">
            <Search size={13} />
            <span className="truncate">{project?.repoPath ?? project?.localPath ?? 'Select files, commands, artifacts, or services'}</span>
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={() => navigate('/workspace')}>
          Change project
        </Button>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[52px_minmax(240px,300px)_minmax(0,1fr)] max-lg:grid-cols-[52px_minmax(0,1fr)]">
        <aside className="flex flex-col items-center gap-1 border-r border-border bg-card/40 px-2 py-3">
          {WORKSPACE_TOOLS.map(item => {
            const Icon = item.icon
            return (
              <Button
                key={item.id}
                size="icon"
                variant={tool === item.id ? 'secondary' : 'ghost'}
                className="h-9 w-9"
                title={item.label}
                onClick={() => setTool(item.id)}
              >
                <Icon size={17} />
              </Button>
            )
          })}
        </aside>

        <aside className="min-h-0 border-r border-border bg-card/30 max-lg:hidden">
          <div className="flex h-11 items-center justify-between border-b border-border px-3">
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold uppercase tracking-normal text-muted-foreground">{activeTool.label}</p>
            </div>
            <Badge variant="outline">{activeTool.description}</Badge>
          </div>

          {tool === 'files' ? (
            <>
              <div className="border-b border-border/60 p-3">
                <div className="relative">
                  <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/50" />
                  <Input
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder="Find files"
                    className="h-8 text-xs"
                    style={{ paddingLeft: 32 }}
                  />
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground/60">
                  {filesLoading ? 'Loading...' : `${filteredFiles.length} of ${fileList.length} files`}
                </p>
              </div>
              {htmlEntries.length > 0 && (
                <div className="border-b border-border/60 px-3 py-2">
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-normal text-muted-foreground">HTML entries</p>
                  <div className="flex flex-col gap-1">
                    {htmlEntries.slice(0, 6).map(entry => (
                      <Button key={entry} size="sm" variant="ghost" className="h-7 justify-start px-2 text-xs" onClick={() => selectFile(entry)}>
                        <Globe size={12} />{entry}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
              <div className="max-h-[calc(100vh-220px)] overflow-auto p-2">
                {filteredFiles.length === 0 ? (
                  <p className="px-2 py-8 text-center text-sm text-muted-foreground/60">
                    {fileList.length === 0 ? 'Files appear here after something is committed to main.' : 'No files match your search.'}
                  </p>
                ) : sortedChildren(tree).map(child => (
                  <TreeRow key={child.path} node={child} depth={0} selected={selectedFile} openDirs={openDirs} setOpenDirs={setOpenDirs} onSelect={selectFile} />
                ))}
              </div>
            </>
          ) : (
            <div className="p-2">
              {WORKSPACE_TOOLS.filter(item => item.id !== 'files').map(item => {
                const Icon = item.icon
                return (
                  <Button
                    key={item.id}
                    variant={tool === item.id ? 'secondary' : 'ghost'}
                    className="h-auto w-full justify-start px-3 py-2 text-left"
                    onClick={() => setTool(item.id)}
                  >
                    <Icon size={15} className="shrink-0" />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{item.label}</span>
                      <span className="block text-[11px] leading-snug text-muted-foreground">{item.description}</span>
                    </span>
                  </Button>
                )
              })}
            </div>
          )}
        </aside>

        <main className="min-h-0 min-w-0 overflow-auto bg-background">
          <div className="min-h-full p-4">
            {tool === 'commands' && (
              <div className="flex flex-col gap-4">
                <AppPanel
                  info={appInfo}
                  selectedCommand={selectedCommand}
                  setSelectedCommand={setSelectedCommand}
                  onStart={() => startApp.mutate()}
                  onStop={() => stopApp.mutate()}
                  starting={startApp.isPending}
                  stopping={stopApp.isPending}
                />
                {(startApp.isError || stopApp.isError) && (
                  <p className="text-sm text-destructive">{(startApp.error ?? stopApp.error)?.message}</p>
                )}
              </div>
            )}

            {tool === 'files' && (
              <section className="min-h-[calc(100vh-120px)] overflow-hidden rounded-lg border border-border/60 bg-card">
                {selectedFile ? (
                  <>
                    <div className="flex h-11 items-center gap-3 border-b border-border/50 bg-background/70 px-3">
                      {(() => { const { icon: Icon, color } = fileMeta(selectedFile); return <Icon size={15} style={{ color }} /> })()}
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-mono text-xs text-foreground">{selectedFile}</p>
                      </div>
                      {canRender && (
                        <div className="flex items-center gap-1">
                          <Button size="sm" variant={view === 'code' ? 'secondary' : 'ghost'} onClick={() => setView('code')}>Code</Button>
                          <Button size="sm" variant={view === 'render' ? 'secondary' : 'ghost'} onClick={() => setView('render')}>Render</Button>
                        </div>
                      )}
                      <Button size="icon" variant="ghost" onClick={() => { setSelected(null); setContent(null) }} title="Close file">
                        <X size={14} />
                      </Button>
                    </div>
                    <div className="min-h-[560px] p-4">
                      {loading ? (
                        <p className="font-mono text-xs text-muted-foreground">Loading...</p>
                      ) : view === 'render' && canRender ? (
                        <iframe
                          title={selectedFile}
                          sandbox="allow-scripts allow-forms allow-modals"
                          className="h-[calc(100vh-190px)] min-h-[560px] w-full rounded-md border border-border bg-white"
                          srcDoc={fileContent ?? ''}
                        />
                      ) : (
                        <CodePreview content={fileContent ?? ''} filePath={selectedFile} />
                      )}
                    </div>
                  </>
                ) : (
                  <div className="grid min-h-[calc(100vh-120px)] place-items-center px-8 text-center">
                    <div>
                      <FileCode2 size={30} className="mx-auto mb-3 text-muted-foreground/40" />
                      <p className="text-sm font-medium text-foreground">Pick a file from Explorer</p>
                      <p className="mt-1 max-w-sm text-xs text-muted-foreground">
                        Browse main branch files, render HTML, or open source in the editor pane.
                      </p>
                      <div className="mt-4 flex justify-center gap-2 lg:hidden">
                        {htmlEntries.slice(0, 3).map(entry => (
                          <Button key={entry} size="sm" variant="outline" onClick={() => selectFile(entry)}>
                            <Globe size={12} />{entry}
                          </Button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </section>
            )}

            {tool === 'artifacts' && (
              <section className="min-h-[620px] rounded-lg border border-border/60 bg-card grid place-items-center px-8 text-center">
                <div>
                  <Archive size={30} className="mx-auto text-muted-foreground/40 mb-3" />
                  <p className="text-sm font-semibold text-foreground">Artifacts</p>
                  <p className="text-xs text-muted-foreground mt-1 max-w-md">
                    Generated files, screenshots, reports, and build outputs will live here.
                  </p>
                </div>
              </section>
            )}

            {tool === 'environments' && (
              <section className="min-h-[620px] rounded-lg border border-border/60 bg-card grid place-items-center px-8 text-center">
                <div>
                  <Monitor size={30} className="mx-auto text-muted-foreground/40 mb-3" />
                  <p className="text-sm font-semibold text-foreground">Environments</p>
                  <p className="text-xs text-muted-foreground mt-1 max-w-md">
                    Runtime services, ports, worktrees, and environment state will be managed here.
                  </p>
                </div>
              </section>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
