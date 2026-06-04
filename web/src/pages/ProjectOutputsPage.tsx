import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { projects } from '../api/client'
import { Download } from 'lucide-react'

const BORING = [
  /package-lock\.json$/, /yarn\.lock$/, /pnpm-lock\.yaml$/, /bun\.lockb$/,
  /\.min\.(js|css)$/, /\.map$/, /^(dist|build|\.next|out|node_modules)\//,
  /\.(log|lock)$/,
]

function isInteresting(p: string) { return !BORING.some(r => r.test(p)) }
function extOf(p: string) { return p.split('.').pop()?.toLowerCase() ?? '' }

function sortFiles(files: string[]): string[] {
  const rank = (p: string) => {
    const e = extOf(p)
    if (['md', 'mdx', 'txt', 'html', 'htm'].includes(e)) return 0
    if (['svg', 'png', 'jpg', 'jpeg', 'gif', 'webp'].includes(e)) return 1
    if (['ts', 'tsx', 'js', 'jsx', 'py', 'go', 'rs', 'rb', 'java', 'swift'].includes(e)) return 2
    if (['css', 'scss'].includes(e)) return 3
    return 4
  }
  return files.filter(isInteresting).sort((a, b) => rank(a) - rank(b))
}

const EXT_COLOR: Record<string, string> = {
  ts: '#3b82f6', tsx: '#3b82f6', js: '#eab308', jsx: '#eab308',
  py: '#22c55e', go: '#06b6d4', rs: '#f97316', rb: '#ef4444',
  md: '#a855f7', mdx: '#a855f7', html: '#ef4444', htm: '#ef4444',
  svg: '#10b981', css: '#06b6d4', scss: '#ec4899',
  json: '#f97316', yaml: '#a855f7', yml: '#a855f7',
  png: '#10b981', jpg: '#10b981', jpeg: '#10b981', gif: '#10b981', webp: '#10b981',
}

async function downloadFile(projectId: string, filePath: string) {
  const token = localStorage.getItem('token') ?? ''
  const res = await fetch(`/projects/${projectId}/file?path=${encodeURIComponent(filePath)}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) return
  const { content } = await res.json()
  const blob = new Blob([content], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filePath.split('/').pop() ?? filePath
  a.click()
  URL.revokeObjectURL(url)
}

function FileRow({ file, projectId }: { file: string; projectId: string }) {
  const ext   = extOf(file)
  const color = EXT_COLOR[ext] ?? 'var(--muted-foreground)'
  const name  = file.split('/').pop() ?? file
  const dir   = file.includes('/') ? file.slice(0, file.lastIndexOf('/')) : null

  return (
    <button
      onClick={() => downloadFile(projectId, file)}
      className="group flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/30 transition-colors"
    >
      <span
        className="shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold w-12 text-center"
        style={{ background: `color-mix(in srgb, ${color} 15%, transparent)`, color }}
      >
        {ext.toUpperCase() || '—'}
      </span>
      <span className="flex-1 min-w-0">
        <span className="text-sm font-medium text-foreground">{name}</span>
        {dir && <span className="ml-2 text-xs text-muted-foreground/50 font-mono">{dir}</span>}
      </span>
      <Download size={13} className="shrink-0 text-muted-foreground/30 group-hover:text-muted-foreground transition-colors" />
    </button>
  )
}

export default function ProjectOutputsPage() {
  const { id } = useParams<{ id: string }>()

  const { data, isLoading } = useQuery({
    queryKey: ['project-files', id],
    queryFn: () => projects.files(id!),
    enabled: !!id,
    staleTime: 30_000,
  })

  const files = sortFiles(data?.files ?? [])

  if (isLoading) return (
    <div className="p-8"><p className="text-xs font-mono text-muted-foreground">Loading…</p></div>
  )

  if (files.length === 0) return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <p className="text-sm text-muted-foreground">No outputs yet</p>
      <p className="text-xs text-muted-foreground/60 mt-1">Files will appear here once sessions are completed.</p>
    </div>
  )

  return (
    <div className="p-6 max-w-2xl">
      <div className="rounded-lg border border-border overflow-hidden divide-y divide-border/60">
        {files.map(f => <FileRow key={f} file={f} projectId={id!} />)}
      </div>
    </div>
  )
}
