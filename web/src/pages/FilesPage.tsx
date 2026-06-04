import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { Highlight, themes } from 'prism-react-renderer'
import { projects } from '../api/client'
import type { ProjectAppInfo } from '../api/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import {
  Braces, ChevronRight, ExternalLink, File, FileCode2, FileText, Folder,
  Globe, Image, Monitor, Paintbrush, Play, Search, Square, X,
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

function AppPanel({ info, selectedScript, setSelectedScript, onStart, onStop, starting, stopping }: {
  info?: ProjectAppInfo
  selectedScript: string
  setSelectedScript: (script: string) => void
  onStart: () => void
  onStop: () => void
  starting: boolean
  stopping: boolean
}) {
  const scripts = Object.keys(info?.scripts ?? {})
  const status = info?.status
  const hasScripts = scripts.length > 0

  return (
    <section className="rounded-lg border border-border/60 bg-card px-4 py-3">
      <div className="flex items-start gap-3">
        <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary grid place-items-center shrink-0">
          <Monitor size={15} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-foreground">App runtime</p>
            {status?.running && <span className="stat green"><span className="dot green pulse" />{status.script}</span>}
            {!status?.running && status?.script && <span className="text-xs text-muted-foreground">last run: {status.script}</span>}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Start npm scripts from a main-branch worktree, or render static HTML files below.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {hasScripts && (
            <Select value={selectedScript || scripts[0]} onValueChange={setSelectedScript}>
              <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {scripts.map(script => <SelectItem key={script} value={script}>{script}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          {status?.running ? (
            <Button size="sm" variant="outline" onClick={onStop} disabled={stopping}>
              <Square size={12} />{stopping ? '…' : 'Stop'}
            </Button>
          ) : (
            <Button size="sm" onClick={onStart} disabled={!hasScripts || starting}>
              <Play size={12} />{starting ? '…' : 'Start'}
            </Button>
          )}
        </div>
      </div>
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
      {!hasScripts && (
        <p className="mt-3 text-xs text-muted-foreground">No package scripts found in `package.json`.</p>
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

export default function FilesPage() {
  const { id: projectId } = useParams<{ id: string }>()
  const qc = useQueryClient()
  const [selectedFile, setSelected] = useState<string | null>(null)
  const [fileContent, setContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [openDirs, setOpenDirs] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')
  const [view, setView] = useState<'code' | 'render'>('code')
  const [selectedScript, setSelectedScript] = useState('')

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
    mutationFn: () => projects.startApp(projectId!, selectedScript || Object.keys(appInfo?.scripts ?? {})[0]),
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
  const selectedName = selectedFile?.split('/').pop() ?? ''
  const canRender = isRenderableHtml(selectedFile) || /\.svg$/i.test(selectedFile ?? '')

  return (
    <div className="flex-1 overflow-y-auto bg-background">
      <div className="px-6 pt-6 pb-8 flex flex-col gap-4">
        <AppPanel
          info={appInfo}
          selectedScript={selectedScript}
          setSelectedScript={setSelectedScript}
          onStart={() => startApp.mutate()}
          onStop={() => stopApp.mutate()}
          starting={startApp.isPending}
          stopping={stopApp.isPending}
        />

        {htmlEntries.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground">HTML</span>
            {htmlEntries.slice(0, 6).map(entry => (
              <Button key={entry} size="sm" variant="outline" onClick={() => selectFile(entry)}>
                <Globe size={12} />{entry}
              </Button>
            ))}
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)] items-start">
          <aside className="rounded-lg border border-border/60 bg-card overflow-hidden">
            <div className="p-3 border-b border-border/50">
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
              <p className="text-[11px] text-muted-foreground/60 mt-2">
                {filesLoading ? 'Loading…' : `${filteredFiles.length} of ${fileList.length} files`}
              </p>
            </div>
            <div className="max-h-[62vh] overflow-auto p-2">
              {filteredFiles.length === 0 ? (
                <p className="text-sm text-muted-foreground/60 px-2 py-8 text-center">
                  {fileList.length === 0 ? 'Files appear here after something is committed to main.' : 'No files match your search.'}
                </p>
              ) : sortedChildren(tree).map(child => (
                <TreeRow key={child.path} node={child} depth={0} selected={selectedFile} openDirs={openDirs} setOpenDirs={setOpenDirs} onSelect={selectFile} />
              ))}
            </div>
          </aside>

          <section className="min-w-0 rounded-lg border border-border/60 bg-card overflow-hidden">
            {selectedFile ? (
              <>
                <div className="flex items-center gap-3 px-4 py-3 border-b border-border/50">
                  {(() => { const { icon: Icon, color } = fileMeta(selectedFile); return <Icon size={15} style={{ color }} /> })()}
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-xs text-foreground truncate">{selectedFile}</p>
                    <p className="text-[11px] text-muted-foreground/60">{selectedName}</p>
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
                <div className="p-4 min-h-[480px]">
                  {loading ? (
                    <p className="font-mono text-xs text-muted-foreground">Loading…</p>
                  ) : view === 'render' && canRender ? (
                    <iframe
                      title={selectedFile}
                      sandbox="allow-scripts allow-forms allow-modals"
                      className="w-full min-h-[560px] rounded-lg border border-border bg-white"
                      srcDoc={fileContent ?? ''}
                    />
                  ) : (
                    <CodePreview content={fileContent ?? ''} filePath={selectedFile} />
                  )}
                </div>
              </>
            ) : (
              <div className="min-h-[520px] grid place-items-center px-8 text-center">
                <div>
                  <FileCode2 size={28} className="mx-auto text-muted-foreground/40 mb-3" />
                  <p className="text-sm font-medium text-foreground">Pick a file</p>
                  <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                    Browse main branch files, render HTML, or start a package script from the app runtime panel.
                  </p>
                </div>
              </div>
            )}
          </section>
        </div>

        {(startApp.isError || stopApp.isError) && (
          <p className="text-sm text-destructive">{(startApp.error ?? stopApp.error)?.message}</p>
        )}
      </div>
    </div>
  )
}
