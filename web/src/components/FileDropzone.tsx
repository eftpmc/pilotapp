import { useRef, useState, useCallback } from 'react'
import { Paperclip, X } from 'lucide-react'

interface Props {
  files: string[]
  onAdd: (files: File[]) => void
  onRemove: (name: string) => void
  uploading?: boolean
  disabled?: boolean
}

function fileIcon(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return '🖼'
  if (['pdf'].includes(ext)) return '📄'
  if (['csv', 'tsv'].includes(ext)) return '📊'
  if (['md', 'txt'].includes(ext)) return '📝'
  if (['json', 'yaml', 'yml', 'toml'].includes(ext)) return '⚙️'
  if (['zip', 'tar', 'gz'].includes(ext)) return '📦'
  return '📎'
}

export function FileDropzone({ files, onAdd, onRemove, uploading, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    if (disabled) return
    const dropped = Array.from(e.dataTransfer.files)
    if (dropped.length > 0) onAdd(dropped)
  }, [disabled, onAdd])

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    if (disabled) return
    const items = Array.from(e.clipboardData.items)
    const pastedFiles = items
      .filter(i => i.kind === 'file')
      .map(i => i.getAsFile())
      .filter(Boolean) as File[]
    if (pastedFiles.length > 0) onAdd(pastedFiles)
  }, [disabled, onAdd])

  return (
    <div onPaste={handlePaste}>
      {/* Attached files list */}
      {files.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {files.map(f => (
            <div key={f} className="flex items-center gap-1 px-2 py-1 rounded-md border border-border/60 bg-card text-xs text-foreground">
              <span>{fileIcon(f)}</span>
              <span className="max-w-[140px] truncate font-mono">{f}</span>
              {!disabled && (
                <button
                  type="button"
                  onClick={() => onRemove(f)}
                  className="ml-0.5 text-muted-foreground hover:text-destructive transition-colors"
                >
                  <X size={11} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); if (!disabled) setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => !disabled && inputRef.current?.click()}
        style={{
          border: `1px dashed ${dragging ? 'var(--ember)' : 'var(--rule)'}`,
          borderRadius: 8,
          padding: '10px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          cursor: disabled ? 'default' : 'pointer',
          background: dragging ? 'color-mix(in srgb, var(--ember) 6%, transparent)' : 'transparent',
          transition: 'border-color 0.15s, background 0.15s',
          opacity: disabled ? 0.5 : 1,
        }}
      >
        <Paperclip size={13} style={{ color: 'var(--muted)', flexShrink: 0 }} />
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>
          {uploading ? 'Uploading…' : 'Attach files — drag, click, or paste'}
        </span>
      </div>

      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={e => {
          const picked = Array.from(e.target.files ?? [])
          if (picked.length > 0) onAdd(picked)
          e.target.value = ''
        }}
      />
    </div>
  )
}
