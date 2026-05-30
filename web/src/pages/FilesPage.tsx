import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { projects } from '../api/client'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ViewToggle, type ViewMode } from '@/components/ViewToggle'
import { cn } from '@/lib/utils'
import {
  File, FileCode2, FileText, Braces, Paintbrush, Globe, Image,
  FolderOpen, X, ChevronRight,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// File type metadata
// ---------------------------------------------------------------------------

const EXT_META: Record<string, { icon: typeof File; color: string }> = {
  ts:   { icon: FileCode2, color: '#3b82f6' },
  tsx:  { icon: FileCode2, color: '#3b82f6' },
  js:   { icon: FileCode2, color: '#eab308' },
  jsx:  { icon: FileCode2, color: '#eab308' },
  py:   { icon: FileCode2, color: '#22c55e' },
  go:   { icon: FileCode2, color: '#06b6d4' },
  rs:   { icon: FileCode2, color: '#f97316' },
  rb:   { icon: FileCode2, color: '#ef4444' },
  java: { icon: FileCode2, color: '#f97316' },
  json: { icon: Braces,    color: '#f97316' },
  yaml: { icon: Braces,    color: '#a855f7' },
  yml:  { icon: Braces,    color: '#a855f7' },
  toml: { icon: Braces,    color: '#a855f7' },
  md:   { icon: FileText,  color: '#8b5cf6' },
  mdx:  { icon: FileText,  color: '#8b5cf6' },
  txt:  { icon: FileText,  color: '#6b7280' },
  css:  { icon: Paintbrush,color: '#06b6d4' },
  scss: { icon: Paintbrush,color: '#ec4899' },
  sass: { icon: Paintbrush,color: '#ec4899' },
  html: { icon: Globe,     color: '#ef4444' },
  svg:  { icon: Image,     color: '#10b981' },
  png:  { icon: Image,     color: '#10b981' },
  jpg:  { icon: Image,     color: '#10b981' },
}

function fileMeta(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  return EXT_META[ext] ?? { icon: File, color: 'var(--muted-foreground)' }
}

// ---------------------------------------------------------------------------
// File tree grouping
// ---------------------------------------------------------------------------

interface DirGroup { dir: string; files: string[] }

function groupByDir(files: string[]): DirGroup[] {
  const map = new Map<string, string[]>()
  for (const f of files) {
    const slash = f.indexOf('/')
    const dir = slash >= 0 ? f.slice(0, slash) : ''
    if (!map.has(dir)) map.set(dir, [])
    map.get(dir)!.push(f)
  }
  // root files first, then dirs alphabetically
  const sorted = [...map.entries()].sort(([a], [b]) => {
    if (a === '') return -1
    if (b === '') return 1
    return a.localeCompare(b)
  })
  return sorted.map(([dir, files]) => ({ dir, files }))
}

// ---------------------------------------------------------------------------
// Code preview with line numbers
// ---------------------------------------------------------------------------

function CodePreview({ content }: { content: string }) {
  const lines = content.split('\n')
  return (
    <div className="flex font-mono text-[11.5px] leading-[1.7] h-full">
      <div className="select-none pr-4 pl-4 text-right text-muted-foreground/30 shrink-0 border-r border-border/40 min-w-[3rem]">
        {lines.map((_, i) => <div key={i}>{i + 1}</div>)}
      </div>
      <pre className="flex-1 overflow-auto m-0 px-4 py-0 text-foreground/80 whitespace-pre">
        {content}
      </pre>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Grid card
// ---------------------------------------------------------------------------

function FileGridCard({ path, selected, onClick }: { path: string; selected: boolean; onClick: () => void }) {
  const name = path.split('/').pop() ?? path
  const { icon: Icon, color } = fileMeta(name)
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex flex-col items-center gap-2 p-3 rounded-xl cursor-pointer border-none transition-all text-center group',
        selected
          ? 'bg-primary/10 ring-1 ring-primary/30'
          : 'bg-transparent hover:bg-muted/60'
      )}
    >
      <div
        className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: color + '15' }}
      >
        <Icon className="h-6 w-6" style={{ color }} />
      </div>
      <div className="w-full">
        <p className={cn(
          'font-mono text-[11px] leading-tight truncate',
          selected ? 'text-primary' : 'text-foreground'
        )} title={path}>{name}</p>
        {ext && (
          <span className="font-mono text-[9px] text-muted-foreground uppercase tracking-wide">{ext}</span>
        )}
      </div>
    </button>
  )
}

// ---------------------------------------------------------------------------
// List row
// ---------------------------------------------------------------------------

function FileListRow({ path, selected, onClick, indent = false }: {
  path: string; selected: boolean; onClick: () => void; indent?: boolean
}) {
  const name = path.split('/').pop() ?? path
  const { icon: Icon, color } = fileMeta(name)
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-2.5 px-4 py-1.5 cursor-pointer border-none text-left transition-colors',
        indent && 'pl-8',
        selected
          ? 'bg-primary/8 text-primary'
          : 'bg-transparent text-foreground hover:bg-muted/50'
      )}
    >
      <div className="w-4 h-4 rounded flex items-center justify-center shrink-0" style={{ background: color + '18' }}>
        <Icon className="h-2.5 w-2.5" style={{ color }} />
      </div>
      <span className="font-mono text-[11.5px] flex-1 truncate">{path}</span>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function FilesPage() {
  const { id: projectId } = useParams<{ id: string }>()
  const [mode, setMode]           = useState<ViewMode>('list')
  const [selectedFile, setSelected] = useState<string | null>(null)
  const [fileContent, setContent]   = useState<string | null>(null)
  const [loading, setLoading]       = useState(false)
  const [openDirs, setOpenDirs]     = useState<Set<string>>(new Set())

  const { data: fileData } = useQuery({
    queryKey: ['files', projectId],
    queryFn: () => projects.files(projectId!),
    enabled: !!projectId,
  })
  const fileList = fileData?.files ?? []
  const groups = groupByDir(fileList)

  async function selectFile(path: string) {
    if (path === selectedFile) { setSelected(null); setContent(null); return }
    setSelected(path)
    setLoading(true)
    try {
      const res = await projects.file(projectId!, path)
      setContent(res.content)
    } finally { setLoading(false) }
  }

  function toggleDir(dir: string) {
    setOpenDirs(prev => {
      const next = new Set(prev)
      next.has(dir) ? next.delete(dir) : next.add(dir)
      return next
    })
  }

  const previewOpen = selectedFile !== null

  return (
    <div className="flex-1 flex flex-col bg-background">

      {/* Top bar */}
      <div className="h-14 shrink-0 flex items-center gap-3 px-6 border-b border-border/60">
        <span className="text-sm font-semibold text-foreground">Files</span>
        {fileList.length > 0 && (
          <span className="font-mono text-xs text-muted-foreground">{fileList.length}</span>
        )}
        <div className="flex-1" />
        {fileList.length > 0 && <ViewToggle mode={mode} onChange={setMode} />}
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 flex overflow-hidden">

        {/* Browser */}
        <div className={cn('flex flex-col overflow-hidden transition-all', previewOpen ? 'w-72 shrink-0 border-r border-border/60' : 'flex-1')}>
          {fileList.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center p-8">
              <FolderOpen className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm font-medium text-foreground">No files yet</p>
              <p className="text-xs text-muted-foreground">Files appear here once an agent commits something.</p>
            </div>
          ) : mode === 'grid' ? (
            <ScrollArea className="flex-1">
              <div className="p-4 grid gap-1.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))' }}>
                {fileList.map(f => (
                  <FileGridCard key={f} path={f} selected={selectedFile === f} onClick={() => selectFile(f)} />
                ))}
              </div>
            </ScrollArea>
          ) : (
            <ScrollArea className="flex-1">
              <div className="py-2">
                {groups.map(({ dir, files }) => (
                  <div key={dir || '__root__'}>
                    {/* Directory header */}
                    {dir && (
                      <button
                        onClick={() => toggleDir(dir)}
                        className="w-full flex items-center gap-2 px-4 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors cursor-pointer bg-transparent border-none text-left"
                      >
                        <ChevronRight className={cn('h-3 w-3 transition-transform shrink-0', openDirs.has(dir) && 'rotate-90')} />
                        <FolderOpen className="h-3 w-3 shrink-0" />
                        {dir}
                        <span className="ml-auto font-mono text-[10px] text-muted-foreground/60">{files.length}</span>
                      </button>
                    )}
                    {/* Files — root always shown, subdirs toggle */}
                    {(dir === '' || openDirs.has(dir)) && files.map(f => (
                      <FileListRow key={f} path={f} selected={selectedFile === f} onClick={() => selectFile(f)} indent={!!dir} />
                    ))}
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>

        {/* Preview panel */}
        {previewOpen && (
          <div className="flex-1 min-w-0 flex flex-col">
            {/* Preview header */}
            <div className="h-9 shrink-0 flex items-center gap-2 px-4 border-b border-border/60 bg-muted/20">
              {(() => { const { icon: Icon, color } = fileMeta(selectedFile!); return <Icon className="h-3.5 w-3.5 shrink-0" style={{ color }} />; })()}
              <span className="font-mono text-[11.5px] text-muted-foreground flex-1 truncate">{selectedFile}</span>
              <button
                onClick={() => { setSelected(null); setContent(null) }}
                className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer bg-transparent border-none"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            {/* Preview content */}
            <ScrollArea className="flex-1 bg-muted/10">
              <div className="py-3">
                {loading
                  ? <p className="font-mono text-xs text-muted-foreground px-4">Loading…</p>
                  : <CodePreview content={fileContent ?? ''} />}
              </div>
            </ScrollArea>
          </div>
        )}
      </div>
    </div>
  )
}
