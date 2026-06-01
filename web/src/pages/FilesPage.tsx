import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { Highlight, themes } from 'prism-react-renderer'
import { projects } from '../api/client'
import { cn } from '@/lib/utils'
import {
  File, FileCode2, FileText, Braces, Paintbrush, Globe, Image,
  FolderOpen, X, ChevronRight,
} from 'lucide-react'

const PRISM_LANG: Record<string, string> = {
  ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx',
  py: 'python', go: 'go', rs: 'rust', rb: 'ruby', java: 'java',
  json: 'json', yaml: 'yaml', yml: 'yaml', toml: 'toml',
  md: 'markdown', mdx: 'markdown', css: 'css', scss: 'scss',
  sass: 'scss', html: 'html', xml: 'xml', sh: 'bash', bash: 'bash',
  sql: 'sql', graphql: 'graphql', swift: 'swift', kt: 'kotlin',
}

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
// Syntax-highlighted code preview
// ---------------------------------------------------------------------------

function CodePreview({ content, filePath }: { content: string; filePath: string }) {
  const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
  const language = PRISM_LANG[ext] ?? 'plain'
  const theme = isDark ? themes.oneDark : themes.oneLight

  return (
    <Highlight theme={theme} code={content.trimEnd()} language={language}>
      {({ tokens, getLineProps, getTokenProps }) => (
        <div className="flex font-mono text-xs leading-relaxed min-w-0">
          {/* Line numbers */}
          <div className="select-none text-right shrink-0 border-r border-border/30 min-w-[3rem] pr-3 pl-4"
            style={{ color: 'var(--color-muted-foreground)', opacity: 0.4 }}>
            {tokens.map((_, i) => <div key={i}>{i + 1}</div>)}
          </div>
          {/* Code */}
          <pre className="flex-1 m-0 px-4 py-0 overflow-x-auto whitespace-pre bg-transparent">
            {tokens.map((line, i) => (
              <div key={i} {...getLineProps({ line })}>
                {line.map((token, key) => (
                  <span key={key} {...getTokenProps({ token })} />
                ))}
              </div>
            ))}
          </pre>
        </div>
      )}
    </Highlight>
  )
}

function FileListRow({ path, selected, onClick, indent = false }: {
  path: string; selected: boolean; onClick: () => void; indent?: boolean
}) {
  const name = path.split('/').pop() ?? path
  const { icon: Icon, color } = fileMeta(name)
  const ext = name.includes('.') ? name.split('.').pop()?.toLowerCase() : ''
  return (
    <button
      onClick={onClick}
      className={cn(
        'row quiet',
        selected && 'selected'
      )}
      style={indent ? { paddingLeft: 30 } : undefined}
    >
      <Icon size={15} style={{ color, flexShrink: 0 }} />
      <div className="row-main">
        <div className="row-title" style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: selected ? 'var(--indigo)' : 'var(--ink)' }}>{path}</div>
      </div>
      {ext && <span className="chip mono">{ext}</span>}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function FilesPage() {
  const { id: projectId } = useParams<{ id: string }>()
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

  // Auto-open first 3 non-root directories when files load
  useEffect(() => {
    if (fileList.length === 0) return
    const dirs = groups.filter(g => g.dir !== '').slice(0, 3).map(g => g.dir)
    if (dirs.length > 0) setOpenDirs(new Set(dirs))
  }, [fileList.length]) // eslint-disable-line react-hooks/exhaustive-deps

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
      if (next.has(dir)) {
        next.delete(dir)
      } else {
        next.add(dir)
      }
      return next
    })
  }

  const previewOpen = selectedFile !== null

  return (
    <div style={{ overflowY: 'auto', flex: 1, background: 'var(--bg)' }}>
      <div className="page-content" style={{ paddingTop: 32, paddingBottom: 80 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 26 }}>
          <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 24, fontWeight: 420, letterSpacing: '-0.02em', margin: 0 }}>Files</h2>
          {fileList.length > 0 && <span className="count">{fileList.length}</span>}
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: previewOpen ? 'minmax(260px, 0.85fr) minmax(0, 1.35fr)' : '1fr',
          gap: previewOpen ? 28 : 0,
          alignItems: 'start',
        }}>
          <div>
          {fileList.length === 0 ? (
            <p className="empty-line"><FolderOpen size={15} style={{ display: 'inline', marginRight: 8, verticalAlign: -2 }} />Files appear here once an agent commits something.</p>
          ) : (
            <div className="rows">
                {groups.map(({ dir, files }) => (
                  <div key={dir || '__root__'}>
                    {dir && (
                      <button
                        onClick={() => toggleDir(dir)}
                        className="row quiet"
                      >
                        <ChevronRight size={13} className={cn('transition-transform', openDirs.has(dir) && 'rotate-90')} style={{ color: 'var(--faint)' }} />
                        <FolderOpen size={14} style={{ color: 'var(--muted)' }} />
                        <div className="row-main">
                          <div className="row-title" style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--muted)' }}>{dir}</div>
                        </div>
                        <span className="row-time">{files.length}</span>
                      </button>
                    )}
                    {(dir === '' || openDirs.has(dir)) && files.map(f => (
                      <FileListRow key={f} path={f} selected={selectedFile === f} onClick={() => selectFile(f)} indent={!!dir} />
                    ))}
                  </div>
                ))}
            </div>
          )}
          </div>

          {previewOpen && (
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 0 12px', borderBottom: '1px solid var(--rule)' }}>
                {(() => { const { icon: Icon, color } = fileMeta(selectedFile!); return <Icon size={15} style={{ color, flexShrink: 0 }} />; })()}
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--muted)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedFile}</span>
              <button
                onClick={() => { setSelected(null); setContent(null) }}
                style={{ color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: 4 }}
              >
                <X size={15} />
              </button>
            </div>
              <div style={{ paddingTop: 18, overflowX: 'auto' }}>
                {loading
                  ? <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--muted)' }}>Loading…</p>
                  : <CodePreview content={fileContent ?? ''} filePath={selectedFile ?? ''} />}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
